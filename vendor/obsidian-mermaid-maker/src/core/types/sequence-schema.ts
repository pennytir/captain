/**
 * sequenceDiagram 用 AST schema (M11.1)
 *
 * flowchart の `Graph` 型とは完全別。混ぜない (30_How M10 規約)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-SequenceParser.md
 */

export type SequenceParticipantKind = 'participant' | 'actor';

export type SequenceParticipant = {
  id: string;
  label: string;
  kind: SequenceParticipantKind;
};

/**
 * Mermaid sequenceDiagram の 8 種 message arrow.
 *
 * | enum 値 | Mermaid token | 意味 |
 * |---|---|---|
 * | 'solid-arrow' | `->>` | solid + filled triangle |
 * | 'solid-line' | `->`  | solid + 矢じり無し |
 * | 'dotted-arrow' | `-->>` | dotted + filled triangle |
 * | 'dotted-line' | `-->` | dotted + 矢じり無し |
 * | 'solid-cross' | `-x`  | solid + × |
 * | 'dotted-cross' | `--x` | dotted + × |
 * | 'solid-open' | `-)`  | solid + open arrow (async) |
 * | 'dotted-open' | `--)` | dotted + open arrow |
 */
export type SequenceMessageArrow =
  | 'solid-arrow'
  | 'solid-line'
  | 'dotted-arrow'
  | 'dotted-line'
  | 'solid-cross'
  | 'dotted-cross'
  | 'solid-open'
  | 'dotted-open';

export type SequenceMessage = {
  /** 出現順 'm0', 'm1', ... */
  id: string;
  /** participant id */
  from: string;
  /** participant id */
  to: string;
  /** `:` 以降のメッセージ本文 (trim 済) */
  label: string;
  arrow: SequenceMessageArrow;
};

// ============================================================
// M11.3a L2 拡張: activation / Note / 6 種 control block
// ============================================================

/** message に対する activation (lifeline 上の active 矩形) */
export type SequenceActivation = {
  /** 出現順 'a0', 'a1', ... */
  id: string;
  /** どの participant の activation か */
  participantId: string;
  /**
   * 開始 message の index (messages[] 配列内)。
   * `+` 略記 → その message の index、`activate X` 単独 → 次に出現する message の index (= 解釈時点の msg count)。
   * 該当 message が無い場合 messages.length (end-of-diagram 開始)。
   */
  startMessageIndex: number;
  /**
   * 終了 message の index。
   * `-` 略記 → その message、`deactivate X` 単独 → 直前 message の index。
   * undefined = 図末尾まで open。
   */
  endMessageIndex?: number;
};

export type SequenceNotePlacement = 'left-of' | 'right-of' | 'over';

export type SequenceNote = {
  type: 'note';
  /** 出現順 'n0', 'n1', ... */
  id: string;
  placement: SequenceNotePlacement;
  /** `Note over A,B` のとき 2 個、それ以外 1 個 */
  participantIds: string[];
  label: string;
};

export type SequenceBlockKind =
  | 'loop'
  | 'alt' // 'else' 分岐
  | 'opt'
  | 'par' // 'and' 分岐
  | 'critical' // 'option' 分岐
  | 'break';

export type SequenceBlockBranch = {
  /** 各 branch のラベル (`else <label>` / `and <label>` 等)。最初の branch のラベルは block.label と同じ */
  label?: string;
  items: SequenceItem[];
};

export type SequenceBlock = {
  type: 'block';
  /** 出現順 'b0', 'b1', ... */
  id: string;
  kind: SequenceBlockKind;
  /** 開始ラベル (`loop <label>` 等) */
  label: string;
  /** 1 個 (loop / opt / break) or 複数 (alt / par / critical) */
  branches: SequenceBlockBranch[];
};

/** message item (SequenceMessage に type discriminator を付与) */
export type SequenceMessageItem = SequenceMessage & { type: 'message' };

export type SequenceItem = SequenceMessageItem | SequenceNote | SequenceBlock;

export type SequenceDiagram = {
  title?: string;
  autonumber?: boolean;
  participants: SequenceParticipant[];
  /**
   * L1 flat list (M11.1 互換)。L2 を含む図でも flatten された全 message を保持。
   * Edit 時は `items` を更新 → `messages` を再 flatten。
   */
  messages: SequenceMessage[];
  /**
   * L2 SoT (M11.3a)。L1 のみの図では undefined (M11.1 互換)。
   * L2 を含む図では items が真の構造、messages は flatten 派生。
   */
  items?: SequenceItem[];
  /** L2 activation。L1 のみの図では undefined。 */
  activations?: SequenceActivation[];
  /** M11.4 L3: box / links / properties / create / destroy / rect / accTitle / accDescr の raw line 保持 */
  extras?: SequenceExtraLine[];
};

/** M11.4 L3: box / links / properties / create / destroy / rect / accTitle / accDescr の raw line 保持 (round-trip 維持、Pattern 7) */
export type SequenceExtraLine = {
  /** 'sex0', 'sex1', ... 出現順 */
  id: string;
  /** 行全体 (先頭インデント trim 済)。multi-line block (box / rect) は ; 区切りで 1 行化 */
  raw: string;
};

export type SequenceParseError = {
  message: string;
  line?: number;
};

export type SequenceParseResult =
  | { ok: true; sequence: SequenceDiagram }
  | { ok: false; error: SequenceParseError };

export const emptySequenceDiagram: SequenceDiagram = {
  participants: [],
  messages: [],
};
