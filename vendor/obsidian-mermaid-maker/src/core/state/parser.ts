/**
 * Atom-StateParser (M14.1)
 *
 * Mermaid `stateDiagram-v2` テキスト → StateDiagram AST 純関数。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-StateParser.md
 */

import type {
  StateDiagram,
  StateExtraLine,
  StateNode,
  StateNodeType,
  StateNote,
  StateParseResult,
  StateTransition,
} from '../types/state-schema.js';

const HEADER_RE = /^stateDiagram(?:-v2)?\b/;
const DIRECTION_RE = /^direction\s+(LR|RL|TB|BT)\s*$/;
const STEREOTYPE_RE =
  /^state\s+([A-Za-z_][A-Za-z0-9_]*)\s+<<(fork|join|choice)>>\s*$/;
const STATE_DECL_RE = /^state\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const COMPOSITE_OPEN_RE =
  /^state\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*$/;
const COMPOSITE_CLOSE_RE = /^\}\s*$/;
const DESCRIPTION_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;
const NOTE_RE =
  /^note\s+(left|right)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;
const TRANSITION_RE =
  /^(\[\*\]|[A-Za-z_][A-Za-z0-9_]*)\s*-->\s*(\[\*\]|[A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*(.+))?$/;

const L3_KEYWORDS = ['accTitle', 'accDescr', 'classDef', 'class', 'click', 'style', 'link'];

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

function isL3Directive(trimmed: string): boolean {
  return L3_KEYWORDS.some(
    (k) => trimmed === k || trimmed.startsWith(`${k}:`) || trimmed.startsWith(`${k} `),
  );
}

type ParseCtx = {
  diagram: StateDiagram;
  /** composite state parent stack (id 文字列) */
  parentStack: string[];
  transitionCounter: number;
  noteCounter: number;
  extraCounter: number;
  states: Map<string, StateNode>; // id → StateNode (重複登録の防止)
  notes: StateNote[];
  extras: StateExtraLine[];
};

function pseudoId(kind: 'start' | 'end', parentId: string | undefined): string {
  const k = kind === 'start' ? '__START__' : '__END__';
  return parentId ? `${parentId}${k}` : k;
}

function ensureState(
  ctx: ParseCtx,
  id: string,
  type: StateNodeType = 'normal',
  label?: string,
): StateNode {
  const existing = ctx.states.get(id);
  if (existing) {
    if (label !== undefined) existing.label = label;
    return existing;
  }
  const parentId = ctx.parentStack[ctx.parentStack.length - 1];
  const node: StateNode = {
    id,
    type,
    ...(label !== undefined ? { label } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  };
  ctx.states.set(id, node);
  ctx.diagram.states.push(node);
  return node;
}

function resolveBracket(s: string, kind: 'start' | 'end', ctx: ParseCtx): string {
  if (s === '[*]') {
    const parent = ctx.parentStack[ctx.parentStack.length - 1];
    const id = pseudoId(kind, parent);
    // pseudo state は自動登録
    if (!ctx.states.has(id)) {
      const node: StateNode = {
        id,
        type: kind,
        ...(parent !== undefined ? { parentId: parent } : {}),
      };
      ctx.states.set(id, node);
      ctx.diagram.states.push(node);
    }
    return id;
  }
  return s;
}

export function parseStateDiagram(text: string): StateParseResult {
  const ctx: ParseCtx = {
    diagram: { states: [], transitions: [] },
    parentStack: [],
    transitionCounter: 0,
    noteCounter: 0,
    extraCounter: 0,
    states: new Map(),
    notes: [],
    extras: [],
  };

  const lines = text.split('\n');
  let headerFound = false;
  let lineNum = 0;

  for (const raw of lines) {
    lineNum += 1;
    if (isSkippable(raw)) continue;
    const trimmed = raw.trim();

    if (!headerFound) {
      if (HEADER_RE.test(trimmed)) {
        headerFound = true;
        continue;
      }
      return {
        ok: false,
        error: {
          line: lineNum,
          message: `stateDiagram: header 'stateDiagram(-v2)?' が見つかりません (got: '${trimmed}')`,
        },
      };
    }

    // composite close
    if (COMPOSITE_CLOSE_RE.test(trimmed)) {
      ctx.parentStack.pop();
      continue;
    }

    // composite open
    const compOpen = COMPOSITE_OPEN_RE.exec(trimmed);
    if (compOpen) {
      const id = compOpen[1]!;
      ensureState(ctx, id, 'normal');
      ctx.parentStack.push(id);
      continue;
    }

    // direction (L1)
    const dirMatch = DIRECTION_RE.exec(trimmed);
    if (dirMatch) {
      ctx.diagram.direction = dirMatch[1] as 'LR' | 'RL' | 'TB' | 'BT';
      continue;
    }

    // L3 directive を description regex より先に判定 (accTitle: hello が description と誤解される)
    if (isL3Directive(trimmed)) {
      ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: trimmed });
      continue;
    }

    // note (L2)
    const noteMatch = NOTE_RE.exec(trimmed);
    if (noteMatch) {
      ctx.notes.push({
        id: `sn${ctx.noteCounter++}`,
        placement: noteMatch[1] as 'left' | 'right',
        forStateId: noteMatch[2]!,
        label: noteMatch[3]!.trim(),
      });
      continue;
    }

    // stereotype (L2)
    const stereoMatch = STEREOTYPE_RE.exec(trimmed);
    if (stereoMatch) {
      ensureState(ctx, stereoMatch[1]!, stereoMatch[2] as StateNodeType);
      continue;
    }

    // state decl (bare)
    const stateMatch = STATE_DECL_RE.exec(trimmed);
    if (stateMatch) {
      ensureState(ctx, stateMatch[1]!, 'normal');
      continue;
    }

    // description: `X : descr`
    const descMatch = DESCRIPTION_RE.exec(trimmed);
    if (descMatch && !trimmed.includes('-->')) {
      ensureState(ctx, descMatch[1]!, 'normal', descMatch[2]!.trim());
      continue;
    }

    // transition
    const trMatch = TRANSITION_RE.exec(trimmed);
    if (trMatch) {
      const from = resolveBracket(trMatch[1]!, 'start', ctx);
      const to = resolveBracket(trMatch[2]!, 'end', ctx);
      // 暗黙登録 (pseudo 以外)
      if (!ctx.states.has(from)) ensureState(ctx, from, 'normal');
      if (!ctx.states.has(to)) ensureState(ctx, to, 'normal');
      const t: StateTransition = {
        id: `t${ctx.transitionCounter++}`,
        from,
        to,
        ...(trMatch[3] ? { label: trMatch[3].trim() } : {}),
      };
      ctx.diagram.transitions.push(t);
      continue;
    }

    // unrecognised — extras に逃がす (Pattern 7)
    ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: trimmed });
  }

  if (!headerFound) {
    return {
      ok: false,
      error: {
        message: `stateDiagram: header 'stateDiagram(-v2)?' が見つかりません (空入力)`,
      },
    };
  }

  if (ctx.notes.length > 0) ctx.diagram.notes = ctx.notes;
  if (ctx.extras.length > 0) ctx.diagram.extras = ctx.extras;

  return { ok: true, diagram: ctx.diagram };
}
