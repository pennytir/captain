/**
 * Atom-MindmapParser (M13.1)
 *
 * Mermaid `mindmap` テキスト → MindmapDiagram AST 純関数。
 * L1 syntax: header + root + node tree + 6 shape (square/rounded/circle/bang/cloud/hexagon/default)
 * L2 syntax (M13.3): icon directive `::icon(...)` / class directive `:::className`
 * L3 syntax (M13.3): accTitle / accDescr / その他 → extras 配列に raw 保持 (Pattern 7)
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MindmapParser.md
 */

import type {
  MindmapDiagram,
  MindmapExtraLine,
  MindmapNode,
  MindmapParseResult,
  MindmapShape,
} from '../types/mindmap-schema.js';

const HEADER_RE = /^mindmap\b/;

const ICON_RE = /^::icon\(([^)]+)\)\s*$/;
const CLASS_RE = /^:::([A-Za-z_][A-Za-z0-9_-]*)\s*$/;

/** L3: accTitle / accDescr 等の認識できない directive、raw に保持 */
const L3_KEYWORDS_PREFIX = ['accTitle', 'accDescr'];

type ParseCtx = {
  diagram: MindmapDiagram;
  /** parent stack: { node, indent }。indent = leading space 数 */
  stack: Array<{ node: MindmapNode | null; indent: number }>;
  /** id counter for nodes */
  nodeCounter: number;
  /** id counter for extras */
  extraCounter: number;
  /** 直前に push した node (icon / class directive の attach 先) */
  lastNode: MindmapNode | null;
};

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

/** leading whitespace 数 (tab は 2 space 換算) */
function leadingIndent(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 2;
    else break;
  }
  return n;
}

/** shape token と label を抽出。token 長い順で先にテスト */
function parseShape(trimmed: string): { shape: MindmapShape; label: string } {
  // ((text)) circle - 先頭末尾
  if (trimmed.startsWith('((') && trimmed.endsWith('))') && trimmed.length >= 4) {
    return { shape: 'circle', label: trimmed.slice(2, -2) };
  }
  // ))text(( bang
  if (trimmed.startsWith('))') && trimmed.endsWith('((') && trimmed.length >= 4) {
    return { shape: 'bang', label: trimmed.slice(2, -2) };
  }
  // {{text}} hexagon
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}') && trimmed.length >= 4) {
    return { shape: 'hexagon', label: trimmed.slice(2, -2) };
  }
  // [text] square
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length >= 2) {
    return { shape: 'square', label: trimmed.slice(1, -1) };
  }
  // (text) rounded
  if (trimmed.startsWith('(') && trimmed.endsWith(')') && trimmed.length >= 2) {
    return { shape: 'rounded', label: trimmed.slice(1, -1) };
  }
  // )text( cloud
  if (trimmed.startsWith(')') && trimmed.endsWith('(') && trimmed.length >= 2) {
    return { shape: 'cloud', label: trimmed.slice(1, -1) };
  }
  // default: bare text
  return { shape: 'default', label: trimmed };
}

/** node line を消費して context を更新 */
function consumeNode(
  ctx: ParseCtx,
  indent: number,
  trimmed: string,
): void {
  const { shape, label } = parseShape(trimmed);
  const node: MindmapNode = {
    id: `n${ctx.nodeCounter++}`,
    label,
    shape,
    children: [],
  };

  // root がまだ無ければこれが root
  if (ctx.diagram.root === null) {
    ctx.diagram.root = node;
    ctx.stack = [{ node, indent }];
    ctx.lastNode = node;
    return;
  }

  // 既存 stack を indent で巻戻し: 同じか深い indent の entry を pop
  while (
    ctx.stack.length > 0 &&
    ctx.stack[ctx.stack.length - 1]!.indent >= indent
  ) {
    ctx.stack.pop();
  }

  // 親は stack top (空ならエラー回避で root を fallback)
  const parentEntry = ctx.stack[ctx.stack.length - 1];
  const parent = parentEntry?.node ?? ctx.diagram.root;
  parent.children.push(node);
  ctx.stack.push({ node, indent });
  ctx.lastNode = node;
}

/** L3 directive 判定 */
function isL3Directive(trimmed: string): boolean {
  return L3_KEYWORDS_PREFIX.some(
    (k) => trimmed === k || trimmed.startsWith(`${k}:`) || trimmed.startsWith(`${k} `),
  );
}

export function parseMindmap(text: string): MindmapParseResult {
  const rawLines = text.split('\n');
  const ctx: ParseCtx = {
    diagram: { root: null },
    stack: [],
    nodeCounter: 0,
    extraCounter: 0,
    lastNode: null,
  };
  const extras: MindmapExtraLine[] = [];

  let headerFound = false;
  let lineNum = 0;

  for (const raw of rawLines) {
    lineNum += 1;
    if (isSkippable(raw)) continue;

    const trimmed = raw.trim();

    // header
    if (!headerFound) {
      if (HEADER_RE.test(trimmed)) {
        headerFound = true;
        continue;
      }
      return {
        ok: false,
        error: {
          line: lineNum,
          message: `mindmap: header 'mindmap' が見つかりません (got: '${trimmed}')`,
        },
      };
    }

    // icon directive
    const iconMatch = ICON_RE.exec(trimmed);
    if (iconMatch && ctx.lastNode) {
      ctx.lastNode.icon = iconMatch[1]!.trim();
      continue;
    }

    // class directive
    const classMatch = CLASS_RE.exec(trimmed);
    if (classMatch && ctx.lastNode) {
      ctx.lastNode.className = classMatch[1]!;
      continue;
    }

    // L3 directive (accTitle / accDescr 等) → extras
    if (isL3Directive(trimmed)) {
      extras.push({ id: `ex${ctx.extraCounter++}`, raw: trimmed });
      continue;
    }

    // node line
    const indent = leadingIndent(raw);
    consumeNode(ctx, indent, trimmed);
  }

  if (!headerFound) {
    return {
      ok: false,
      error: {
        message: `mindmap: header 'mindmap' が見つかりません (空入力)`,
      },
    };
  }

  if (extras.length > 0) {
    ctx.diagram.extras = extras;
  }

  return { ok: true, diagram: ctx.diagram };
}
