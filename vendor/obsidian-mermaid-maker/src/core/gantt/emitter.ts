/**
 * Atom-GanttEmitter (M16.1)
 *
 * GanttDiagram AST → Mermaid `gantt` テキスト 純関数。
 * task 行は canonical 順 (name : [tags,] [taskId,] [start,] end) で round-trip 担保。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-GanttEmitter.md
 */

import type { GanttDiagram, GanttTask } from '../types/gantt-schema.js';

const I = '    ';

function emitTask(t: GanttTask): string {
  const meta: string[] = [];
  for (const tag of t.tags) meta.push(tag);
  if (t.taskId) meta.push(t.taskId);
  // start spec
  if (t.startDate) meta.push(t.startDate);
  else if (t.after && t.after.length > 0) meta.push(`after ${t.after.join(' ')}`);
  // end spec
  if (t.duration) meta.push(t.duration);
  else if (t.endDate) meta.push(t.endDate);
  else if (t.until) meta.push(`until ${t.until}`);
  return `${I}${I}${t.name} :${meta.join(', ')}`;
}

export function emitGanttDiagram(diagram: GanttDiagram): string {
  const lines: string[] = ['gantt'];
  if (diagram.title !== undefined) lines.push(`${I}title ${diagram.title}`);
  if (diagram.dateFormat !== undefined) {
    lines.push(`${I}dateFormat ${diagram.dateFormat}`);
  }
  for (const s of diagram.sections) {
    // 暗黙 section (name '') は section 行を出さず task 直書き
    if (s.name !== '') lines.push(`${I}section ${s.name}`);
    for (const t of s.tasks) lines.push(emitTask(t));
  }
  for (const ex of diagram.extras ?? []) lines.push(`${I}${ex.raw}`);
  return lines.join('\n');
}
