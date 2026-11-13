/**
 * Atom-TimelineParser (M17)
 *
 * Mermaid `timeline` テキスト → TimelineDiagram AST 純関数。
 * title / section / `<period> : <event> : ...` を構造化、accTitle/accDescr は
 * extras に退避 (Pattern 7)。section 宣言前の period は暗黙 section (name '') へ。
 * gantt-parser をミラー (date 系メタの代わりに ':' 区切り event 列)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-TimelineParser.md
 */

import type {
  TimelineDiagram,
  TimelineParseResult,
  TimelinePeriod,
  TimelineSection,
} from '../types/timeline-schema.js';

const HEADER_RE = /^timeline\b/;
const ACC_RE = /^(accTitle|accDescr)\b/;

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface Ctx {
  title?: string;
  sections: TimelineSection[];
  current: TimelineSection | null;
  periodCounter: number;
  sectionCounter: number;
  extras: string[];
}

function ensureSection(ctx: Ctx): TimelineSection {
  if (ctx.current) return ctx.current;
  // section 前の period 用の暗黙 section (name '')
  const s: TimelineSection = {
    id: `s${ctx.sectionCounter++}`,
    name: '',
    periods: [],
  };
  ctx.sections.push(s);
  ctx.current = s;
  return s;
}

export function parseTimelineDiagram(text: string): TimelineParseResult {
  const lines = text.split('\n');
  const ctx: Ctx = {
    sections: [],
    current: null,
    periodCounter: 0,
    sectionCounter: 0,
    extras: [],
  };

  let headerSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (isSkippable(line)) continue;

    if (!headerSeen) {
      if (HEADER_RE.test(line)) {
        headerSeen = true;
        continue;
      }
      return {
        ok: false,
        error: {
          line: i + 1,
          message: `Expected 'timeline' header, got: ${line}`,
        },
      };
    }

    const titleM = line.match(/^title\s+(.+)$/);
    if (titleM) {
      ctx.title = titleM[1].trim();
      continue;
    }
    const secM = line.match(/^section\s+(.+)$/);
    if (secM) {
      const s: TimelineSection = {
        id: `s${ctx.sectionCounter++}`,
        name: secM[1].trim(),
        periods: [],
      };
      ctx.sections.push(s);
      ctx.current = s;
      continue;
    }
    if (ACC_RE.test(line)) {
      ctx.extras.push(line);
      continue;
    }

    // period 行: ':' で label / events を分割 (event は ',' や <br> を含んでよい)
    const parts = line.split(':').map((s) => s.trim());
    const period: TimelinePeriod = {
      id: `p${ctx.periodCounter++}`,
      label: parts[0],
      events: parts.slice(1).filter((e) => e.length > 0),
    };
    ensureSection(ctx).periods.push(period);
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing timeline header' },
    };
  }

  const diagram: TimelineDiagram = {
    ...(ctx.title !== undefined ? { title: ctx.title } : {}),
    sections: ctx.sections,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
