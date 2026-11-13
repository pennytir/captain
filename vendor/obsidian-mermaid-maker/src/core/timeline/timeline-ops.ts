/**
 * Atom-TimelineOps (M17)
 *
 * TimelineDiagram への immutable CRUD 純関数群。gantt-ops をミラー。
 * TimelineCanvas の Edit / 意味ドラッグはすべて本 Atom の関数呼出に集約 (薄いシェル)。
 * 関数名は Timeline prefix で統一 (barrel `export *` 衝突回避、Playbook 罠 2)。
 *
 * 設計: ../../../50_Mission/zddmission/MermaidMaker/Atom-TimelineOps.md
 */

import type {
  TimelineDiagram,
  TimelinePeriod,
  TimelineSection,
} from '../types/timeline-schema.js';

// ── id 採番 (diagram 全体で一意、parser と整合) ──
function nextSectionId(d: TimelineDiagram): string {
  let max = -1;
  for (const s of d.sections) {
    const m = s.id.match(/^s(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

function nextPeriodId(d: TimelineDiagram): string {
  let max = -1;
  for (const s of d.sections) {
    for (const p of s.periods) {
      const m = p.id.match(/^p(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `p${max + 1}`;
}

// ── diagram メタ ────────────────────────────────────
export function setTimelineTitle(
  d: TimelineDiagram,
  title: string,
): TimelineDiagram {
  const next: TimelineDiagram = { ...d };
  if (title === '') delete next.title;
  else next.title = title;
  return next;
}

// ── section CRUD ────────────────────────────────────
export function addTimelineSection(
  d: TimelineDiagram,
  init: { name: string },
): { diagram: TimelineDiagram; section: TimelineSection } {
  const section: TimelineSection = {
    id: nextSectionId(d),
    name: init.name,
    periods: [],
  };
  return {
    diagram: { ...d, sections: [...d.sections, section] },
    section,
  };
}

export function removeTimelineSection(
  d: TimelineDiagram,
  sectionId: string,
): TimelineDiagram {
  return { ...d, sections: d.sections.filter((s) => s.id !== sectionId) };
}

export function renameTimelineSection(
  d: TimelineDiagram,
  sectionId: string,
  name: string,
): TimelineDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)),
  };
}

// ── period CRUD ─────────────────────────────────────
function updateSectionPeriods(
  d: TimelineDiagram,
  sectionId: string,
  fn: (periods: TimelinePeriod[]) => TimelinePeriod[],
): TimelineDiagram {
  return {
    ...d,
    sections: d.sections.map((s) =>
      s.id === sectionId ? { ...s, periods: fn([...s.periods]) } : s,
    ),
  };
}

function findPeriodSection(d: TimelineDiagram, periodId: string): string | null {
  for (const s of d.sections) {
    if (s.periods.some((p) => p.id === periodId)) return s.id;
  }
  return null;
}

export function addTimelinePeriod(
  d: TimelineDiagram,
  sectionId: string,
  init: { label: string; events?: string[] },
): { diagram: TimelineDiagram; period: TimelinePeriod } {
  const period: TimelinePeriod = {
    id: nextPeriodId(d),
    label: init.label,
    events: init.events ? [...init.events] : [],
  };
  const next = updateSectionPeriods(d, sectionId, (ps) => [...ps, period]);
  return { diagram: next, period };
}

export function removeTimelinePeriod(
  d: TimelineDiagram,
  periodId: string,
): TimelineDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      periods: s.periods.filter((p) => p.id !== periodId),
    })),
  };
}

export function updateTimelinePeriod(
  d: TimelineDiagram,
  periodId: string,
  patch: { label?: string; events?: string[] },
): TimelineDiagram {
  return {
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      periods: s.periods.map((p) =>
        p.id === periodId
          ? {
              ...p,
              ...(patch.label !== undefined ? { label: patch.label } : {}),
              ...(patch.events !== undefined ? { events: [...patch.events] } : {}),
            }
          : p,
      ),
    })),
  };
}

/**
 * 意味ドラッグ用: period を section 内で左右に 1 つ並べ替える。
 * 端を越える方向は no-op (新配列を返す = immutable 一貫)。
 */
export function reorderTimelinePeriod(
  d: TimelineDiagram,
  periodId: string,
  direction: 'left' | 'right',
): TimelineDiagram {
  const sid = findPeriodSection(d, periodId);
  if (sid == null) return { ...d };
  return updateSectionPeriods(d, sid, (ps) => {
    const idx = ps.findIndex((p) => p.id === periodId);
    if (idx === -1) return ps;
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ps.length) return ps;
    [ps[idx], ps[target]] = [ps[target], ps[idx]];
    return ps;
  });
}
