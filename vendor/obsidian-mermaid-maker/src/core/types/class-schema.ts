/**
 * classDiagram 用 AST schema (M12.1)
 *
 * flowchart の `Graph` / sequenceDiagram の `SequenceDiagram` とは完全別。
 * 混ぜない (30_How M10 規約)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ClassParser.md
 */

export type ClassVisibility = 'public' | 'private' | 'protected' | 'package';

export type ClassField = {
  kind: 'field';
  /** 'fld0', 'fld1', ... 出現順 */
  id: string;
  visibility: ClassVisibility;
  /** 戻り値型 (e.g. 'String', 'int'); 未指定なら undefined */
  type?: string;
  name: string;
};

export type ClassMethodParam = {
  type?: string;
  name: string;
};

export type ClassMethod = {
  kind: 'method';
  /** 'mth0', 'mth1', ... 出現順 */
  id: string;
  visibility: ClassVisibility;
  /** 戻り値型 */
  returnType?: string;
  name: string;
  params: ClassMethodParam[];
};

export type ClassMember = ClassField | ClassMethod;

export type ClassNode = {
  /** Mermaid 仕様: class name = id */
  id: string;
  /** 表示名 (id と同じが基本、将来 alias 対応の余地) */
  label: string;
  members: ClassMember[];
  /** M12.3a: annotation (interface / abstract / enumeration / service 等)。`<<...>>` の中身 */
  annotation?: string;
  /** M12.3a: generic type parameter (`~T~` / `~K, V~` の中身、`~` は含まない) */
  generic?: string;
};

/** M12.3a: classDiagram の note */
export type ClassNote = {
  /** 'cn0', 'cn1', ... 出現順 */
  id: string;
  /** 対象 class id (undefined なら standalone note) */
  forClassId?: string;
  label: string;
};

// M12.4 L3
export type ClassDirection = 'LR' | 'RL' | 'TB' | 'BT';

/** M12.4: namespace でグループ化された class 群 */
export type ClassNamespace = {
  /** 'ns0', 'ns1', ... 出現順 */
  id: string;
  /** namespace identifier */
  name: string;
  /** 内包 class id (classes は flatten 配列に置く、ここは参照のみ) */
  classIds: string[];
};

/** M12.4: click / cssClass / callback / style の raw line を保持 (round-trip 維持) */
export type ClassExtraLine = {
  /** 'ex0', 'ex1', ... 出現順 */
  id: string;
  /** 行全体 (先頭インデント trim 済) */
  raw: string;
};

/**
 * Mermaid classDiagram の 7 種 relationship (canonical kind).
 *
 * | kind | token 例 (from→to) |
 * |---|---|
 * | inheritance | `--|>` (from extends to) |
 * | composition | `*--` (from composes to) |
 * | aggregation | `o--` (from aggregates to) |
 * | association | `-->` |
 * | dependency | `..>` |
 * | realization | `..|>` (from realizes to) |
 * | link | `--` (無向) |
 */
export type ClassRelationKind =
  | 'inheritance'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'realization'
  | 'link';

export type ClassRelation = {
  /** 'r0', 'r1', ... 出現順 */
  id: string;
  from: string; // class id
  to: string; // class id
  kind: ClassRelationKind;
  /** `:` 以降のラベル (任意) */
  label?: string;
};

export type ClassDiagram = {
  classes: ClassNode[];
  relations: ClassRelation[];
  /** M12.3a L2 notes。L1-only 図では undefined (M12.1/M12.2 互換) */
  notes?: ClassNote[];
  /** M12.4 L3 direction (rankdir); 未指定で 'TB' default は Canvas 側で判定 */
  direction?: ClassDirection;
  /** M12.4 L3 namespace 群。空なら undefined */
  namespaces?: ClassNamespace[];
  /** M12.4 L3 click / cssClass / callback / style の raw line 保持 (round-trip) */
  extras?: ClassExtraLine[];
};

export type ClassParseError = {
  message: string;
  line?: number;
};

export type ClassParseResult =
  | { ok: true; diagram: ClassDiagram }
  | { ok: false; error: ClassParseError };

export const emptyClassDiagram: ClassDiagram = {
  classes: [],
  relations: [],
};
