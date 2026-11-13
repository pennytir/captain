/**
 * requirementDiagram 用 AST schema (M19)
 *
 * flowchart の `Graph` / erDiagram の `ErDiagram` とは完全別。混ぜない (30_How M10 規約)。
 * er をミラー (box + 関係) しつつ、er の単一 entity を 2 ノード種 (requirement / element) へ拡張、
 * cardinality crow's foot を有向 type ラベルへ置換。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-RequirementParser.md
 */

/** requirement のサブタイプ (mermaid の 6 キーワード) */
export type RequirementKind =
  | 'requirement'
  | 'functionalRequirement'
  | 'interfaceRequirement'
  | 'performanceRequirement'
  | 'physicalRequirement'
  | 'designConstraint';

/** risk レベル (正規化後) */
export type RequirementRisk = 'Low' | 'Medium' | 'High';

/** 検証方法 (正規化後) */
export type RequirementVerifyMethod =
  | 'Analysis'
  | 'Inspection'
  | 'Test'
  | 'Demonstration';

/** 関係の種別 (mermaid の 7 キーワード) */
export type RequirementRelationType =
  | 'contains'
  | 'copies'
  | 'derives'
  | 'satisfies'
  | 'verifies'
  | 'refines'
  | 'traces';

export type Requirement = {
  /** ノード名 = id (関係 src/dst の参照キー、xyflow node id) */
  id: string;
  kind: RequirementKind;
  /** block 内の `id:` フィールド (表示 id、1.2.1 等)。node id とは別 */
  reqId?: string;
  text?: string;
  risk?: RequirementRisk;
  verifyMethod?: RequirementVerifyMethod;
};

export type RequirementElement = {
  /** ノード名 = id */
  id: string;
  type?: string;
  docref?: string;
};

export type RequirementRelation = {
  /** 'rel0', 'rel1', ... 出現順 */
  id: string;
  /** source ノード id */
  src: string;
  /** dest ノード id */
  dst: string;
  type: RequirementRelationType;
};

/** 未対応構文 (`direction` / `style` 等) を round-trip 維持で raw 保持 (Pattern 7) */
export type RequirementExtraLine = {
  /** 'ex0', 'ex1', ... 出現順 */
  id: string;
  raw: string;
};

export type RequirementDiagram = {
  requirements: Requirement[];
  elements: RequirementElement[];
  relations: RequirementRelation[];
  /** 未対応 raw 行。空なら undefined */
  extras?: RequirementExtraLine[];
};

export type RequirementParseError = {
  message: string;
  line?: number;
};

export type RequirementParseResult =
  | { ok: true; diagram: RequirementDiagram }
  | { ok: false; error: RequirementParseError };

export const emptyRequirementDiagram: RequirementDiagram = {
  requirements: [],
  elements: [],
  relations: [],
};

/** requirement サブタイプキーワードの一覧 (parser / emitter 共有) */
export const REQUIREMENT_KINDS: readonly RequirementKind[] = [
  'requirement',
  'functionalRequirement',
  'interfaceRequirement',
  'performanceRequirement',
  'physicalRequirement',
  'designConstraint',
];

/** 関係キーワードの一覧 (parser / emitter 共有) */
export const REQUIREMENT_RELATION_TYPES: readonly RequirementRelationType[] = [
  'contains',
  'copies',
  'derives',
  'satisfies',
  'verifies',
  'refines',
  'traces',
];
