/**
 * Atom-ArchitectureParser (M20)
 *
 * Mermaid `architecture-beta` テキスト → ArchitectureDiagram AST 純関数。
 * 3 ノード種 (group: 入れ子コンテナ / service: icon+title / junction: 分岐点) と
 * port 付き有向 edge (T/B/L/R + 4 arrow、`{group}` マーカー) を parse。
 * 未知行は `extras` に退避 (Pattern 7)、致命的破綻のみ { ok:false } で FallbackCanvas 降格。
 * requirementParser をミラー (header → 行ループ → 種別分岐 → 未知は extras)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ArchitectureParser.md
 */

import type {
  ArchitectureArrow,
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureExtraLine,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureParseResult,
  ArchitectureService,
  ArchitectureSide,
} from '../types/architecture-schema.js';

const HEADER_RE = /^architecture-beta\b/;

const NAME = '[A-Za-z_][A-Za-z0-9_]*';

// group NAME (icon) [title] in parent  (icon / title / parent はすべて optional)
const GROUP_RE = new RegExp(
  `^group\\s+(${NAME})\\s*(?:\\(([^)]*)\\))?\\s*(?:\\[([^\\]]*)\\])?\\s*(?:\\bin\\s+(${NAME}))?\\s*$`,
);
// service NAME (icon) [title] in parent  (group と同形、keyword 違い)
const SERVICE_RE = new RegExp(
  `^service\\s+(${NAME})\\s*(?:\\(([^)]*)\\))?\\s*(?:\\[([^\\]]*)\\])?\\s*(?:\\bin\\s+(${NAME}))?\\s*$`,
);
// junction NAME in parent  (icon / title 無し)
const JUNCTION_RE = new RegExp(
  `^junction\\s+(${NAME})\\s*(?:\\bin\\s+(${NAME}))?\\s*$`,
);
// src{group}:side ARROW side:dst{group}  (arrow は longest-first で 4 種を吸収)
const EDGE_RE = new RegExp(
  `^(${NAME})(\\{group\\})?:([TBLR])\\s*(<-->|<--|-->|--)\\s*([TBLR]):(${NAME})(\\{group\\})?$`,
);

/** 空行と `%%` (コメント / init directive) を skip。req isSkippable をミラー */
function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface ParseCtx {
  groups: ArchitectureGroup[];
  services: ArchitectureService[];
  junctions: ArchitectureJunction[];
  edges: ArchitectureEdge[];
  extras: ArchitectureExtraLine[];
  edgeCounter: number;
  extraCounter: number;
}

function pushOrReplace<T extends { id: string }>(arr: T[], item: T): void {
  const existing = arr.findIndex((x) => x.id === item.id);
  if (existing >= 0) arr[existing] = item;
  else arr.push(item);
}

function tryParseGroup(line: string, ctx: ParseCtx): boolean {
  const m = line.match(GROUP_RE);
  if (!m) return false;
  const group: ArchitectureGroup = { id: m[1] };
  if (m[2]) group.icon = m[2];
  if (m[3] !== undefined && m[3] !== '') group.title = m[3];
  if (m[4]) group.parent = m[4];
  pushOrReplace(ctx.groups, group);
  return true;
}

function tryParseService(line: string, ctx: ParseCtx): boolean {
  const m = line.match(SERVICE_RE);
  if (!m) return false;
  const service: ArchitectureService = { id: m[1] };
  if (m[2]) service.icon = m[2];
  if (m[3] !== undefined && m[3] !== '') service.title = m[3];
  if (m[4]) service.parent = m[4];
  pushOrReplace(ctx.services, service);
  return true;
}

function tryParseJunction(line: string, ctx: ParseCtx): boolean {
  const m = line.match(JUNCTION_RE);
  if (!m) return false;
  const junction: ArchitectureJunction = { id: m[1] };
  if (m[2]) junction.parent = m[2];
  pushOrReplace(ctx.junctions, junction);
  return true;
}

function tryParseEdge(line: string, ctx: ParseCtx): boolean {
  const m = line.match(EDGE_RE);
  if (!m) return false;
  const edge: ArchitectureEdge = {
    id: `edge${ctx.edgeCounter++}`,
    src: m[1],
    srcSide: m[3] as ArchitectureSide,
    ...(m[2] ? { srcIsGroup: true } : {}),
    dst: m[6],
    dstSide: m[5] as ArchitectureSide,
    ...(m[7] ? { dstIsGroup: true } : {}),
    arrow: m[4] as ArchitectureArrow,
  };
  ctx.edges.push(edge);
  return true;
}

export function parseArchitectureDiagram(text: string): ArchitectureParseResult {
  const lines = text.split('\n');
  const ctx: ParseCtx = {
    groups: [],
    services: [],
    junctions: [],
    edges: [],
    extras: [],
    edgeCounter: 0,
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
        error: {
          line: i + 1,
          message: `Expected 'architecture-beta' header, got: ${line}`,
        },
      };
    }

    if (tryParseGroup(line, ctx)) continue;
    if (tryParseService(line, ctx)) continue;
    if (tryParseJunction(line, ctx)) continue;
    if (tryParseEdge(line, ctx)) continue;

    // 未対応行は extras に退避 (round-trip 維持、図ごと fallback を防ぐ)
    ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: line });
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing architecture-beta header' },
    };
  }

  const diagram: ArchitectureDiagram = {
    groups: ctx.groups,
    services: ctx.services,
    junctions: ctx.junctions,
    edges: ctx.edges,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
