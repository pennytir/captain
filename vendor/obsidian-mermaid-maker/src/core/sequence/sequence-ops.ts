/**
 * Atom-SequenceOps (M11.2 L1 / M11.3b L2 拡張)
 *
 * SequenceDiagram への immutable CRUD 純関数群。
 * [[Atom-SequenceCanvas]] の Edit 操作はすべて本 Atom の関数呼出に集約される
 * (薄いシェル原則、GraphOps と同設計)。
 *
 * - L1 (M11.2): participant / message / metadata の flat CRUD
 * - L2 (M11.3b): Note / Block / Block branch / Activation toggle / moveItem + items 木対応
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-SequenceOps.md
 */

import type {
  SequenceActivation,
  SequenceBlock,
  SequenceBlockBranch,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceItem,
  SequenceMessage,
  SequenceMessageArrow,
  SequenceMessageItem,
  SequenceNote,
  SequenceNotePlacement,
  SequenceParticipant,
  SequenceParticipantKind,
} from '../types/sequence-schema.js';

// ── id 採番 helper ────────────────────────────────────
function nextMessageId(messages: ReadonlyArray<SequenceMessage>): string {
  let maxN = -1;
  for (const m of messages) {
    const match = m.id.match(/^m(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxN) maxN = n;
    }
  }
  return `m${maxN + 1}`;
}

function collectIdsByPrefix(seq: SequenceDiagram, prefix: string): number[] {
  const ids: number[] = [];
  const re = new RegExp(`^${prefix}(\\d+)$`);
  function walk(items: ReadonlyArray<SequenceItem>): void {
    for (const it of items) {
      const match = it.id.match(re);
      if (match) ids.push(Number(match[1]));
      if (it.type === 'block') {
        for (const br of it.branches) walk(br.items);
      }
    }
  }
  walk(seq.items ?? []);
  if (prefix === 'a') {
    for (const a of seq.activations ?? []) {
      const m = a.id.match(re);
      if (m) ids.push(Number(m[1]));
    }
  }
  return ids;
}

function nextItemId(seq: SequenceDiagram, prefix: 'n' | 'b' | 'a'): string {
  const ids = collectIdsByPrefix(seq, prefix);
  const max = ids.length > 0 ? Math.max(...ids) : -1;
  return `${prefix}${max + 1}`;
}

// ── items 木 traversal helpers ────────────────────────

function mapItems(
  items: ReadonlyArray<SequenceItem>,
  fn: (item: SequenceItem) => SequenceItem | null,
): SequenceItem[] {
  const out: SequenceItem[] = [];
  for (const it of items) {
    if (it.type === 'block') {
      const mapped: SequenceBlock = {
        ...it,
        branches: it.branches.map((br) => ({
          ...br,
          items: mapItems(br.items, fn),
        })),
      };
      const result = fn(mapped);
      if (result !== null) out.push(result);
    } else {
      const result = fn(it);
      if (result !== null) out.push(result);
    }
  }
  return out;
}

function findItem(
  items: ReadonlyArray<SequenceItem>,
  id: string,
): SequenceItem | null {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.type === 'block') {
      for (const br of it.branches) {
        const found = findItem(br.items, id);
        if (found) return found;
      }
    }
  }
  return null;
}

/** items 木をフラットに走査して message item を出現順に集める */
function collectFlatMessages(items: ReadonlyArray<SequenceItem>): SequenceMessage[] {
  const out: SequenceMessage[] = [];
  function walk(its: ReadonlyArray<SequenceItem>): void {
    for (const it of its) {
      if (it.type === 'message') {
        // type discriminator を除外して plain SequenceMessage を出す
        const { id, from, to, label, arrow } = it;
        out.push({ id, from, to, label, arrow });
      } else if (it.type === 'block') {
        for (const br of it.branches) walk(br.items);
      }
    }
  }
  walk(items);
  return out;
}

/** items 木から messages を再生成。items が undefined なら seq.messages のコピー */
export function flattenMessages(seq: SequenceDiagram): SequenceMessage[] {
  if (seq.items === undefined) return [...seq.messages];
  return collectFlatMessages(seq.items);
}

/** parentPath で指定された branch 内に item を append した新 items 木を返す */
function appendToPath(
  items: ReadonlyArray<SequenceItem>,
  parentPath: ReadonlyArray<number>,
  newItem: SequenceItem,
): SequenceItem[] {
  if (parentPath.length === 0) {
    return [...items, newItem];
  }
  const [blockIdx, branchIdx, ...rest] = parentPath;
  return items.map((it, i) => {
    if (i !== blockIdx || it.type !== 'block') return it;
    return {
      ...it,
      branches: it.branches.map((br, bi) => {
        if (bi !== branchIdx) return br;
        return {
          ...br,
          items: appendToPath(br.items, rest, newItem),
        };
      }),
    };
  });
}

/** 全 message id → index map (flatten 後の messages 配列内 index) */
function buildMessageIndexMap(
  messages: ReadonlyArray<SequenceMessage>,
): Map<string, number> {
  const m = new Map<string, number>();
  messages.forEach((msg, i) => m.set(msg.id, i));
  return m;
}

/**
 * activations を新 messages 配列に対して再計算。
 * 削除された message を参照する activation は除外。
 * 残った activation は startMessageIndex / endMessageIndex を新 index に更新。
 */
function rebuildActivations(
  oldActivations: ReadonlyArray<SequenceActivation>,
  oldMessages: ReadonlyArray<SequenceMessage>,
  newMessages: ReadonlyArray<SequenceMessage>,
): SequenceActivation[] | undefined {
  if (oldActivations.length === 0) return undefined;
  const newIdx = buildMessageIndexMap(newMessages);
  const out: SequenceActivation[] = [];
  for (const a of oldActivations) {
    const startMsg = oldMessages[a.startMessageIndex];
    if (!startMsg) continue;
    const newStart = newIdx.get(startMsg.id);
    if (newStart === undefined) continue;
    let newEnd: number | undefined;
    if (a.endMessageIndex !== undefined) {
      const endMsg = oldMessages[a.endMessageIndex];
      if (endMsg) {
        const ne = newIdx.get(endMsg.id);
        if (ne === undefined) {
          // end msg removed → 図末尾まで open
          newEnd = undefined;
        } else {
          newEnd = ne;
        }
      }
    }
    out.push({
      ...a,
      startMessageIndex: newStart,
      ...(newEnd !== undefined ? { endMessageIndex: newEnd } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * items / messages / activations をひとまとめに更新する helper。
 * items が undefined のときは messages を直接更新、activations は変更しない。
 */
function withItems(
  seq: SequenceDiagram,
  newItems: SequenceItem[] | undefined,
): SequenceDiagram {
  if (newItems === undefined) return { ...seq };
  const newMessages = collectFlatMessages(newItems);
  const newActivations = rebuildActivations(
    seq.activations ?? [],
    seq.messages,
    newMessages,
  );
  const out: SequenceDiagram = {
    ...seq,
    items: newItems,
    messages: newMessages,
  };
  if (newActivations !== undefined) {
    out.activations = newActivations;
  } else {
    delete out.activations;
  }
  return out;
}

// ── participant CRUD ──────────────────────────────────
export function addParticipant(
  seq: SequenceDiagram,
  init: { id: string; label?: string; kind?: SequenceParticipantKind },
): SequenceDiagram {
  if (seq.participants.some((p) => p.id === init.id)) {
    return { ...seq, participants: [...seq.participants] };
  }
  const p: SequenceParticipant = {
    id: init.id,
    label: init.label ?? init.id,
    kind: init.kind ?? 'participant',
  };
  return { ...seq, participants: [...seq.participants, p] };
}

export function removeParticipant(seq: SequenceDiagram, id: string): SequenceDiagram {
  const baseParticipants = seq.participants.filter((p) => p.id !== id);
  if (seq.items === undefined) {
    return {
      ...seq,
      participants: baseParticipants,
      messages: seq.messages.filter((m) => m.from !== id && m.to !== id),
    };
  }
  // L2: items 木からも該当 message / note を再帰削除
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'message' && (it.from === id || it.to === id)) return null;
    if (it.type === 'note' && it.participantIds.includes(id)) {
      const remaining = it.participantIds.filter((p) => p !== id);
      if (remaining.length === 0) return null;
      return { ...it, participantIds: remaining };
    }
    return it;
  });
  return withItems({ ...seq, participants: baseParticipants }, newItems);
}

export function renameParticipant(
  seq: SequenceDiagram,
  id: string,
  patch: { label?: string; newId?: string },
): SequenceDiagram {
  const newId = patch.newId ?? id;
  const newParticipants = seq.participants.map((p) =>
    p.id === id
      ? {
          ...p,
          ...(patch.newId ? { id: newId } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
        }
      : p,
  );
  if (!patch.newId) {
    return { ...seq, participants: newParticipants };
  }
  // newId 適用: messages / items 内の参照も書き換え
  const mappedMessages = seq.messages.map((m) => ({
    ...m,
    from: m.from === id ? newId : m.from,
    to: m.to === id ? newId : m.to,
  }));
  if (seq.items === undefined) {
    return { ...seq, participants: newParticipants, messages: mappedMessages };
  }
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'message') {
      return {
        ...it,
        from: it.from === id ? newId : it.from,
        to: it.to === id ? newId : it.to,
      };
    }
    if (it.type === 'note') {
      return {
        ...it,
        participantIds: it.participantIds.map((p) => (p === id ? newId : p)),
      };
    }
    return it;
  });
  return withItems({ ...seq, participants: newParticipants }, newItems);
}

export function setParticipantKind(
  seq: SequenceDiagram,
  id: string,
  kind: SequenceParticipantKind,
): SequenceDiagram {
  return {
    ...seq,
    participants: seq.participants.map((p) => (p.id === id ? { ...p, kind } : p)),
  };
}

/**
 * participant を左右に 1 つ並べ替える (意味ドラッグ用)。
 * participants は L1/L2 共通で top-level 配列なので items 分岐は不要。
 * 端を越える方向は no-op (新配列を返す = immutable 一貫)。
 */
export function reorderParticipant(
  seq: SequenceDiagram,
  id: string,
  direction: 'left' | 'right',
): SequenceDiagram {
  const idx = seq.participants.findIndex((p) => p.id === id);
  if (idx === -1) return { ...seq, participants: [...seq.participants] };
  const target = direction === 'left' ? idx - 1 : idx + 1;
  if (target < 0 || target >= seq.participants.length) {
    return { ...seq, participants: [...seq.participants] };
  }
  const next = [...seq.participants];
  [next[idx], next[target]] = [next[target], next[idx]];
  return { ...seq, participants: next };
}

// ── message CRUD ─────────────────────────────────────
export function addMessage(
  seq: SequenceDiagram,
  init: Omit<SequenceMessage, 'id'>,
): { sequence: SequenceDiagram; message: SequenceMessage } {
  const message: SequenceMessage = { id: nextMessageId(seq.messages), ...init };
  if (seq.items === undefined) {
    return {
      sequence: { ...seq, messages: [...seq.messages, message] },
      message,
    };
  }
  // L2: top-level items 末尾に message item を追加
  const messageItem: SequenceMessageItem = { ...message, type: 'message' };
  const newItems = [...(seq.items ?? []), messageItem];
  return { sequence: withItems(seq, newItems), message };
}

export function removeMessage(
  seq: SequenceDiagram,
  messageId: string,
): SequenceDiagram {
  if (seq.items === undefined) {
    return { ...seq, messages: seq.messages.filter((m) => m.id !== messageId) };
  }
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'message' && it.id === messageId) return null;
    return it;
  });
  return withItems(seq, newItems);
}

export function updateMessage(
  seq: SequenceDiagram,
  messageId: string,
  patch: Partial<Omit<SequenceMessage, 'id'>>,
): SequenceDiagram {
  if (seq.items === undefined) {
    return {
      ...seq,
      messages: seq.messages.map((m) =>
        m.id === messageId ? { ...m, ...patch } : m,
      ),
    };
  }
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'message' && it.id === messageId) {
      return { ...it, ...patch };
    }
    return it;
  });
  return withItems(seq, newItems);
}

export function reorderMessage(
  seq: SequenceDiagram,
  messageId: string,
  direction: 'up' | 'down',
): SequenceDiagram {
  if (seq.items === undefined) {
    const idx = seq.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return { ...seq, messages: [...seq.messages] };
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= seq.messages.length) {
      return { ...seq, messages: [...seq.messages] };
    }
    const next = [...seq.messages];
    [next[idx], next[target]] = [next[target], next[idx]];
    return { ...seq, messages: next };
  }
  return moveItem(seq, messageId, direction);
}

// ── metadata ─────────────────────────────────────────
export function setTitle(
  seq: SequenceDiagram,
  title: string | undefined,
): SequenceDiagram {
  const next = { ...seq } as SequenceDiagram;
  if (title === undefined) delete next.title;
  else next.title = title;
  return next;
}

export function setAutonumber(
  seq: SequenceDiagram,
  value: boolean,
): SequenceDiagram {
  const next = { ...seq } as SequenceDiagram;
  if (value) next.autonumber = true;
  else delete next.autonumber;
  return next;
}

// ============================================================
// M11.3b L2 ops
// ============================================================

export type ItemPath = ReadonlyArray<number>;

function ensureItems(seq: SequenceDiagram): SequenceItem[] {
  return seq.items === undefined
    ? // L1 → L2 昇格: 既存 messages を items に積む
      seq.messages.map<SequenceMessageItem>((m) => ({ ...m, type: 'message' }))
    : [...seq.items];
}

export function addNote(
  seq: SequenceDiagram,
  init: {
    placement: SequenceNotePlacement;
    participantIds: string[];
    label: string;
  },
  parentPath: ItemPath = [],
): { sequence: SequenceDiagram; note: SequenceNote } {
  const note: SequenceNote = {
    type: 'note',
    id: nextItemId(seq, 'n'),
    placement: init.placement,
    participantIds: [...init.participantIds],
    label: init.label,
  };
  const baseItems = ensureItems(seq);
  const newItems = appendToPath(baseItems, parentPath, note);
  return { sequence: withItems(seq, newItems), note };
}

export function removeNote(seq: SequenceDiagram, noteId: string): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'note' && it.id === noteId) return null;
    return it;
  });
  return withItems(seq, newItems);
}

export function updateNote(
  seq: SequenceDiagram,
  noteId: string,
  patch: Partial<Pick<SequenceNote, 'placement' | 'participantIds' | 'label'>>,
): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'note' && it.id === noteId) {
      return { ...it, ...patch };
    }
    return it;
  });
  return withItems(seq, newItems);
}

const SINGLE_BRANCH_KINDS = new Set<SequenceBlockKind>(['loop', 'opt', 'break']);

export function addBlock(
  seq: SequenceDiagram,
  init: { kind: SequenceBlockKind; label: string },
  parentPath: ItemPath = [],
): { sequence: SequenceDiagram; block: SequenceBlock } {
  const block: SequenceBlock = {
    type: 'block',
    id: nextItemId(seq, 'b'),
    kind: init.kind,
    label: init.label,
    branches: [{ label: init.label, items: [] }],
  };
  const baseItems = ensureItems(seq);
  const newItems = appendToPath(baseItems, parentPath, block);
  return { sequence: withItems(seq, newItems), block };
}

export function removeBlock(seq: SequenceDiagram, blockId: string): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'block' && it.id === blockId) return null;
    return it;
  });
  return withItems(seq, newItems);
}

export function updateBlock(
  seq: SequenceDiagram,
  blockId: string,
  patch: Partial<Pick<SequenceBlock, 'kind' | 'label'>>,
): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'block' && it.id === blockId) {
      const newKind = patch.kind ?? it.kind;
      const newLabel = patch.label ?? it.label;
      let newBranches = it.branches;
      // 単一 branch kind に変換時は branches を 1 つに統合
      if (SINGLE_BRANCH_KINDS.has(newKind) && it.branches.length > 1) {
        const merged: SequenceBlockBranch = {
          label: newLabel,
          items: it.branches.flatMap((b) => b.items),
        };
        newBranches = [merged];
      } else if (patch.label !== undefined && it.branches.length > 0) {
        newBranches = it.branches.map((b, i) =>
          i === 0 ? { ...b, label: newLabel } : b,
        );
      }
      return { ...it, kind: newKind, label: newLabel, branches: newBranches };
    }
    return it;
  });
  return withItems(seq, newItems);
}

export function addBlockBranch(
  seq: SequenceDiagram,
  blockId: string,
  branchLabel: string,
): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'block' && it.id === blockId) {
      if (SINGLE_BRANCH_KINDS.has(it.kind)) return it; // no-op
      return {
        ...it,
        branches: [...it.branches, { label: branchLabel, items: [] }],
      };
    }
    return it;
  });
  return withItems(seq, newItems);
}

export function removeBlockBranch(
  seq: SequenceDiagram,
  blockId: string,
  branchIndex: number,
): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };
  const newItems = mapItems(seq.items, (it) => {
    if (it.type === 'block' && it.id === blockId) {
      if (it.branches.length <= 1) return it; // 最後の branch は削除不可
      if (branchIndex < 0 || branchIndex >= it.branches.length) return it;
      const newBranches = it.branches.filter((_, i) => i !== branchIndex);
      return { ...it, branches: newBranches };
    }
    return it;
  });
  return withItems(seq, newItems);
}

export function toggleMessageActivation(
  seq: SequenceDiagram,
  messageId: string,
  kind: 'activate' | 'deactivate',
): SequenceDiagram {
  const msgIdx = seq.messages.findIndex((m) => m.id === messageId);
  if (msgIdx === -1) return { ...seq };
  const msg = seq.messages[msgIdx];
  const targetParticipant = kind === 'activate' ? msg.to : msg.from;
  const oldActs = seq.activations ?? [];

  if (kind === 'activate') {
    // 既存 activation で startMessageIndex === msgIdx && participantId === targetParticipant がある → remove (toggle off)
    const existsIdx = oldActs.findIndex(
      (a) =>
        a.startMessageIndex === msgIdx && a.participantId === targetParticipant,
    );
    if (existsIdx !== -1) {
      const next = oldActs.filter((_, i) => i !== existsIdx);
      return finalizeActivations(seq, next);
    }
    // 追加
    const newAct: SequenceActivation = {
      id: nextItemId(seq, 'a'),
      participantId: targetParticipant,
      startMessageIndex: msgIdx,
    };
    return finalizeActivations(seq, [...oldActs, newAct]);
  }
  // deactivate: 該当 participant の open activation (endMessageIndex undefined) の endMessageIndex を埋める or 既存の endMessageIndex === msgIdx を解除
  const existsIdx = oldActs.findIndex(
    (a) => a.endMessageIndex === msgIdx && a.participantId === targetParticipant,
  );
  if (existsIdx !== -1) {
    // toggle off: endMessageIndex を外す
    const next = oldActs.map((a, i) =>
      i === existsIdx ? { ...a, endMessageIndex: undefined } : a,
    );
    return finalizeActivations(seq, next);
  }
  // 直近の open activation を閉じる
  const openIdx = oldActs.findIndex(
    (a) =>
      a.participantId === targetParticipant &&
      a.endMessageIndex === undefined &&
      a.startMessageIndex <= msgIdx,
  );
  if (openIdx === -1) return { ...seq, activations: [...oldActs] };
  const next = oldActs.map((a, i) =>
    i === openIdx ? { ...a, endMessageIndex: msgIdx } : a,
  );
  return finalizeActivations(seq, next);
}

function finalizeActivations(
  seq: SequenceDiagram,
  acts: SequenceActivation[],
): SequenceDiagram {
  const cleaned = acts
    .map((a) => {
      if (a.endMessageIndex === undefined) {
        const { endMessageIndex: _, ...rest } = a;
        return rest as SequenceActivation;
      }
      return a;
    })
    .filter(Boolean);
  const out: SequenceDiagram = { ...seq };
  if (cleaned.length > 0) out.activations = cleaned;
  else delete out.activations;
  // L2 modes: items が定義済なら維持
  if (seq.items !== undefined) out.items = seq.items;
  return out;
}

export function moveItem(
  seq: SequenceDiagram,
  itemId: string,
  direction: 'up' | 'down',
): SequenceDiagram {
  if (seq.items === undefined) return { ...seq };

  function moveInList(list: SequenceItem[]): SequenceItem[] | null {
    const idx = list.findIndex((it) => it.id === itemId);
    if (idx === -1) return null;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return [...list]; // 端で no-op
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  }

  function recur(list: ReadonlyArray<SequenceItem>): SequenceItem[] {
    const movedHere = moveInList([...list]);
    if (movedHere !== null) return movedHere;
    // ここに無ければ block 内を再帰
    return list.map((it) => {
      if (it.type !== 'block') return it;
      return {
        ...it,
        branches: it.branches.map((br) => ({
          ...br,
          items: recur(br.items),
        })),
      };
    });
  }

  const newItems = recur(seq.items);
  return withItems(seq, newItems);
}

// Re-export types
export type { SequenceMessageArrow };
