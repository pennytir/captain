/**
 * Atom-RequirementParser (M19)
 *
 * Mermaid `requirementDiagram` テキスト → RequirementDiagram AST 純関数。
 * 2 ノード種 (requirement: 6 サブタイプ + 固定フィールド / element: type+docref) と
 * 有向ラベル関係 (7 種) を parse。未知行は `extras` に退避 (Pattern 7)、
 * 致命的破綻のみ { ok:false } で FallbackCanvas 降格。erParser をミラー。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-RequirementParser.md
 */

import type {
  Requirement,
  RequirementDiagram,
  RequirementElement,
  RequirementExtraLine,
  RequirementKind,
  RequirementParseResult,
  RequirementRelation,
  RequirementRelationType,
  RequirementRisk,
  RequirementVerifyMethod,
} from '../types/requirement-schema.js';
import {
  REQUIREMENT_KINDS,
  REQUIREMENT_RELATION_TYPES,
} from '../types/requirement-schema.js';

const HEADER_RE = /^requirementDiagram\b/;

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const KINDS_ALT = REQUIREMENT_KINDS.join('|');
const RELTYPE_ALT = REQUIREMENT_RELATION_TYPES.join('|');

// KIND NAME { inner }
const REQ_BLOCK_RE = new RegExp(`^(${KINDS_ALT})\\s+(${NAME})\\s*\\{(.*)\\}\\s*$`);
// element NAME { inner }
const EL_BLOCK_RE = new RegExp(`^element\\s+(${NAME})\\s*\\{(.*)\\}\\s*$`);
// A - type -> B
const REL_FWD_RE = new RegExp(
  `^(${NAME})\\s*-\\s*(${RELTYPE_ALT})\\s*->\\s*(${NAME})$`,
);
// A <- type - B   (= B - type -> A)
const REL_BWD_RE = new RegExp(
  `^(${NAME})\\s*<-\\s*(${RELTYPE_ALT})\\s*-\\s*(${NAME})$`,
);
// block 開き行 (multi-line brace collapse 用)
const BLOCK_OPEN_RE = new RegExp(`^(?:${KINDS_ALT}|element)\\s+${NAME}\\s*\\{`);

const RISK_MAP: Record<string, RequirementRisk> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const VERIFY_MAP: Record<string, RequirementVerifyMethod> = {
  analysis: 'Analysis',
  inspection: 'Inspection',
  test: 'Test',
  demonstration: 'Demonstration',
};

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

interface ParseCtx {
  requirements: Requirement[];
  elements: RequirementElement[];
  relations: RequirementRelation[];
  extras: RequirementExtraLine[];
  relCounter: number;
  extraCounter: number;
}

/**
 * 連続行の block brace を 1 行にまとめる pre-pass。
 * `requirement X {\n id: 1\n }` → `requirement X { id: 1 }`。
 * erParser の collapseEntityBraces をミラー。
 */
function collapseBlocks(text: string): string {
  const out: string[] = [];
  const lines = text.split('\n');
  let buf: string[] | null = null;
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
    const isBlockOpen =
      BLOCK_OPEN_RE.test(trimmed) && line.includes('{') && !line.includes('}');
    if (isBlockOpen) {
      buf = [line];
      continue;
    }
    out.push(line);
  }
  if (buf !== null) out.push(...buf);
  return out.join('\n');
}

/** block 内フィールド `key: value` を Map に。key は case-insensitive、value は引用符剥がし */
function parseFields(inner: string): Map<string, string> {
  const fields = new Map<string, string>();
  const segs = inner
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segs) {
    const ci = seg.indexOf(':');
    if (ci === -1) continue;
    const key = seg.slice(0, ci).trim().toLowerCase();
    let val = seg.slice(ci + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (key) fields.set(key, val);
  }
  return fields;
}

function tryParseRelation(line: string, ctx: ParseCtx): boolean {
  let m = line.match(REL_FWD_RE);
  if (m) {
    ctx.relations.push({
      id: `rel${ctx.relCounter++}`,
      src: m[1],
      dst: m[3],
      type: m[2] as RequirementRelationType,
    });
    return true;
  }
  m = line.match(REL_BWD_RE);
  if (m) {
    // `A <- type - B` は `B - type -> A`
    ctx.relations.push({
      id: `rel${ctx.relCounter++}`,
      src: m[3],
      dst: m[1],
      type: m[2] as RequirementRelationType,
    });
    return true;
  }
  return false;
}

function tryParseRequirementBlock(line: string, ctx: ParseCtx): boolean {
  const m = line.match(REQ_BLOCK_RE);
  if (!m) return false;
  const fields = parseFields(m[3]);
  const req: Requirement = { id: m[2], kind: m[1] as RequirementKind };
  const reqId = fields.get('id');
  if (reqId !== undefined && reqId !== '') req.reqId = reqId;
  const text = fields.get('text');
  if (text) req.text = text;
  const risk = fields.get('risk');
  if (risk && RISK_MAP[risk.toLowerCase()]) req.risk = RISK_MAP[risk.toLowerCase()];
  const vm = fields.get('verifymethod');
  if (vm && VERIFY_MAP[vm.toLowerCase()]) {
    req.verifyMethod = VERIFY_MAP[vm.toLowerCase()];
  }
  // 同名 requirement の後勝ち上書き
  const existing = ctx.requirements.findIndex((r) => r.id === req.id);
  if (existing >= 0) ctx.requirements[existing] = req;
  else ctx.requirements.push(req);
  return true;
}

function tryParseElementBlock(line: string, ctx: ParseCtx): boolean {
  const m = line.match(EL_BLOCK_RE);
  if (!m) return false;
  const fields = parseFields(m[2]);
  const el: RequirementElement = { id: m[1] };
  const type = fields.get('type');
  if (type) el.type = type;
  const docref = fields.get('docref');
  if (docref) el.docref = docref;
  const existing = ctx.elements.findIndex((e) => e.id === el.id);
  if (existing >= 0) ctx.elements[existing] = el;
  else ctx.elements.push(el);
  return true;
}

export function parseRequirementDiagram(text: string): RequirementParseResult {
  const collapsed = collapseBlocks(text);
  const lines = collapsed.split('\n');
  const ctx: ParseCtx = {
    requirements: [],
    elements: [],
    relations: [],
    extras: [],
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
        error: {
          line: i + 1,
          message: `Expected 'requirementDiagram' header, got: ${line}`,
        },
      };
    }

    if (tryParseRelation(line, ctx)) continue;
    if (tryParseRequirementBlock(line, ctx)) continue;
    if (tryParseElementBlock(line, ctx)) continue;

    // 未対応行は extras に退避 (round-trip 維持、図ごと fallback を防ぐ)
    ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: line });
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing requirementDiagram header' },
    };
  }

  const diagram: RequirementDiagram = {
    requirements: ctx.requirements,
    elements: ctx.elements,
    relations: ctx.relations,
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
