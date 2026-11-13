/**
 * Atom-JourneyEmitter (M18)
 *
 * JourneyDiagram AST → Mermaid `journey` テキスト 純関数。
 * task 行は `name : score [: actor, actor]`。暗黙 section (name '') は section 行を
 * 出さず task 直書き。parser と round-trip 担保。timeline-emitter をミラー。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-JourneyEmitter.md
 */

import type { JourneyDiagram, JourneyTask } from '../types/journey-schema.js';

const I = '    ';

function emitTask(t: JourneyTask): string {
  const head = `${t.name} : ${t.score}`;
  return t.actors.length > 0
    ? `${I}${I}${head} : ${t.actors.join(', ')}`
    : `${I}${I}${head}`;
}

export function emitJourneyDiagram(diagram: JourneyDiagram): string {
  const lines: string[] = ['journey'];
  if (diagram.title !== undefined) lines.push(`${I}title ${diagram.title}`);
  for (const s of diagram.sections) {
    // 暗黙 section (name '') は section 行を出さず task 直書き
    if (s.name !== '') lines.push(`${I}section ${s.name}`);
    for (const t of s.tasks) lines.push(emitTask(t));
  }
  for (const ex of diagram.extras ?? []) lines.push(`${I}${ex}`);
  return lines.join('\n');
}
