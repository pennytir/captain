/**
 * Atom-ErOps (M15.2)
 *
 * ErDiagram への immutable CRUD 純関数群。
 * [[Atom-ErCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、ClassOps をミラー = Pattern 4)。
 * 関数名は er prefix で統一 (命名規約、class の addRelation 等との衝突回避)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ErOps.md
 */

import type {
  ErAttribute,
  ErCardinality,
  ErDiagram,
  ErEntity,
  ErKey,
  ErRelation,
} from '../types/er-schema.js';

// ── id 採番 helper (diagram 全体で一意、parser と同方針) ──
function nextErAttributeId(diagram: ErDiagram): string {
  let max = -1;
  for (const e of diagram.entities) {
    for (const a of e.attributes) {
      const m = a.id.match(/^attr(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
  }
  return `attr${max + 1}`;
}

function nextErRelationId(diagram: ErDiagram): string {
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

function ensureErEntity(diagram: ErDiagram, id: string): ErDiagram {
  if (diagram.entities.some((e) => e.id === id)) return diagram;
  const entity: ErEntity = { id, label: id, attributes: [] };
  return { ...diagram, entities: [...diagram.entities, entity] };
}

// ── entity CRUD ───────────────────────────────────────
export function addErEntity(
  diagram: ErDiagram,
  init: { id: string; label?: string },
): { diagram: ErDiagram; entity: ErEntity } {
  const existing = diagram.entities.find((e) => e.id === init.id);
  if (existing) {
    return {
      diagram: { ...diagram, entities: [...diagram.entities] },
      entity: existing,
    };
  }
  const entity: ErEntity = {
    id: init.id,
    label: init.label ?? init.id,
    attributes: [],
  };
  return {
    diagram: { ...diagram, entities: [...diagram.entities, entity] },
    entity,
  };
}

export function removeErEntity(diagram: ErDiagram, id: string): ErDiagram {
  return {
    ...diagram,
    entities: diagram.entities.filter((e) => e.id !== id),
    // 連鎖削除: from/to に id を含む relation を全削除
    relations: diagram.relations.filter((r) => r.from !== id && r.to !== id),
  };
}

export function renameErEntity(
  diagram: ErDiagram,
  id: string,
  patch: { newId?: string; label?: string },
): ErDiagram {
  const newId = patch.newId ?? id;
  const entities = diagram.entities.map((e) =>
    e.id === id
      ? {
          ...e,
          ...(patch.newId ? { id: newId } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
        }
      : e,
  );
  const relations = patch.newId
    ? diagram.relations.map((r) => ({
        ...r,
        from: r.from === id ? newId : r.from,
        to: r.to === id ? newId : r.to,
      }))
    : [...diagram.relations];
  return { ...diagram, entities, relations };
}

export function setErEntityLabel(
  diagram: ErDiagram,
  id: string,
  label: string,
): ErDiagram {
  return {
    ...diagram,
    entities: diagram.entities.map((e) => (e.id === id ? { ...e, label } : e)),
  };
}

// ── attribute CRUD ────────────────────────────────────
function updateErAttributes(
  diagram: ErDiagram,
  entityId: string,
  fn: (attrs: ErAttribute[]) => ErAttribute[],
): ErDiagram {
  return {
    ...diagram,
    entities: diagram.entities.map((e) =>
      e.id === entityId ? { ...e, attributes: fn([...e.attributes]) } : e,
    ),
  };
}

export function addErAttribute(
  diagram: ErDiagram,
  entityId: string,
  init: { type?: string; name: string; keys?: ErKey[]; comment?: string },
): { diagram: ErDiagram; attribute: ErAttribute } {
  const attribute: ErAttribute = {
    id: nextErAttributeId(diagram),
    type: init.type && init.type.trim() !== '' ? init.type : 'string',
    name: init.name,
    keys: init.keys ? [...init.keys] : [],
    ...(init.comment !== undefined && init.comment !== ''
      ? { comment: init.comment }
      : {}),
  };
  // 暗黙 entity 登録
  const withEntity = ensureErEntity(diagram, entityId);
  const next = updateErAttributes(withEntity, entityId, (as) => [
    ...as,
    attribute,
  ]);
  return { diagram: next, attribute };
}

export function removeErAttribute(
  diagram: ErDiagram,
  entityId: string,
  attrId: string,
): ErDiagram {
  return updateErAttributes(diagram, entityId, (as) =>
    as.filter((a) => a.id !== attrId),
  );
}

export function updateErAttribute(
  diagram: ErDiagram,
  entityId: string,
  attrId: string,
  patch: Partial<Pick<ErAttribute, 'type' | 'name' | 'keys' | 'comment'>>,
): ErDiagram {
  return updateErAttributes(diagram, entityId, (as) =>
    as.map((a) => {
      if (a.id !== attrId) return a;
      const next: ErAttribute = {
        ...a,
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.keys !== undefined ? { keys: [...patch.keys] } : {}),
      };
      // comment: 空文字なら削除 (optional)、文字列なら設定
      if (patch.comment !== undefined) {
        if (patch.comment === '') {
          delete (next as { comment?: string }).comment;
        } else {
          next.comment = patch.comment;
        }
      }
      return next;
    }),
  );
}

export function reorderErAttribute(
  diagram: ErDiagram,
  entityId: string,
  attrId: string,
  direction: 'up' | 'down',
): ErDiagram {
  return updateErAttributes(diagram, entityId, (as) => {
    const idx = as.findIndex((a) => a.id === attrId);
    if (idx === -1) return as;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= as.length) return as;
    [as[idx], as[target]] = [as[target], as[idx]];
    return as;
  });
}

// ── relation CRUD ─────────────────────────────────────
export function addErRelation(
  diagram: ErDiagram,
  init: {
    from: string;
    to: string;
    leftCard?: ErCardinality;
    rightCard?: ErCardinality;
    identifying?: boolean;
    label?: string;
  },
): { diagram: ErDiagram; relation: ErRelation } {
  const relation: ErRelation = {
    id: nextErRelationId(diagram),
    from: init.from,
    to: init.to,
    // default: 一対多 (||--o{)
    leftCard: init.leftCard ?? 'exactly-one',
    rightCard: init.rightCard ?? 'zero-or-many',
    identifying: init.identifying ?? true,
    label: init.label ?? '',
  };
  // 暗黙 entity 登録
  let withEntities = ensureErEntity(diagram, init.from);
  withEntities = ensureErEntity(withEntities, init.to);
  return {
    diagram: {
      ...withEntities,
      relations: [...withEntities.relations, relation],
    },
    relation,
  };
}

export function removeErRelation(
  diagram: ErDiagram,
  relationId: string,
): ErDiagram {
  return {
    ...diagram,
    relations: diagram.relations.filter((r) => r.id !== relationId),
  };
}

export function updateErRelation(
  diagram: ErDiagram,
  relationId: string,
  patch: Partial<
    Pick<
      ErRelation,
      'from' | 'to' | 'leftCard' | 'rightCard' | 'identifying' | 'label'
    >
  >,
): ErDiagram {
  return {
    ...diagram,
    relations: diagram.relations.map((r) => {
      if (r.id !== relationId) return r;
      return {
        ...r,
        ...(patch.from !== undefined ? { from: patch.from } : {}),
        ...(patch.to !== undefined ? { to: patch.to } : {}),
        ...(patch.leftCard !== undefined ? { leftCard: patch.leftCard } : {}),
        ...(patch.rightCard !== undefined
          ? { rightCard: patch.rightCard }
          : {}),
        ...(patch.identifying !== undefined
          ? { identifying: patch.identifying }
          : {}),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
      };
    }),
  };
}
