/**
 * Atom-StateOps (M14.2)
 *
 * StateDiagram への immutable CRUD 純関数群。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-StateOps.md
 */

import type {
  StateDiagram,
  StateDirection,
  StateNode,
  StateNodeType,
  StateNote,
  StateTransition,
} from '../types/state-schema.js';

function nextTransitionId(diagram: StateDiagram): string {
  let max = -1;
  for (const t of diagram.transitions) {
    const m = t.id.match(/^t(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `t${max + 1}`;
}

function findState(diagram: StateDiagram, id: string): StateNode | undefined {
  return diagram.states.find((s) => s.id === id);
}

export function addStateNode(
  diagram: StateDiagram,
  init: { id: string; label?: string; type?: StateNodeType },
): { diagram: StateDiagram; state: StateNode | null } {
  if (diagram.states.some((s) => s.id === init.id)) {
    return { diagram, state: null };
  }
  const state: StateNode = {
    id: init.id,
    type: init.type ?? 'normal',
    ...(init.label !== undefined ? { label: init.label } : {}),
  };
  return {
    diagram: { ...diagram, states: [...diagram.states, state] },
    state,
  };
}

export function removeStateNode(
  diagram: StateDiagram,
  id: string,
): StateDiagram {
  if (!findState(diagram, id)) return diagram;
  return {
    ...diagram,
    states: diagram.states.filter((s) => s.id !== id),
    transitions: diagram.transitions.filter(
      (t) => t.from !== id && t.to !== id,
    ),
  };
}

export function renameStateNode(
  diagram: StateDiagram,
  oldId: string,
  newId: string,
): StateDiagram {
  if (oldId === newId) return diagram;
  if (!findState(diagram, oldId)) return diagram;
  if (findState(diagram, newId)) return diagram; // 衝突 → no-op
  return {
    ...diagram,
    states: diagram.states.map((s) =>
      s.id === oldId ? { ...s, id: newId } : s,
    ),
    transitions: diagram.transitions.map((t) => ({
      ...t,
      from: t.from === oldId ? newId : t.from,
      to: t.to === oldId ? newId : t.to,
    })),
  };
}

export function setStateNodeLabel(
  diagram: StateDiagram,
  id: string,
  label: string,
): StateDiagram {
  if (!findState(diagram, id)) return diagram;
  return {
    ...diagram,
    states: diagram.states.map((s) =>
      s.id === id ? { ...s, label } : s,
    ),
  };
}

export function setStateNodeType(
  diagram: StateDiagram,
  id: string,
  type: StateNodeType,
): StateDiagram {
  if (!findState(diagram, id)) return diagram;
  return {
    ...diagram,
    states: diagram.states.map((s) =>
      s.id === id ? { ...s, type } : s,
    ),
  };
}

export function addStateTransition(
  diagram: StateDiagram,
  init: { from: string; to: string; label?: string },
): { diagram: StateDiagram; transition: StateTransition | null } {
  // 暗黙登録
  let nextDiagram = diagram;
  if (!findState(nextDiagram, init.from)) {
    const r = addStateNode(nextDiagram, { id: init.from });
    nextDiagram = r.diagram;
  }
  if (!findState(nextDiagram, init.to)) {
    const r = addStateNode(nextDiagram, { id: init.to });
    nextDiagram = r.diagram;
  }
  const id = nextTransitionId(nextDiagram);
  const transition: StateTransition = {
    id,
    from: init.from,
    to: init.to,
    ...(init.label !== undefined ? { label: init.label } : {}),
  };
  return {
    diagram: {
      ...nextDiagram,
      transitions: [...nextDiagram.transitions, transition],
    },
    transition,
  };
}

export function removeStateTransition(
  diagram: StateDiagram,
  id: string,
): StateDiagram {
  if (!diagram.transitions.some((t) => t.id === id)) return diagram;
  return {
    ...diagram,
    transitions: diagram.transitions.filter((t) => t.id !== id),
  };
}

export function updateStateTransition(
  diagram: StateDiagram,
  id: string,
  patch: { from?: string; to?: string; label?: string },
): StateDiagram {
  const target = diagram.transitions.find((t) => t.id === id);
  if (!target) return diagram;
  return {
    ...diagram,
    transitions: diagram.transitions.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(patch.from !== undefined ? { from: patch.from } : {}),
            ...(patch.to !== undefined ? { to: patch.to } : {}),
            ...(patch.label !== undefined ? { label: patch.label } : {}),
          }
        : t,
    ),
  };
}

export function setStateDirection(
  diagram: StateDiagram,
  direction: StateDirection | undefined,
): StateDiagram {
  if (direction === undefined) {
    if (diagram.direction === undefined) return diagram;
    const { direction: _, ...rest } = diagram;
    return rest as StateDiagram;
  }
  if (diagram.direction === direction) return diagram;
  return { ...diagram, direction };
}

// ── L2 (M14.3): composite parent + note CRUD ──────────────

function nextNoteId(diagram: StateDiagram): string {
  let max = -1;
  for (const n of diagram.notes ?? []) {
    const m = n.id.match(/^sn(\d+)$/);
    if (m) {
      const v = Number(m[1]);
      if (v > max) max = v;
    }
  }
  return `sn${max + 1}`;
}

/**
 * composite 親を設定/解除する。parentId=undefined で top-level へ戻す。
 * id 不在 / 自己参照 / parentId 不在 / 循環 (parentId が id の子孫) は no-op。
 */
export function setStateParent(
  diagram: StateDiagram,
  id: string,
  parentId: string | undefined,
): StateDiagram {
  if (!findState(diagram, id)) return diagram;
  if (parentId === id) return diagram;
  if (parentId !== undefined) {
    if (!findState(diagram, parentId)) return diagram;
    // 循環ガード: parentId から親リンクを辿り id に到達したら cycle
    const parentById = new Map(diagram.states.map((s) => [s.id, s.parentId]));
    const seen = new Set<string>();
    let cursor: string | undefined = parentId;
    while (cursor !== undefined) {
      if (cursor === id) return diagram;
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentById.get(cursor);
    }
  }
  return {
    ...diagram,
    states: diagram.states.map((s) => {
      if (s.id !== id) return s;
      if (parentId === undefined) {
        const { parentId: _omit, ...rest } = s;
        return rest;
      }
      return { ...s, parentId };
    }),
  };
}

export function addStateNote(
  diagram: StateDiagram,
  init: { forStateId: string; placement: 'left' | 'right'; label: string },
): { diagram: StateDiagram; note: StateNote | null } {
  const note: StateNote = {
    id: nextNoteId(diagram),
    forStateId: init.forStateId,
    placement: init.placement,
    label: init.label,
  };
  return {
    diagram: { ...diagram, notes: [...(diagram.notes ?? []), note] },
    note,
  };
}

export function removeStateNote(
  diagram: StateDiagram,
  id: string,
): StateDiagram {
  if (!diagram.notes?.some((n) => n.id === id)) return diagram;
  const next = diagram.notes.filter((n) => n.id !== id);
  if (next.length === 0) {
    const { notes: _omit, ...rest } = diagram;
    return rest;
  }
  return { ...diagram, notes: next };
}

export function updateStateNote(
  diagram: StateDiagram,
  id: string,
  patch: { forStateId?: string; placement?: 'left' | 'right'; label?: string },
): StateDiagram {
  if (!diagram.notes?.some((n) => n.id === id)) return diagram;
  return {
    ...diagram,
    notes: diagram.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            ...(patch.forStateId !== undefined
              ? { forStateId: patch.forStateId }
              : {}),
            ...(patch.placement !== undefined
              ? { placement: patch.placement }
              : {}),
            ...(patch.label !== undefined ? { label: patch.label } : {}),
          }
        : n,
    ),
  };
}
