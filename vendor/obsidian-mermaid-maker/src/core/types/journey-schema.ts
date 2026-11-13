/**
 * journey schema (M18) — Atom-JourneyParser/Emitter/Ops/Canvas の共有 schema。
 * timeline-schema をミラー。period→task、task は name + score(number) + actors[]。
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-JourneyParser.md
 */

export type JourneyTask = {
  id: string; // 't0','t1',...
  name: string; // タスク名 (最初の ':' より前)
  score: number; // 満足度スコア (2 番目フィールド、NaN 可)
  actors: string[]; // 3 番目フィールドを ',' 分割
};

export type JourneySection = {
  id: string; // 's0','s1',...
  name: string; // '' = 暗黙 section
  tasks: JourneyTask[];
};

export type JourneyDiagram = {
  title?: string;
  sections: JourneySection[];
  extras?: string[]; // round-trip 用 raw 行 (accTitle/accDescr 等)
};

export const emptyJourneyDiagram: JourneyDiagram = { sections: [] };

export type JourneyParseError = { message: string; line?: number };

export type JourneyParseResult =
  | { ok: true; diagram: JourneyDiagram }
  | { ok: false; error: JourneyParseError };
