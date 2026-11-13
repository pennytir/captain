/**
 * Atom-Layout
 *
 * 座標未指定の Graph に dagre で初期座標を割り当てる純関数。
 * subgraph (cluster) があれば dagre の compound graph として処理し、
 * 各 subgraph のサイズと位置も算出する。
 *
 * 設計: ../../../../50_Mission/zddmission/MermaidMaker/Atom-Layout.md
 */

import dagre from 'dagre';
import type {
  Graph as InternalGraph,
  PositionMap,
  Subgraph,
} from '../types/schema.js';

export type LayoutOptions = {
  direction?: 'LR' | 'RL' | 'TB' | 'BT' | 'TD';
  nodeSpacing?: number;
  rankSpacing?: number;
};

const DEFAULT_NODE_WIDTH = 80;
const DEFAULT_NODE_HEIGHT = 60;

/** Subgraph に対する layout 結果。中心座標 + サイズ。 */
export type SubgraphLayout = { x: number; y: number; width: number; height: number };
export type SubgraphLayoutMap = Record<string, SubgraphLayout>;

function normalizeDir(d: string): 'LR' | 'RL' | 'TB' | 'BT' {
  if (d === 'TD') return 'TB';
  if (d === 'LR' || d === 'RL' || d === 'TB' || d === 'BT') return d;
  return 'LR';
}

export function fillMissingPositions(
  graph: InternalGraph,
  existing: PositionMap,
  options: LayoutOptions = {},
): PositionMap {
  if (graph.nodes.length === 0) return {};

  const direction = normalizeDir(options.direction ?? graph.direction);
  const nodeSpacing = options.nodeSpacing ?? 100;
  const rankSpacing = options.rankSpacing ?? 150;

  const dg = new dagre.graphlib.Graph({ compound: true });
  dg.setGraph({
    rankdir: direction,
    nodesep: nodeSpacing,
    ranksep: rankSpacing,
  });
  dg.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    dg.setNode(node.id, {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    });
  }

  // subgraph 群を compound 親として登録
  const subgraphs = graph.subgraphs ?? [];
  for (const sg of subgraphs) {
    dg.setNode(sg.id, { label: sg.title ?? sg.id, clusterLabelPos: 'top' });
  }
  // parent-child 設定
  for (const sg of subgraphs) {
    for (const nid of sg.nodeIds) {
      dg.setParent(nid, sg.id);
    }
    for (const childSgId of sg.childSubgraphIds) {
      dg.setParent(childSgId, sg.id);
    }
  }

  for (const edge of graph.edges) {
    if (edge.source !== edge.target) {
      dg.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(dg);

  const result: PositionMap = {};
  for (const node of graph.nodes) {
    const dn = dg.node(node.id);
    if (dn && Number.isFinite(dn.x) && Number.isFinite(dn.y)) {
      result[node.id] = { x: dn.x, y: dn.y };
    } else {
      result[node.id] = { x: 0, y: 0 };
    }
  }

  for (const id of Object.keys(existing)) {
    result[id] = existing[id];
  }

  return result;
}

/**
 * Subgraph 群の中心座標とサイズを返す。座標は dagre による計算結果。
 * 既存ノード座標を尊重する形では出さない（あくまで初期 layout の参考）。
 * subgraph 自体の位置を既存ノード座標から再計算したい場合は別途 `computeSubgraphBounds` を使う。
 */
export function computeSubgraphLayout(
  graph: InternalGraph,
  options: LayoutOptions = {},
): SubgraphLayoutMap {
  if (graph.nodes.length === 0 || !graph.subgraphs?.length) return {};

  const direction = normalizeDir(options.direction ?? graph.direction);
  const dg = new dagre.graphlib.Graph({ compound: true });
  dg.setGraph({
    rankdir: direction,
    nodesep: options.nodeSpacing ?? 100,
    ranksep: options.rankSpacing ?? 150,
  });
  dg.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    dg.setNode(node.id, { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT });
  }
  for (const sg of graph.subgraphs) {
    dg.setNode(sg.id, { label: sg.title ?? sg.id });
  }
  for (const sg of graph.subgraphs) {
    for (const nid of sg.nodeIds) dg.setParent(nid, sg.id);
    for (const cid of sg.childSubgraphIds) dg.setParent(cid, sg.id);
  }
  for (const edge of graph.edges) {
    if (edge.source !== edge.target) dg.setEdge(edge.source, edge.target);
  }

  dagre.layout(dg);

  const out: SubgraphLayoutMap = {};
  for (const sg of graph.subgraphs) {
    const dn = dg.node(sg.id);
    if (dn && Number.isFinite(dn.x) && Number.isFinite(dn.y)) {
      out[sg.id] = {
        x: dn.x,
        y: dn.y,
        width: dn.width ?? 0,
        height: dn.height ?? 0,
      };
    }
  }
  return out;
}

/**
 * 与えられたノード座標から、subgraph の bounds (中心 + 幅高さ) を計算する。
 * 子 subgraph も再帰的に含める。GUI 側で subgraph rect を描画する際に使う。
 */
export function computeSubgraphBounds(
  graph: InternalGraph,
  positions: PositionMap,
  options: { nodeWidth?: number; nodeHeight?: number; padding?: number } = {},
): SubgraphLayoutMap {
  const subgraphs = graph.subgraphs ?? [];
  if (subgraphs.length === 0) return {};
  const w = options.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const h = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const pad = options.padding ?? 24;
  const byId = new Map<string, Subgraph>(subgraphs.map((s) => [s.id, s]));
  const cache = new Map<string, SubgraphLayout>();

  function visit(sg: Subgraph): SubgraphLayout | null {
    const cached = cache.get(sg.id);
    if (cached) return cached;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const nid of sg.nodeIds) {
      const p = positions[nid];
      if (!p) continue;
      any = true;
      minX = Math.min(minX, p.x - w / 2);
      minY = Math.min(minY, p.y - h / 2);
      maxX = Math.max(maxX, p.x + w / 2);
      maxY = Math.max(maxY, p.y + h / 2);
    }
    for (const cid of sg.childSubgraphIds) {
      const child = byId.get(cid);
      if (!child) continue;
      const cb = visit(child);
      if (!cb) continue;
      any = true;
      minX = Math.min(minX, cb.x - cb.width / 2);
      minY = Math.min(minY, cb.y - cb.height / 2);
      maxX = Math.max(maxX, cb.x + cb.width / 2);
      maxY = Math.max(maxY, cb.y + cb.height / 2);
    }
    if (!any) return null;
    const bound: SubgraphLayout = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2 - pad / 2,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2 + 24, // title 領域
    };
    cache.set(sg.id, bound);
    return bound;
  }
  for (const sg of subgraphs) visit(sg);
  const out: SubgraphLayoutMap = {};
  for (const [id, b] of cache.entries()) out[id] = b;
  return out;
}
