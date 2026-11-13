/**
 * Atom-MermaidEmitter
 * 内部 AST + 各種メタデータ → Mermaid テキスト（コメント付き）
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MermaidEmitter.md
 */

import type {
  Edge,
  EdgeArrowEnd,
  EdgeArrowStart,
  EdgeControlMap,
  EdgeLine,
  EdgeShapeMap,
  Graph,
  Node,
  PositionMap,
  Subgraph,
} from '../types/schema.js';
import {
  formatPositionComment,
  formatEdgeCtrlComment,
  formatEdgeShapeComment,
} from '../store/position-store.js';

function formatNode(node: Node): string {
  const { id, shape } = node;
  // Markdown label は引用符で囲って emit (B3b、round-trip 維持)
  const label = node.labelMarkdown ? `"${node.label}"` : node.label;
  switch (shape) {
    case 'box':              return `${id}[${label}]`;
    case 'rounded':          return `${id}(${label})`;
    case 'stadium':          return `${id}([${label}])`;
    case 'subroutine':       return `${id}[[${label}]]`;
    case 'cylinder':         return `${id}[(${label})]`;
    case 'circle':           return `${id}((${label}))`;
    case 'doubleCircle':     return `${id}(((${label})))`;
    case 'asymmetric':       return `${id}>${label}]`;
    case 'rhombus':          return `${id}{${label}}`;
    case 'hexagon':          return `${id}{{${label}}}`;
    case 'parallelogram':    return `${id}[/${label}/]`;
    case 'parallelogramAlt': return `${id}[\\${label}\\]`;
    case 'trapezoid':        return `${id}[/${label}\\]`;
    case 'trapezoidAlt':     return `${id}[\\${label}/]`;
  }
}

function startSym(s: EdgeArrowStart | undefined): string {
  switch (s) {
    case 'arrow': return '<';
    case 'circle': return 'o';
    case 'cross': return 'x';
    default: return '';
  }
}

function endSym(e: EdgeArrowEnd | undefined): string {
  switch (e) {
    case 'arrow': return '>';
    case 'circle': return 'o';
    case 'cross': return 'x';
    default: return '';
  }
}

function formatEdgeArrowClean(edge: Edge): string {
  const line: EdgeLine = edge.line ?? 'solid';
  const start = startSym(edge.arrowStart);
  const end = endSym(edge.arrowEnd ?? 'arrow');
  switch (line) {
    case 'solid':  return `${start}--${end}`;
    case 'thick':  return `${start}==${end}`;
    case 'dotted': return `${start}-.${end}`;
  }
}
function indentLines(lines: string[], depth: number): string[] {
  const pad = '    '.repeat(depth);
  return lines.map((l) => pad + l);
}

function emitSubgraphBlock(
  sg: Subgraph,
  graph: Graph,
  depth: number,
  emittedNodes: Set<string>,
  subgraphById: Map<string, Subgraph>,
): string[] {
  const lines: string[] = [];
  const header = sg.title ? `subgraph ${sg.id} [${sg.title}]` : `subgraph ${sg.id}`;
  lines.push(header);
  if (sg.direction) lines.push(`    direction ${sg.direction}`);
  // 子 subgraph を先に出力（mermaid 上はどちらでも問題ない）
  for (const childId of sg.childSubgraphIds) {
    const child = subgraphById.get(childId);
    if (!child) continue;
    const childLines = emitSubgraphBlock(child, graph, depth + 1, emittedNodes, subgraphById);
    lines.push(...indentLines(childLines, 1));
  }
  for (const nid of sg.nodeIds) {
    const node = graph.nodes.find((n) => n.id === nid);
    if (!node) continue;
    if (emittedNodes.has(nid)) continue;
    // subgraph 内ではノードを必ず書き出す（subgraph への所属を明示するため）。
    // デフォルト box (label=id) は素の ID だけ出す。
    if (node.shape === 'box' && node.label === node.id) {
      lines.push(`    ${node.id}`);
    } else {
      lines.push(`    ${formatNode(node)}`);
    }
    emittedNodes.add(nid);
  }
  lines.push(`end`);
  return lines;
}

export function emitMermaid(
  graph: Graph,
  positions: PositionMap,
  options: {
    edgeControls?: EdgeControlMap;
    edgeShapes?: EdgeShapeMap;
  } = {},
): string {
  const lines: string[] = [];
  lines.push(`graph ${graph.direction}`);

  const subgraphs = graph.subgraphs ?? [];
  const subgraphById = new Map<string, Subgraph>(subgraphs.map((s) => [s.id, s]));
  const childIds = new Set<string>();
  for (const sg of subgraphs) {
    for (const c of sg.childSubgraphIds) childIds.add(c);
  }
  const rootSubgraphs = subgraphs.filter((s) => !childIds.has(s.id));
  const nodesInSubgraphs = new Set<string>();
  for (const sg of subgraphs) {
    for (const nid of sg.nodeIds) nodesInSubgraphs.add(nid);
  }

  const emittedNodes = new Set<string>();

  // subgraph 群 (root) を先に出す
  for (const sg of rootSubgraphs) {
    const block = emitSubgraphBlock(sg, graph, 0, emittedNodes, subgraphById);
    lines.push(...indentLines(block, 1));
  }

  // subgraph に属さないノードを出す
  for (const node of graph.nodes) {
    if (nodesInSubgraphs.has(node.id)) continue;
    if (emittedNodes.has(node.id)) continue;
    if (node.shape === 'box' && node.label === node.id) {
      const isReferenced = graph.edges.some(
        (e) => e.source === node.id || e.target === node.id,
      );
      if (isReferenced) continue;
    }
    lines.push(`    ${formatNode(node)}`);
  }

  for (const edge of graph.edges) {
    const arrow = formatEdgeArrowClean(edge);
    const labelPart = edge.label ? `|${edge.label}|` : '';
    lines.push(`    ${edge.source} ${arrow}${labelPart} ${edge.target}`);
  }

  // ─── L2 スタイル (Phase B) ───
  // classDef
  for (const cd of graph.classDefs ?? []) {
    lines.push(`    classDef ${cd.name} ${cd.style}`);
  }
  // node inline style
  for (const node of graph.nodes) {
    if (node.style) lines.push(`    style ${node.id} ${node.style}`);
  }
  // class assignment (className → nodeIds、出現順にまとめて 1 行)
  const classOrder: string[] = [];
  const classMembers = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const c of node.classes ?? []) {
      if (!classMembers.has(c)) {
        classMembers.set(c, []);
        classOrder.push(c);
      }
      classMembers.get(c)!.push(node.id);
    }
  }
  for (const c of classOrder) {
    lines.push(`    class ${classMembers.get(c)!.join(',')} ${c}`);
  }
  // L2/L3 extras (Pattern 7、raw 行をそのまま)
  for (const ex of graph.extras ?? []) {
    lines.push(`    ${ex.raw}`);
  }

  const posLine = formatPositionComment(positions);
  if (posLine) lines.push(posLine);

  const shapesFromEdges: EdgeShapeMap = {};
  for (const e of graph.edges) {
    if (e.shape && e.shape !== 'default') {
      shapesFromEdges[e.id] = e.shape;
    }
  }
  const mergedShapes: EdgeShapeMap = { ...shapesFromEdges, ...(options.edgeShapes ?? {}) };
  const shapeLine = formatEdgeShapeComment(mergedShapes);
  if (shapeLine) lines.push(shapeLine);

  if (options.edgeControls) {
    const ctrlLine = formatEdgeCtrlComment(options.edgeControls);
    if (ctrlLine) lines.push(ctrlLine);
  }

  return lines.join('\n');
}
