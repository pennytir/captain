/**
 * Atom-ClassParser (M12.1)
 *
 * Mermaid `classDiagram` テキスト → ClassDiagram AST 純関数。
 * L1 syntax (class 宣言 / 4 visibility / fields / methods / 7 relationship kinds) のみ対応。
 * L2 (notes / annotations / generics) / L3 (namespaces / direction / click 等) を含む場合は
 * { ok: false } を返し、呼出元 (ClassCanvas) が FallbackCanvas へ降格する設計。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ClassParser.md
 */

import type {
  ClassDiagram,
  ClassDirection,
  ClassExtraLine,
  ClassField,
  ClassMember,
  ClassMethod,
  ClassMethodParam,
  ClassNamespace,
  ClassNode,
  ClassNote,
  ClassParseResult,
  ClassRelation,
  ClassRelationKind,
  ClassVisibility,
} from '../types/class-schema.js';

const HEADER_RE = /^classDiagram(?:-v2)?\b/;

// 長い token を先にテストする
type TokenSpec = {
  token: string;
  kind: ClassRelationKind;
  /** true なら token は逆向き (左が継承元 / 集約先)、parse 時に from/to を swap */
  reverse: boolean;
};

const RELATION_TOKENS: ReadonlyArray<TokenSpec> = [
  { token: '<|--', kind: 'inheritance', reverse: true },
  { token: '--|>', kind: 'inheritance', reverse: false },
  { token: '<|..', kind: 'realization', reverse: true },
  { token: '..|>', kind: 'realization', reverse: false },
  { token: '*--', kind: 'composition', reverse: false },
  { token: '--*', kind: 'composition', reverse: true },
  { token: 'o--', kind: 'aggregation', reverse: false },
  { token: '--o', kind: 'aggregation', reverse: true },
  { token: '..>', kind: 'dependency', reverse: false },
  { token: '<..', kind: 'dependency', reverse: true },
  { token: '-->', kind: 'association', reverse: false },
  { token: '<--', kind: 'association', reverse: true },
  { token: '--', kind: 'link', reverse: false },
];

// M12.4 で L3 keyword も accept、`link` (mermaid 仕様外、誤入力対策) のみ fail-fast 維持
const L3_FAIL_KEYWORDS = new Set([
  'link', // class link は使われない (relationship に -- がある)、誤入力扱い
]);

const EXTRA_KEYWORDS = new Set(['click', 'cssClass', 'callback', 'style']);

const DIRECTION_RE = /^direction\s+(LR|RL|TB|BT)\s*$/;
const NAMESPACE_OPEN_RE =
  /^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{?\s*$/;

const VISIBILITY_MAP: Record<string, ClassVisibility> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
};

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('%%');
}

function isClassId(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/** member 行 (visibility + 型 + name(+params)) を parse */
function parseMember(
  line: string,
  fieldCounter: { n: number },
  methodCounter: { n: number },
): ClassMember | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  let visibility: ClassVisibility = 'public';
  let rest = trimmed;
  const firstChar = trimmed.charAt(0);
  if (VISIBILITY_MAP[firstChar]) {
    visibility = VISIBILITY_MAP[firstChar];
    rest = trimmed.slice(1).trim();
  }

  // method: `name(params) ReturnType?` または `ReturnType name(params)`
  // Mermaid 慣用: `+String getName()` (型が先) / `+getName() String` (型が後) どちらも受ける
  const parenIdx = rest.indexOf('(');
  if (parenIdx !== -1) {
    const closeIdx = rest.lastIndexOf(')');
    if (closeIdx === -1 || closeIdx < parenIdx) return null;
    const beforeParen = rest.slice(0, parenIdx).trim();
    const paramsStr = rest.slice(parenIdx + 1, closeIdx).trim();
    const afterParen = rest.slice(closeIdx + 1).trim();

    // beforeParen: `<returnType?> <name>` or just `<name>`
    const beforeTokens = beforeParen.split(/\s+/).filter(Boolean);
    let methodName: string;
    let returnTypeBefore: string | undefined;
    if (beforeTokens.length === 1) {
      methodName = beforeTokens[0];
    } else if (beforeTokens.length >= 2) {
      methodName = beforeTokens[beforeTokens.length - 1];
      returnTypeBefore = beforeTokens.slice(0, -1).join(' ');
    } else {
      return null;
    }
    const returnType = afterParen !== '' ? afterParen : returnTypeBefore;

    const params: ClassMethodParam[] = paramsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((token) => {
        const parts = token.split(/\s+/).filter(Boolean);
        if (parts.length === 1) return { name: parts[0] };
        return { type: parts.slice(0, -1).join(' '), name: parts[parts.length - 1] };
      });

    const method: ClassMethod = {
      kind: 'method',
      id: `mth${methodCounter.n++}`,
      visibility,
      ...(returnType ? { returnType } : {}),
      name: methodName,
      params,
    };
    return method;
  }

  // field: `<type?> <name>`
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  let fieldName: string;
  let fieldType: string | undefined;
  if (parts.length === 1) {
    fieldName = parts[0];
  } else {
    fieldName = parts[parts.length - 1];
    fieldType = parts.slice(0, -1).join(' ');
  }
  const field: ClassField = {
    kind: 'field',
    id: `fld${fieldCounter.n++}`,
    visibility,
    ...(fieldType ? { type: fieldType } : {}),
    name: fieldName,
  };
  return field;
}

interface ParseCtx {
  classesById: Map<string, ClassNode>;
  relations: ClassRelation[];
  notes: ClassNote[];
  namespaces: ClassNamespace[];
  extras: ClassExtraLine[];
  direction?: ClassDirection;
  fieldCounter: { n: number };
  methodCounter: { n: number };
  relCounter: number;
  noteCounter: number;
  nsCounter: number;
  extraCounter: number;
}

function ensureClass(ctx: ParseCtx, id: string): ClassNode {
  let cls = ctx.classesById.get(id);
  if (!cls) {
    cls = { id, label: id, members: [] };
    ctx.classesById.set(id, cls);
  }
  return cls;
}

/** relationship 行を検出 (token を含む) */
function tryParseRelation(
  line: string,
  ctx: ParseCtx,
): boolean | { error: string } {
  for (const spec of RELATION_TOKENS) {
    const idx = line.indexOf(spec.token);
    if (idx === -1) continue;
    const left = line.slice(0, idx).trim();
    const rest = line.slice(idx + spec.token.length);
    let labelPart: string | undefined;
    let rightOnly = rest;
    const colonIdx = rest.indexOf(':');
    if (colonIdx !== -1) {
      rightOnly = rest.slice(0, colonIdx).trim();
      labelPart = rest.slice(colonIdx + 1).trim();
    } else {
      rightOnly = rest.trim();
    }
    if (!isClassId(left) || !isClassId(rightOnly)) continue;
    const fromId = spec.reverse ? rightOnly : left;
    const toId = spec.reverse ? left : rightOnly;
    ensureClass(ctx, fromId);
    ensureClass(ctx, toId);
    const rel: ClassRelation = {
      id: `r${ctx.relCounter++}`,
      from: fromId,
      to: toId,
      kind: spec.kind,
      ...(labelPart ? { label: labelPart } : {}),
    };
    ctx.relations.push(rel);
    return true;
  }
  return false;
}

/** `class <Id>` / `class <Id>~<Generic>~` / `class <Id> { ... }` 行を parse */
function tryParseClassDecl(
  line: string,
  ctx: ParseCtx,
): boolean | { error: string } {
  // M12.3a: `class Id~T~` または `class Id~T~ { ... }` の generic を抽出
  const m = line.match(
    /^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:~([^~]+)~)?\s*(\{(.*)\})?\s*$/,
  );
  if (!m) {
    if (line.startsWith('class ')) {
      return { error: `Invalid class declaration: ${line}` };
    }
    return false;
  }
  const id = m[1];
  const generic = m[2]?.trim();
  const cls = ensureClass(ctx, id);
  if (generic) cls.generic = generic;
  const brace = m[4];
  if (brace) {
    // brace 内を `;` または改行で split → 各 token (member or annotation)
    const innerLines = brace
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const inner of innerLines) {
      const annoMatch = inner.match(/^<<([^>]+)>>$/);
      if (annoMatch) {
        cls.annotation = annoMatch[1].trim();
        continue;
      }
      const mem = parseMember(inner, ctx.fieldCounter, ctx.methodCounter);
      if (mem) cls.members.push(mem);
    }
  }
  return true;
}

/** sticky member 行: `<Id> : <member-line>` */
function tryParseStickyMember(line: string, ctx: ParseCtx): boolean {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
  if (!m) return false;
  const id = m[1];
  const memberLine = m[2];
  const cls = ensureClass(ctx, id);
  const mem = parseMember(memberLine, ctx.fieldCounter, ctx.methodCounter);
  if (mem) cls.members.push(mem);
  return true;
}

/** M12.3a: standalone annotation 行 `<<interface>> Id` */
function tryParseStandaloneAnnotation(line: string, ctx: ParseCtx): boolean {
  const m = line.match(/^<<([^>]+)>>\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (!m) return false;
  const annotation = m[1].trim();
  const id = m[2];
  const cls = ensureClass(ctx, id);
  cls.annotation = annotation;
  return true;
}

/** M12.3a: note 行 `note "text" for Id` / `note "text"` */
function tryParseNote(line: string, ctx: ParseCtx): boolean {
  // per-class note: `note "<text>" for <Id>` (with or without quotes)
  let m = line.match(
    /^note\s+"([^"]*)"\s+for\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/,
  );
  if (m) {
    const cls = ensureClass(ctx, m[2]);
    void cls; // 暗黙登録のみ
    const note: ClassNote = {
      id: `cn${ctx.noteCounter++}`,
      forClassId: m[2],
      label: m[1],
    };
    ctx.notes.push(note);
    return true;
  }
  // standalone note: `note "<text>"`
  m = line.match(/^note\s+"([^"]*)"\s*$/);
  if (m) {
    const note: ClassNote = {
      id: `cn${ctx.noteCounter++}`,
      label: m[1],
    };
    ctx.notes.push(note);
    return true;
  }
  // quote 無し版: `note <text> for <Id>` / `note <text>` (Mermaid は寛容)
  m = line.match(/^note\s+for\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
  if (m) {
    ensureClass(ctx, m[1]);
    ctx.notes.push({
      id: `cn${ctx.noteCounter++}`,
      forClassId: m[1],
      label: m[2].trim(),
    });
    return true;
  }
  return false;
}

/**
 * 連続行の class brace を 1 行にまとめる pre-pass
 * `class A { ... \n... \n}` → `class A { ...; ... }`。
 *
 * M12.4: namespace block (`namespace ns { class A; class B }`) は対象外 (brace depth で
 * 区別)。class brace のみ collapse、namespace brace はそのまま残して parser 本体で
 * sub-loop で扱う。
 */
function collapseMultilineBraces(text: string): string {
  const out: string[] = [];
  const lines = text.split('\n');
  let buf: string[] | null = null;
  for (const line of lines) {
    if (buf !== null) {
      buf.push(line);
      if (line.includes('}')) {
        const joined = buf.join('\n');
        const collapsed = joined.replace(/\n/g, '; ').replace(/;\s*}/, ' }');
        out.push(collapsed);
        buf = null;
      }
      continue;
    }
    const openIdx = line.indexOf('{');
    const closeIdx = line.indexOf('}');
    // class declaration の brace のみ collapse (namespace は対象外)
    const trimmed = line.trim();
    const isClassBrace = /^class\s+[A-Za-z_]/.test(trimmed) && openIdx !== -1 && closeIdx === -1;
    if (isClassBrace) {
      buf = [line];
      continue;
    }
    out.push(line);
  }
  if (buf !== null) out.push(...buf);
  return out.join('\n');
}

export function parseClassDiagram(text: string): ClassParseResult {
  const collapsed = collapseMultilineBraces(text);
  const lines = collapsed.split('\n');
  const ctx: ParseCtx = {
    classesById: new Map(),
    relations: [],
    notes: [],
    namespaces: [],
    extras: [],
    fieldCounter: { n: 0 },
    methodCounter: { n: 0 },
    relCounter: 0,
    noteCounter: 0,
    nsCounter: 0,
    extraCounter: 0,
  };

  let headerSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
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
          message: `Expected 'classDiagram' header, got: ${line}`,
        },
      };
    }

    // 誤入力扱いの L3 keyword だけ fail-fast (`link` 等)
    const firstWord = line.split(/\s+/)[0];
    if (L3_FAIL_KEYWORDS.has(firstWord)) {
      return {
        ok: false,
        error: {
          line: i + 1,
          message: `Unsupported keyword: ${line}`,
        },
      };
    }

    // M12.4: direction LR/RL/TB/BT
    const dirM = line.match(DIRECTION_RE);
    if (dirM) {
      ctx.direction = dirM[1] as ClassDirection;
      continue;
    }

    // M12.4: namespace block (multi-line brace)
    const nsM = line.match(NAMESPACE_OPEN_RE);
    if (nsM) {
      // namespace ns { ... } を sub-loop で parse、内部 class を classes に追加
      const nsName = nsM[1];
      const classIds: string[] = [];
      // 同じ行に `{` が無ければ単独行扱いで何もせず継続 (Mermaid 仕様外、寛容)
      const hasOpenBrace = line.includes('{');
      if (!hasOpenBrace) {
        return {
          ok: false,
          error: {
            line: i + 1,
            message: `namespace requires '{' on same or next line`,
          },
        };
      }
      // sub-loop: matching `}` まで読む
      let nsClosed = false;
      while (++i < lines.length) {
        const subLine = lines[i].trim();
        if (subLine === '}') {
          nsClosed = true;
          break;
        }
        if (isSkippable(subLine)) continue;
        // namespace 内部の class 宣言 (sticky member は namespace 外で使う、ここでは class declaration のみ受ける)
        const cm = subLine.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (cm) {
          const clsRes = tryParseClassDecl(subLine, ctx);
          if (typeof clsRes === 'object' && 'error' in clsRes) {
            return { ok: false, error: { line: i + 1, message: clsRes.error } };
          }
          classIds.push(cm[1]);
          continue;
        }
        return {
          ok: false,
          error: {
            line: i + 1,
            message: `Unsupported inside namespace: ${subLine}`,
          },
        };
      }
      if (!nsClosed) {
        return {
          ok: false,
          error: { line: i, message: `Unclosed namespace '${nsName}'` },
        };
      }
      ctx.namespaces.push({
        id: `ns${ctx.nsCounter++}`,
        name: nsName,
        classIds,
      });
      continue;
    }

    // M12.4: click / cssClass / callback / style → raw line で保持
    if (EXTRA_KEYWORDS.has(firstWord)) {
      ctx.extras.push({ id: `ex${ctx.extraCounter++}`, raw: line });
      continue;
    }

    // M12.3a: note 行 を先に試す (relationship token と被らない)
    if (tryParseNote(line, ctx)) continue;

    // M12.3a: standalone annotation `<<interface>> Id`
    if (tryParseStandaloneAnnotation(line, ctx)) continue;

    // relationship を試す (class 宣言行と被らないように token を先にチェック)
    const relRes = tryParseRelation(line, ctx);
    if (typeof relRes === 'object' && 'error' in relRes) {
      return { ok: false, error: { line: i + 1, message: relRes.error } };
    }
    if (relRes === true) continue;

    // class 宣言
    const clsRes = tryParseClassDecl(line, ctx);
    if (typeof clsRes === 'object' && 'error' in clsRes) {
      return { ok: false, error: { line: i + 1, message: clsRes.error } };
    }
    if (clsRes === true) continue;

    // sticky member
    if (tryParseStickyMember(line, ctx)) continue;

    return {
      ok: false,
      error: { line: i + 1, message: `Unknown syntax at line ${i + 1}: ${line}` },
    };
  }

  if (!headerSeen) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing classDiagram header' },
    };
  }

  const diagram: ClassDiagram = {
    classes: Array.from(ctx.classesById.values()),
    relations: ctx.relations,
    ...(ctx.notes.length > 0 ? { notes: ctx.notes } : {}),
    ...(ctx.direction !== undefined ? { direction: ctx.direction } : {}),
    ...(ctx.namespaces.length > 0 ? { namespaces: ctx.namespaces } : {}),
    ...(ctx.extras.length > 0 ? { extras: ctx.extras } : {}),
  };
  return { ok: true, diagram };
}
