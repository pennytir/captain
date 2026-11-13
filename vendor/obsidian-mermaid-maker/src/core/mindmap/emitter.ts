/**
 * Atom-MindmapEmitter (M13.1)
 *
 * MindmapDiagram AST → Mermaid `mindmap` テキスト 純関数。
 * 出力は parseMindmap で再 parse すると元 AST と等価 (round-trip 維持)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-MindmapEmitter.md
 */

import type {
  MindmapDiagram,
  MindmapNode,
  MindmapShape,
} from '../types/mindmap-schema.js';

const INDENT_UNIT = '  '; // 2 spaces (Mermaid mindmap 公式)
const ROOT_DEPTH = 1; // root は 2-space indent から始まる (Mermaid 慣例)

function wrapShape(label: string, shape: MindmapShape): string {
  switch (shape) {
    case 'default':
      return label;
    case 'square':
      return `[${label}]`;
    case 'rounded':
      return `(${label})`;
    case 'circle':
      return `((${label}))`;
    case 'bang':
      return `))${label}((`;
    case 'cloud':
      return `)${label}(`;
    case 'hexagon':
      return `{{${label}}}`;
  }
}

function indentFor(depth: number): string {
  let s = '';
  for (let i = 0; i < depth; i++) s += INDENT_UNIT;
  return s;
}

function emitNode(node: MindmapNode, depth: number, out: string[]): void {
  const indent = indentFor(depth);
  out.push(`${indent}${wrapShape(node.label, node.shape)}`);

  // L2: icon / class directive を 1 階層深く出す
  const directiveIndent = indentFor(depth + 1);
  if (node.icon !== undefined) {
    out.push(`${directiveIndent}::icon(${node.icon})`);
  }
  if (node.className !== undefined) {
    out.push(`${directiveIndent}:::${node.className}`);
  }

  for (const child of node.children) {
    emitNode(child, depth + 1, out);
  }
}

export function emitMindmap(diagram: MindmapDiagram): string {
  const out: string[] = ['mindmap'];

  if (diagram.root !== null) {
    emitNode(diagram.root, ROOT_DEPTH, out);
  }

  // L3: extras を末尾に出力 (indent 1 階層、Mermaid 慣例)
  if (diagram.extras && diagram.extras.length > 0) {
    const exIndent = indentFor(1);
    for (const ex of diagram.extras) {
      out.push(`${exIndent}${ex.raw}`);
    }
  }

  return out.join('\n');
}
