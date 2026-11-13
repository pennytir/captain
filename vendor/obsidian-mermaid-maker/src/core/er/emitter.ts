/**
 * Atom-ErEmitter (M15.1)
 *
 * ErDiagram AST → Mermaid `erDiagram` テキスト 純関数。
 * Parser とのラウンドトリップ維持を保証する。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ErEmitter.md
 */

import type {
  ErAttribute,
  ErCardinality,
  ErDiagram,
} from '../types/er-schema.js';

const INDENT = '    ';

const LEFT_TOKEN: Record<ErCardinality, string> = {
  'zero-or-one': '|o',
  'exactly-one': '||',
  'zero-or-many': '}o',
  'one-or-many': '}|',
};
const RIGHT_TOKEN: Record<ErCardinality, string> = {
  'zero-or-one': 'o|',
  'exactly-one': '||',
  'zero-or-many': 'o{',
  'one-or-many': '|{',
};

function emitAttribute(a: ErAttribute): string {
  const keys = a.keys.length > 0 ? ` ${a.keys.join(', ')}` : '';
  const comment = a.comment !== undefined ? ` "${a.comment}"` : '';
  return `${a.type} ${a.name}${keys}${comment}`;
}

export function emitErDiagram(diagram: ErDiagram): string {
  const lines: string[] = ['erDiagram'];

  for (const e of diagram.entities) {
    const head = e.label !== e.id ? `${e.id}["${e.label}"]` : e.id;
    if (e.attributes.length === 0) {
      lines.push(`${INDENT}${head}`);
    } else {
      lines.push(`${INDENT}${head} {`);
      for (const a of e.attributes) {
        lines.push(`${INDENT}${INDENT}${emitAttribute(a)}`);
      }
      lines.push(`${INDENT}}`);
    }
  }

  for (const r of diagram.relations) {
    const token = `${LEFT_TOKEN[r.leftCard]}${r.identifying ? '--' : '..'}${RIGHT_TOKEN[r.rightCard]}`;
    const labelPart = r.label ? ` : ${r.label}` : '';
    lines.push(`${INDENT}${r.from} ${token} ${r.to}${labelPart}`);
  }

  for (const ex of diagram.extras ?? []) {
    lines.push(`${INDENT}${ex.raw}`);
  }

  return lines.join('\n');
}
