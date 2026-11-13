/**
 * Atom-ClassOps (M12.2)
 *
 * ClassDiagram への immutable CRUD 純関数群。
 * [[Atom-ClassCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、GraphOps / SequenceOps と同設計 = Pattern 4)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ClassOps.md
 */

import type {
  ClassDiagram,
  ClassField,
  ClassMember,
  ClassMethod,
  ClassNode,
  ClassNote,
  ClassRelation,
  ClassRelationKind,
  ClassVisibility,
} from '../types/class-schema.js';

// ── id 採番 helper (diagram 全体で一意) ────────────────
function nextMemberId(
  diagram: ClassDiagram,
  prefix: 'fld' | 'mth',
): string {
  let max = -1;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const cls of diagram.classes) {
    for (const m of cls.members) {
      const match = m.id.match(re);
      if (match) {
        const n = Number(match[1]);
        if (n > max) max = n;
      }
    }
  }
  return `${prefix}${max + 1}`;
}

function nextRelationId(diagram: ClassDiagram): string {
  let max = -1;
  for (const r of diagram.relations) {
    const m = r.id.match(/^r(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `r${max + 1}`;
}

function ensureClassExists(
  diagram: ClassDiagram,
  id: string,
): ClassDiagram {
  if (diagram.classes.some((c) => c.id === id)) return diagram;
  const cls: ClassNode = { id, label: id, members: [] };
  return { ...diagram, classes: [...diagram.classes, cls] };
}

// ── class CRUD ────────────────────────────────────────
export function addClass(
  diagram: ClassDiagram,
  init: { id: string; label?: string },
): { diagram: ClassDiagram; cls: ClassNode } {
  if (diagram.classes.some((c) => c.id === init.id)) {
    const existing = diagram.classes.find((c) => c.id === init.id)!;
    return { diagram: { ...diagram, classes: [...diagram.classes] }, cls: existing };
  }
  const cls: ClassNode = {
    id: init.id,
    label: init.label ?? init.id,
    members: [],
  };
  return {
    diagram: { ...diagram, classes: [...diagram.classes, cls] },
    cls,
  };
}

export function removeClass(diagram: ClassDiagram, id: string): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.filter((c) => c.id !== id),
    // 連鎖削除: from/to に id を含む relation を全削除
    relations: diagram.relations.filter(
      (r) => r.from !== id && r.to !== id,
    ),
  };
}

export function renameClass(
  diagram: ClassDiagram,
  id: string,
  patch: { newId?: string; label?: string },
): ClassDiagram {
  const newId = patch.newId ?? id;
  const newClasses = diagram.classes.map((c) =>
    c.id === id
      ? {
          ...c,
          ...(patch.newId ? { id: newId } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
        }
      : c,
  );
  const newRelations = patch.newId
    ? diagram.relations.map((r) => ({
        ...r,
        from: r.from === id ? newId : r.from,
        to: r.to === id ? newId : r.to,
      }))
    : [...diagram.relations];
  return { ...diagram, classes: newClasses, relations: newRelations };
}

export function setClassLabel(
  diagram: ClassDiagram,
  id: string,
  label: string,
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) => (c.id === id ? { ...c, label } : c)),
  };
}

// ── member CRUD ──────────────────────────────────────
function updateClassMembers(
  diagram: ClassDiagram,
  classId: string,
  fn: (members: ClassMember[]) => ClassMember[],
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) =>
      c.id === classId ? { ...c, members: fn([...c.members]) } : c,
    ),
  };
}

export function addField(
  diagram: ClassDiagram,
  classId: string,
  init: { visibility?: ClassVisibility; type?: string; name: string },
): { diagram: ClassDiagram; member: ClassField } {
  const member: ClassField = {
    kind: 'field',
    id: nextMemberId(diagram, 'fld'),
    visibility: init.visibility ?? 'public',
    ...(init.type ? { type: init.type } : {}),
    name: init.name,
  };
  // 暗黙 class 登録
  const withClass = ensureClassExists(diagram, classId);
  const next = updateClassMembers(withClass, classId, (ms) => [...ms, member]);
  return { diagram: next, member };
}

export function addMethod(
  diagram: ClassDiagram,
  classId: string,
  init: {
    visibility?: ClassVisibility;
    returnType?: string;
    name: string;
    params?: Array<{ type?: string; name: string }>;
  },
): { diagram: ClassDiagram; member: ClassMethod } {
  const member: ClassMethod = {
    kind: 'method',
    id: nextMemberId(diagram, 'mth'),
    visibility: init.visibility ?? 'public',
    ...(init.returnType ? { returnType: init.returnType } : {}),
    name: init.name,
    params: init.params ? init.params.map((p) => ({ ...p })) : [],
  };
  const withClass = ensureClassExists(diagram, classId);
  const next = updateClassMembers(withClass, classId, (ms) => [...ms, member]);
  return { diagram: next, member };
}

export function removeMember(
  diagram: ClassDiagram,
  classId: string,
  memberId: string,
): ClassDiagram {
  return updateClassMembers(diagram, classId, (ms) =>
    ms.filter((m) => m.id !== memberId),
  );
}

export function updateField(
  diagram: ClassDiagram,
  classId: string,
  memberId: string,
  patch: Partial<Pick<ClassField, 'visibility' | 'type' | 'name'>>,
): ClassDiagram {
  return updateClassMembers(diagram, classId, (ms) =>
    ms.map((m) =>
      m.id === memberId && m.kind === 'field' ? { ...m, ...patch } : m,
    ),
  );
}

export function updateMethod(
  diagram: ClassDiagram,
  classId: string,
  memberId: string,
  patch: Partial<
    Pick<ClassMethod, 'visibility' | 'returnType' | 'name' | 'params'>
  >,
): ClassDiagram {
  return updateClassMembers(diagram, classId, (ms) =>
    ms.map((m) =>
      m.id === memberId && m.kind === 'method' ? { ...m, ...patch } : m,
    ),
  );
}

export function reorderMember(
  diagram: ClassDiagram,
  classId: string,
  memberId: string,
  direction: 'up' | 'down',
): ClassDiagram {
  return updateClassMembers(diagram, classId, (ms) => {
    const idx = ms.findIndex((m) => m.id === memberId);
    if (idx === -1) return ms;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ms.length) return ms;
    [ms[idx], ms[target]] = [ms[target], ms[idx]];
    return ms;
  });
}

// ── relation CRUD ────────────────────────────────────
export function addRelation(
  diagram: ClassDiagram,
  init: {
    from: string;
    to: string;
    kind: ClassRelationKind;
    label?: string;
  },
): { diagram: ClassDiagram; relation: ClassRelation } {
  const relation: ClassRelation = {
    id: nextRelationId(diagram),
    from: init.from,
    to: init.to,
    kind: init.kind,
    ...(init.label ? { label: init.label } : {}),
  };
  // 暗黙 class 登録
  let withClasses = ensureClassExists(diagram, init.from);
  withClasses = ensureClassExists(withClasses, init.to);
  return {
    diagram: { ...withClasses, relations: [...withClasses.relations, relation] },
    relation,
  };
}

export function removeRelation(
  diagram: ClassDiagram,
  relationId: string,
): ClassDiagram {
  return {
    ...diagram,
    relations: diagram.relations.filter((r) => r.id !== relationId),
  };
}

export function updateRelation(
  diagram: ClassDiagram,
  relationId: string,
  patch: Partial<Pick<ClassRelation, 'from' | 'to' | 'kind' | 'label'>>,
): ClassDiagram {
  return {
    ...diagram,
    relations: diagram.relations.map((r) => {
      if (r.id !== relationId) return r;
      const next: ClassRelation = {
        ...r,
        ...(patch.from !== undefined ? { from: patch.from } : {}),
        ...(patch.to !== undefined ? { to: patch.to } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      };
      if (patch.label !== undefined) {
        // 空文字なら label を削除、それ以外は設定
        if (patch.label === '') {
          delete (next as { label?: string }).label;
        } else {
          next.label = patch.label;
        }
      }
      return next;
    }),
  };
}

// ============================================================
// M12.3b L2 ops: notes / annotation / generic
// ============================================================

function nextNoteId(diagram: ClassDiagram): string {
  let max = -1;
  for (const n of diagram.notes ?? []) {
    const m = n.id.match(/^cn(\d+)$/);
    if (m) {
      const num = Number(m[1]);
      if (num > max) max = num;
    }
  }
  return `cn${max + 1}`;
}

export function addClassNote(
  diagram: ClassDiagram,
  init: { forClassId?: string; label: string },
): { diagram: ClassDiagram; note: ClassNote } {
  const note: ClassNote = {
    id: nextNoteId(diagram),
    ...(init.forClassId ? { forClassId: init.forClassId } : {}),
    label: init.label,
  };
  const newNotes = [...(diagram.notes ?? []), note];
  return {
    diagram: { ...diagram, notes: newNotes },
    note,
  };
}

export function removeClassNote(
  diagram: ClassDiagram,
  noteId: string,
): ClassDiagram {
  if (!diagram.notes) return { ...diagram };
  const filtered = diagram.notes.filter((n) => n.id !== noteId);
  const next: ClassDiagram = { ...diagram };
  if (filtered.length === 0) {
    delete next.notes; // L1 互換戻し
  } else {
    next.notes = filtered;
  }
  return next;
}

export function updateClassNote(
  diagram: ClassDiagram,
  noteId: string,
  patch: Partial<Pick<ClassNote, 'forClassId' | 'label'>>,
): ClassDiagram {
  if (!diagram.notes) return { ...diagram };
  return {
    ...diagram,
    notes: diagram.notes.map((n) => {
      if (n.id !== noteId) return n;
      const next: ClassNote = {
        ...n,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
      };
      // forClassId: 空文字なら standalone 化 (delete)、未指定ならスキップ、文字列なら設定
      if (patch.forClassId !== undefined) {
        if (patch.forClassId === '') {
          delete (next as { forClassId?: string }).forClassId;
        } else {
          next.forClassId = patch.forClassId;
        }
      }
      return next;
    }),
  };
}

export function setClassAnnotation(
  diagram: ClassDiagram,
  classId: string,
  annotation: string,
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) =>
      c.id === classId ? { ...c, annotation } : c,
    ),
  };
}

export function clearClassAnnotation(
  diagram: ClassDiagram,
  classId: string,
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) => {
      if (c.id !== classId) return c;
      const next: ClassNode = { ...c };
      delete (next as { annotation?: string }).annotation;
      return next;
    }),
  };
}

export function setClassGeneric(
  diagram: ClassDiagram,
  classId: string,
  generic: string,
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) =>
      c.id === classId ? { ...c, generic } : c,
    ),
  };
}

export function clearClassGeneric(
  diagram: ClassDiagram,
  classId: string,
): ClassDiagram {
  return {
    ...diagram,
    classes: diagram.classes.map((c) => {
      if (c.id !== classId) return c;
      const next: ClassNode = { ...c };
      delete (next as { generic?: string }).generic;
      return next;
    }),
  };
}
