import type {
  AppState,
  Classroom,
  Day,
  GeneratorWeights,
  Lesson,
  LessonGroup,
  SchoolClass,
  Settings,
  Shift,
  Subject,
  Teacher,
} from "./types";
import {
  buildTimeline,
  classWindows,
  isWorkday,
  maxPeriodForClass,
  overlaps,
  teacherWindows,
  type TimelinePeriod,
} from "./time";
import { uid } from "./utils";

export interface DemandGroup {
  teacherId: string;
  label?: string;
}

export interface Demand {
  index: number;
  classId: string;
  classSubjectId: string;
  subjectId: string;
  occurrence: number;
  totalOccurrences: number;
  groups: DemandGroup[];
  specId: string | null;
  difficulty: number;
  allowPairs: boolean;
}

export interface UnplacedDemand {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  reason: string;
}

export interface GenStats {
  attempts: number;
  nodes: number;
  ms: number;
  placed: number;
  total: number;
  penalty: number;
  improved: boolean;
}

export interface GenResult {
  schedule: Lesson[];
  unplaced: UnplacedDemand[];
  warnings: string[];
  stats: GenStats;
}

export interface GenOptions {
  timeBudgetMs?: number;
  randomness?: number;
  weights?: GeneratorWeights;
  keepLocked?: boolean;
  seed?: number;
  onProgress?: (p: {
    phase: string;
    attempts: number;
    nodes: number;
    placed: number;
    total: number;
    elapsed: number;
    bestPenalty: number | null;
  }) => void;
  cancelled?: { current: boolean };
}

export interface Interval {
  start: number;
  end: number;
}

export interface Placement {
  day: Day;
  period: number;
  start: number;
  end: number;
  groups: Array<{ teacherId: string; roomId: string | null }>;
  score: number;
}

const TIMEOUT = Symbol("timeout");
const NODE_BUDGET = 90000;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface RoomOption {
  room: Classroom;
  penalty: number;
}

export type EvalCtx = Pick<
  Context,
  | "settings"
  | "weights"
  | "classesById"
  | "subjectsById"
  | "teachersById"
  | "roomsById"
  | "maxPeriodByClass"
  | "timeline"
>;

export class Context {
  state: AppState;
  settings: Settings;
  weights: GeneratorWeights;
  timeline: TimelinePeriod[] = [];
  periodByShift = new Map<Shift, Map<number, TimelinePeriod>>();
  classesById = new Map<string, SchoolClass>();
  subjectsById = new Map<string, Subject>();
  teachersById = new Map<string, Teacher>();
  roomsById = new Map<string, Classroom>();
  maxPeriodByClass = new Map<string, number>();
  demands: Demand[] = [];
  demandsByClass = new Map<string, number[]>();
  rng: () => number;
  private roomOptionsCache = new Map<string, RoomOption[]>();

  constructor(state: AppState, options: GenOptions = {}) {
    this.state = state;
    this.settings = state.settings;
    this.weights = options.weights ?? state.settings.weights;
    this.timeline = buildTimeline(state.bells);
    for (const shift of [1, 2] as Shift[]) {
      const m = new Map<number, TimelinePeriod>();
      for (const t of this.timeline) if (t.shift === shift) m.set(t.period, t);
      this.periodByShift.set(shift, m);
    }
    for (const c of state.classes) this.classesById.set(c.id, c);
    for (const s of state.subjects) this.subjectsById.set(s.id, s);
    for (const t of state.teachers) this.teachersById.set(t.id, t);
    for (const r of state.rooms) this.roomsById.set(r.id, r);
    for (const c of state.classes) {
      this.maxPeriodByClass.set(c.id, maxPeriodForClass(c, this.settings, state.bells));
    }
    this.rng = mulberry32(options.seed ?? 20240901);
  }

  period(shift: Shift, period: number): TimelinePeriod | undefined {
    return this.periodByShift.get(shift)?.get(period);
  }

  intervalOf(shift: Shift, period: number): Interval | null {
    const tp = this.period(shift, period);
    return tp ? { start: tp.start, end: tp.end } : null;
  }

  /**
   * Комнаты в порядке приоритета:
   * 1) специализированные под предмет, 2) закреплённый кабинет класса,
   * 3) стандартные, 4) чужие специализированные (крайний случай).
   */
  roomOptions(specId: string | null, homeRoomId: string | null): RoomOption[] {
    const cacheKey = `${specId ?? "-"}|${homeRoomId ?? "-"}`;
    const cached = this.roomOptionsCache.get(cacheKey);
    if (cached) return cached;
    const w = this.weights;
    const rooms = Array.from(this.roomsById.values());
    const options: RoomOption[] = [];
    const push = (room: Classroom, penalty: number) => {
      if (!options.some((o) => o.room.id === room.id)) options.push({ room, penalty });
    };
    if (specId) {
      for (const r of rooms) {
        if (r.type === "specialized" && r.specializationId === specId) push(r, 0);
      }
    }
    if (homeRoomId) {
      const home = this.roomsById.get(homeRoomId);
      if (home) push(home, Math.max(0, -w.homeRoom));
    }
    for (const r of rooms) if (r.type === "standard") push(r, specId ? w.roomFallback : 0);
    for (const r of rooms) {
      if (r.type === "specialized" && r.specializationId !== specId) {
        push(r, w.roomFallback + w.specRoomMisuse);
      }
    }
    this.roomOptionsCache.set(cacheKey, options);
    return options;
  }
}

export interface SlotInfo {
  subjectId: string;
  teachers: string[];
  rooms: Array<string | null>;
}

export class Engine {
  ctx: Context;
  nodeCount = 0;
  rngJitter = 0;
  /** крайний режим: разрешает второй урок предмета в тот же день (используется при доремонте) */
  relaxSubjectCap = false;
  teacherIntervals = new Map<string, Interval[]>();
  roomIntervals = new Map<string, Interval[]>();
  teacherPeriods = new Map<string, Array<{ shift: Shift; period: number }>>();
  teacherDayCount = new Map<string, number>();
  roomUsage = new Map<string, number>();
  classOccupied = new Map<string, Set<number>>();
  classSubjectDay = new Map<string, number>();
  slotInfo = new Map<string, SlotInfo>();
  subjectDays = new Map<string, Day[]>();
  assignments = new Map<number, Placement>();

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  private tk(id: string, day: Day) {
    return `${id}|${day}`;
  }

  nextPeriod(cls: SchoolClass, day: Day): number {
    const max = this.ctx.maxPeriodByClass.get(cls.id) ?? 0;
    const used = this.classOccupied.get(`${cls.id}|${day}`);
    for (let p = 1; p <= max; p++) if (!used?.has(p)) return p;
    return -1;
  }

  private busy(map: Map<string, Interval[]>, key: string, iv: Interval): boolean {
    const list = map.get(key);
    if (!list) return false;
    return list.some((x) => overlaps(x.start, x.end, iv.start, iv.end));
  }

  canPlace(demandIndex: number, day: Day): Placement | null {
    const ctx = this.ctx;
    const d = ctx.demands[demandIndex];
    const cls = ctx.classesById.get(d.classId);
    if (!cls) return null;
    if (!isWorkday(day, cls, ctx.settings)) return null;
    const period = this.nextPeriod(cls, day);
    if (period < 0) return null;
    const iv = ctx.intervalOf(cls.shift, period);
    if (!iv) return null;

    const capKey = `${cls.id}|${day}|${d.subjectId}`;
    const alreadyToday = this.classSubjectDay.get(capKey) ?? 0;
    const cap = d.totalOccurrences > cls.workdays.length ? 2 : 1;
    if (alreadyToday >= cap && !this.relaxSubjectCap) return null;

    const w = ctx.weights;
    let score = 0;
    const usedRooms = new Set<string>();
    const groups: Array<{ teacherId: string; roomId: string | null }> = [];

    for (const g of d.groups) {
      const teacher = ctx.teachersById.get(g.teacherId);
      if (!teacher) return null;
      const tk = this.tk(g.teacherId, day);
      if (this.busy(this.teacherIntervals, tk, iv)) return null;
      if (
        teacher.unavailable.some(
          (u) => u.day === day && u.shift === cls.shift && u.period === period,
        )
      ) {
        return null;
      }
      const dayCount = this.teacherDayCount.get(tk) ?? 0;
      if (teacher.maxLessonsPerDay != null && dayCount >= teacher.maxLessonsPerDay) return null;

      const periods = [...(this.teacherPeriods.get(tk) ?? []), { shift: cls.shift, period }];
      const wr = teacherWindows(periods);
      if (wr.maxRun > ctx.settings.maxTeacherWindows) return null; // строго
      score -= w.teacherWindows * wr.total;
      score -= w.teacherDailyLoad * dayCount;

      const room = this.pickRoom(d, cls, day, iv, usedRooms);
      if (!room) return null;
      usedRooms.add(room.room.id);
      score -= room.penalty;
      score -= Math.min(6, this.roomUsage.get(room.room.id) ?? 0) * 0.6;
      groups.push({ teacherId: g.teacherId, roomId: room.room.id });
    }

    const prev = this.slotInfo.get(`${cls.id}|${day}|${period - 1}`);
    if (prev) {
      if (prev.subjectId === d.subjectId) {
        score -= w.sameSubjectPerDay;
        const sameTeacher = prev.teachers.some((t) => d.groups.some((g) => g.teacherId === t));
        if (sameTeacher && !d.allowPairs) score -= w.sameTeacherConsecutive;
      }
      if (prev.rooms.some((r) => r && groups.some((g) => g.roomId === r))) {
        score += w.roomChange;
      } else {
        score -= w.roomChange;
      }
    }

    const maxP = ctx.maxPeriodByClass.get(cls.id) ?? 1;
    const dayPos = (period - 1) / Math.max(1, maxP - 1);
    const workdays = cls.workdays.filter((x) => ctx.settings.workdays.includes(x));
    const dayIdx = Math.max(0, workdays.indexOf(day)) / Math.max(1, workdays.length - 1);
    score -= w.difficultyPosition * (d.difficulty - 3) * (dayPos * 1.2 + dayIdx * 0.6);

    if (d.totalOccurrences > 1) {
      const prevDays = this.subjectDays.get(d.classSubjectId) ?? [];
      const ideal = Math.max(1, workdays.length / d.totalOccurrences);
      const gap =
        prevDays.length === 0
          ? workdays.indexOf(day) + 1
          : day - prevDays[prevDays.length - 1];
      score -= w.subjectSpread * Math.abs(Math.max(1, gap) - ideal);
    }

    return { day, period, start: iv.start, end: iv.end, groups, score };
  }

  private pickRoom(
    d: Demand,
    cls: SchoolClass,
    day: Day,
    iv: Interval,
    exclude: Set<string>,
  ): RoomOption | null {
    for (const option of this.ctx.roomOptions(d.specId, cls.homeRoomId)) {
      if (exclude.has(option.room.id)) continue;
      if (this.busy(this.roomIntervals, `${option.room.id}|${day}`, iv)) continue;
      return option;
    }
    return null;
  }

  place(demandIndex: number, p: Placement) {
    const d = this.ctx.demands[demandIndex];
    const cls = this.ctx.classesById.get(d.classId)!;
    const iv: Interval = { start: p.start, end: p.end };
    this.assignments.set(demandIndex, p);

    const occKey = `${d.classId}|${p.day}`;
    const set = this.classOccupied.get(occKey) ?? new Set<number>();
    set.add(p.period);
    this.classOccupied.set(occKey, set);

    const capKey = `${d.classId}|${p.day}|${d.subjectId}`;
    this.classSubjectDay.set(capKey, (this.classSubjectDay.get(capKey) ?? 0) + 1);

    this.slotInfo.set(`${d.classId}|${p.day}|${p.period}`, {
      subjectId: d.subjectId,
      teachers: d.groups.map((g) => g.teacherId),
      rooms: p.groups.map((g) => g.roomId),
    });

    const days = this.subjectDays.get(d.classSubjectId) ?? [];
    days.push(p.day);
    days.sort((a, b) => a - b);
    this.subjectDays.set(d.classSubjectId, days);

    for (const g of p.groups) {
      const tk = this.tk(g.teacherId, p.day);
      const list = this.teacherIntervals.get(tk) ?? [];
      list.push(iv);
      this.teacherIntervals.set(tk, list);
      const periods = this.teacherPeriods.get(tk) ?? [];
      periods.push({ shift: cls.shift, period: p.period });
      this.teacherPeriods.set(tk, periods);
      this.teacherDayCount.set(tk, (this.teacherDayCount.get(tk) ?? 0) + 1);
      if (g.roomId) {
        const rk = `${g.roomId}|${p.day}`;
        const rl = this.roomIntervals.get(rk) ?? [];
        rl.push(iv);
        this.roomIntervals.set(rk, rl);
        this.roomUsage.set(g.roomId, (this.roomUsage.get(g.roomId) ?? 0) + 1);
      }
    }
  }

  unplace(demandIndex: number) {
    const p = this.assignments.get(demandIndex);
    if (!p) return;
    const d = this.ctx.demands[demandIndex];
    const cls = this.ctx.classesById.get(d.classId)!;
    this.assignments.delete(demandIndex);

    this.classOccupied.get(`${d.classId}|${p.day}`)?.delete(p.period);
    const capKey = `${d.classId}|${p.day}|${d.subjectId}`;
    this.classSubjectDay.set(capKey, Math.max(0, (this.classSubjectDay.get(capKey) ?? 1) - 1));
    this.slotInfo.delete(`${d.classId}|${p.day}|${p.period}`);

    const days = this.subjectDays.get(d.classSubjectId) ?? [];
    const di = days.indexOf(p.day);
    if (di >= 0) days.splice(di, 1);
    this.subjectDays.set(d.classSubjectId, days);

    for (const g of p.groups) {
      const tk = this.tk(g.teacherId, p.day);
      const list = this.teacherIntervals.get(tk) ?? [];
      const idx = list.findIndex((x) => x.start === p.start && x.end === p.end);
      if (idx >= 0) list.splice(idx, 1);
      const periods = this.teacherPeriods.get(tk) ?? [];
      const pi = periods.findIndex((x) => x.period === p.period && x.shift === cls.shift);
      if (pi >= 0) periods.splice(pi, 1);
      this.teacherDayCount.set(tk, Math.max(0, (this.teacherDayCount.get(tk) ?? 1) - 1));
      if (g.roomId) {
        const rk = `${g.roomId}|${p.day}`;
        const rl = this.roomIntervals.get(rk) ?? [];
        const ri = rl.findIndex((x) => x.start === p.start && x.end === p.end);
        if (ri >= 0) rl.splice(ri, 1);
        this.roomUsage.set(g.roomId, Math.max(0, (this.roomUsage.get(g.roomId) ?? 1) - 1));
      }
    }
  }

  /** Ручное размещение закреплённого урока (без проверки ограничений). */
  placeLocked(l: Lesson) {
    const iv = this.ctx.intervalOf(l.shift, l.period);
    if (!iv) return;
    const occKey = `${l.classId}|${l.day}`;
    const set = this.classOccupied.get(occKey) ?? new Set<number>();
    set.add(l.period);
    this.classOccupied.set(occKey, set);
    const capKey = `${l.classId}|${l.day}|${l.subjectId}`;
    this.classSubjectDay.set(capKey, (this.classSubjectDay.get(capKey) ?? 0) + 1);
    this.slotInfo.set(`${l.classId}|${l.day}|${l.period}`, {
      subjectId: l.subjectId,
      teachers: l.groups.map((g) => g.teacherId).filter((x): x is string => !!x),
      rooms: l.groups.map((g) => g.roomId),
    });
    for (const g of l.groups) {
      if (!g.teacherId) continue;
      const tk = this.tk(g.teacherId, l.day);
      const list = this.teacherIntervals.get(tk) ?? [];
      list.push(iv);
      this.teacherIntervals.set(tk, list);
      const periods = this.teacherPeriods.get(tk) ?? [];
      periods.push({ shift: l.shift, period: l.period });
      this.teacherPeriods.set(tk, periods);
      this.teacherDayCount.set(tk, (this.teacherDayCount.get(tk) ?? 0) + 1);
      if (g.roomId) {
        const rk = `${g.roomId}|${l.day}`;
        const rl = this.roomIntervals.get(rk) ?? [];
        rl.push(iv);
        this.roomIntervals.set(rk, rl);
      }
    }
  }
}

export function buildDemands(
  ctx: Context,
  warnings: string[],
  unplaced: UnplacedDemand[],
  lockedCounts: Map<string, number> = new Map(),
) {
  const demands: Demand[] = [];
  const byClass = new Map<string, number[]>();
  for (const cls of ctx.state.classes) {
    const indices: number[] = [];
    const maxPeriod = ctx.maxPeriodByClass.get(cls.id) ?? 0;
    const capacity = maxPeriod * cls.workdays.filter((d) => ctx.settings.workdays.includes(d)).length;
    const rows = cls.subjects
      .filter((cs) => cs.hoursPerWeek > 0)
      .map((cs) => ({ cs, subject: ctx.subjectsById.get(cs.subjectId) }))
      .filter((r): r is { cs: (typeof cls.subjects)[number]; subject: Subject } => !!r.subject);

    rows.sort((a, b) => b.subject.difficulty - a.subject.difficulty);
    let produced = 0;
    for (const { cs, subject } of rows) {
      const groups: DemandGroup[] = [];
      if (cs.teacherId && ctx.teachersById.has(cs.teacherId)) {
        groups.push({ teacherId: cs.teacherId });
      }
      if (cs.groups === 2) {
        if (cs.group2TeacherId && cs.group2TeacherId !== cs.teacherId && ctx.teachersById.has(cs.group2TeacherId)) {
          groups.push({ teacherId: cs.group2TeacherId, label: "2 подгруппа" });
          groups[0].label = "1 подгруппа";
        } else {
          warnings.push(
            `«${cls.name}» → «${subject.name}»: для второй подгруппы не выбран педагог, урок ставится общим потоком.`,
          );
        }
      }
      const lockedHere = lockedCounts.get(cs.id) ?? 0;
      for (let i = 0; i < cs.hoursPerWeek; i++) {
        if (i < lockedHere) continue; // уже закреплено пользователем вручную
        produced++;
        if (produced > capacity) {
          unplaced.push({
            classId: cls.id,
            className: cls.name,
            subjectId: subject.id,
            subjectName: subject.name,
            reason: `превышен лимит уроков в день (${maxPeriod} уроков × ${cls.workdays.length} дн.)`,
          });
          continue;
        }
        if (groups.length === 0) {
          unplaced.push({
            classId: cls.id,
            className: cls.name,
            subjectId: subject.id,
            subjectName: subject.name,
            reason: "не назначен педагог",
          });
          continue;
        }
        indices.push(demands.length);
        demands.push({
          index: demands.length,
          classId: cls.id,
          classSubjectId: cs.id,
          subjectId: subject.id,
          occurrence: i,
          totalOccurrences: cs.hoursPerWeek,
          groups,
          specId:
            cs.roomSpecializationId === undefined
              ? subject.specializationId
              : cs.roomSpecializationId,
          difficulty: subject.difficulty,
          allowPairs: subject.allowPairs ?? false,
        });
      }
    }
    if (produced > 0 && capacity === 0) {
      warnings.push(
        `«${cls.name}»: нет ни одного доступного урока — проверьте звонки смены, учебные дни и лимит уроков.`,
      );
    }
    byClass.set(cls.id, indices);
  }
  ctx.demands = demands;
  ctx.demandsByClass = byClass;
}

export function harvest(ctx: Context, engine: Engine): Lesson[] {
  const lessons: Lesson[] = [];
  for (const [di, p] of engine.assignments) {
    const d = ctx.demands[di];
    const cls = ctx.classesById.get(d.classId);
    if (!cls) continue;
    const groups: LessonGroup[] = p.groups.map((g) => ({
      teacherId: g.teacherId,
      roomId: g.roomId,
      label: d.groups.find((x) => x.teacherId === g.teacherId)?.label,
    }));
    lessons.push({
      id: uid("lsn"),
      classId: d.classId,
      day: p.day,
      shift: cls.shift,
      period: p.period,
      subjectId: d.subjectId,
      groups,
      classSubjectId: d.classSubjectId,
    });
  }
  return lessons;
}

export function unplacedFrom(ctx: Context, engine: Engine): UnplacedDemand[] {
  const out: UnplacedDemand[] = [];
  for (let i = 0; i < ctx.demands.length; i++) {
    if (engine.assignments.has(i)) continue;
    const d = ctx.demands[i];
    out.push({
      classId: d.classId,
      className: ctx.classesById.get(d.classId)?.name ?? "",
      subjectId: d.subjectId,
      subjectName: ctx.subjectsById.get(d.subjectId)?.name ?? "",
      reason: "нет места без нарушения жёстких ограничений",
    });
  }
  return out;
}

/** Итоговая оценка качества (чем меньше, тем лучше). */
export function evaluatePenalty(schedule: Lesson[], ctx: EvalCtx): number {
  const w = ctx.weights;
  let penalty = 0;
  const byClassDay = new Map<string, Lesson[]>();
  for (const l of schedule) {
    const k = `${l.classId}|${l.day}`;
    const arr = byClassDay.get(k) ?? [];
    arr.push(l);
    byClassDay.set(k, arr);
  }
  for (const [k, list] of byClassDay) {
    list.sort((a, b) => a.period - b.period);
    const classId = k.split("|")[0];
    const cls = ctx.classesById.get(classId);
    const maxP = ctx.maxPeriodByClass.get(classId) ?? 1;
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const subj = ctx.subjectsById.get(cur.subjectId);
      if (subj) {
        const dayPos = (cur.period - 1) / Math.max(1, maxP - 1);
        penalty += w.difficultyPosition * (subj.difficulty - 3) * dayPos;
      }
      const next = list[i + 1];
      if (next) {
        if (next.subjectId === cur.subjectId) {
          penalty += w.sameSubjectPerDay;
          const sameTeacher = cur.groups.some((g) =>
            next.groups.some((n) => n.teacherId === g.teacherId),
          );
          if (sameTeacher && !(subj?.allowPairs ?? false)) penalty += w.sameTeacherConsecutive;
        }
        const curRooms = cur.groups.map((g) => g.roomId).filter(Boolean);
        const nextRooms = next.groups.map((g) => g.roomId).filter(Boolean);
        if (curRooms.length && nextRooms.length && !curRooms.some((r) => nextRooms.includes(r))) {
          penalty += w.roomChange;
        }
      }
    }
    const cw = classWindows(list);
    penalty += 800 * cw.total;
    void cls;
  }
  for (const l of schedule) {
    const subj = ctx.subjectsById.get(l.subjectId);
    const specId = subj?.specializationId ?? null;
    for (const g of l.groups) {
      const room = g.roomId ? ctx.roomsById.get(g.roomId) : null;
      if (!room) {
        penalty += w.roomFallback;
        continue;
      }
      if (specId && room.type === "specialized" && room.specializationId === specId) continue;
      if (specId && room.type === "standard") penalty += w.roomFallback;
      if (!specId && room.type === "specialized") penalty += w.specRoomMisuse;
      if (specId && room.type === "specialized" && room.specializationId !== specId) {
        penalty += w.specRoomMisuse;
      }
    }
  }
  const teacherDay = new Map<string, Array<{ shift: Shift; period: number }>>();
  const teacherCount = new Map<string, number>();
  for (const l of schedule) {
    for (const g of l.groups) {
      if (!g.teacherId) continue;
      const k = `${g.teacherId}|${l.day}`;
      const arr = teacherDay.get(k) ?? [];
      arr.push({ shift: l.shift, period: l.period });
      teacherDay.set(k, arr);
      teacherCount.set(k, (teacherCount.get(k) ?? 0) + 1);
    }
  }
  for (const [k, list] of teacherDay) {
    const wr = teacherWindows(list);
    penalty += w.teacherWindows * wr.total;
    if (wr.maxRun > ctx.settings.maxTeacherWindows) {
      penalty += 5000 * (wr.maxRun - ctx.settings.maxTeacherWindows);
    }
    const teacher = ctx.teachersById.get(k.split("|")[0]);
    if (teacher?.maxLessonsPerDay != null && list.length > teacher.maxLessonsPerDay) {
      penalty += 300 * (list.length - teacher.maxLessonsPerDay);
    }
  }
  return Math.round(penalty);
}

/** Подсчёт жёстких нарушений — используется при локальном улучшении. */
export function countConflicts(schedule: Lesson[], ctx: EvalCtx): number {
  let conflicts = 0;
  const iv = (l: Lesson) => ctx.timeline.find((t) => t.shift === l.shift && t.period === l.period);

  const teacherMap = new Map<string, Array<{ l: Lesson; s: number; e: number }>>();
  const roomMap = new Map<string, Array<{ l: Lesson; s: number; e: number }>>();
  const classMap = new Map<string, Array<{ l: Lesson; s: number; e: number }>>();
  const byClassDay = new Map<string, Lesson[]>();
  const subjectDay = new Map<string, number>();

  for (const l of schedule) {
    const t = iv(l);
    const s = t?.start ?? 0;
    const e = t?.end ?? 0;
    if (!t) conflicts += 5;
    const cls = ctx.classesById.get(l.classId);
    if (cls) {
      if (!isWorkday(l.day, cls, ctx.settings)) conflicts += 5;
      if (l.period > (ctx.maxPeriodByClass.get(l.classId) ?? 0)) conflicts += 5;
      if (l.shift !== cls.shift) conflicts += 5;
      const k = `${l.classId}|${l.day}`;
      byClassDay.set(k, [...(byClassDay.get(k) ?? []), l]);
      const capKey = `${l.classId}|${l.day}|${l.subjectId}`;
      const cs = cls.subjects.find((x) => x.id === l.classSubjectId);
      const cap = (cs?.hoursPerWeek ?? 1) > cls.workdays.length ? 2 : 1;
      const n = (subjectDay.get(capKey) ?? 0) + 1;
      subjectDay.set(capKey, n);
      if (n > cap) conflicts += 3;
    }
    classMap.set(l.classId, [...(classMap.get(l.classId) ?? []), { l, s, e }]);
    for (const g of l.groups) {
      if (g.teacherId) {
        const k = `${g.teacherId}|${l.day}`;
        teacherMap.set(k, [...(teacherMap.get(k) ?? []), { l, s, e }]);
      }
      if (g.roomId) {
        const k = `${g.roomId}|${l.day}`;
        roomMap.set(k, [...(roomMap.get(k) ?? []), { l, s, e }]);
      }
    }
  }

  const overlapCount = (map: Map<string, Array<{ s: number; e: number }>>) => {
    for (const [, list] of map) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (overlaps(list[i].s, list[i].e, list[j].s, list[j].e)) conflicts++;
        }
      }
    }
  };
  overlapCount(teacherMap);
  overlapCount(roomMap);
  overlapCount(classMap);

  for (const [, list] of byClassDay) {
    const cw = classWindows(list);
    if (cw.maxRun > 0) conflicts += 4 * cw.maxRun;
  }
  const teacherPeriods = new Map<string, Array<{ shift: Shift; period: number }>>();
  for (const l of schedule) {
    for (const g of l.groups) {
      if (!g.teacherId) continue;
      const k = `${g.teacherId}|${l.day}`;
      teacherPeriods.set(k, [...(teacherPeriods.get(k) ?? []), { shift: l.shift, period: l.period }]);
    }
  }
  for (const [, list] of teacherPeriods) {
    const wr = teacherWindows(list);
    if (wr.maxRun > ctx.settings.maxTeacherWindows) conflicts += 6;
  }
  return conflicts;
}

