/**
 * gantt 用 AST schema (M16.1)
 *
 * flowchart の Graph / 他 diagram の AST とは完全別。混ぜない (30_How M10 規約)。
 * **初の非グラフ型** (timeline/bar)。date の絶対解決はしない
 * (canvas 側 gantt-schedule.ts の責務、core は Node/browser 中立で date ライブラリ非依存)。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-GanttParser.md
 */

export type GanttTaskTag = 'active' | 'done' | 'crit' | 'milestone';

export type GanttTask = {
  /** 't0','t1'... 出現順 (diagram 全体で一意、React key / 内部参照) */
  id: string;
  name: string;
  /** テキスト中の明示 id (after/until の参照先)。無ければ undefined */
  taskId?: string;
  tags: GanttTaskTag[];
  /** 明示開始日 (dateFormat の生文字列) */
  startDate?: string;
  /** 依存: 参照 taskId 群 (開始 = それらの最大終了) */
  after?: string[];
  /** 生 duration '30d' 等 */
  duration?: string;
  /** 明示終了日 */
  endDate?: string;
  /** 依存: 参照 taskId (終了 = その task の開始) */
  until?: string;
};

export type GanttSection = {
  /** 's0','s1'... */
  id: string;
  /** section 名。section 前の task をまとめる暗黙 section は '' */
  name: string;
  tasks: GanttTask[];
};

/** 未対応 directive (axisFormat/excludes/weekend/tickInterval/todayMarker/vert/未知) を raw 保持 (Pattern 7) */
export type GanttExtraLine = {
  /** 'gex0','gex1'... */
  id: string;
  raw: string;
};

export type GanttDiagram = {
  title?: string;
  dateFormat?: string;
  sections: GanttSection[];
  extras?: GanttExtraLine[];
};

export type GanttParseError = { message: string; line?: number };

export type GanttParseResult =
  | { ok: true; diagram: GanttDiagram }
  | { ok: false; error: GanttParseError };

export const emptyGanttDiagram: GanttDiagram = { sections: [] };
