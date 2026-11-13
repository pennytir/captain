/**
 * architecture-beta 用 AST schema (M20)
 *
 * flowchart の `Graph` / requirementDiagram の `RequirementDiagram` とは完全別。混ぜない (30_How M10 規約)。
 * requirement をミラー (node + 関係) しつつ、req の 2 ノード種 → 3 ノード種 (group / service / junction)、
 * 有向 type ラベル → port 付き有向 edge (T/B/L/R + 4 arrow)、平坦 → 入れ子 group へ拡張。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ArchitectureParser.md
 */

/** 接続辺の port (ノードの 4 辺) */
export type ArchitectureSide = 'T' | 'B' | 'L' | 'R';

/** edge の矢印種別 (方向) */
export type ArchitectureArrow = '--' | '-->' | '<--' | '<-->';

/** 入れ子可能なコンテナ */
export type ArchitectureGroup = {
  /** ノード名 = id (edge src/dst / parent の参照キー、xyflow node id) */
  id: string;
  /** `(database)` 等の組込名 or `(logos:aws)` の iconify 名 */
  icon?: string;
  title?: string;
  /** `in {親id}` 句。無ければ top-level */
  parent?: string;
};

/** icon + title を持つ末端ノード */
export type ArchitectureService = {
  id: string;
  icon?: string;
  title?: string;
  parent?: string;
};

/** 4 方向分岐点 (icon / title 無し) */
export type ArchitectureJunction = {
  id: string;
  parent?: string;
};

/** port 付き有向 edge */
export type ArchitectureEdge = {
  /** 'edge0', 'edge1', ... 出現順 */
  id: string;
  /** source ノード id */
  src: string;
  /** source の接続辺 */
  srcSide: ArchitectureSide;
  /** src が service ではなく group を指す (`{group}` マーカー) */
  srcIsGroup?: boolean;
  /** dest ノード id */
  dst: string;
  /** dest の接続辺 */
  dstSide: ArchitectureSide;
  /** dst が group を指す (`{group}` マーカー) */
  dstIsGroup?: boolean;
  arrow: ArchitectureArrow;
};

/** 未対応構文を round-trip 維持で raw 保持 (Pattern 7) */
export type ArchitectureExtraLine = {
  /** 'ex0', 'ex1', ... 出現順 */
  id: string;
  raw: string;
};

export type ArchitectureDiagram = {
  groups: ArchitectureGroup[];
  services: ArchitectureService[];
  junctions: ArchitectureJunction[];
  edges: ArchitectureEdge[];
  /** 未対応 raw 行。空なら undefined */
  extras?: ArchitectureExtraLine[];
};

export type ArchitectureParseError = {
  message: string;
  line?: number;
};

export type ArchitectureParseResult =
  | { ok: true; diagram: ArchitectureDiagram }
  | { ok: false; error: ArchitectureParseError };

export const emptyArchitectureDiagram: ArchitectureDiagram = {
  groups: [],
  services: [],
  junctions: [],
  edges: [],
};

/** 接続辺一覧 (parser / canvas 共有) */
export const ARCHITECTURE_SIDES: readonly ArchitectureSide[] = ['T', 'B', 'L', 'R'];

/** 矢印種別一覧 (parser / emitter 共有) */
export const ARCHITECTURE_ARROWS: readonly ArchitectureArrow[] = [
  '--',
  '-->',
  '<--',
  '<-->',
];

/** mermaid architecture-beta の組込 icon 名 (canvas の icon 描画で参照) */
export const ARCHITECTURE_ICONS: readonly string[] = [
  'cloud',
  'database',
  'disk',
  'internet',
  'server',
];
