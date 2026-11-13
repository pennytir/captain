/**
 * stateDiagram-v2 用 AST schema (M14.1)
 *
 * flowchart / sequence / class / mindmap とは完全別。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-StateParser.md
 */

export type StateNodeType =
  | 'normal'
  | 'fork'
  | 'join'
  | 'choice'
  | 'start'
  | 'end';

export type StateNode = {
  /** Mermaid 仕様: state name = id。`[*]` は内部で '__START__' / '__END__' に正規化 */
  id: string;
  /** description (id 上書き表示)。未指定なら id を表示 */
  label?: string;
  /** stereotype: fork / join / choice、または pseudo start/end / normal */
  type: StateNodeType;
  /** M14.3: composite state の親 id (undefined ならトップレベル) */
  parentId?: string;
};

export type StateTransition = {
  /** 't0', 't1', ... 出現順 */
  id: string;
  /** state id ('__START__' なら `[*]` 始点) */
  from: string;
  /** state id ('__END__' なら `[*]` 終点) */
  to: string;
  /** ':' 以降のラベル */
  label?: string;
};

/** M14.3: note left/right of X : text */
export type StateNote = {
  /** 'sn0', 'sn1', ... 出現順 */
  id: string;
  forStateId: string;
  placement: 'left' | 'right';
  label: string;
};

export type StateDirection = 'LR' | 'RL' | 'TB' | 'BT';

/** L3: 認識できない / 未対応 syntax の raw 行保持 (Pattern 7) */
export type StateExtraLine = {
  id: string;
  raw: string;
};

export type StateDiagram = {
  /** 全 state を flat 配列 (composite 内の child も同居、parentId で関係表現) */
  states: StateNode[];
  transitions: StateTransition[];
  /** M14.3 notes */
  notes?: StateNote[];
  /** L1 direction (Canvas dagre rankdir に反映) */
  direction?: StateDirection;
  /** L3 extras (round-trip 維持) */
  extras?: StateExtraLine[];
};

export type StateParseError = {
  message: string;
  line?: number;
};

export type StateParseResult =
  | { ok: true; diagram: StateDiagram }
  | { ok: false; error: StateParseError };

export const emptyStateDiagram: StateDiagram = {
  states: [],
  transitions: [],
};
