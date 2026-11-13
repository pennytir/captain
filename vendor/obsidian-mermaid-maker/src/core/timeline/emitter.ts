/**
 * Atom-TimelineEmitter (M17)
 *
 * TimelineDiagram AST → Mermaid `timeline` テキスト 純関数。
 * period 行は `label : e1 : e2` (events 空なら label のみ)。暗黙 section (name '')
 * は section 行を出さず period 直書き。parser と round-trip 担保。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-TimelineEmitter.md
 */

import type { TimelineDiagram, TimelinePeriod } from '../types/timeline-schema.js';

const I = '    ';

function emitPeriod(p: TimelinePeriod): string {
  const parts = [p.label, ...p.events];
  return `${I}${I}${parts.join(' : ')}`;
}

export function emitTimelineDiagram(diagram: TimelineDiagram): string {
  const lines: string[] = ['timeline'];
  if (diagram.title !== undefined) lines.push(`${I}title ${diagram.title}`);
  for (const s of diagram.sections) {
    // 暗黙 section (name '') は section 行を出さず period 直書き
    if (s.name !== '') lines.push(`${I}section ${s.name}`);
    for (const p of s.periods) lines.push(emitPeriod(p));
  }
  for (const ex of diagram.extras ?? []) lines.push(`${I}${ex}`);
  return lines.join('\n');
}
