import type { Bell, Day, Lesson, Settings, Shift } from "./types";

export function toMin(hhmm: string): number {
  const [h, m] = (hhmm || "0:0").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function toStr(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface TimelinePeriod {
  shift: Shift;
  period: number;
  start: number;
  end: number;
  /** сквозной номер: 1 смена, затем 2 смена */
  globalIndex: number;
}

export function bellsForShift(bells: Bell[], shift: Shift): Bell[] {
  return bells
    .filter((b) => b.shift === shift)
    .slice()
    .sort((a, b) => a.period - b.period || toMin(a.start) - toMin(b.start));
}

/** Полная временная шкала школы: сначала уроки 1 смены, затем 2 смены. */
export function buildTimeline(bells: Bell[]): TimelinePeriod[] {
  const out: TimelinePeriod[] = [];
  let idx = 1;
  for (const shift of [1, 2] as Shift[]) {
    for (const b of bellsForShift(bells, shift)) {
      out.push({
        shift,
        period: b.period,
        start: toMin(b.start),
        end: toMin(b.end),
        globalIndex: idx++,
      });
    }
  }
  return out;
}

export function periodOf(
  timeline: TimelinePeriod[],
  shift: Shift,
  period: number,
): TimelinePeriod | undefined {
  return timeline.find((t) => t.shift === shift && t.period === period);
}

export type ShiftFilter = "all" | Shift;

/**
 * Нумерация уроков сквозная:
 *  - «только 1 смена» → 1..N
 *  - «только 2 смена» → 1..M
 *  - «обе смены» → 1 смена 1..N, 2 смена продолжается N+1..
 */
export function displayNumbers(
  timeline: TimelinePeriod[],
  filter: ShiftFilter,
): Map<string, number> {
  const map = new Map<string, number>();
  if (filter === "all") {
    for (const t of timeline) map.set(key(t.shift, t.period), t.globalIndex);
    return map;
  }
  const list = timeline.filter((t) => t.shift === filter);
  list.forEach((t, i) => map.set(key(t.shift, t.period), i + 1));
  return map;
}

export function key(shift: Shift, period: number): string {
  return `${shift}:${period}`;
}

export function generateBells(opts: {
  shift: Shift;
  count: number;
  start: string;
  lessonMinutes: number;
  breakMinutes: number;
  bigBreakAfter: number;
  bigBreakMinutes: number;
}): Bell[] {
  const out: Bell[] = [];
  let cursor = toMin(opts.start);
  for (let i = 1; i <= opts.count; i++) {
    const end = cursor + opts.lessonMinutes;
    out.push({
      id: `bell-${opts.shift}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      shift: opts.shift,
      period: i,
      start: toStr(cursor),
      end: toStr(end),
    });
    cursor = end;
    if (i < opts.count) {
      cursor +=
        opts.bigBreakAfter > 0 && i === opts.bigBreakAfter
          ? opts.bigBreakMinutes
          : opts.breakMinutes;
    }
  }
  return out;
}

export function shiftSpan(
  bells: Bell[],
  shift: Shift,
): { start: number; end: number; count: number } | null {
  const list = bellsForShift(bells, shift);
  if (list.length === 0) return null;
  return {
    start: Math.min(...list.map((b) => toMin(b.start))),
    end: Math.max(...list.map((b) => toMin(b.end))),
    count: list.length,
  };
}

/** Пересечение смен в минутах (>0 — вторая смена начинается раньше конца первой). */
export function shiftsOverlapMinutes(bells: Bell[]): number {
  const s1 = shiftSpan(bells, 1);
  const s2 = shiftSpan(bells, 2);
  if (!s1 || !s2) return 0;
  return Math.max(0, s1.end - s2.start);
}

export function suggestShift2Start(bells: Bell[], gapMinutes = 30): string {
  const s1 = shiftSpan(bells, 1);
  if (!s1) return "13:30";
  return toStr(s1.end + gapMinutes);
}

export function shiftBellsBy(bells: Bell[], shift: Shift, deltaMinutes: number): Bell[] {
  return bells.map((b) =>
    b.shift === shift
      ? { ...b, start: toStr(toMin(b.start) + deltaMinutes), end: toStr(toMin(b.end) + deltaMinutes) }
      : b,
  );
}

export interface WindowReport {
  /** максимальная серия подряд идущих окон */
  maxRun: number;
  /** всего окон за день */
  total: number;
  lessons: number;
}

/**
 * Окна педагога в рамках дня. Межсменный перерыв окном не считается:
 * серия считается отдельно внутри каждой смены.
 */
export function teacherWindows(
  lessons: Array<{ shift: Shift; period: number }>,
): WindowReport {
  let maxRun = 0;
  let total = 0;
  for (const shift of [1, 2] as Shift[]) {
    const ps = lessons
      .filter((l) => l.shift === shift)
      .map((l) => l.period)
      .sort((a, b) => a - b);
    for (let i = 1; i < ps.length; i++) {
      const gap = ps[i] - ps[i - 1] - 1;
      if (gap > 0) {
        total += gap;
        maxRun = Math.max(maxRun, gap);
      }
    }
  }
  return { maxRun, total, lessons: lessons.length };
}

/** Окна класса в рамках дня (должно быть 0 — строго). */
export function classWindows(lessons: Array<{ period: number }>): WindowReport {
  const ps = lessons.map((l) => l.period).sort((a, b) => a - b);
  let maxRun = 0;
  let total = 0;
  for (let i = 1; i < ps.length; i++) {
    const gap = ps[i] - ps[i - 1] - 1;
    if (gap > 0) {
      total += gap;
      maxRun = Math.max(maxRun, gap);
    }
  }
  return { maxRun, total, lessons: ps.length };
}

export function maxPeriodForClass(
  cls: { maxLessonsPerDay: number; shift: Shift },
  settings: Settings,
  bells: Bell[],
): number {
  const count = bellsForShift(bells, cls.shift).length;
  return Math.max(0, Math.min(cls.maxLessonsPerDay, settings.maxLessonsPerDay, count));
}

export function isWorkday(day: Day, cls: { workdays: Day[] }, settings: Settings): boolean {
  return cls.workdays.includes(day) && settings.workdays.includes(day);
}

export function lessonTime(lesson: Lesson, bells: Bell[]): { start: string; end: string } {
  const b = bells.find((x) => x.shift === lesson.shift && x.period === lesson.period);
  return { start: b?.start ?? "—", end: b?.end ?? "—" };
}

export function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** День недели ISO-даты в нашей нумерации (1 = понедельник). */
export function dayOfWeekFromISO(iso: string): Day {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  const js = date.getDay(); // 0 = вс
  return ((js + 6) % 7 + 1) as Day;
}
