/**
 * Atom-GanttOps (M16.2)
 *
 * GanttDiagram への immutable CRUD 純関数群。
 * GanttCanvas の Edit 操作はすべて本 Atom の関数呼出に集約 (薄いシェル、Pattern 4)。
 * 関数名は Gantt prefix で統一 (命名規約、barrel `export *` の衝突回避)。
 * date 解決はしない (canvas 側 gantt-schedule.ts)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-GanttOps.md
 */

import type {
  GanttDiagram,
  GanttSection,
  GanttTask,
  GanttTaskTag,
} from '../types/gantt-schema.js';

// ── id 採番 (diagram 全体で一意、parser と整合) ──
function nextSectionId(d: GanttDiagram): string {
  let max = -1;
  for (const s of d.sections) {
    const m = s.id.match(/^s(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

function nextTaskId(d: GanttDiagram): string {
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
export function setGanttTitle(diagram: GanttDiagram, title: string): GanttDiagram {
  const next: GanttDiagram = { ...diagram };
  if (title === '') delete next.title;
  else next.title = title;
  return next;
}

export function setGanttDateFormat(
  diagram: GanttDiagram,
  fmt: string,
): GanttDiagram {
  const next: GanttDiagram = { ...diagram };
  if (fmt === '') delete next.dateFormat;
  else next.dateFormat = fmt;
  return next;
}

// ── section CRUD ────────────────────────────────────
export function addGanttSection(
  diagram: GanttDiagram,
  init: { name: string },
): { diagram: GanttDiagram; section: GanttSection } {
  const section: GanttSection = {
    id: nextSectionId(diagram),
    name: init.name,
    tasks: [],
  };
  return {
    diagram: { ...diagram, sections: [...diagram.sections, section] },
    section,
  };
}

export function removeGanttSection(
  diagram: GanttDiagram,
  sectionId: string,
): GanttDiagram {
  return {
    ...diagram,
    sections: diagram.sections.filter((s) => s.id !== sectionId),
  };
}

export function renameGanttSection(
  diagram: GanttDiagram,
  sectionId: string,
  name: string,
): GanttDiagram {
  return {
    ...diagram,
    sections: diagram.sections.map((s) =>
      s.id === sectionId ? { ...s, name } : s,
    ),
  };
}

// ── task CRUD ───────────────────────────────────────
function updateSectionTasks(
  diagram: GanttDiagram,
  sectionId: string,
  fn: (tasks: GanttTask[]) => GanttTask[],
): GanttDiagram {
  return {
    ...diagram,
    sections: diagram.sections.map((s) =>
      s.id === sectionId ? { ...s, tasks: fn([...s.tasks]) } : s,
    ),
  };
}

function findTaskSection(diagram: GanttDiagram, taskId: string): string | null {
  for (const s of diagram.sections) {
    if (s.tasks.some((t) => t.id === taskId)) return s.id;
  }
  return null;
}

export function addGanttTask(
  diagram: GanttDiagram,
  sectionId: string,
  init: {
    name: string;
    tags?: GanttTaskTag[];
    taskId?: string;
    startDate?: string;
    after?: string[];
    duration?: string;
    endDate?: string;
    until?: string;
  },
): { diagram: GanttDiagram; task: GanttTask } {
  const task: GanttTask = {
    id: nextTaskId(diagram),
    name: init.name,
    tags: init.tags ? [...init.tags] : [],
    ...(init.taskId ? { taskId: init.taskId } : {}),
    ...(init.startDate ? { startDate: init.startDate } : {}),
    ...(init.after && init.after.length > 0 ? { after: [...init.after] } : {}),
    ...(init.duration ? { duration: init.duration } : {}),
    ...(init.endDate ? { endDate: init.endDate } : {}),
    ...(init.until ? { until: init.until } : {}),
  };
  const next = updateSectionTasks(diagram, sectionId, (ts) => [...ts, task]);
  return { diagram: next, task };
}

export function removeGanttTask(
  diagram: GanttDiagram,
  taskId: string,
): GanttDiagram {
  return {
    ...diagram,
    sections: diagram.sections.map((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== taskId),
    })),
  };
}

function applyTaskPatch(
  t: GanttTask,
  patch: Partial<
    Pick<
      GanttTask,
      | 'name'
      | 'tags'
      | 'taskId'
      | 'startDate'
      | 'after'
      | 'duration'
      | 'endDate'
      | 'until'
    >
  >,
): GanttTask {
  const next: GanttTask = { ...t };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.tags !== undefined) next.tags = [...patch.tags];
  if (patch.taskId !== undefined) {
    if (patch.taskId === '') delete next.taskId;
    else next.taskId = patch.taskId;
  }
  // start 系 (startDate / after) は排他
  if (patch.startDate !== undefined) {
    if (patch.startDate === '') {
      delete next.startDate;
    } else {
      next.startDate = patch.startDate;
      delete next.after;
    }
  }
  if (patch.after !== undefined) {
    if (patch.after.length === 0) {
      delete next.after;
    } else {
      next.after = [...patch.after];
      delete next.startDate;
    }
  }
  // end 系 (duration / endDate / until) は排他
  if (patch.duration !== undefined) {
    if (patch.duration === '') {
      delete next.duration;
    } else {
      next.duration = patch.duration;
      delete next.endDate;
      delete next.until;
    }
  }
  if (patch.endDate !== undefined) {
    if (patch.endDate === '') {
      delete next.endDate;
    } else {
      next.endDate = patch.endDate;
      delete next.duration;
      delete next.until;
    }
  }
  if (patch.until !== undefined) {
    if (patch.until === '') {
      delete next.until;
    } else {
      next.until = patch.until;
      delete next.duration;
      delete next.endDate;
    }
  }
  return next;
}

export function updateGanttTask(
  diagram: GanttDiagram,
  taskId: string,
  patch: Partial<
    Pick<
      GanttTask,
      | 'name'
      | 'tags'
      | 'taskId'
      | 'startDate'
      | 'after'
      | 'duration'
      | 'endDate'
      | 'until'
    >
  >,
): GanttDiagram {
  return {
    ...diagram,
    sections: diagram.sections.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === taskId ? applyTaskPatch(t, patch) : t)),
    })),
  };
}

export function moveGanttTask(
  diagram: GanttDiagram,
  taskId: string,
  direction: 'up' | 'down',
): GanttDiagram {
  const sid = findTaskSection(diagram, taskId);
  if (sid == null) return { ...diagram };
  return updateSectionTasks(diagram, sid, (ts) => {
    const idx = ts.findIndex((t) => t.id === taskId);
    if (idx === -1) return ts;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ts.length) return ts;
    [ts[idx], ts[target]] = [ts[target], ts[idx]];
    return ts;
  });
}
