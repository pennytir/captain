/**
 * Atom-ErParser (M15.1)
 *
 * Mermaid `erDiagram` テキスト → ErDiagram AST 純関数。
 * entity (typed attribute + PK/FK/UK + comment) / relationship (cardinality + identifying + label)。
 * 未知行は `extras` に退避 (Pattern 7)、致命的破綻のみ { ok:false } で FallbackCanvas 降格。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ErParser.md
 */

import type {
  ErAttribute,
  ErCardinality,
  ErDiagram,
  ErEntity,
  ErExtraLine,
  ErKey,
  ErParseResult,
  ErRelation,
} from '../types/er-schema.js';

const HEADER_RE = /^erDiagram\b/;

const LEFT_CARD: Record<string, ErCardinality> = {
  '|o': 'zero-or-one',
  '||': 'exactly-one',
  '}o': 'zero-or-many',
  '}|': 'one-or-many',
};
const RIGHT_CARD: Record<string, ErCardinality> = {
  'o|': 'zero-or-one',
  '||': 'exactly-one',
  'o{': 'zero-or-many',
  '|{': 'one-or-many',
};

const ENTITY_NAME = '[A-Za-z_][A-Za-z0-9_-]*';
// ENTITY1 <Lcard><line><Rcard> ENTITY2 [: label]
const REL_RE = new RegExp(
  `^(${ENTITY_NAME})\\s+(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s+(${ENTITY_NAME})(?:\\s*:\\s*(.*))?$`,
);
const ENTITY_BLOCK_RE = new RegExp(
  `^(${ENTITY_NAME})(?:\\s*\\["([^"]*)"\\])?\\s*\\{(.*)\\}\\s*$`,
);
const ENTITY_DECL_RE = new RegExp(
  `^(${ENTITY_NAME})(?:\\s*\\["([^"]*)"\\])?\\s*$`,
);

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface ParseCtx {
  entitiesById: Map<string, ErEntity>;
  relations: ErRelation[];
  extras: ErExtraLine[];
  attrCounter: { n: number };
  relCounter: number;
  extraCounter: number;
}

function ensureEntity(ctx: ParseCtx, id: string, label?: string): ErEntity {
  let e = ctx.entitiesById.get(id);
  if (!e) {
    e = { id, label: label ?? id, attributes: [] };
    ctx.entitiesById.set(id, e);
  } else if (label && e.label === e.id) {
    // 後から alias 宣言が来たら反映
    e.label = label;
  }
  return e;
}

/** 属性行: `type name [PK|FK|UK[, ...]] ["comment"]` */
function parseAttribute(
  line: string,
  counter: { n: number },
): ErAttribute | null {
  const t = line.trim();
  if (t === '') return null;

  let comment: string | undefined;
  let rest = t;
  const cm = t.match(/"([^"]*)"\s*$/);
  if (cm) {
    comment = cm[1];
    rest = t.slice(0, cm.index).trim();
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null; // 最低 type + name
  const type = parts[0];
  const name = parts[1];
  const keys = parts
    .slice(2)
    .join(' ')
    .split(/[,\s]+/)
    .filter(Boolean)
    .filter((k): k is ErKey => k === 'PK' || k === 'FK' || k === 'UK');

  return {
    id: `attr${counter.n++}`,
    type,
    name,
    keys,
    ...(comment !== undefined ? { comment } : {}),
  };
}

/**
 * 連続行の entity brace を 1 行にまとめる pre-pass。
 * `NAME {\n  attr\n}` → `NAME { attr }`。class の collapseMultilineBraces をミラー。
 */
function collapseEntityBraces(text: string): string {
  const out: string[] = [];
  const lines = text.split('\n');
  let buf: string[] | null = null;
  const ENTITY_OPEN = new RegExp(`^${ENTITY_NAME}(?:\\s*\\["[^"]*"\\])?\\s*\\{`);
  for (const line of lines) {
    if (buf !== null) {
      buf.push(line);
      if (line.includes('}')) {
        const collapsed = buf
          .join('\n')
          .replace(/\n/g, '; ')
          .replace(/;\s*}/, ' }');
        out.push(collapsed);
        buf = null;
      }
      continue;
    }
    const trimmed = line.trim();
    const isEntityBrace =
      ENTITY_OPEN.test(trimmed) &&
      line.includes('{') &&
      !line.includes('}');
    if (isEntityBrace) {
      buf = [line];
      continue;
    }
    out.push(line);
  }
  if (buf !== null) out.push(...buf);
  return out.join('\n');
}

function tryParseRelation(line: string, ctx: ParseCtx): boolean {
  const m = line.match(REL_RE);
  if (!m) return false;
  const [, from, lt, lineTok, rt, to, label] = m;
  ensureEntity(ctx, from);
  ensureEntity(ctx, to);
  ctx.relations.push({
    id: `r${ctx.relCounter++}`,
    from,
    to,
    leftCard: LEFT_CARD[lt],
    rightCard: RIGHT_CARD[rt],
    identifying: lineTok === '--',
    label: (label ?? '').trim(),
  });
  return true;
}

function tryParseEntityBlock(line: string, ctx: ParseCtx): boolean {
  const m = line.match(ENTITY_BLOCK_RE);
  if (!m) return false;
  const ent = ensureEntity(ctx, m[1], m[2]);
  const inner = m[3]
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const al of inner) {
    const attr = parseAttribute(al, ctx.attrCounter);
    if (attr) ent.attributes.push(attr);
  }
  return true;
}

function tryParseEntityDecl(line: string, ctx: ParseCtx): boolean {
  const m = line.match(ENTITY_DECL_RE);
  if (!m) return false;
  ensureEntity(ctx, m[1], m[2]);
  return true;
}

export function parseErDiagram(text: string): ErParseResult {
  const collapsed = collapseEntityBraces(text);
  const lines = collapsed.split('\n');
  const ctx: ParseCtx = {
    entitiesById: new Map(),
    relations: [],
    extras: [],
    attrCounter: { n: 0 },
    relCounter: 0,
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
        error: { line: i + 1, message: `Expected 'erDiagram' header, got: ${line}` },
      };
    }

    if (tryParseRelation(line, ctx)) continue;
    if (tryParseEntityBlock(line, ctx)) continue;
    if (tryParseEntityDecl(line, ctx)) continue;

    // 未対応行は extras に退避 (round-trip 維持、図ごと fallback を防ぐ)
    ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: line });
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing erDiagram header' },
    };
  }

  const diagram: ErDiagram = {
    entities: Array.from(ctx.entitiesById.values()),
    relations: ctx.relations,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
