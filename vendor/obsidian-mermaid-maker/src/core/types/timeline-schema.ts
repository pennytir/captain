/**
 * timeline schema (M17) — Atom-TimelineParser/Emitter/Ops/Canvas の共有 schema。
 * gantt-schema をミラーした自前 SVG 系の非グラフ型。task→period (label + events[])。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-TimelineParser.md
 */

export type TimelinePeriod = {
  id: string; // 'p0','p1',... (diagram 全体で一意)
  label: string; // 時間軸ラベル (最初の ':' より前)
  events: string[]; // ':' 区切りイベント (0 個以上)
};

export type TimelineSection = {
  id: string; // 's0','s1',...
  name: string; // '' = 暗黙 section (section 宣言前の period)
  periods: TimelinePeriod[];
};

export type TimelineDiagram = {
  title?: string;
  sections: TimelineSection[];
  extras?: string[]; // round-trip 用 raw 行 (accTitle/accDescr 等)
};

export const emptyTimelineDiagram: TimelineDiagram = { sections: [] };

export type TimelineParseError = { message: string; line?: number };

export type TimelineParseResult =
  | { ok: true; diagram: TimelineDiagram }
  | { ok: false; error: TimelineParseError };
