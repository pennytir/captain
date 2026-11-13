/**
 * Internal AST schema for MermaidMaker
 * 設計: ../../50_Mission/zddmission/MermaidMaker/30_How.md
 */

// Mermaid flowchart direction. TD is treated as alias of TB.
export type Direction = 'LR' | 'RL' | 'TB' | 'BT' | 'TD';

export type NodeShape =
  | 'box'              // [text]
  | 'rounded'          // (text)
  | 'stadium'          // ([text])
  | 'subroutine'       // [[text]]
  | 'cylinder'         // [(text)]
  | 'circle'           // ((text))
  | 'doubleCircle'     // (((text)))
  | 'asymmetric'       // >text]
  | 'rhombus'          // {text}
  | 'hexagon'          // {{text}}
  | 'parallelogram'    // [/text/]
  | 'parallelogramAlt' // [\text\]
  | 'trapezoid'        // [/text\]
  | 'trapezoidAlt';    // [\text/]

export type Node = {
  id: string;
  label: string;
  shape: NodeShape;
  /** L2 (Phase B): 割り当てられた classDef 名。`class A red` / `A:::red` 由来 */
  classes?: string[];
  /** L2 (Phase B): inline style。`style A fill:#f9f,stroke:#333` の css 文字列 */
  style?: string;
  /** L2 (Phase B, B3b): 引用符ラベル `["..."]` 由来。label を markdown として描画 */
  labelMarkdown?: boolean;
};

/** L2 (Phase B): `classDef <name> <css>` の定義 */
export type ClassDef = {
  name: string;
  /** css 文字列 (例: 'fill:#f9f,stroke:#333,stroke-width:2px') */
  style: string;
};

/** L2/L3 (Phase B): 認識できない / 未構造化 syntax の raw 行保持 (Pattern 7) */
export type ExtraLine = {
  id: string;
  raw: string;
};

/** Edge curve rendering style (GUI metadata, not part of Mermaid syntax). */
export type EdgeShape = 'default' | 'straight' | 'step' | 'smoothstep';

/** Mermaid edge line style. */
export type EdgeLine = 'solid' | 'dotted' | 'thick';

/** Edge endpoint symbol. `arrow` = `>`, `open` = no symbol, `circle` = `o`, `cross` = `x`. */
export type EdgeArrowEnd = 'arrow' | 'open' | 'circle' | 'cross';

/** Edge start symbol (for bidirectional edges). `none` = no symbol. */
export type EdgeArrowStart = 'none' | 'arrow' | 'circle' | 'cross';

export type Edge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** Mermaid line style. Default 'solid'. */
  line?: EdgeLine;
  /** Mermaid end arrow. Default 'arrow'. */
  arrowEnd?: EdgeArrowEnd;
  /** Mermaid start arrow (for `<-->` etc). Default 'none'. */
  arrowStart?: EdgeArrowStart;
  /** GUI curve rendering style. */
  shape?: EdgeShape;
  /** Optional handle ids used by the GUI to pin which side of each node
   * the edge attaches to. Format: `s-left` / `s-right` / `s-top` / `s-bottom`
   * for source, `t-...` for target. When omitted, the renderer falls back
   * to the closest handle. These are GUI-only metadata and are not emitted
   * to the Mermaid text — they survive only for the lifetime of a session. */
  sourceHandle?: string;
  targetHandle?: string;
};

/**
 * Subgraph (cluster) definition. Flat representation: parent/child
 * relationships are expressed via `nodeIds` and `childSubgraphIds`.
 * `subgraphs` field on `Graph` lists ALL subgraphs in the document
 * (root and nested). Top-level subgraphs are those not referenced as
 * any other subgraph's `childSubgraphIds`.
 */
export type Subgraph = {
  id: string;
  /** Optional display title. If omitted, `id` is used as the title. */
  title?: string;
  /** Optional direction override (`direction TB` inside the subgraph). */
  direction?: Direction;
  /** Direct child node ids (not including nodes inside nested subgraphs). */
  nodeIds: string[];
  /** Direct child subgraph ids (for nesting). */
  childSubgraphIds: string[];
};

export type Graph = {
  direction: Direction;
  nodes: Node[];
  edges: Edge[];
  /** Subgraphs (clusters). Empty / absent means flat graph. */
  subgraphs?: Subgraph[];
  /** L2 (Phase B): classDef 定義群 */
  classDefs?: ClassDef[];
  /** L2/L3 (Phase B): 未構造化 raw 行 (Pattern 7、round-trip 維持) */
  extras?: ExtraLine[];
};

export type Position = { x: number; y: number };

export type PositionMap = Record<string, Position>;

export type EdgeControlMap = Record<string, Position>;
export type EdgeShapeMap = Record<string, EdgeShape>;

export type ParseError = {
  message: string;
  line?: number;
};

export type ParseResult =
  | {
      ok: true;
      graph: Graph;
      positions: PositionMap;
      edgeControls: EdgeControlMap;
      edgeShapes: EdgeShapeMap;
    }
  | { ok: false; error: ParseError };

export const emptyGraph: Graph = {
  direction: 'LR',
  nodes: [],
  edges: [],
};
