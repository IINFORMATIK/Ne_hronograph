import type { AppState, Day, Lesson, Shift } from "./types";
import { overlaps } from "./time";
import { uid } from "./utils";
import {
  buildDemands,
  countConflicts,
  Context,
  Engine,
  evaluatePenalty,
  harvest,
  shuffle,
  unplacedFrom,
  type Demand,
  type EvalCtx,
  type GenOptions,
  type GenResult,
  type Placement,
  type UnplacedDemand,
} from "./generator";

/**
 * Компоновщик расписания.
 *
 * Стратегия:
 *  1. Классы обрабатываются по очереди (сначала самые «нагруженные»).
 *  2. Внутри класса — ограниченный поиск с возвратом и эвристикой MRV
 *     (сначала размещается урок, у которого меньше всего возможных дней).
 *     Уроки класса всегда заполняют периоды подряд с первого — окон у класса нет.
 *  3. Остатки «доремонтируются» выбросом мешающих уроков (ejection chains).
 *  4. Финал — локальное улучшение перестановками внутри класса.
 */

interface FillResult {
  complete: boolean;
  nodes: number;
}

function fillClassBounded(
  ctx: Context,
  engine: Engine,
  classId: string,
  nodeCap: number,
  deadline: number,
  jitter: number,
  rng: () => number,
): FillResult {
  const demands = ctx.demandsByClass.get(classId) ?? [];
  const cls = ctx.classesById.get(classId);
  if (!cls) return { complete: true, nodes: 0 };
  const days = cls.workdays.filter((d) => ctx.settings.workdays.includes(d));
  const cache = new Map<string, Placement | null>();
  const get = (di: number, day: Day): Placement | null => {
    const k = `${di}|${day}`;
    if (!cache.has(k)) cache.set(k, engine.canPlace(di, day));
    return cache.get(k) ?? null;
  };
  const invalidateDay = (day: Day) => {
    for (const di of demands) cache.delete(`${di}|${day}`);
  };

  let nodes = 0;
  let bestSnapshot: Array<{ di: number; p: Placement }> = [];

  const snapshot = () => {
    const list = demands
      .filter((di) => engine.assignments.has(di))
      .map((di) => ({ di, p: engine.assignments.get(di) as Placement }));
    if (list.length > bestSnapshot.length) bestSnapshot = list;
  };

  function rec(): boolean {
    nodes++;
    if (nodes > nodeCap) return false;
    if (nodes % 64 === 0 && Date.now() > deadline) return false;

    const remaining = demands.filter((di) => !engine.assignments.has(di));
    if (remaining.length === 0) {
      snapshot();
      return true;
    }

    const scored: Array<{ di: number; plans: Placement[] }> = [];
    for (const di of remaining) {
      const plans: Placement[] = [];
      for (const day of days) {
        const p = get(di, day);
        if (p) plans.push(p);
      }
      scored.push({ di, plans });
    }
    scored.sort((a, b) => a.plans.length - b.plans.length);
    const window = Math.min(scored.length, 1 + Math.floor(jitter * 3));
    const pick = scored[Math.floor(rng() * window)];
    if (!pick || pick.plans.length === 0) {
      snapshot();
      return false;
    }

    const ordered = pick.plans
      .map((p) => ({ p, adj: p.score - rng() * jitter * 80 }))
      .sort((a, b) => b.adj - a.adj);

    for (const cand of ordered) {
      engine.place(pick.di, cand.p);
      invalidateDay(cand.p.day);
      if (rec()) return true;
      engine.unplace(pick.di);
      invalidateDay(cand.p.day);
      if (nodes > nodeCap || Date.now() > deadline) {
        snapshot();
        return false;
      }
    }
    snapshot();
    return false;
  }

  const complete = rec();
  if (!complete && bestSnapshot.length > 0) {
    const currentCount = demands.filter((di) => engine.assignments.has(di)).length;
    if (bestSnapshot.length > currentCount) {
      for (const di of demands) {
        if (engine.assignments.has(di)) {
          const p = engine.assignments.get(di) as Placement;
          engine.unplace(di);
          invalidateDay(p.day);
        }
      }
      for (const item of bestSnapshot) engine.place(item.di, item.p);
    }
  }
  return { complete, nodes };
}

function tryDirect(ctx: Context, engine: Engine, di: number): boolean {
  const d = ctx.demands[di];
  const cls = ctx.classesById.get(d.classId);
  if (!cls) return false;
  const days = cls.workdays.filter((x) => ctx.settings.workdays.includes(x));
  let best: Placement | null = null;
  for (const day of days) {
    const p = engine.canPlace(di, day);
    if (p && (!best || p.score > best.score)) best = p;
  }
  if (best) {
    engine.place(di, best);
    return true;
  }
  return false;
}

function findBlockers(
  ctx: Context,
  engine: Engine,
  d: Demand,
  day: Day,
  iv: { start: number; end: number },
): number[] {
  const teachers = new Set(d.groups.map((g) => g.teacherId));
  const out: number[] = [];
  for (const [bDi, p] of engine.assignments) {
    if (p.day !== day) continue;
    if (!overlaps(p.start, p.end, iv.start, iv.end)) continue;
    const bd = ctx.demands[bDi];
    if (!bd || bd.classId === d.classId) continue;
    if (bd.groups.some((g) => teachers.has(g.teacherId))) out.push(bDi);
  }
  return out;
}

/** Размещение с «выбросом» мешающего урока и попыткой переставить его elsewhere. */
function tryEject(ctx: Context, engine: Engine, di: number, depth: number): boolean {
  const d = ctx.demands[di];
  const cls = ctx.classesById.get(d.classId);
  if (!cls) return false;
  const days = cls.workdays.filter((x) => ctx.settings.workdays.includes(x));
  for (const day of days) {
    const period = engine.nextPeriod(cls, day);
    if (period < 0) continue;
    const iv = ctx.intervalOf(cls.shift, period);
    if (!iv) continue;
    const blockers = findBlockers(ctx, engine, d, day, iv);
    for (const bDi of blockers) {
      const bPlacement = engine.assignments.get(bDi);
      if (!bPlacement) continue;
      engine.unplace(bDi);
      const p = engine.canPlace(di, day);
      if (p) {
        engine.place(di, p);
        const relocated = depth > 0 ? tryDirect(ctx, engine, bDi) || tryEject(ctx, engine, bDi, depth - 1) : tryDirect(ctx, engine, bDi);
        if (relocated) return true;
        engine.unplace(di);
      }
      engine.place(bDi, bPlacement);
    }
  }
  return false;
}

function repair(ctx: Context, engine: Engine, indices: number[], deadline: number): void {
  const left: number[] = [];
  for (const di of indices) {
    if (Date.now() > deadline) {
      left.push(di);
      continue;
    }
    if (engine.assignments.has(di)) continue;
    if (tryDirect(ctx, engine, di)) continue;
    if (tryEject(ctx, engine, di, 2)) continue;
    left.push(di);
  }
  if (left.length === 0) return;
  // крайний проход: разрешаем второй урок предмета в тот же день,
  // иначе часы учебного плана останутся нереализованными
  engine.relaxSubjectCap = true;
  for (const di of left) {
    if (Date.now() > deadline) break;
    if (engine.assignments.has(di)) continue;
    if (tryDirect(ctx, engine, di)) continue;
    tryEject(ctx, engine, di, 2);
  }
  engine.relaxSubjectCap = false;
}

/** Перестановки уроков внутри класса для снижения суммарного штрафа. */
function improve(
  schedule: Lesson[],
  ctx: EvalCtx,
  deadline: number,
): { lessons: Lesson[]; improved: boolean } {
  let current = schedule.slice();
  let currentPenalty = evaluatePenalty(current, ctx);
  let currentConflicts = countConflicts(current, ctx);
  let improved = false;
  let guard = 0;
  while (Date.now() < deadline - 60 && guard < 600) {
    guard++;
    let swapped = false;
    const byClass = new Map<string, Lesson[]>();
    for (const l of current) byClass.set(l.classId, [...(byClass.get(l.classId) ?? []), l]);
    outer: for (const [, list] of byClass) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (Date.now() > deadline - 60) break outer;
          const a = list[i];
          const b = list[j];
          if (a.locked || b.locked) continue;
          if (a.day === b.day && a.period === b.period) continue;
          const trial = current.map((l) => {
            if (l.id === a.id) return { ...l, day: b.day, period: b.period };
            if (l.id === b.id) return { ...l, day: a.day, period: a.period };
            return l;
          });
          const c = countConflicts(trial, ctx);
          if (c > currentConflicts) continue;
          const p = evaluatePenalty(trial, ctx);
          if (p < currentPenalty - 0.5) {
            current = trial;
            currentPenalty = p;
            currentConflicts = c;
            improved = true;
            swapped = true;
            break outer;
          }
        }
      }
    }
    if (!swapped) break;
  }
  return { lessons: current, improved };
}

export function generateSchedule(state: AppState, options: GenOptions = {}): GenResult {
  const startedAt = Date.now();
  const budget = Math.max(600, options.timeBudgetMs ?? state.settings.generatorTimeBudgetMs ?? 6000);
  const deadline = startedAt + budget;
  const ctx = new Context(state, options);
  const warnings: string[] = [];
  const preUnplaced: UnplacedDemand[] = [];

  const lockedLessons = options.keepLocked ? state.schedule.filter((l) => l.locked) : [];
  const lockedCounts = new Map<string, number>();
  for (const l of lockedLessons) {
    if (!l.classSubjectId) continue;
    lockedCounts.set(l.classSubjectId, (lockedCounts.get(l.classSubjectId) ?? 0) + 1);
  }
  buildDemands(ctx, warnings, preUnplaced, lockedCounts);

  const total = ctx.demands.length + lockedLessons.length;

  const teacherLoad = new Map<string, number>();
  for (const d of ctx.demands) {
    for (const g of d.groups) teacherLoad.set(g.teacherId, (teacherLoad.get(g.teacherId) ?? 0) + 1);
  }
  for (const [tid, load] of teacherLoad) {
    const t = ctx.teachersById.get(tid);
    if (!t) continue;
    const days = ctx.settings.workdays.length;
    const max = t.maxLessonsPerDay ?? ctx.settings.maxLessonsPerDay;
    if (load > max * days) {
      warnings.push(
        `${t.name}: нагрузка ${load} ч/нед. выше предела ${max * days} ч (${max} × ${days} дн.) — часть уроков может остаться нераспределённой.`,
      );
    }
  }

  const baseOrder = state.classes
    .map((c) => c.id)
    .sort(
      (a, b) => (ctx.demandsByClass.get(b) ?? []).length - (ctx.demandsByClass.get(a) ?? []).length,
    );

  let best: {
    lessons: Lesson[];
    unplaced: UnplacedDemand[];
    penalty: number;
    conflicts: number;
  } | null = null;
  let attempts = 0;
  let nodes = 0;
  let stale = 0;
  const rng = ctx.rng;

  while (Date.now() < deadline && attempts < 60) {
    attempts++;
    const attemptDeadline = Math.min(
      deadline,
      Date.now() + Math.max(700, Math.min(4000, (deadline - Date.now()) / (attempts === 1 ? 2 : 1))),
    );
    const engine = new Engine(ctx);
    for (const l of lockedLessons) engine.placeLocked(l);
    const order = attempts === 1 ? [...baseOrder] : shuffle(baseOrder, rng);
    const nodeCap = 2500 + attempts * 1200;
    const jitter = Math.min(1, (options.randomness ?? state.settings.generatorRandomness ?? 0.3) * (1 + attempts / 6));

    for (const classId of order) {
      if (Date.now() > attemptDeadline) break;
      const res = fillClassBounded(ctx, engine, classId, nodeCap, attemptDeadline, jitter, rng);
      nodes += res.nodes;
      options.onProgress?.({
        phase: `Подбор: ${ctx.classesById.get(classId)?.name ?? ""}`,
        attempts,
        nodes,
        placed: engine.assignments.size + lockedLessons.length,
        total,
        elapsed: Date.now() - startedAt,
        bestPenalty: best?.penalty ?? null,
      });
    }

    const missing: number[] = [];
    for (let i = 0; i < ctx.demands.length; i++) if (!engine.assignments.has(i)) missing.push(i);
    if (missing.length) {
      options.onProgress?.({
        phase: "Доремонт нераспределённых уроков",
        attempts,
        nodes,
        placed: engine.assignments.size + lockedLessons.length,
        total,
        elapsed: Date.now() - startedAt,
        bestPenalty: best?.penalty ?? null,
      });
      repair(ctx, engine, missing, Math.min(deadline, attemptDeadline + 600));
    }

    const lessons = [...harvest(ctx, engine), ...lockedLessons];
    const unplaced = unplacedFrom(ctx, engine);
    const penalty = evaluatePenalty(lessons, ctx);
    const conflicts = countConflicts(lessons, ctx);
    const better =
      !best ||
      lessons.length > best.lessons.length ||
      (lessons.length === best.lessons.length &&
        (conflicts < best.conflicts || (conflicts === best.conflicts && penalty < best.penalty)));
    if (better) {
      best = { lessons, unplaced, penalty, conflicts };
      stale = 0;
    } else {
      stale++;
    }
    const currentBest = best as NonNullable<typeof best>;

    options.onProgress?.({
      phase: "Оценка варианта",
      attempts,
      nodes,
      placed: currentBest.lessons.length,
      total,
      elapsed: Date.now() - startedAt,
      bestPenalty: currentBest.penalty,
    });

    if (options.cancelled?.current) break;
    if (currentBest.unplaced.length === 0 && currentBest.conflicts === 0 && attempts >= 4) break;
    if (stale >= 8) break;
  }

  if (!best) best = { lessons: [...lockedLessons], unplaced: [], penalty: 0, conflicts: 0 };

  options.onProgress?.({
    phase: "Улучшение расстановки",
    attempts,
    nodes,
    placed: best.lessons.length,
    total,
    elapsed: Date.now() - startedAt,
    bestPenalty: best.penalty,
  });

  const before = best.penalty;
  const improveDeadline = Date.now() + Math.max(250, Math.min(2000, deadline - Date.now() + 800));
  const improvedResult = improve(best.lessons, ctx, improveDeadline);
  const lessons = improvedResult.lessons;
  const penalty = evaluatePenalty(lessons, ctx);

  return {
    schedule: lessons,
    unplaced: [...preUnplaced, ...best.unplaced],
    warnings,
    stats: {
      attempts,
      nodes,
      ms: Date.now() - startedAt,
      placed: lessons.length,
      total,
      penalty,
      improved: improvedResult.improved || penalty < before,
    },
  };
}

export function buildContext(state: AppState): Context {
  return new Context(state);
}

export function emptyLesson(classId: string, day: Day, shift: Shift, period: number): Lesson {
  return {
    id: uid("lsn"),
    classId,
    day,
    shift,
    period,
    subjectId: "",
    groups: [{ teacherId: null, roomId: null }],
  };
}

export type { Context as GeneratorContext, EvalCtx };
export type { GenResult, GenOptions, GenStats, UnplacedDemand } from "./generator";
