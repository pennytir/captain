/**
 * mindmap 用 AST schema (M13.1)
 *
 * flowchart の `Graph` / sequenceDiagram の `SequenceDiagram` / classDiagram の `ClassDiagram` とは完全別。
 * mindmap は再帰 tree 構造 (cross-link 不可)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MindmapParser.md
 */

export type MindmapShape =
  | 'default' // bare: just text
  | 'square' // [text]
  | 'rounded' // (text)
  | 'circle' // ((text))
  | 'bang' // ))text((
  | 'cloud' // )text(
  | 'hexagon'; // {{text}}

export type MindmapNode = {
  /** 'n0', 'n1', ... DFS 出現順で採番 */
  id: string;
  /** 表示テキスト (shape 記号を除いた中身) */
  label: string;
  /** 形状 */
  shape: MindmapShape;
  /** M13.3 L2: icon directive (`::icon(fa fa-book)` の `fa fa-book`) */
  icon?: string;
  /** M13.3 L2: CSS class (`:::className` の className 部分) */
  className?: string;
  /** 子ノード (出現順保持) */
  children: MindmapNode[];
};

/** M13.3 L3: 認識できない / 未対応 syntax の raw 行保持 (Pattern 7) */
export type MindmapExtraLine = {
  /** 'ex0', 'ex1', ... 出現順 */
  id: string;
  /** 行全体 (先頭インデント trim 済) */
  raw: string;
};

export type MindmapDiagram = {
  /** 空 mindmap は root null */
  root: MindmapNode | null;
  /** M13.3 L3: extras (accTitle / accDescr / その他) */
  extras?: MindmapExtraLine[];
};

export type MindmapParseError = {
  message: string;
  line?: number;
};

export type MindmapParseResult =
  | { ok: true; diagram: MindmapDiagram }
  | { ok: false; error: MindmapParseError };

export const emptyMindmapDiagram: MindmapDiagram = {
  root: null,
};
