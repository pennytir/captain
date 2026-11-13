/**
 * Atom-MindmapOps (M13.2)
 *
 * MindmapDiagram への immutable CRUD 純関数群。
 * [[Atom-MindmapCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、GraphOps / SequenceOps / ClassOps と同設計 = Pattern 4 4 件目)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MindmapOps.md
 */

import type {
  MindmapDiagram,
  MindmapNode,
  MindmapShape,
} from '../types/mindmap-schema.js';

// ── helper: deep clone ────────────────────────────────
function cloneNode(n: MindmapNode): MindmapNode {
  return {
    id: n.id,
    label: n.label,
    shape: n.shape,
    ...(n.icon !== undefined ? { icon: n.icon } : {}),
    ...(n.className !== undefined ? { className: n.className } : {}),
    children: n.children.map(cloneNode),
  };
}

function cloneDiagram(d: MindmapDiagram): MindmapDiagram {
  return {
    root: d.root ? cloneNode(d.root) : null,
    ...(d.extras ? { extras: d.extras.map((e) => ({ ...e })) } : {}),
  };
}

// ── helper: find context (node + parent + index) ───────
type NodeCtx = {
  node: MindmapNode;
  parent: MindmapNode | null; // null = root
  index: number; // parent.children 内の index (root の場合は -1)
};

function findContext(
  root: MindmapNode | null,
  id: string,
  parent: MindmapNode | null = null,
  index = -1,
): NodeCtx | null {
  if (root === null) return null;
  if (root.id === id) return { node: root, parent, index };
  for (let i = 0; i < root.children.length; i++) {
    const r = findContext(root.children[i]!, id, root, i);
    if (r) return r;
  }
  return null;
}

// ── helper: 再採番 (DFS 出現順で 'n0','n1',...) ────────
function reassignIds(root: MindmapNode): void {
  let counter = 0;
  function walk(n: MindmapNode): void {
    n.id = `n${counter++}`;
    for (const c of n.children) walk(c);
  }
  walk(root);
}

// ── helper: subtree に id 含むかチェック ────────────────
function subtreeContainsId(node: MindmapNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => subtreeContainsId(c, id));
}

// ── L1 ops ────────────────────────────────────────────

export function addMindmapChild(
  diagram: MindmapDiagram,
  parentId: string,
  label: string,
  shape: MindmapShape = 'default',
): { diagram: MindmapDiagram; node: MindmapNode | null } {
  if (diagram.root === null) {
    return { diagram, node: null };
  }
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, parentId);
  if (!ctx) return { diagram, node: null };
  const newNode: MindmapNode = {
    id: 'tmp',
    label,
    shape,
    children: [],
  };
  ctx.node.children.push(newNode);
  reassignIds(next.root!);
  // newNode は reassign 後の id でも取れる: parent の最後の child
  const reassignedNode =
    ctx.node.children[ctx.node.children.length - 1] ?? null;
  return { diagram: next, node: reassignedNode };
}

export function removeMindmapNode(
  diagram: MindmapDiagram,
  id: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  if (ctx.parent === null) {
    // root を消す
    next.root = null;
    return next;
  }
  ctx.parent.children.splice(ctx.index, 1);
  if (next.root) reassignIds(next.root);
  return next;
}

export function setMindmapRoot(
  diagram: MindmapDiagram,
  label: string,
  shape: MindmapShape = 'default',
): MindmapDiagram {
  if (diagram.root !== null) return diagram;
  return {
    ...diagram,
    root: { id: 'n0', label, shape, children: [] },
  };
}

export function renameMindmapNode(
  diagram: MindmapDiagram,
  id: string,
  newLabel: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  ctx.node.label = newLabel;
  return next;
}

export function setMindmapNodeShape(
  diagram: MindmapDiagram,
  id: string,
  shape: MindmapShape,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  ctx.node.shape = shape;
  return next;
}

export function moveMindmapNode(
  diagram: MindmapDiagram,
  id: string,
  newParentId: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  if (id === newParentId) return diagram;
  // 循環チェック: newParentId が id の subtree にあれば NG
  const origCtx = findContext(diagram.root, id);
  if (!origCtx) return diagram;
  if (subtreeContainsId(origCtx.node, newParentId)) return diagram;
  // root を move しようとした場合は NG (root は親を持たない)
  if (origCtx.parent === null) return diagram;

  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx || !ctx.parent) return diagram;
  // detach
  const [detached] = ctx.parent.children.splice(ctx.index, 1);
  if (!detached) return diagram;
  // attach to new parent
  const newParentCtx = findContext(next.root, newParentId);
  if (!newParentCtx) return diagram;
  newParentCtx.node.children.push(detached);
  if (next.root) reassignIds(next.root);
  return next;
}

export function reorderMindmapNode(
  diagram: MindmapDiagram,
  id: string,
  direction: 'up' | 'down',
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx || !ctx.parent) return diagram; // root or not found
  const siblings = ctx.parent.children;
  const i = ctx.index;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return diagram;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  if (next.root) reassignIds(next.root);
  return next;
}

// ── L2 ops (M13.3): icon / className set/clear ───────

export function setMindmapNodeIcon(
  diagram: MindmapDiagram,
  id: string,
  icon: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  ctx.node.icon = icon;
  return next;
}

export function clearMindmapNodeIcon(
  diagram: MindmapDiagram,
  id: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  delete ctx.node.icon;
  return next;
}

export function setMindmapNodeClassName(
  diagram: MindmapDiagram,
  id: string,
  className: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  ctx.node.className = className;
  return next;
}

export function clearMindmapNodeClassName(
  diagram: MindmapDiagram,
  id: string,
): MindmapDiagram {
  if (diagram.root === null) return diagram;
  const next = cloneDiagram(diagram);
  const ctx = findContext(next.root, id);
  if (!ctx) return diagram;
  delete ctx.node.className;
  return next;
}
