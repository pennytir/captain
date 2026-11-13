/**
 * Atom-RequirementEmitter (M19)
 *
 * RequirementDiagram AST → Mermaid `requirementDiagram` テキスト 純関数。
 * Parser とのラウンドトリップ維持を保証する。erEmitter をミラー。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-RequirementEmitter.md
 */

import type {
  Requirement,
  RequirementDiagram,
  RequirementElement,
} from '../types/requirement-schema.js';

const INDENT = '    ';

function emitRequirement(r: Requirement): string[] {
  const lines: string[] = [`${r.kind} ${r.id} {`];
  if (r.reqId !== undefined) lines.push(`${INDENT}id: ${r.reqId}`);
  if (r.text !== undefined) lines.push(`${INDENT}text: ${r.text}`);
  if (r.risk !== undefined) lines.push(`${INDENT}risk: ${r.risk.toLowerCase()}`);
  if (r.verifyMethod !== undefined) {
    lines.push(`${INDENT}verifymethod: ${r.verifyMethod.toLowerCase()}`);
  }
  lines.push('}');
  return lines;
}

function emitElement(e: RequirementElement): string[] {
  const lines: string[] = [`element ${e.id} {`];
  if (e.type !== undefined) lines.push(`${INDENT}type: ${e.type}`);
  if (e.docref !== undefined) lines.push(`${INDENT}docref: ${e.docref}`);
  lines.push('}');
  return lines;
}

export function emitRequirementDiagram(diagram: RequirementDiagram): string {
  const lines: string[] = ['requirementDiagram'];

  for (const r of diagram.requirements) {
    lines.push('');
    lines.push(...emitRequirement(r));
  }

  for (const e of diagram.elements) {
    lines.push('');
    lines.push(...emitElement(e));
  }

  if (diagram.relations.length > 0) {
    lines.push('');
    for (const rel of diagram.relations) {
      lines.push(`${rel.src} - ${rel.type} -> ${rel.dst}`);
    }
  }

  for (const ex of diagram.extras ?? []) {
    lines.push(ex.raw);
  }

  return lines.join('\n');
}
