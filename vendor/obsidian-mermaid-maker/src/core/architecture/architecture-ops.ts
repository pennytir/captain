/**
 * Atom-ArchitectureOps (M20)
 *
 * ArchitectureDiagram への immutable CRUD 純関数群。
 * [[Atom-ArchitectureCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、requirementOps をミラー = Pattern 4)。
 * 関数名は Architecture prefix で統一 (罠 2、barrel 衝突回避)。
 * req の 2 ノード種 (10 関数) → 3 ノード種 (group/service/junction、13 関数)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ArchitectureOps.md
 */

import type {
  ArchitectureArrow,
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureService,
  ArchitectureSide,
} from '../types/architecture-schema.js';

// ── id 採番 helper ──
function nextEdgeId(diagram: ArchitectureDiagram): string {
  let max = -1;
  for (const e of diagram.edges) {
    const m = e.id.match(/^edge(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `edge${max + 1}`;
}

/** parent === parentId の子ノードを top-level へ昇格 (group 削除時の orphan 化) */
function orphan<T extends { parent?: string }>(arr: T[], parentId: string): T[] {
  return arr.map((n) => {
    if (n.parent !== parentId) return n;
    const next = { ...n };
    delete next.parent;
    return next;
  });
}

// ── group CRUD ────────────────────────────────────────
export function addArchitectureGroup(
  diagram: ArchitectureDiagram,
  init: { id: string; icon?: string; title?: string; parent?: string },
): { diagram: ArchitectureDiagram; group: ArchitectureGroup } {
  const existing = diagram.groups.find((g) => g.id === init.id);
  if (existing) {
    return { diagram: { ...diagram, groups: [...diagram.groups] }, group: existing };
  }
  const group: ArchitectureGroup = {
    id: init.id,
    ...(init.icon !== undefined && init.icon !== '' ? { icon: init.icon } : {}),
    ...(init.title !== undefined && init.title !== '' ? { title: init.title } : {}),
    ...(init.parent !== undefined && init.parent !== '' ? { parent: init.parent } : {}),
  };
  return { diagram: { ...diagram, groups: [...diagram.groups, group] }, group };
}

export function removeArchitectureGroup(
  diagram: ArchitectureDiagram,
  id: string,
): ArchitectureDiagram {
  return {
    ...diagram,
    // 対象 group を除去 + 残りの group / service / junction で parent===id を orphan 化
    groups: orphan(
      diagram.groups.filter((g) => g.id !== id),
      id,
    ),
    services: orphan(diagram.services, id),
    junctions: orphan(diagram.junctions, id),
    // 連鎖削除: src/dst に id を含む edge を全削除
    edges: diagram.edges.filter((e) => e.src !== id && e.dst !== id),
  };
}

export function updateArchitectureGroup(
  diagram: ArchitectureDiagram,
  id: string,
  patch: { icon?: string; title?: string; parent?: string },
): ArchitectureDiagram {
  return {
    ...diagram,
    groups: diagram.groups.map((g) => {
      if (g.id !== id) return g;
      const next: ArchitectureGroup = { ...g };
      setOptionalString(next, 'icon', patch.icon);
      setOptionalString(next, 'title', patch.title);
      setOptionalString(next, 'parent', patch.parent);
      return next;
    }),
  };
}

// ── service CRUD (group と同形) ───────────────────────
export function addArchitectureService(
  diagram: ArchitectureDiagram,
  init: { id: string; icon?: string; title?: string; parent?: string },
): { diagram: ArchitectureDiagram; service: ArchitectureService } {
  const existing = diagram.services.find((s) => s.id === init.id);
  if (existing) {
    return {
      diagram: { ...diagram, services: [...diagram.services] },
      service: existing,
    };
  }
  const service: ArchitectureService = {
    id: init.id,
    ...(init.icon !== undefined && init.icon !== '' ? { icon: init.icon } : {}),
    ...(init.title !== undefined && init.title !== '' ? { title: init.title } : {}),
    ...(init.parent !== undefined && init.parent !== '' ? { parent: init.parent } : {}),
  };
  return {
    diagram: { ...diagram, services: [...diagram.services, service] },
    service,
  };
}

export function removeArchitectureService(
  diagram: ArchitectureDiagram,
  id: string,
): ArchitectureDiagram {
  return {
    ...diagram,
    services: diagram.services.filter((s) => s.id !== id),
    edges: diagram.edges.filter((e) => e.src !== id && e.dst !== id),
  };
}

export function updateArchitectureService(
  diagram: ArchitectureDiagram,
  id: string,
  patch: { icon?: string; title?: string; parent?: string },
): ArchitectureDiagram {
  return {
    ...diagram,
    services: diagram.services.map((s) => {
      if (s.id !== id) return s;
      const next: ArchitectureService = { ...s };
      setOptionalString(next, 'icon', patch.icon);
      setOptionalString(next, 'title', patch.title);
      setOptionalString(next, 'parent', patch.parent);
      return next;
    }),
  };
}

// ── junction CRUD (icon / title 無し) ─────────────────
export function addArchitectureJunction(
  diagram: ArchitectureDiagram,
  init: { id: string; parent?: string },
): { diagram: ArchitectureDiagram; junction: ArchitectureJunction } {
  const existing = diagram.junctions.find((j) => j.id === init.id);
  if (existing) {
    return {
      diagram: { ...diagram, junctions: [...diagram.junctions] },
      junction: existing,
    };
  }
  const junction: ArchitectureJunction = {
    id: init.id,
    ...(init.parent !== undefined && init.parent !== '' ? { parent: init.parent } : {}),
  };
  return {
    diagram: { ...diagram, junctions: [...diagram.junctions, junction] },
    junction,
  };
}

export function removeArchitectureJunction(
  diagram: ArchitectureDiagram,
  id: string,
): ArchitectureDiagram {
  return {
    ...diagram,
    junctions: diagram.junctions.filter((j) => j.id !== id),
    edges: diagram.edges.filter((e) => e.src !== id && e.dst !== id),
  };
}

export function updateArchitectureJunction(
  diagram: ArchitectureDiagram,
  id: string,
  patch: { parent?: string },
): ArchitectureDiagram {
  return {
    ...diagram,
    junctions: diagram.junctions.map((j) => {
      if (j.id !== id) return j;
      const next: ArchitectureJunction = { ...j };
      setOptionalString(next, 'parent', patch.parent);
      return next;
    }),
  };
}

// ── rename (group / service / junction 共通) ──────────
export function renameArchitectureNode(
  diagram: ArchitectureDiagram,
  oldId: string,
  newId: string,
): ArchitectureDiagram {
  if (newId === '' || newId === oldId) return diagram;
  const renameNode = <T extends { id: string; parent?: string }>(n: T): T => {
    let next = n;
    if (n.id === oldId) next = { ...next, id: newId };
    if (next.parent === oldId) next = { ...next, parent: newId };
    return next;
  };
  return {
    ...diagram,
    groups: diagram.groups.map(renameNode),
    services: diagram.services.map(renameNode),
    junctions: diagram.junctions.map(renameNode),
    edges: diagram.edges.map((e) => ({
      ...e,
      src: e.src === oldId ? newId : e.src,
      dst: e.dst === oldId ? newId : e.dst,
    })),
  };
}

// ── edge CRUD ─────────────────────────────────────────
export function addArchitectureEdge(
  diagram: ArchitectureDiagram,
  init: {
    src: string;
    srcSide?: ArchitectureSide;
    srcIsGroup?: boolean;
    dst: string;
    dstSide?: ArchitectureSide;
    dstIsGroup?: boolean;
    arrow?: ArchitectureArrow;
  },
): { diagram: ArchitectureDiagram; edge: ArchitectureEdge } {
  const edge: ArchitectureEdge = {
    id: nextEdgeId(diagram),
    src: init.src,
    srcSide: init.srcSide ?? 'R',
    ...(init.srcIsGroup ? { srcIsGroup: true } : {}),
    dst: init.dst,
    dstSide: init.dstSide ?? 'L',
    ...(init.dstIsGroup ? { dstIsGroup: true } : {}),
    arrow: init.arrow ?? '-->',
  };
  return { diagram: { ...diagram, edges: [...diagram.edges, edge] }, edge };
}

export function removeArchitectureEdge(
  diagram: ArchitectureDiagram,
  edgeId: string,
): ArchitectureDiagram {
  return {
    ...diagram,
    edges: diagram.edges.filter((e) => e.id !== edgeId),
  };
}

export function updateArchitectureEdge(
  diagram: ArchitectureDiagram,
  edgeId: string,
  patch: Partial<
    Pick<
      ArchitectureEdge,
      'src' | 'srcSide' | 'srcIsGroup' | 'dst' | 'dstSide' | 'dstIsGroup' | 'arrow'
    >
  >,
): ArchitectureDiagram {
  return {
    ...diagram,
    edges: diagram.edges.map((e) => {
      if (e.id !== edgeId) return e;
      const next: ArchitectureEdge = { ...e };
      if (patch.src !== undefined) next.src = patch.src;
      if (patch.srcSide !== undefined) next.srcSide = patch.srcSide;
      if (patch.dst !== undefined) next.dst = patch.dst;
      if (patch.dstSide !== undefined) next.dstSide = patch.dstSide;
      if (patch.arrow !== undefined) next.arrow = patch.arrow;
      setOptionalBool(next, 'srcIsGroup', patch.srcIsGroup);
      setOptionalBool(next, 'dstIsGroup', patch.dstIsGroup);
      return next;
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

/** optional boolean field: false で delete、true で set、undefined で据え置き */
function setOptionalBool<T extends Record<string, unknown>>(
  obj: T,
  key: keyof T,
  value: boolean | undefined,
): void {
  if (value === undefined) return;
  if (value) {
    (obj as Record<string, unknown>)[key as string] = true;
  } else {
    delete obj[key];
  }
}
