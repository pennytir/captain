/**
 * Atom-MermaidParser
 * Mermaid テキスト → 内部 AST (Graph) + 座標 (PositionMap)
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MermaidParser.md
 *
 * 対応構文:
 * - ヘッダ: `graph` / `flowchart` + LR | RL | TB | BT | TD
 * - ノード形状: box/rounded/stadium/subroutine/cylinder/circle/doubleCircle/
 *               asymmetric/rhombus/hexagon/parallelogram(Alt)/trapezoid(Alt)
 * - エッジ線: solid (-) / dotted (-.) / thick (=)
 * - エッジ端: arrow > / open (none) / circle o / cross x
 * - 双方向: `<-->` 等で arrowStart 設定
 * - ラベル: `--text-->` / `-->|label|` 両形式
 * - subgraph ... end (ネスト可、`direction` 指定可)
 * - コメント: `%%`
 */

import type {
  ClassDef,
  Direction,
  Edge,
  EdgeArrowEnd,
  EdgeArrowStart,
  EdgeLine,
  ExtraLine,
  Graph,
  Node,
  NodeShape,
  ParseResult,
  Subgraph,
} from '../types/schema.js';
import {
  extractPositionComments,
  extractEdgeCtrlComments,
  extractEdgeShapeComments,
} from '../store/position-store.js';

// ─── ヘッダ ───────────────────────────────────────────────
const HEADER_RE = /^\s*(?:graph|flowchart)\s+(LR|RL|TB|BT|TD)\s*$/;
const DIRECTION_RE = /^\s*direction\s+(LR|RL|TB|BT|TD)\s*$/;

// ─── ノード形状 (順序重要：長い記号から先にマッチ) ──────
// それぞれ "ID + 形状記号(label)形状終わり" を完全マッチ
const NODE_PATTERNS: Array<{ shape: NodeShape; re: RegExp }> = [
  { shape: 'doubleCircle',      re: /^([A-Za-z0-9_]+)\(\(\((.+?)\)\)\)$/ },
  { shape: 'circle',            re: /^([A-Za-z0-9_]+)\(\((.+?)\)\)$/ },
  { shape: 'subroutine',        re: /^([A-Za-z0-9_]+)\[\[(.+?)\]\]$/ },
  { shape: 'cylinder',          re: /^([A-Za-z0-9_]+)\[\((.+?)\)\]$/ },
  { shape: 'stadium',           re: /^([A-Za-z0-9_]+)\(\[(.+?)\]\)$/ },
  { shape: 'hexagon',           re: /^([A-Za-z0-9_]+)\{\{(.+?)\}\}$/ },
  { shape: 'trapezoid',         re: /^([A-Za-z0-9_]+)\[\/(.+?)\\\]$/ },
  { shape: 'trapezoidAlt',      re: /^([A-Za-z0-9_]+)\[\\(.+?)\/\]$/ },
  { shape: 'parallelogram',     re: /^([A-Za-z0-9_]+)\[\/(.+?)\/\]$/ },
  { shape: 'parallelogramAlt',  re: /^([A-Za-z0-9_]+)\[\\(.+?)\\\]$/ },
  { shape: 'rhombus',           re: /^([A-Za-z0-9_]+)\{(.+?)\}$/ },
  { shape: 'asymmetric',        re: /^([A-Za-z0-9_]+)>(.+?)\]$/ },
  { shape: 'box',               re: /^([A-Za-z0-9_]+)\[(.+?)\]$/ },
  { shape: 'rounded',           re: /^([A-Za-z0-9_]+)\((.+?)\)$/ },
];

const ID_ONLY_RE = /^([A-Za-z0-9_]+)$/;

// ノードトークンから { id, label, shape } を取り出す。形状未指定 (素の ID) なら
// label = id, shape = box とする。失敗時 null。
function parseNodeToken(
  token: string,
): { id: string; label: string; shape: NodeShape; markdown?: boolean } | null {
  for (const { shape, re } of NODE_PATTERNS) {
    const m = token.match(re);
    if (m) {
      const label = m[2]!;
      // 引用符ラベル `"..."` は markdown として剥がす (B3b)
      if (label.length >= 2 && label.startsWith('"') && label.endsWith('"')) {
        return { id: m[1]!, label: label.slice(1, -1), shape, markdown: true };
      }
      return { id: m[1]!, label, shape };
    }
  }
  const idMatch = token.match(ID_ONLY_RE);
  if (idMatch) {
    return { id: idMatch[1]!, label: idMatch[1]!, shape: 'box' };
  }
  return null;
}

// ─── エッジトークン ──────────────────────────────────────
// Mermaid edge token (左端開始記号 + 線 + 任意 inline ラベル + 右端終了記号)
// 例:
//   -->         arrow
//   ---         open
//   -.->        dotted arrow
//   -.-         dotted open
//   ==>         thick arrow
//   ===         thick open
//   --o         circle
//   --x         cross
//   <-->        bi arrow
//   o--o        bi circle
//   x--x        bi cross
//   --text-->   inline-text arrow
//   -.text.->   inline-text dotted
//   ==text==>   inline-text thick
//
// 構造的に：[startSym?][lineCore][text?][endSym]
// lineCore は -+, -.+, =+ のいずれか
// startSym は < o x のいずれか (なければ none)
// endSym は > o x のいずれか、または無い場合は "open"
//
// 実装方針: 1 つの大きな regex で edge トークンを切り出して 4 グループ取得する。
// 線形式ごとに 3 種類 (solid / dotted / thick) の regex を試す。

type EdgeTokenInfo = {
  startSym: '<' | 'o' | 'x' | '';
  line: EdgeLine;
  inlineText: string | undefined;
  endSym: '>' | 'o' | 'x' | '';
};

// 各形式: start? (open|sym) hyphens [text hyphens]? end?
//   solid: -+ ... -+   (hyphen の連続)
//   dotted: -. ... .-  or -.-+
//   thick:  =+ ... =+
// Mermaid 公式の lexer は複雑だが、よくある形式を網羅する。
const EDGE_REGEXES: Array<{ line: EdgeLine; re: RegExp }> = [
  {
    // thick:  ([<ox])?  ={1,}  (text  ={1,})?  ([>ox])?
    line: 'thick',
    re: /^([<ox])?={1,}(?:([^=<>ox][^=<>]*?)={1,})?([>ox])?$/,
  },
  {
    // dotted: ([<ox])?  -\.+   (text  \.+)?  -?  ([>ox])?
    // 形式: -.-  /  -.->  /  -.text.->
    line: 'dotted',
    re: /^([<ox])?-\.+(?:([^.<>ox-][^.<>]*?)\.+)?-?([>ox])?$/,
  },
  {
    // solid:  ([<ox])?  -{1,}  (text  -{1,})?  ([>ox])?
    line: 'solid',
    re: /^([<ox])?-{2,}(?:([^-<>ox][^-<>]*?)-{1,})?([>ox])?$/,
  },
];

function parseEdgeToken(token: string): EdgeTokenInfo | null {
  for (const { line, re } of EDGE_REGEXES) {
    const m = token.match(re);
    if (m) {
      const startSym = (m[1] ?? '') as EdgeTokenInfo['startSym'];
      const inlineText = m[2]?.trim() || undefined;
      const endSym = (m[3] ?? '') as EdgeTokenInfo['endSym'];
      return { startSym, line, inlineText, endSym };
    }
  }
  return null;
}

function arrowEndFromSym(sym: '>' | 'o' | 'x' | ''): EdgeArrowEnd {
  if (sym === '>') return 'arrow';
  if (sym === 'o') return 'circle';
  if (sym === 'x') return 'cross';
  return 'open';
}

function arrowStartFromSym(sym: '<' | 'o' | 'x' | ''): EdgeArrowStart {
  if (sym === '<') return 'arrow';
  if (sym === 'o') return 'circle';
  if (sym === 'x') return 'cross';
  return 'none';
}

// ─── 行スキャナ ──────────────────────────────────────────
// エッジ行を「ノードトークン / エッジトークン / ノードトークン / …」に分割する。
// チェーン (`A --> B --> C`) は左から順に消費する。
//
// edge token は -, =, ., <, >, o, x のみで構成される連続シーケンス（ただし inline ラベル含む形式は特殊）。
// ここでは「ノード→edge→ノード(→edge→ノード…)」の構造を仮定し、edge プレフィックス検出は
// 先頭文字が `<`, `o`, `x`, `-`, `=` でかつ続きが edge token に合致する場合とする。
//
// ノードトークンは `ID` または `ID<shape>` (括弧やブラケットを含む)。
// ノード形状終了は、`(...)` / `((...))` 等のネスト深さ追跡で行う。

// 行の tokenize
//
// 戦略:
// 1. 行を空白で粗く split し、各トークンを試行（edge / node 全体マッチ）
// 2. どちらにも該当しない場合は compound（`A-->B` 等）として regex split
// 3. 結果が `node (edge node)+` の形に並べばエッジ行と判定
//
// compound 内では start/end sym `o`/`x` は使えない（ID と区別不能のため）。
// `A o--o B` のように空白で区切る形式のみ対応。

// compound 用 edge regex: start=`<` のみ / end=`>` のみ
const COMPOUND_EDGE_RE = /(<?)(-{2,}|={1,}|-\.+-?)(>?)/g;

type LineTok = { type: 'node' | 'edge'; text: string };

function splitCompoundToken(tok: string): LineTok[] | null {
  const result: LineTok[] = [];
  let lastEnd = 0;
  const re = new RegExp(COMPOUND_EDGE_RE.source, 'g');
  let m: RegExpExecArray | null;
  let foundAny = false;
  while ((m = re.exec(tok)) !== null) {
    const startSym = m[1];
    const core = m[2];
    const endSym = m[3];
    if (!core || core.length === 0) {
      re.lastIndex++;
      continue;
    }
    // thick edge needs at least 2 `=` to disambiguate from styling
    if (core[0] === '=' && core.length < 2) {
      re.lastIndex = m.index + 1;
      continue;
    }
    const fullEdge = startSym + core + endSym;
    if (!parseEdgeToken(fullEdge)) {
      re.lastIndex = m.index + 1;
      continue;
    }
    foundAny = true;
    // node text before
    const nodeText = tok.slice(lastEnd, m.index);
    if (nodeText) {
      if (!parseNodeToken(splitInlineClass(nodeText).core)) return null;
      result.push({ type: 'node', text: nodeText });
    }
    result.push({ type: 'edge', text: fullEdge });
    lastEnd = re.lastIndex;
  }
  if (!foundAny) return null;
  const trailing = tok.slice(lastEnd);
  if (trailing) {
    if (!parseNodeToken(splitInlineClass(trailing).core)) return null;
    result.push({ type: 'node', text: trailing });
  }
  return result;
}

// ブラケット `[](){}` 深さ + 引用符 `"..."` の内側のスペースを sentinel に置換する。
// これで `A[hello world]` / `A["**bold** x"]` が空白 split で割れない (B3a)。
const SPACE_SENTINEL = String.fromCharCode(0);
function protectLabelSpaces(line: string): string {
  let depth = 0;
  let inQuote = false;
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      out += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === '[' || ch === '(' || ch === '{') depth++;
      else if ((ch === ']' || ch === ')' || ch === '}') && depth > 0) depth--;
    }
    out += ch === ' ' && (depth > 0 || inQuote) ? SPACE_SENTINEL : ch;
  }
  return out;
}
function restoreSpaces(tok: string): string {
  return tok.split(SPACE_SENTINEL).join(' ');
}

function tokenizeLine(line: string): LineTok[] | null {
  // ブラケット/引用符内のスペースを保護してから空白 split (B3a)。
  // 各トークンは復元してから分類する。
  const wsToks = protectLabelSpaces(line).split(/\s+/).filter(Boolean);
  const result: LineTok[] = [];
  for (const protTok of wsToks) {
    const tok = restoreSpaces(protTok);
    if (parseEdgeToken(tok)) {
      result.push({ type: 'edge', text: tok });
      continue;
    }
    if (parseNodeToken(splitInlineClass(tok).core)) {
      result.push({ type: 'node', text: tok });
      continue;
    }
    const sub = splitCompoundToken(tok);
    if (!sub) return null;
    result.push(...sub);
  }
  return result;
}

function scanLineForEdges(line: string): {
  nodeTokens: string[];
  edgeTokens: string[];
} | null {
  const toks = tokenizeLine(line);
  if (!toks) return null;
  if (toks.length < 3) return null;
  // 期待形: node edge node (edge node)*
  for (let k = 0; k < toks.length; k++) {
    const expected = k % 2 === 0 ? 'node' : 'edge';
    if (toks[k].type !== expected) return null;
  }
  if (toks[toks.length - 1].type !== 'node') return null;
  const nodeTokens: string[] = [];
  const edgeTokens: string[] = [];
  for (const t of toks) {
    if (t.type === 'node') nodeTokens.push(t.text);
    else edgeTokens.push(t.text);
  }
  return { nodeTokens, edgeTokens };
}

// ─── パーサ本体 ──────────────────────────────────────────

type ParseState = {
  direction: Direction;
  nodes: Map<string, Node>;
  edges: Edge[];
  // subgraph スタック: 現在パース中の subgraph 階層
  subgraphStack: Subgraph[];
  // 全 subgraph (root 含む) フラットリスト
  allSubgraphs: Map<string, Subgraph>;
  edgeIdCounter: number;
  // L2 (Phase B)
  classDefs: ClassDef[];
  extras: ExtraLine[];
  extraCounter: number;
};

function pushNodeId(state: ParseState, id: string) {
  // 現在の subgraph に所属させる（あれば）。
  const cur = state.subgraphStack[state.subgraphStack.length - 1];
  if (cur && !cur.nodeIds.includes(id)) {
    cur.nodeIds.push(id);
  }
}

function addClass(node: Node, className: string) {
  if (!node.classes) node.classes = [];
  if (!node.classes.includes(className)) node.classes.push(className);
}

function ensureNode(state: ParseState, token: string): Node | null {
  // inline class `:::name` を末尾から剥がす (Phase B)
  const { core: coreToken, className } = splitInlineClass(token);
  const parsed = parseNodeToken(coreToken);
  if (!parsed) return null;
  const existing = state.nodes.get(parsed.id);
  if (existing) {
    // 形状やラベルの後出し上書き: 形状が明示された (label !== id or shape !== 'box') 場合のみ上書き
    if (parsed.shape !== 'box' || parsed.label !== parsed.id) {
      existing.shape = parsed.shape;
      existing.label = parsed.label;
      if (parsed.markdown) existing.labelMarkdown = true;
    }
    if (className) addClass(existing, className);
    pushNodeId(state, parsed.id);
    return existing;
  }
  const node: Node = { id: parsed.id, label: parsed.label, shape: parsed.shape };
  if (parsed.markdown) node.labelMarkdown = true;
  if (className) addClass(node, className);
  state.nodes.set(parsed.id, node);
  pushNodeId(state, parsed.id);
  return node;
}

const SUBGRAPH_RE = /^subgraph\s+([A-Za-z0-9_]+)(?:\s*\[(.+?)\])?\s*$/;
const SUBGRAPH_END_RE = /^end\s*$/;

// ─── L2 スタイル directive (Phase B) ──────────────────────
const CLASSDEF_RE = /^classDef\s+([A-Za-z0-9_,]+)\s+(.+)$/;
const CLASS_RE = /^class\s+([A-Za-z0-9_,]+)\s+([A-Za-z0-9_]+)\s*$/;
const STYLE_RE = /^style\s+([A-Za-z0-9_]+)\s+(.+)$/;
// node トークン末尾の inline class `:::name`
const INLINE_CLASS_RE = /:::([A-Za-z0-9_]+)$/;

// node トークンから inline class `:::name` を分離する
function splitInlineClass(token: string): { core: string; className?: string } {
  const m = token.match(INLINE_CLASS_RE);
  if (m) {
    return { core: token.slice(0, token.length - m[0].length), className: m[1] };
  }
  return { core: token };
}

export function parseMermaid(text: string): ParseResult {
  const lines = text.split('\n');
  const state: ParseState = {
    direction: 'LR',
    nodes: new Map(),
    edges: [],
    subgraphStack: [],
    allSubgraphs: new Map(),
    edgeIdCounter: 0,
    classDefs: [],
    extras: [],
    extraCounter: 0,
  };
  let headerSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('%%')) continue;

    if (!headerSeen) {
      const h = line.match(HEADER_RE);
      if (h) {
        state.direction = h[1] as Direction;
        headerSeen = true;
        continue;
      }
      return {
        ok: false,
        error: {
          line: i + 1,
          message: `Expected 'graph' or 'flowchart' header with direction (LR|RL|TB|BT|TD), got: ${line}`,
        },
      };
    }

    // subgraph 開始
    const sgm = line.match(SUBGRAPH_RE);
    if (sgm) {
      const id = sgm[1];
      const title = sgm[2];
      const sg: Subgraph = {
        id,
        ...(title ? { title } : {}),
        nodeIds: [],
        childSubgraphIds: [],
      };
      // 親 subgraph があれば、その childSubgraphIds に登録
      const parent = state.subgraphStack[state.subgraphStack.length - 1];
      if (parent && !parent.childSubgraphIds.includes(id)) {
        parent.childSubgraphIds.push(id);
      }
      state.allSubgraphs.set(id, sg);
      state.subgraphStack.push(sg);
      continue;
    }

    // subgraph 終了
    if (SUBGRAPH_END_RE.test(line)) {
      if (state.subgraphStack.length === 0) {
        return {
          ok: false,
          error: { line: i + 1, message: `'end' without matching 'subgraph'` },
        };
      }
      state.subgraphStack.pop();
      continue;
    }

    // subgraph 内の direction オーバーライド
    const dm = line.match(DIRECTION_RE);
    if (dm) {
      const cur = state.subgraphStack[state.subgraphStack.length - 1];
      if (cur) {
        cur.direction = dm[1] as Direction;
      } else {
        state.direction = dm[1] as Direction;
      }
      continue;
    }

    // ─── L2 スタイル directive (Phase B、edge/node 解釈より先に判定) ───
    const cdm = line.match(CLASSDEF_RE);
    if (cdm) {
      const css = cdm[2].trim();
      for (const name of cdm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        state.classDefs.push({ name, style: css });
      }
      continue;
    }
    const clm = line.match(CLASS_RE);
    if (clm) {
      const className = clm[2];
      for (const id of clm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const node = ensureNode(state, id);
        if (node) addClass(node, className);
      }
      continue;
    }
    const stm = line.match(STYLE_RE);
    if (stm) {
      const node = ensureNode(state, stm[1]);
      if (node) {
        node.style = stm[2].trim();
        continue;
      }
      // node 化できない style 対象 (edge id 等) は extras へ
      state.extras.push({ id: `ex${state.extraCounter++}`, raw: line });
      continue;
    }

    // エッジ行 / ノード行
    // pipe-label `|...|` を一旦剥がして edge token をきれいにする。
    // 剥がした label は出現順に edge へ割り当てる。
    const pipeLabels: string[] = [];
    const lineNoPipes = line.replace(/\|([^|]*)\|/g, (_, lbl) => {
      pipeLabels.push(lbl);
      return '';
    });
    const scanned = scanLineForEdges(lineNoPipes);
    if (scanned) {
      // node tokens を node 化
      const resolvedNodes: Node[] = [];
      for (const nt of scanned.nodeTokens) {
        const n = ensureNode(state, nt);
        if (!n) {
          return {
            ok: false,
            error: { line: i + 1, message: `Invalid node token: ${nt}` },
          };
        }
        resolvedNodes.push(n);
      }
      // edges
      for (let k = 0; k < scanned.edgeTokens.length; k++) {
        const et = scanned.edgeTokens[k];
        const info = parseEdgeToken(et);
        if (!info) {
          return {
            ok: false,
            error: { line: i + 1, message: `Invalid edge token: ${et}` },
          };
        }
        const src = resolvedNodes[k];
        const tgt = resolvedNodes[k + 1];
        const edge: Edge = {
          id: `e${state.edgeIdCounter++}`,
          source: src.id,
          target: tgt.id,
        };
        if (info.inlineText) edge.label = info.inlineText;
        if (info.line !== 'solid') edge.line = info.line;
        const endA = arrowEndFromSym(info.endSym);
        if (endA !== 'arrow') edge.arrowEnd = endA;
        const startA = arrowStartFromSym(info.startSym);
        if (startA !== 'none') edge.arrowStart = startA;
        state.edges.push(edge);
      }
      // pipe ラベルが行から事前に剥がされているなら、出現順に edge へ割り当てる。
      for (let k = 0; k < pipeLabels.length && k < scanned.edgeTokens.length; k++) {
        const lbl = pipeLabels[k].trim();
        if (lbl) {
          state.edges[state.edges.length - scanned.edgeTokens.length + k].label = lbl;
        }
      }
      continue;
    }

    // ノード単独行 (inline class `:::` 付きも ensureNode 経由で許容)
    const singleCore = line.replace(INLINE_CLASS_RE, '');
    if (parseNodeToken(singleCore)) {
      ensureNode(state, line);
      continue;
    }

    // どの構文にも該当しない body 行 → extras に退避 (Pattern 7、Phase B)
    // 従来は ok:false で図ごと fallback していたが、L2/L3 directive を round-trip 維持する
    state.extras.push({ id: `ex${state.extraCounter++}`, raw: line });
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing header' },
    };
  }
  if (state.subgraphStack.length > 0) {
    return {
      ok: false,
      error: {
        line: lines.length,
        message: `Unclosed subgraph: ${state.subgraphStack.map((s) => s.id).join(' > ')}`,
      },
    };
  }

  const edgeShapes = extractEdgeShapeComments(text);
  const edgesWithShape = state.edges.map((e) =>
    edgeShapes[e.id] ? { ...e, shape: edgeShapes[e.id] } : e,
  );

  const subgraphList = Array.from(state.allSubgraphs.values());
  const graph: Graph = {
    direction: state.direction,
    nodes: Array.from(state.nodes.values()),
    edges: edgesWithShape,
    ...(subgraphList.length > 0 ? { subgraphs: subgraphList } : {}),
    ...(state.classDefs.length > 0 ? { classDefs: state.classDefs } : {}),
    ...(state.extras.length > 0 ? { extras: state.extras } : {}),
  };

  const positions = extractPositionComments(text);
  const edgeControls = extractEdgeCtrlComments(text);

  return { ok: true, graph, positions, edgeControls, edgeShapes };
}
