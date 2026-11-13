/**
 * Atom-GanttParser (M16.1)
 *
 * Mermaid `gantt` テキスト → GanttDiagram AST 純関数。
 * title / dateFormat / section / task を構造化。task メタは **型で分類** (位置非依存)。
 * 未対応 directive (axisFormat/excludes/vert 等) は extras に退避 (Pattern 7)。
 * date の絶対解決はしない (canvas 側 gantt-schedule.ts)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-GanttParser.md
 */

import type {
  GanttDiagram,
  GanttExtraLine,
  GanttParseResult,
  GanttSection,
  GanttTask,
  GanttTaskTag,
} from '../types/gantt-schema.js';

const HEADER_RE = /^gantt\b/;
const TAGS: ReadonlySet<string> = new Set([
  'active',
  'done',
  'crit',
  'milestone',
]);
// number + unit (M=month / m=minute、mermaid/dayjs 慣習)
const DURATION_RE = /^\d+(\.\d+)?(ms|s|h|d|w|M|m|y)$/;
// 既定 dateFormat YYYY-MM-DD
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// clean identifier (= taskId 候補)
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
// 構造化対象外 directive (extras 行き)
const KNOWN_DIRECTIVE_RE =
  /^(axisFormat|excludes|includes|todayMarker|tickInterval|weekday|weekend|vert)\b/;

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface Ctx {
  title?: string;
  dateFormat?: string;
  sections: GanttSection[];
  current: GanttSection | null;
  taskCounter: number;
  sectionCounter: number;
  extras: GanttExtraLine[];
  extraCounter: number;
}

function ensureSection(ctx: Ctx): GanttSection {
  if (ctx.current) return ctx.current;
  // section 前の task 用の暗黙 section (name '')
  const s: GanttSection = { id: `s${ctx.sectionCounter++}`, name: '', tasks: [] };
  ctx.sections.push(s);
  ctx.current = s;
  return s;
}

/** colon 後のメタ token 群を型で分類して task に設定 */
function classifyMeta(tokens: string[], task: GanttTask): void {
  let sawDate = false;
  for (const tok of tokens) {
    if (TAGS.has(tok)) {
      task.tags.push(tok as GanttTaskTag);
    } else if (/^after\s+/.test(tok)) {
      task.after = tok
        .replace(/^after\s+/, '')
        .split(/\s+/)
        .filter(Boolean);
    } else if (/^until\s+/.test(tok)) {
      task.until = tok.replace(/^until\s+/, '').trim();
    } else if (DURATION_RE.test(tok)) {
      task.duration = tok;
    } else if (DATE_RE.test(tok)) {
      if (!sawDate) {
        task.startDate = tok;
        sawDate = true;
      } else {
        task.endDate = tok;
      }
    } else if (IDENT_RE.test(tok) && task.taskId === undefined) {
      // clean identifier (数字/区切りを含まない) → taskId
      task.taskId = tok;
    } else {
      // 残り (custom-format date 等) → date 扱い (best-effort、taskId 誤分類を避ける)
      if (!sawDate) {
        task.startDate = tok;
        sawDate = true;
      } else {
        task.endDate = tok;
      }
    }
  }
}

export function parseGanttDiagram(text: string): GanttParseResult {
  const lines = text.split('\n');
  const ctx: Ctx = {
    sections: [],
    current: null,
    taskCounter: 0,
    sectionCounter: 0,
    extras: [],
    extraCounter: 0,
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
        error: { line: i + 1, message: `Expected 'gantt' header, got: ${line}` },
      };
    }

    const titleM = line.match(/^title\s+(.+)$/);
    if (titleM) {
      ctx.title = titleM[1].trim();
      continue;
    }
    const dfM = line.match(/^dateFormat\s+(.+)$/);
    if (dfM) {
      ctx.dateFormat = dfM[1].trim();
      continue;
    }
    const secM = line.match(/^section\s+(.+)$/);
    if (secM) {
      const s: GanttSection = {
        id: `s${ctx.sectionCounter++}`,
        name: secM[1].trim(),
        tasks: [],
      };
      ctx.sections.push(s);
      ctx.current = s;
      continue;
    }
    if (KNOWN_DIRECTIVE_RE.test(line)) {
      ctx.extras.push({ id: `gex${ctx.extraCounter++}`, raw: line });
      continue;
    }

    // task 行: 最初の ':' で name / meta を分割
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const name = line.slice(0, colonIdx).trim();
      const metaStr = line.slice(colonIdx + 1);
      const tokens = metaStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const task: GanttTask = {
        id: `t${ctx.taskCounter++}`,
        name,
        tags: [],
      };
      classifyMeta(tokens, task);
      ensureSection(ctx).tasks.push(task);
      continue;
    }

    // それ以外 → extras
    ctx.extras.push({ id: `gex${ctx.extraCounter++}`, raw: line });
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing gantt header' },
    };
  }

  const diagram: GanttDiagram = {
    ...(ctx.title !== undefined ? { title: ctx.title } : {}),
    ...(ctx.dateFormat !== undefined ? { dateFormat: ctx.dateFormat } : {}),
    sections: ctx.sections,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
