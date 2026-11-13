/**
 * Atom-ArchitectureEmitter (M20)
 *
 * ArchitectureDiagram AST → Mermaid `architecture-beta` テキスト 純関数。
 * Parser とのラウンドトリップ維持を保証する。requirementEmitter をミラー。
 * req の block emit → architecture は 1 行 1 宣言 (flat、INDENT / 空行区切り無し)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-ArchitectureEmitter.md
 */

import type {
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureGroup,
  ArchitectureJunction,
  ArchitectureService,
} from '../types/architecture-schema.js';

function emitContainer(keyword: 'group' | 'service', n: ArchitectureGroup | ArchitectureService): string {
  let s = `${keyword} ${n.id}`;
  if (n.icon !== undefined) s += `(${n.icon})`;
  if (n.title !== undefined) s += `[${n.title}]`;
  if (n.parent !== undefined) s += ` in ${n.parent}`;
  return s;
}

function emitJunction(j: ArchitectureJunction): string {
  let s = `junction ${j.id}`;
  if (j.parent !== undefined) s += ` in ${j.parent}`;
  return s;
}

function emitEdge(e: ArchitectureEdge): string {
  const srcG = e.srcIsGroup ? '{group}' : '';
  const dstG = e.dstIsGroup ? '{group}' : '';
  return `${e.src}${srcG}:${e.srcSide} ${e.arrow} ${e.dstSide}:${e.dst}${dstG}`;
}

export function emitArchitectureDiagram(diagram: ArchitectureDiagram): string {
  const lines: string[] = ['architecture-beta'];

  for (const g of diagram.groups) lines.push(emitContainer('group', g));
  for (const s of diagram.services) lines.push(emitContainer('service', s));
  for (const j of diagram.junctions) lines.push(emitJunction(j));
  for (const e of diagram.edges) lines.push(emitEdge(e));
  for (const ex of diagram.extras ?? []) lines.push(ex.raw);

  return lines.join('\n');
}
