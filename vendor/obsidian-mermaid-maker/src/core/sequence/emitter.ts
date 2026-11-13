/**
 * Atom-SequenceEmitter (M11.1 L1 / M11.3a L2 拡張)
 *
 * SequenceDiagram AST → Mermaid sequenceDiagram テキスト 純関数。
 * Parser とのラウンドトリップ維持を保証する。
 *
 * - `items === undefined` → L1-only emit (M11.1 互換)
 * - `items !== undefined` → items を再帰 emit (block 入れ子は depth × INDENT)
 * - activations は `activate` / `deactivate` 独立行で emit (`+`/`-` 略記は使わない)
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-SequenceEmitter.md
 */

import type {
  SequenceActivation,
  SequenceBlock,
  SequenceDiagram,
  SequenceItem,
  SequenceMessageArrow,
  SequenceMessageItem,
  SequenceNote,
} from '../types/sequence-schema.js';

const ARROW_TO_TOKEN: Record<SequenceMessageArrow, string> = {
  'solid-arrow': '->>',
  'solid-line': '->',
  'dotted-arrow': '-->>',
  'dotted-line': '-->',
  'solid-cross': '-x',
  'dotted-cross': '--x',
  'solid-open': '-)',
  'dotted-open': '--)',
};

const INDENT = '    ';

function indentN(depth: number): string {
  return INDENT.repeat(depth);
}

function emitMessage(m: SequenceMessageItem, depth: number): string {
  const token = ARROW_TO_TOKEN[m.arrow];
  return `${indentN(depth)}${m.from}${token}${m.to}: ${m.label}`;
}

function emitNote(n: SequenceNote, depth: number): string {
  const placementText =
    n.placement === 'left-of'
      ? 'left of'
      : n.placement === 'right-of'
        ? 'right of'
        : 'over';
  const ids = n.participantIds.join(',');
  return `${indentN(depth)}Note ${placementText} ${ids}: ${n.label}`;
}

function emitBlock(
  block: SequenceBlock,
  depth: number,
  out: string[],
  activations: SequenceActivation[],
): void {
  // 開始ラベルは branches[0].label と一致する (parser 設計)
  const firstLabel = block.branches[0]?.label ?? block.label;
  out.push(`${indentN(depth)}${block.kind} ${firstLabel}`.trimEnd());
  block.branches.forEach((branch, idx) => {
    if (idx > 0) {
      const branchKW =
        block.kind === 'alt'
          ? 'else'
          : block.kind === 'par'
            ? 'and'
            : block.kind === 'critical'
              ? 'option'
              : 'else'; // fallback
      out.push(
        `${indentN(depth)}${branchKW}${
          branch.label ? ` ${branch.label}` : ''
        }`,
      );
    }
    for (const item of branch.items) {
      emitItem(item, depth + 1, out, activations);
    }
  });
  out.push(`${indentN(depth)}end`);
}

function emitItem(
  item: SequenceItem,
  depth: number,
  out: string[],
  activations: SequenceActivation[],
): void {
  if (item.type === 'message') {
    // activation open/close を message 前後に挿入
    const openHere = activations.filter(
      (a) => a.startMessageIndex >= 0 && messageIndexOf(item) === a.startMessageIndex,
    );
    for (const a of openHere) {
      out.push(`${indentN(depth)}activate ${a.participantId}`);
    }
    out.push(emitMessage(item, depth));
    const closeHere = activations.filter(
      (a) =>
        a.endMessageIndex !== undefined &&
        messageIndexOf(item) === a.endMessageIndex,
    );
    for (const a of closeHere) {
      out.push(`${indentN(depth)}deactivate ${a.participantId}`);
    }
  } else if (item.type === 'note') {
    out.push(emitNote(item, depth));
  } else {
    emitBlock(item, depth, out, activations);
  }
}

/** SequenceMessageItem.id (`m0`/`m1`/...) から index を抽出 */
function messageIndexOf(m: SequenceMessageItem): number {
  const n = parseInt(m.id.slice(1), 10);
  return Number.isNaN(n) ? -1 : n;
}

export function emitSequenceDiagram(sequence: SequenceDiagram): string {
  const lines: string[] = ['sequenceDiagram'];

  if (sequence.title !== undefined) {
    lines.push(`${INDENT}title ${sequence.title}`);
  }
  if (sequence.autonumber) {
    lines.push(`${INDENT}autonumber`);
  }

  for (const p of sequence.participants) {
    const aliasPart = p.label === p.id ? '' : ` as ${p.label}`;
    lines.push(`${INDENT}${p.kind} ${p.id}${aliasPart}`);
  }

  if (sequence.items === undefined) {
    // L1-only emit (M11.1 互換)
    for (const m of sequence.messages) {
      const token = ARROW_TO_TOKEN[m.arrow];
      lines.push(`${INDENT}${m.from}${token}${m.to}: ${m.label}`);
    }
  } else {
    // L2 emit: items 再帰
    const activations = sequence.activations ?? [];
    for (const item of sequence.items) {
      emitItem(item, 1, lines, activations);
    }
  }

  // M11.4 L3: extras (raw line) を末尾に出力。`; ` 区切りで 1 行化された block keyword は再展開。
  if (sequence.extras) {
    for (const ex of sequence.extras) {
      // `; ` 区切りで複数行化されたものは元の改行に戻す
      if (ex.raw.includes('; ')) {
        for (const part of ex.raw.split('; ')) {
          lines.push(`${INDENT}${part}`);
        }
      } else {
        lines.push(`${INDENT}${ex.raw}`);
      }
    }
  }

  return lines.join('\n');
}
