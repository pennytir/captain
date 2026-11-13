/**
 * Atom-JourneyParser (M18)
 *
 * Mermaid `journey` テキスト → JourneyDiagram AST 純関数。
 * title / section / `<task> : <score> : <actor>[, <actor>]` を構造化、accTitle/accDescr は
 * extras に退避 (Pattern 7)。section 宣言前の task は暗黙 section (name '') へ。
 * timeline-parser をミラー (events[] の代わりに score + actors)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-JourneyParser.md
 */

import type {
  JourneyDiagram,
  JourneyParseResult,
  JourneySection,
  JourneyTask,
} from '../types/journey-schema.js';

const HEADER_RE = /^journey\b/;
const ACC_RE = /^(accTitle|accDescr)\b/;

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface Ctx {
  title?: string;
  sections: JourneySection[];
  current: JourneySection | null;
  taskCounter: number;
  sectionCounter: number;
  extras: string[];
}

function ensureSection(ctx: Ctx): JourneySection {
  if (ctx.current) return ctx.current;
  const s: JourneySection = {
    id: `s${ctx.sectionCounter++}`,
    name: '',
    tasks: [],
  };
  ctx.sections.push(s);
  ctx.current = s;
  return s;
}

export function parseJourneyDiagram(text: string): JourneyParseResult {
  const lines = text.split('\n');
  const ctx: Ctx = {
    sections: [],
    current: null,
    taskCounter: 0,
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
          message: `Expected 'journey' header, got: ${line}`,
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
      const s: JourneySection = {
        id: `s${ctx.sectionCounter++}`,
        name: secM[1].trim(),
        tasks: [],
      };
      ctx.sections.push(s);
      ctx.current = s;
      continue;
    }
    if (ACC_RE.test(line)) {
      ctx.extras.push(line);
      continue;
    }

    // task 行: `name : score : actor[, actor]`
    const parts = line.split(':');
    const task: JourneyTask = {
      id: `t${ctx.taskCounter++}`,
      name: parts[0].trim(),
      score: Number((parts[1] ?? '').trim()),
      actors: (parts[2] ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    };
    ensureSection(ctx).tasks.push(task);
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing journey header' },
    };
  }

  const diagram: JourneyDiagram = {
    ...(ctx.title !== undefined ? { title: ctx.title } : {}),
    sections: ctx.sections,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
