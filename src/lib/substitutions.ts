import type { AppState, Day, Lesson, Substitution, Teacher } from "./types";
import { buildTimeline, overlaps, teacherWindows, dayOfWeekFromISO, toStr } from "./time";
import { shortTeacher, teacherHomerooms } from "./utils";

export interface SubstitutionCandidate {
  teacher: Teacher;
  score: number;
  reasons: string[];
  warnings: string[];
  loadToday: number;
}

export interface SubstitutionRequest {
  date: string;
  lessonId: string;
  absentTeacherId: string;
}

interface TimeSlot {
  start: number;
  end: number;
}

function slotOf(state: AppState, lesson: Pick<Lesson, "shift" | "period">): TimeSlot | null {
  const timeline = buildTimeline(state.bells);
  const t = timeline.find((x) => x.shift === lesson.shift && x.period === lesson.period);
  return t ? { start: t.start, end: t.end } : null;
}

/** Все уроки педагога в конкретный день недели (с учётом уже оформленных замен). */
function teacherDayLessons(
  state: AppState,
  teacherId: string,
  day: Day,
  date: string,
): Array<{ lesson: Lesson; slot: TimeSlot }> {
  const out: Array<{ lesson: Lesson; slot: TimeSlot }> = [];
  const subs = state.substitutions.filter((s) => s.date === date);
  for (const l of state.schedule) {
    if (l.day !== day) continue;
    const slot = slotOf(state, l);
    if (!slot) continue;
    const effective = l.groups.map((g) => {
      const sub = subs.find((s) => s.lessonId === l.id && s.originalTeacherId === g.teacherId);
      if (sub) {
        return sub.status === "cancelled" ? null : sub.replacementTeacherId;
      }
      return g.teacherId;
    });
    if (effective.some((t) => t === teacherId)) out.push({ lesson: l, slot });
  }
  return out;
}

export function findGroupMerge(state: AppState, lesson: Lesson, date: string, absentTeacherId: string) {
  if (lesson.groups.length !== 2 || dayOfWeekFromISO(date) !== lesson.day) return null;
  const [absent, other] = lesson.groups[0].teacherId === absentTeacherId
    ? lesson.groups
    : [lesson.groups[1], lesson.groups[0]];
  if (absent.teacherId !== absentTeacherId || !other.teacherId || other.teacherId === absentTeacherId) return null;

  const teacher = state.teachers.find((t) => t.id === other.teacherId);
  const slot = slotOf(state, lesson);
  if (!teacher || !slot) return null;
  if (teacher.unavailable.some((u) => u.day === lesson.day && u.shift === lesson.shift && u.period === lesson.period)) return null;

  const absentDuringLesson = state.substitutions.some((sub) => {
    if (sub.date !== date || sub.originalTeacherId !== teacher.id) return false;
    const otherSlot = slotOf(state, sub);
    return sub.lessonId === lesson.id || !!otherSlot && overlaps(slot.start, slot.end, otherSlot.start, otherSlot.end);
  });
  if (absentDuringLesson) return null;

  const hasOtherLesson = teacherDayLessons(state, teacher.id, lesson.day, date).some(
    (entry) => entry.lesson.id !== lesson.id && overlaps(slot.start, slot.end, entry.slot.start, entry.slot.end),
  );
  return hasOtherLesson ? null : { teacher, roomId: other.roomId };
}

export function saveSubstitution(state: AppState, substitution: Substitution) {
  state.substitutions = state.substitutions.filter((existing) => {
    if (existing.date !== substitution.date || existing.lessonId !== substitution.lessonId) return true;
    if (existing.originalTeacherId === substitution.originalTeacherId) return false;
    // Объединение зависит от присутствия педагога, который ведёт соседнюю подгруппу.
    return !(existing.combinedGroups && existing.replacementTeacherId === substitution.originalTeacherId);
  });
  state.substitutions.push(substitution);
}

/**
 * Подбор замены: ищем педагога, который свободен в это время, ведёт этот предмет,
 * не выходит за лимит уроков в день и не получает более двух окон подряд.
 */
export function findCandidates(
  state: AppState,
  request: SubstitutionRequest,
): SubstitutionCandidate[] {
  const lesson = state.schedule.find((l) => l.id === request.lessonId);
  if (!lesson || !lesson.groups.some((g) => g.teacherId === request.absentTeacherId)) return [];
  const slot = slotOf(state, lesson);
  if (!slot) return [];
  const day = lesson.day;
  const date = request.date;

  const absentIds = new Set([request.absentTeacherId]);
  for (const sub of state.substitutions) {
    if (sub.date !== date || !sub.originalTeacherId) continue;
    const subSlot = slotOf(state, sub);
    if (subSlot && overlaps(subSlot.start, subSlot.end, slot.start, slot.end)) {
      absentIds.add(sub.originalTeacherId);
    }
  }

  const candidates: SubstitutionCandidate[] = [];
  for (const teacher of state.teachers) {
    if (absentIds.has(teacher.id)) continue;

    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    const dayLessons = teacherDayLessons(state, teacher.id, day, date);
    const clash = dayLessons.some((x) => overlaps(x.slot.start, x.slot.end, slot.start, slot.end));
    if (clash) continue;

    if (teacher.unavailable.some((u) => u.day === day && u.shift === lesson.shift && u.period === lesson.period)) {
      continue;
    }

    const teachesSubject = teacher.subjectIds.includes(lesson.subjectId);
    if (teachesSubject) {
      score += 60;
      reasons.push("ведёт этот предмет");
    } else {
      score -= 25;
      warnings.push("предмет не в перечне педагога");
    }

    const teachesClass = state.classes.some(
      (c) => c.id === lesson.classId && c.subjects.some((cs) => cs.teacherId === teacher.id || cs.group2TeacherId === teacher.id),
    );
    if (teachesClass) {
      score += 25;
      reasons.push("работает с этим классом");
    }
    if (teacherHomerooms(teacher).includes(lesson.classId)) {
      score += 15;
      reasons.push("классный руководитель");
    }

    const loadToday = dayLessons.length + 1;
    if (teacher.maxLessonsPerDay != null && loadToday > teacher.maxLessonsPerDay) {
      continue;
    }
    score -= loadToday * 4;
    if (loadToday <= 3) {
      score += 8;
      reasons.push("небольшая нагрузка в этот день");
    }

    // окна после подстановки
    const periods = [
      ...dayLessons.map((x) => ({ shift: x.lesson.shift, period: x.lesson.period })),
      { shift: lesson.shift, period: lesson.period },
    ];
    const wr = teacherWindows(periods);
    if (wr.maxRun > state.settings.maxTeacherWindows) {
      warnings.push(`появится ${wr.maxRun} окна подряд`);
      score -= 45 * (wr.maxRun - state.settings.maxTeacherWindows);
      if (wr.maxRun > state.settings.maxTeacherWindows + 1) continue;
    } else if (wr.total > 0) {
      score -= wr.total * 6;
      warnings.push(`добавится окон: ${wr.total}`);
    } else if (dayLessons.length > 0) {
      score += 10;
      reasons.push("урок ложится вплотную к имеющимся");
    }

    candidates.push({
      teacher,
      score,
      reasons: reasons.length ? reasons : ["свободен в это время"],
      warnings,
      loadToday,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.teacher.name.localeCompare(b.teacher.name));
  return candidates;
}

export function createSubstitution(
  lesson: Lesson,
  date: string,
  absentTeacherId: string,
  replacementTeacherId: string | null,
  reason: string,
): Substitution {
  const group = lesson.groups.find((g) => g.teacherId === absentTeacherId);
  if (!group) throw new Error("Педагог не назначен на этот урок");
  return {
    id: `sub_${Math.random().toString(36).slice(2, 9)}`,
    date,
    lessonId: lesson.id,
    classId: lesson.classId,
    day: lesson.day,
    period: lesson.period,
    shift: lesson.shift,
    subjectId: lesson.subjectId,
    roomId: group.roomId,
    originalTeacherId: absentTeacherId,
    replacementTeacherId,
    status: replacementTeacherId ? "replaced" : "cancelled",
    reason: reason || (replacementTeacherId ? "Замена педагога" : lesson.groups.length > 1 ? "Занятие подгруппы отменено" : "Урок отменён"),
    createdAt: new Date().toISOString(),
  };
}

export interface AutoCoverReport {
  date: string;
  absentTeacherId: string;
  covered: Array<{ lesson: Lesson; substitution: Substitution; candidate?: SubstitutionCandidate }>;
  uncovered: Array<{ lesson: Lesson; reason: string }>;
}

/** Автоматическая подстановка замен на весь день для отсутствующего педагога. */
export function autoCoverTeacher(
  state: AppState,
  date: string,
  absentTeacherId: string,
  reason: string,
): AutoCoverReport {
  const day = dayOfWeekFromISO(date);
  const alreadyCovered = new Set(
    state.substitutions.filter((s) => s.date === date && s.originalTeacherId === absentTeacherId).map((s) => s.lessonId),
  );
  const timeline = buildTimeline(state.bells);
  const lessons = state.schedule
    .filter((l) => l.day === day && !alreadyCovered.has(l.id) && l.groups.some((g) => g.teacherId === absentTeacherId))
    .sort((a, b) => startOf(timeline, a) - startOf(timeline, b));

  const covered: AutoCoverReport["covered"] = [];
  const uncovered: AutoCoverReport["uncovered"] = [];
  const working = { ...state };

  for (const lesson of lessons) {
    const candidates = findCandidates(working, { date, lessonId: lesson.id, absentTeacherId });
    const best = candidates[0];
    if (best) {
      const sub = createSubstitution(lesson, date, absentTeacherId, best.teacher.id, reason);
      saveSubstitution(working, sub);
      covered.push({ lesson, substitution: sub, candidate: best });
    } else {
      const sub = createSubstitution(lesson, date, absentTeacherId, null, `${reason} — замена не найдена`);
      saveSubstitution(working, sub);
      uncovered.push({ lesson, reason: "свободных педагогов нет" });
      covered.push({ lesson, substitution: sub });
    }
  }
  return { date, absentTeacherId, covered, uncovered };
}

export function describeLesson(state: AppState, lesson: Lesson): string {
  const cls = state.classes.find((c) => c.id === lesson.classId);
  const subject = state.subjects.find((s) => s.id === lesson.subjectId);
  const timeline = buildTimeline(state.bells);
  const t = timeline.find((x) => x.shift === lesson.shift && x.period === lesson.period);
  const time = t ? toStr(t.start) : "";
  const rooms = lesson.groups
    .map((g) => state.rooms.find((r) => r.id === g.roomId)?.number)
    .filter(Boolean)
    .join(", ");
  return `${cls?.name ?? "?"} · ${subject?.name ?? "?"} · ${time} · каб. ${rooms || "—"}`;
}

function startOf(timeline: ReturnType<typeof buildTimeline>, lesson: Pick<Lesson, "shift" | "period">) {
  return timeline.find((slot) => slot.shift === lesson.shift && slot.period === lesson.period)?.start ?? Number.MAX_SAFE_INTEGER;
}

export function substitutionsForDate(state: AppState, date: string): Substitution[] {
  const timeline = buildTimeline(state.bells);
  return state.substitutions
    .filter((s) => s.date === date)
    .sort((a, b) => startOf(timeline, a) - startOf(timeline, b) || a.classId.localeCompare(b.classId));
}

export function substitutionLabel(state: AppState, sub: Substitution): string {
  if (sub.status === "cancelled") return "урок отменён";
  const t = state.teachers.find((x) => x.id === sub.replacementTeacherId);
  const o = state.teachers.find((x) => x.id === sub.originalTeacherId);
  return `${shortTeacher(o?.name ?? "—")} → ${shortTeacher(t?.name ?? "—")}`;
}

export function shiftStartLabel(state: AppState, shift: 1 | 2): string {
  const bells = state.bells.filter((b) => b.shift === shift).sort((a, b) => a.period - b.period);
  return bells.length ? bells[0].start : "—";
}
