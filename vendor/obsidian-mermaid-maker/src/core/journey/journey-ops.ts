/**
 * Atom-JourneyOps (M18)
 *
 * JourneyDiagram への immutable CRUD 純関数群。timeline-ops をミラー。
 * JourneyCanvas の Edit / 意味ドラッグはすべて本 Atom の関数呼出に集約 (薄いシェル)。
 * 関数名は Journey prefix で統一 (Playbook 罠 2)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-JourneyOps.md
 */

import type {
  JourneyDiagram,
  JourneySection,
  JourneyTask,
} from '../types/journey-schema.js';

function nextSectionId(d: JourneyDiagram): string {
  let max = -1;
  for (const s of d.sections) {
    const m = s.id.match(/^s(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

function nextTaskId(d: JourneyDiagram): string {
  let max = -1;
  for (const s of d.sections) {
    for (const t of s.tasks) {
      const m = t.id.match(/^t(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `t${max + 1}`;
}

// ── diagram メタ ────────────────────────────────────
export function setJourneyTitle(
  d: JourneyDiagram,
  title: string,
): JourneyDiagram {
  const next: JourneyDiagram = { ...d };
  if (title === '') delete next.title;
  else next.title = title;
  return next;
}

// ── section CRUD ────────────────────────────────────
export function addJourneySection(
  d: JourneyDiagram,
  init: { name: string },
): { diagram: JourneyDiagram; section: JourneySection } {
  const section: JourneySection = {
    id: nextSectionId(d),
    name: init.name,
    tasks: [],
  };
  return { diagram: { ...d, sections: [...d.sections, section] }, section };
}

export function removeJourneySection(
  d: JourneyDiagram,
  sectionId: string,
): JourneyDiagram {
  return { ...d, sections: d.sections.filter((s) => s.id !== sectionId) };
}

export function renameJourneySection(
  d: JourneyDiagram,
  sectionId: string,
  name: string,
): JourneyDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)),
  };
}

// ── task CRUD ───────────────────────────────────────
function updateSectionTasks(
  d: JourneyDiagram,
  sectionId: string,
  fn: (tasks: JourneyTask[]) => JourneyTask[],
): JourneyDiagram {
  return {
    ...d,
    sections: d.sections.map((s) =>
      s.id === sectionId ? { ...s, tasks: fn([...s.tasks]) } : s,
    ),
  };
}

function findTaskSection(d: JourneyDiagram, taskId: string): string | null {
  for (const s of d.sections) {
    if (s.tasks.some((t) => t.id === taskId)) return s.id;
  }
  return null;
}

export function addJourneyTask(
  d: JourneyDiagram,
  sectionId: string,
  init: { name: string; score?: number; actors?: string[] },
): { diagram: JourneyDiagram; task: JourneyTask } {
  const task: JourneyTask = {
    id: nextTaskId(d),
    name: init.name,
    score: init.score ?? 0,
    actors: init.actors ? [...init.actors] : [],
  };
  const next = updateSectionTasks(d, sectionId, (ts) => [...ts, task]);
  return { diagram: next, task };
}

export function removeJourneyTask(
  d: JourneyDiagram,
  taskId: string,
): JourneyDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== taskId),
    })),
  };
}

export function updateJourneyTask(
  d: JourneyDiagram,
  taskId: string,
  patch: { name?: string; score?: number; actors?: string[] },
): JourneyDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.score !== undefined ? { score: patch.score } : {}),
              ...(patch.actors !== undefined ? { actors: [...patch.actors] } : {}),
            }
          : t,
      ),
    })),
  };
}

/**
 * 意味ドラッグ用: task を section 内で左右に 1 つ並べ替える。
 * 端を越える方向は no-op (新配列を返す = immutable 一貫)。
 */
export function reorderJourneyTask(
  d: JourneyDiagram,
  taskId: string,
  direction: 'left' | 'right',
): JourneyDiagram {
  const sid = findTaskSection(d, taskId);
  if (sid == null) return { ...d };
  return updateSectionTasks(d, sid, (ts) => {
    const idx = ts.findIndex((t) => t.id === taskId);
    if (idx === -1) return ts;
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ts.length) return ts;
    [ts[idx], ts[target]] = [ts[target], ts[idx]];
    return ts;
  });
}
