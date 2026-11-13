/**
 * Atom-RequirementOps (M19)
 *
 * RequirementDiagram への immutable CRUD 純関数群。
 * [[Atom-RequirementCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、erOps をミラー = Pattern 4)。
 * 関数名は Requirement prefix で統一 (罠 2、class/er の barrel 衝突回避)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-RequirementOps.md
 */

import type {
  Requirement,
  RequirementDiagram,
  RequirementElement,
  RequirementKind,
  RequirementRelation,
  RequirementRelationType,
  RequirementRisk,
  RequirementVerifyMethod,
} from '../types/requirement-schema.js';

// ── id 採番 helper ──
function nextRelationId(diagram: RequirementDiagram): string {
  let max = -1;
  for (const r of diagram.relations) {
    const m = r.id.match(/^rel(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `rel${max + 1}`;
}

// ── requirement CRUD ──────────────────────────────────
export function addRequirement(
  diagram: RequirementDiagram,
  init: {
    id: string;
    kind?: RequirementKind;
    reqId?: string;
    text?: string;
    risk?: RequirementRisk;
    verifyMethod?: RequirementVerifyMethod;
  },
): { diagram: RequirementDiagram; requirement: Requirement } {
  const existing = diagram.requirements.find((r) => r.id === init.id);
  if (existing) {
    return {
      diagram: { ...diagram, requirements: [...diagram.requirements] },
      requirement: existing,
    };
  }
  const requirement: Requirement = {
    id: init.id,
    kind: init.kind ?? 'requirement',
    ...(init.reqId !== undefined && init.reqId !== '' ? { reqId: init.reqId } : {}),
    ...(init.text !== undefined && init.text !== '' ? { text: init.text } : {}),
    ...(init.risk !== undefined ? { risk: init.risk } : {}),
    ...(init.verifyMethod !== undefined
      ? { verifyMethod: init.verifyMethod }
      : {}),
  };
  return {
    diagram: {
      ...diagram,
      requirements: [...diagram.requirements, requirement],
    },
    requirement,
  };
}

export function removeRequirement(
  diagram: RequirementDiagram,
  id: string,
): RequirementDiagram {
  return {
    ...diagram,
    requirements: diagram.requirements.filter((r) => r.id !== id),
    // 連鎖削除: src/dst に id を含む relation を全削除
    relations: diagram.relations.filter((r) => r.src !== id && r.dst !== id),
  };
}

export function updateRequirement(
  diagram: RequirementDiagram,
  id: string,
  patch: {
    kind?: RequirementKind;
    reqId?: string;
    text?: string;
    risk?: RequirementRisk | '';
    verifyMethod?: RequirementVerifyMethod | '';
  },
): RequirementDiagram {
  return {
    ...diagram,
    requirements: diagram.requirements.map((r) => {
      if (r.id !== id) return r;
      const next: Requirement = { ...r };
      if (patch.kind !== undefined) next.kind = patch.kind;
      setOptionalString(next, 'reqId', patch.reqId);
      setOptionalString(next, 'text', patch.text);
      setOptionalEnum(next, 'risk', patch.risk);
      setOptionalEnum(next, 'verifyMethod', patch.verifyMethod);
      return next;
    }),
  };
}

// ── element CRUD ──────────────────────────────────────
export function addRequirementElement(
  diagram: RequirementDiagram,
  init: { id: string; type?: string; docref?: string },
): { diagram: RequirementDiagram; element: RequirementElement } {
  const existing = diagram.elements.find((e) => e.id === init.id);
  if (existing) {
    return {
      diagram: { ...diagram, elements: [...diagram.elements] },
      element: existing,
    };
  }
  const element: RequirementElement = {
    id: init.id,
    ...(init.type !== undefined && init.type !== '' ? { type: init.type } : {}),
    ...(init.docref !== undefined && init.docref !== ''
      ? { docref: init.docref }
      : {}),
  };
  return {
    diagram: { ...diagram, elements: [...diagram.elements, element] },
    element,
  };
}

export function removeRequirementElement(
  diagram: RequirementDiagram,
  id: string,
): RequirementDiagram {
  return {
    ...diagram,
    elements: diagram.elements.filter((e) => e.id !== id),
    relations: diagram.relations.filter((r) => r.src !== id && r.dst !== id),
  };
}

export function updateRequirementElement(
  diagram: RequirementDiagram,
  id: string,
  patch: { type?: string; docref?: string },
): RequirementDiagram {
  return {
    ...diagram,
    elements: diagram.elements.map((e) => {
      if (e.id !== id) return e;
      const next: RequirementElement = { ...e };
      setOptionalString(next, 'type', patch.type);
      setOptionalString(next, 'docref', patch.docref);
      return next;
    }),
  };
}

// ── rename (requirement / element 共通) ───────────────
export function renameRequirementNode(
  diagram: RequirementDiagram,
  oldId: string,
  newId: string,
): RequirementDiagram {
  if (newId === '' || newId === oldId) return diagram;
  return {
    ...diagram,
    requirements: diagram.requirements.map((r) =>
      r.id === oldId ? { ...r, id: newId } : r,
    ),
    elements: diagram.elements.map((e) =>
      e.id === oldId ? { ...e, id: newId } : e,
    ),
    relations: diagram.relations.map((r) => ({
      ...r,
      src: r.src === oldId ? newId : r.src,
      dst: r.dst === oldId ? newId : r.dst,
    })),
  };
}

// ── relation CRUD ─────────────────────────────────────
export function addRequirementRelation(
  diagram: RequirementDiagram,
  init: { src: string; dst: string; type?: RequirementRelationType },
): { diagram: RequirementDiagram; relation: RequirementRelation } {
  const relation: RequirementRelation = {
    id: nextRelationId(diagram),
    src: init.src,
    dst: init.dst,
    type: init.type ?? 'satisfies',
  };
  return {
    diagram: { ...diagram, relations: [...diagram.relations, relation] },
    relation,
  };
}

export function removeRequirementRelation(
  diagram: RequirementDiagram,
  relationId: string,
): RequirementDiagram {
  return {
    ...diagram,
    relations: diagram.relations.filter((r) => r.id !== relationId),
  };
}

export function updateRequirementRelation(
  diagram: RequirementDiagram,
  relationId: string,
  patch: Partial<Pick<RequirementRelation, 'src' | 'dst' | 'type'>>,
): RequirementDiagram {
  return {
    ...diagram,
    relations: diagram.relations.map((r) => {
      if (r.id !== relationId) return r;
      return {
        ...r,
        ...(patch.src !== undefined ? { src: patch.src } : {}),
        ...(patch.dst !== undefined ? { dst: patch.dst } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
      };
    }),
  };
}

// ── 内部 helper ───────────────────────────────────────
/** optional string field: '' で delete、文字列で set、undefined で据え置き */
function setOptionalString<T extends Record<string, unknown>>(
  obj: T,
  key: keyof T,
  value: string | undefined,
): void {
  if (value === undefined) return;
  if (value === '') {
    delete obj[key];
  } else {
    (obj as Record<string, unknown>)[key as string] = value;
  }
}

/** optional enum field: '' で delete、enum 値で set、undefined で据え置き */
function setOptionalEnum<T extends Record<string, unknown>>(
  obj: T,
  key: keyof T,
  value: string | undefined,
): void {
  if (value === undefined) return;
  if (value === '') {
    delete obj[key];
  } else {
    (obj as Record<string, unknown>)[key as string] = value;
  }
}
