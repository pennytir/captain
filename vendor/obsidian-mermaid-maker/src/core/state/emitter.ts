/**
 * Atom-StateEmitter (M14.1)
 *
 * StateDiagram AST → Mermaid `stateDiagram-v2` テキスト 純関数。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-StateEmitter.md
 */

import type {
  StateDiagram,
  StateNode,
  StateTransition,
} from '../types/state-schema.js';

const INDENT_UNIT = '    '; // 4 spaces

function indentFor(depth: number): string {
  let s = '';
  for (let i = 0; i < depth; i++) s += INDENT_UNIT;
  return s;
}

function toMermaidId(id: string): string {
  if (id === '__START__' || id === '__END__') return '[*]';
  if (id.endsWith('__START__') || id.endsWith('__END__')) return '[*]';
  return id;
}

function emitStateDecl(state: StateNode, depth: number, out: string[]): void {
  const ind = indentFor(depth);
  if (state.type === 'fork' || state.type === 'join' || state.type === 'choice') {
    out.push(`${ind}state ${state.id} <<${state.type}>>`);
  } else if (state.type === 'normal') {
    out.push(`${ind}state ${state.id}`);
    if (state.label !== undefined && state.label !== state.id) {
      out.push(`${ind}${state.id} : ${state.label}`);
    }
  }
  // start / end は宣言行を出さない ([*] は transition で表現)
}

function emitTransition(
  t: StateTransition,
  depth: number,
  out: string[],
): void {
  const ind = indentFor(depth);
  const from = toMermaidId(t.from);
  const to = toMermaidId(t.to);
  if (t.label !== undefined) {
    out.push(`${ind}${from} --> ${to} : ${t.label}`);
  } else {
    out.push(`${ind}${from} --> ${to}`);
  }
}

export function emitStateDiagram(diagram: StateDiagram): string {
  const out: string[] = ['stateDiagram-v2'];

  if (diagram.direction) {
    out.push(`${INDENT_UNIT}direction ${diagram.direction}`);
  }

  // children map: parentId → states[]
  const byParent = new Map<string | undefined, StateNode[]>();
  for (const s of diagram.states) {
    const key = s.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }

  // transition の emit 先 scope を決める:
  // from と to が同じ parent に属すならその composite block 内、違えば top-level。
  // これで composite 内 transition が block 外に漏れず、各 transition は 1 度だけ emit される。
  const parentOf = new Map<string, string | undefined>();
  for (const s of diagram.states) parentOf.set(s.id, s.parentId);
  const transitionsByScope = new Map<string | undefined, StateTransition[]>();
  for (const t of diagram.transitions) {
    const fp = parentOf.get(t.from);
    const tp = parentOf.get(t.to);
    const scope = fp === tp ? fp : undefined;
    if (!transitionsByScope.has(scope)) transitionsByScope.set(scope, []);
    transitionsByScope.get(scope)!.push(t);
  }

  // top-level (parentId undefined) を emit。children があれば composite block で再帰
  const topStates = byParent.get(undefined) ?? [];
  const emitStateGroup = (states: StateNode[], depth: number) => {
    for (const s of states) {
      // composite かどうか: byParent に s.id が key として存在するか
      const children = byParent.get(s.id);
      if (children && children.length > 0) {
        const ind = indentFor(depth);
        out.push(`${ind}state ${s.id} {`);
        if (s.label !== undefined && s.label !== s.id) {
          out.push(`${indentFor(depth + 1)}${s.id} : ${s.label}`);
        }
        // child states を再帰
        emitStateGroup(children, depth + 1);
        // この composite scope に属す transition を block 内で emit
        for (const t of transitionsByScope.get(s.id) ?? []) {
          emitTransition(t, depth + 1, out);
        }
        out.push(`${ind}}`);
      } else {
        emitStateDecl(s, depth, out);
      }
    }
  };
  emitStateGroup(topStates, 1);

  // top-level transitions (scope undefined = parentId なし or 境界跨ぎ)
  for (const t of transitionsByScope.get(undefined) ?? []) {
    emitTransition(t, 1, out);
  }

  // notes (L2)
  if (diagram.notes) {
    for (const n of diagram.notes) {
      out.push(
        `${INDENT_UNIT}note ${n.placement} of ${n.forStateId} : ${n.label}`,
      );
    }
  }

  // extras (L3)
  if (diagram.extras) {
    for (const ex of diagram.extras) {
      out.push(`${INDENT_UNIT}${ex.raw}`);
    }
  }

  return out.join('\n');
}
