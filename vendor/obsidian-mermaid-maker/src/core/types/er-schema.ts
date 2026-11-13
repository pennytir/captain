/**
 * erDiagram 用 AST schema (M15.1)
 *
 * flowchart の `Graph` / classDiagram の `ClassDiagram` とは完全別。混ぜない (30_How M10 規約)。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ErParser.md
 */

/** relationship 端の多重度 (crow's foot) */
export type ErCardinality =
  | 'zero-or-one'
  | 'exactly-one'
  | 'zero-or-many'
  | 'one-or-many';

/** 属性の鍵種別 */
export type ErKey = 'PK' | 'FK' | 'UK';

export type ErAttribute = {
  /** 'attr0', 'attr1', ... 出現順 */
  id: string;
  /** データ型 (e.g. 'string', 'int') */
  type: string;
  name: string;
  /** PK / FK / UK (複数可: `PK, FK`) */
  keys: ErKey[];
  /** `"..."` の中身 (未指定なら undefined) */
  comment?: string;
};

export type ErEntity = {
  /** entity 名 = id */
  id: string;
  /** 表示名 (alias `NAME["x"]`、基本 id と同じ) */
  label: string;
  attributes: ErAttribute[];
};

export type ErRelation = {
  /** 'r0', 'r1', ... 出現順 */
  id: string;
  from: string; // entity id (左)
  to: string; // entity id (右)
  leftCard: ErCardinality;
  rightCard: ErCardinality;
  /** true = identifying (実線 `--`) / false = non-identifying (破線 `..`) */
  identifying: boolean;
  /** `:` 以降のラベル (無ければ '') */
  label: string;
};

/** 未対応構文 (`direction` 等) を round-trip 維持で raw 保持 (Pattern 7) */
export type ErExtraLine = {
  /** 'ex0', 'ex1', ... 出現順 */
  id: string;
  raw: string;
};

export type ErDiagram = {
  entities: ErEntity[];
  relations: ErRelation[];
  /** 未対応 raw 行。空なら undefined */
  extras?: ErExtraLine[];
};

export type ErParseError = {
  message: string;
  line?: number;
};

export type ErParseResult =
  | { ok: true; diagram: ErDiagram }
  | { ok: false; error: ErParseError };

export const emptyErDiagram: ErDiagram = {
  entities: [],
  relations: [],
};
