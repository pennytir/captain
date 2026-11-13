/**
 * Atom-SequenceParser (M11.1 L1 / M11.3a L2 拡張)
 *
 * Mermaid `sequenceDiagram` テキスト → SequenceDiagram AST 純関数。
 * - L1: participant / actor / 8 種 message arrow / autonumber / title / 自己ループ / 暗黙 participant
 * - L2 (M11.3a): activation (`activate`/`deactivate`/`+`/`-`) / Note (left of/right of/over) /
 *   6 種 control block (loop / alt-else / opt / par-and / critical-option / break) + 入れ子
 * - L3 (box / links / properties / create / destroy / rect / accTitle / accDescr) → { ok: false }
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-SequenceParser.md
 */

import type {
  SequenceActivation,
  SequenceBlock,
  SequenceBlockBranch,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceExtraLine,
  SequenceItem,
  SequenceMessage,
  SequenceMessageArrow,
  SequenceMessageItem,
  SequenceNote,
  SequenceNotePlacement,
  SequenceParseError,
  SequenceParseResult,
  SequenceParticipant,
} from '../types/sequence-schema.js';

// 長い token から先にテストする (`-->>` を `->>` より優先)
const ARROW_TOKENS: ReadonlyArray<[string, SequenceMessageArrow]> = [
  ['-->>', 'dotted-arrow'],
  ['--x', 'dotted-cross'],
  ['--)', 'dotted-open'],
  ['-->', 'dotted-line'],
  ['->>', 'solid-arrow'],
  ['-x', 'solid-cross'],
  ['-)', 'solid-open'],
  ['->', 'solid-line'],
];

const HEADER_RE = /^sequenceDiagram\b/;
const TITLE_RE = /^title\s+(.+)$/;
const AUTONUMBER_RE = /^autonumber\s*$/;
const PARTICIPANT_RE = /^(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/;
const ACTIVATE_RE = /^activate\s+([A-Za-z0-9_]+)$/;
const DEACTIVATE_RE = /^deactivate\s+([A-Za-z0-9_]+)$/;
const NOTE_RE = /^Note\s+(left of|right of|over)\s+([A-Za-z0-9_,\s]+?)\s*:\s*(.+)$/;
const BLOCK_START_RE = /^(loop|alt|opt|par|critical|break)(?:\s+(.+))?$/;
const BRANCH_RE = /^(else|and|option)(?:\s+(.+))?$/;
// M11.4: L3 keywords を accept (Pattern 7、raw 行で extras に保持)
const L3_EXTRA_KEYWORDS = new Set([
  'box',
  'links',
  'properties',
  'create',
  'destroy',
  'rect',
  'accTitle',
  'accDescr',
]);

// L3 keywords のうち brace block を持つもの (`<keyword> ... end` 形式)
// box / rect は block 内に participant / message を持ちうるが、M11.4 では raw 行 (block 全体を `;` 区切りで 1 行化) で保持
const L3_BLOCK_KEYWORDS = new Set(['box', 'rect']);

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface ParseCtx {
  lines: string[];
  i: number;
  participantsById: Map<string, SequenceParticipant>;
  flatMessages: SequenceMessage[];
  activations: SequenceActivation[];
  /** open activation stack (per participant) */
  openActs: Map<string, SequenceActivation[]>;
  msgIdCounter: number;
  noteIdCounter: number;
  blockIdCounter: number;
  actIdCounter: number;
  hasL2: boolean;
  // M11.4 L3
  extras: SequenceExtraLine[];
  extraIdCounter: number;
}

function ensureParticipant(ctx: ParseCtx, id: string): void {
  if (!ctx.participantsById.has(id)) {
    ctx.participantsById.set(id, { id, label: id, kind: 'participant' });
  }
}

function openActivation(ctx: ParseCtx, participantId: string, startMessageIndex: number): void {
  const act: SequenceActivation = {
    id: `a${ctx.actIdCounter++}`,
    participantId,
    startMessageIndex,
  };
  ctx.activations.push(act);
  let stack = ctx.openActs.get(participantId);
  if (!stack) {
    stack = [];
    ctx.openActs.set(participantId, stack);
  }
  stack.push(act);
}

function closeActivation(ctx: ParseCtx, participantId: string, endMessageIndex: number): void {
  const stack = ctx.openActs.get(participantId);
  if (!stack || stack.length === 0) return; // 防御的: no-op
  const act = stack.pop()!;
  act.endMessageIndex = endMessageIndex;
}

interface MessageParseResult {
  from: string;
  arrow: SequenceMessageArrow;
  to: string;
  label: string;
  activatePrefix: '+' | '-' | null;
}

function parseMessageLine(line: string): MessageParseResult | null {
  for (const [token, arrow] of ARROW_TOKENS) {
    const idx = line.indexOf(token);
    if (idx === -1) continue;
    const left = line.slice(0, idx).trim();
    const rest = line.slice(idx + token.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) continue;
    const rightRaw = rest.slice(0, colonIdx).trim();
    const label = rest.slice(colonIdx + 1).trim();
    let activatePrefix: '+' | '-' | null = null;
    let right = rightRaw;
    if (rightRaw.startsWith('+')) {
      activatePrefix = '+';
      right = rightRaw.slice(1).trim();
    } else if (rightRaw.startsWith('-')) {
      activatePrefix = '-';
      right = rightRaw.slice(1).trim();
    }
    if (!left.match(/^[A-Za-z0-9_]+$/)) continue;
    if (!right.match(/^[A-Za-z0-9_]+$/)) continue;
    return { from: left, arrow, to: right, label, activatePrefix };
  }
  return null;
}

/**
 * M11.4: L3 keyword から始まる行 (or block) を raw 文字列として collect。
 * - 単独行 keyword (links / properties / create / destroy / accTitle / accDescr) → そのまま 1 行
 * - block keyword (box / rect) → 同行に `{` があるか後続 `end` まで読み、`; ` 区切りで 1 行化
 * ctx.i を消費する (block の場合は end までスキップ)。
 */
function collectL3Raw(ctx: ParseCtx, firstWord: string): string {
  const startLine = ctx.lines[ctx.i].trim();
  ctx.i++;
  if (!L3_BLOCK_KEYWORDS.has(firstWord)) {
    return startLine;
  }
  // block keyword: matching `end` まで読む
  const collected: string[] = [startLine];
  while (ctx.i < ctx.lines.length) {
    const sub = ctx.lines[ctx.i].trim();
    ctx.i++;
    if (sub === '') continue;
    collected.push(sub);
    if (sub === 'end') break;
  }
  return collected.join('; ');
}

type ItemResult =
  | { kind: 'item'; item: SequenceItem }
  | { kind: 'none' } // activate / deactivate (no item, side-effect tracked)
  | { kind: 'error'; error: SequenceParseError };

/**
 * 1 item (message / note / block) を parse する。activate/deactivate は side-effect として activations を更新し item は返さない。
 * 呼出元は ctx.i が消費されたことを前提とする。
 */
function parseItem(ctx: ParseCtx): ItemResult {
  const lineNum = ctx.i + 1;
  const line = ctx.lines[ctx.i].trim();
  const firstWord = line.split(/[\s:]/)[0];

  // M11.4: L3 keyword → extras に raw 保持 (Pattern 7)
  if (L3_EXTRA_KEYWORDS.has(firstWord)) {
    const rawCollected = collectL3Raw(ctx, firstWord);
    ctx.extras.push({
      id: `sex${ctx.extraIdCounter++}`,
      raw: rawCollected,
    });
    return { kind: 'none' };
  }

  // activate
  let m = line.match(ACTIVATE_RE);
  if (m) {
    ctx.hasL2 = true;
    const pid = m[1];
    ensureParticipant(ctx, pid);
    openActivation(ctx, pid, ctx.msgIdCounter); // 次の message の index
    ctx.i++;
    return { kind: 'none' };
  }

  m = line.match(DEACTIVATE_RE);
  if (m) {
    ctx.hasL2 = true;
    const pid = m[1];
    closeActivation(ctx, pid, ctx.msgIdCounter - 1); // 直前 message の index
    ctx.i++;
    return { kind: 'none' };
  }

  m = line.match(NOTE_RE);
  if (m) {
    ctx.hasL2 = true;
    const placementToken = m[1];
    const placement: SequenceNotePlacement =
      placementToken === 'left of'
        ? 'left-of'
        : placementToken === 'right of'
          ? 'right-of'
          : 'over';
    const idsRaw = m[2].trim();
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (placement === 'over' && (ids.length < 1 || ids.length > 2)) {
      return {
        kind: 'error',
        error: { line: lineNum, message: 'Note over: 1〜2 participants required' },
      };
    }
    if (placement !== 'over' && ids.length !== 1) {
      return {
        kind: 'error',
        error: {
          line: lineNum,
          message: `Note ${placementToken}: exactly 1 participant required`,
        },
      };
    }
    for (const id of ids) ensureParticipant(ctx, id);
    const note: SequenceNote = {
      type: 'note',
      id: `n${ctx.noteIdCounter++}`,
      placement,
      participantIds: ids,
      label: m[3].trim(),
    };
    ctx.i++;
    return { kind: 'item', item: note };
  }

  // block start
  const bs = line.match(BLOCK_START_RE);
  if (bs) {
    ctx.hasL2 = true;
    const kind = bs[1] as SequenceBlockKind;
    const blockLabel = bs[2]?.trim() ?? '';
    const block: SequenceBlock = {
      type: 'block',
      id: `b${ctx.blockIdCounter++}`,
      kind,
      label: blockLabel,
      branches: [],
    };
    ctx.i++;

    const acceptedBranchKW: ReadonlySet<string> =
      kind === 'alt'
        ? new Set(['else'])
        : kind === 'par'
          ? new Set(['and'])
          : kind === 'critical'
            ? new Set(['option'])
            : new Set();

    let currentBranch: SequenceBlockBranch = { label: blockLabel, items: [] };
    block.branches.push(currentBranch);

    while (true) {
      if (ctx.i >= ctx.lines.length) {
        return {
          kind: 'error',
          error: { line: lineNum, message: `Unclosed block '${kind}' (expected 'end')` },
        };
      }
      const innerLine = ctx.lines[ctx.i].trim();
      if (isSkippable(innerLine)) {
        ctx.i++;
        continue;
      }
      if (innerLine === 'end') {
        ctx.i++;
        return { kind: 'item', item: block };
      }
      const brm = innerLine.match(BRANCH_RE);
      if (brm && acceptedBranchKW.has(brm[1])) {
        currentBranch = { label: brm[2]?.trim() ?? '', items: [] };
        block.branches.push(currentBranch);
        ctx.i++;
        continue;
      }
      const innerRes = parseItem(ctx);
      if (innerRes.kind === 'error') return innerRes;
      if (innerRes.kind === 'item') currentBranch.items.push(innerRes.item);
      // 'none' (activate/deactivate inside block) は side-effect のみ
    }
  }

  // message
  const mm = parseMessageLine(line);
  if (mm) {
    ensureParticipant(ctx, mm.from);
    ensureParticipant(ctx, mm.to);
    const msgIndex = ctx.msgIdCounter;
    const msgId = `m${msgIndex}`;
    ctx.msgIdCounter++;
    const msg: SequenceMessage = {
      id: msgId,
      from: mm.from,
      to: mm.to,
      label: mm.label,
      arrow: mm.arrow,
    };
    ctx.flatMessages.push(msg);

    if (mm.activatePrefix === '+') {
      // `A->>+B: req` → activate recipient (to)
      ctx.hasL2 = true;
      openActivation(ctx, mm.to, msgIndex);
    } else if (mm.activatePrefix === '-') {
      // `B-->>-A: res` → deactivate sender (from)
      ctx.hasL2 = true;
      closeActivation(ctx, mm.from, msgIndex);
    }

    const msgItem: SequenceMessageItem = { ...msg, type: 'message' };
    ctx.i++;
    return { kind: 'item', item: msgItem };
  }

  return {
    kind: 'error',
    error: { line: lineNum, message: `Unknown syntax at line ${lineNum}: ${line}` },
  };
}

export function parseSequenceDiagram(text: string): SequenceParseResult {
  const lines = text.split('\n');
  const ctx: ParseCtx = {
    lines,
    i: 0,
    participantsById: new Map(),
    flatMessages: [],
    activations: [],
    openActs: new Map(),
    msgIdCounter: 0,
    noteIdCounter: 0,
    blockIdCounter: 0,
    actIdCounter: 0,
    hasL2: false,
    extras: [],
    extraIdCounter: 0,
  };
  let title: string | undefined;
  let autonumber: boolean | undefined;
  const topItems: SequenceItem[] = [];

  // header
  let headerSeen = false;
  while (ctx.i < lines.length) {
    const line = lines[ctx.i].trim();
    if (isSkippable(line)) {
      ctx.i++;
      continue;
    }
    if (HEADER_RE.test(line)) {
      headerSeen = true;
      ctx.i++;
      break;
    }
    return {
      ok: false,
      error: {
        line: ctx.i + 1,
        message: `Expected 'sequenceDiagram' header, got: ${line}`,
      },
    };
  }
  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing sequenceDiagram header' },
    };
  }

  // top-level loop
  while (ctx.i < lines.length) {
    const lineNum = ctx.i + 1;
    const line = lines[ctx.i].trim();
    if (isSkippable(line)) {
      ctx.i++;
      continue;
    }

    const firstWord = line.split(/[\s:]/)[0];
    // M11.4: L3 keyword は extras に raw 保持
    if (L3_EXTRA_KEYWORDS.has(firstWord)) {
      const rawCollected = collectL3Raw(ctx, firstWord);
      ctx.extras.push({
        id: `sex${ctx.extraIdCounter++}`,
        raw: rawCollected,
      });
      continue;
    }

    const tm = line.match(TITLE_RE);
    if (tm) {
      title = tm[1].trim();
      ctx.i++;
      continue;
    }
    if (AUTONUMBER_RE.test(line)) {
      autonumber = true;
      ctx.i++;
      continue;
    }
    const pm = line.match(PARTICIPANT_RE);
    if (pm) {
      const kind = pm[1] === 'actor' ? 'actor' : 'participant';
      const id = pm[2];
      const label = pm[3]?.trim() ?? id;
      ctx.participantsById.set(id, { id, label, kind });
      ctx.i++;
      continue;
    }

    // 'else' / 'and' / 'option' / 'end' at top level = error
    if (line === 'end' || BRANCH_RE.test(line)) {
      return {
        ok: false,
        error: { line: lineNum, message: `Unexpected '${line}' at top level` },
      };
    }

    const res = parseItem(ctx);
    if (res.kind === 'error') return { ok: false, error: res.error };
    if (res.kind === 'item') topItems.push(res.item);
    // 'none' (activate/deactivate): no item
  }

  const sequence: SequenceDiagram = {
    ...(title !== undefined ? { title } : {}),
    ...(autonumber !== undefined ? { autonumber } : {}),
    participants: Array.from(ctx.participantsById.values()),
    messages: ctx.flatMessages,
    ...(ctx.hasL2 ? { items: topItems, activations: ctx.activations } : {}),
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };

  return { ok: true, sequence };
}
