import type { AppState, Day, Lesson, Shift } from "./types";
import { DAY_NAMES } from "./types";
import {
  buildTimeline,
  classWindows,
  isWorkday,
  maxPeriodForClass,
  overlaps,
  shiftsOverlapMinutes,
  suggestShift2Start,
  teacherWindows,
} from "./time";

export type ViolationLevel = "error" | "warn" | "info";

export interface Violation {
  id: string;
  level: ViolationLevel;
  code: string;
  message: string;
  refs: {
    classId?: string;
    teacherId?: string;
    roomId?: string;
    lessonIds?: string[];
    day?: Day;
    period?: number;
  };
}

let counter = 0;
function v(
  level: ViolationLevel,
  code: string,
  message: string,
  refs: Violation["refs"] = {},
): Violation {
  counter += 1;
  return { id: `${code}-${counter}`, level, code, message, refs };
}

function dayName(day: Day) {
  return DAY_NAMES[day] ?? String(day);
}

/** Проверка целостности данных (независимо от расписания). */
export function validateData(state: AppState): Violation[] {
  const out: Violation[] = [];
  const { classes, teachers, subjects, rooms, bells, settings } = state;
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  if (rooms.length === 0) out.push(v("warn", "no-rooms", "В базе нет ни одного кабинета."));
  if (teachers.length === 0) out.push(v("warn", "no-teachers", "В базе нет педагогов."));
  if (classes.length === 0) out.push(v("warn", "no-classes", "В базе нет классов."));
  for (const shift of [1, 2] as Shift[]) {
    const used = classes.some((c) => c.shift === shift);
    if (used && bells.filter((b) => b.shift === shift).length === 0) {
      out.push(v("warn", "no-bells", `Для ${shift}-й смены не задано расписание звонков.`));
    }
  }

  const overlap = shiftsOverlapMinutes(bells);
  if (overlap > 0) {
    out.push(
      v(
        "warn",
        "shift-overlap",
        `Смены пересекаются на ${overlap} мин. Рекомендуется сдвинуть начало 2-й смены на ${suggestShift2Start(
          bells,
          20,
        )}.`,
      ),
    );
  }

  for (const cls of classes) {
    if (!roomById.has(cls.homeRoomId ?? "")) {
      if (cls.homeRoomId) {
        out.push(v("warn", "home-room-missing", `«${cls.name}»: закреплённый кабинет удалён из базы.`, { classId: cls.id }));
      }
    }
    if (cls.workdays.filter((d) => settings.workdays.includes(d)).length === 0) {
      out.push(v("error", "no-workdays", `«${cls.name}»: не выбрано ни одного учебного дня.`, { classId: cls.id }));
    }
    const maxP = maxPeriodForClass(cls, settings, bells);
    const capacity = maxP * cls.workdays.filter((d) => settings.workdays.includes(d)).length;
    const total = cls.subjects.reduce((s, cs) => s + Math.max(0, cs.hoursPerWeek), 0);
    if (total > capacity) {
      out.push(
        v(
          "error",
          "capacity",
          `«${cls.name}»: часов в неделю ${total}, а вместимость сетки ${capacity} (${maxP} уроков × ${cls.workdays.length} дн.). Увеличьте лимит уроков в день или звонки.`,
          { classId: cls.id },
        ),
      );
    }
    for (const cs of cls.subjects) {
      if (cs.hoursPerWeek <= 0) continue;
      const subject = subjectById.get(cs.subjectId);
      if (!subject) {
        out.push(v("error", "subject-missing", `«${cls.name}»: предмет удалён из базы, но остался в нагрузке.`, { classId: cls.id }));
        continue;
      }
      if (!cs.teacherId) {
        out.push(v("warn", "no-teacher", `«${cls.name}» → «${subject.name}»: не назначен педагог.`, { classId: cls.id }));
      } else {
        const t = teacherById.get(cs.teacherId);
        if (!t) {
          out.push(v("warn", "teacher-missing", `«${cls.name}» → «${subject.name}»: педагог удалён из базы.`, { classId: cls.id }));
        } else if (!t.subjectIds.includes(subject.id)) {
          out.push(
            v("info", "teacher-subject", `${t.name} ведёт «${subject.name}» в «${cls.name}», хотя предмет не в перечне педагога.`, {
              classId: cls.id,
              teacherId: t.id,
            }),
          );
        }
      }
      if (cs.groups === 2 && (!cs.group2TeacherId || cs.group2TeacherId === cs.teacherId)) {
        out.push(
          v("warn", "no-group2", `«${cls.name}» → «${subject.name}»: деление на 2 подгруппы требует второго педагога.`, { classId: cls.id }),
        );
      }
      const specId = cs.roomSpecializationId ?? subject.specializationId;
      if (specId && !rooms.some((r) => r.type === "specialized" && r.specializationId === specId)) {
        out.push(
          v("warn", "no-spec-room", `Для предмета «${subject.name}» нет специализированного кабинета — уроки встанут в стандартные.`, { classId: cls.id }),
        );
      }
    }
  }

  const loadByTeacher = new Map<string, number>();
  for (const cls of classes) {
    for (const cs of cls.subjects) {
      if (cs.hoursPerWeek <= 0) continue;
      if (cs.teacherId) loadByTeacher.set(cs.teacherId, (loadByTeacher.get(cs.teacherId) ?? 0) + cs.hoursPerWeek);
      if (cs.groups === 2 && cs.group2TeacherId) {
        loadByTeacher.set(cs.group2TeacherId, (loadByTeacher.get(cs.group2TeacherId) ?? 0) + cs.hoursPerWeek);
      }
    }
  }
  for (const [tid, load] of loadByTeacher) {
    const t = teacherById.get(tid);
    if (!t) continue;
    const days = settings.workdays.length;
    const max = t.maxLessonsPerDay ?? settings.maxLessonsPerDay;
    if (load > max * days) {
      out.push(
        v("error", "teacher-overload", `${t.name}: нагрузка ${load} ч/нед. выше предела ${max * days} ч (${max} уроков × ${days} дн.).`, {
          teacherId: tid,
        }),
      );
    }
    if (t.subjectIds.length === 0) {
      out.push(v("info", "teacher-no-subjects", `${t.name}: не указан перечень предметов.`, { teacherId: tid }));
    }
  }
  return out;
}

/** Проверка готового расписания. */
export function validateSchedule(state: AppState, schedule: Lesson[] = state.schedule): Violation[] {
  const out: Violation[] = [];
  const timeline = buildTimeline(state.bells);
  const classById = new Map(state.classes.map((c) => [c.id, c]));
  const teacherById = new Map(state.teachers.map((t) => [t.id, t]));
  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const iv = (l: Lesson) => {
    const t = timeline.find((x) => x.shift === l.shift && x.period === l.period);
    return t ? { start: t.start, end: t.end } : null;
  };

  if (schedule.length === 0) {
    out.push(v("info", "empty-schedule", "Расписание ещё не составлено. Запустите автогенерацию."));
    return out;
  }

  // 1. Класс: окна, лимиты, учебные дни, пересечения
  const byClassDay = new Map<string, Lesson[]>();
  for (const l of schedule) {
    const k = `${l.classId}|${l.day}`;
    byClassDay.set(k, [...(byClassDay.get(k) ?? []), l]);
  }
  for (const [k, list] of byClassDay) {
    const [classId, dayStr] = k.split("|");
    const day = Number(dayStr) as Day;
    const cls = classById.get(classId);
    if (!cls) continue;
    list.sort((a, b) => a.period - b.period);
    const cw = classWindows(list);
    if (cw.maxRun > 0) {
      out.push(
        v("error", "class-window", `«${cls.name}», ${dayName(day)}: ${cw.total} окон(а) в расписании класса — недопустимо.`, {
          classId,
          day,
          lessonIds: list.map((l) => l.id),
        }),
      );
    }
    const maxP = maxPeriodForClass(cls, state.settings, state.bells);
    const lessonSlots = new Set(list.map((lesson) => `${lesson.shift}:${lesson.period}`));
    if (lessonSlots.size > maxP) {
      out.push(
        v("error", "class-limit", `«${cls.name}», ${dayName(day)}: ${lessonSlots.size} уроков при лимите ${maxP}.`, { classId, day }),
      );
    }
    if (!isWorkday(day, cls, state.settings)) {
      out.push(v("error", "non-workday", `«${cls.name}»: уроки поставлены в неучебный день ${dayName(day)}.`, { classId, day }));
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const first = list[i];
        const second = list[j];
        const a = iv(first);
        const b = iv(second);
        const parallelGroups =
          first.shift === second.shift &&
          first.period === second.period &&
          first.groups.length === 1 &&
          second.groups.length === 1 &&
          new Set([first.groups[0].label, second.groups[0].label]).size === 2 &&
          [first.groups[0].label, second.groups[0].label].every((label) => label === "1 подгруппа" || label === "2 подгруппа");
        if (a && b && overlaps(a.start, a.end, b.start, b.end) && !parallelGroups) {
          out.push(
            v("error", "class-time-clash", `«${cls.name}», ${dayName(day)}: два урока идут в одно время.`, {
              classId,
              day,
              lessonIds: [list[i].id, list[j].id],
            }),
          );
        }
      }
      const subj = subjectById.get(list[i].subjectId);
      const next = list[i + 1];
      if (next && next.subjectId === list[i].subjectId) {
        const sameTeacher = list[i].groups.some((g) => next.groups.some((n) => n.teacherId === g.teacherId));
        if (sameTeacher && !subj?.allowPairs) {
          out.push(
            v("warn", "same-subject-consecutive", `«${cls.name}», ${dayName(day)}: «${subj?.name ?? "?"}» дважды подряд у одного педагога.`, {
              classId,
              day,
              lessonIds: [list[i].id, next.id],
            }),
          );
        } else {
          out.push(
            v("info", "same-subject-day", `«${cls.name}», ${dayName(day)}: «${subj?.name ?? "?"}» два урока в один день.`, { classId, day }),
          );
        }
      }
    }
  }

  // 2. Педагоги: пересечения, окна, недоступные часы, дневной лимит
  const byTeacherDay = new Map<string, Lesson[]>();
  for (const l of schedule) {
    for (const g of l.groups) {
      if (!g.teacherId) continue;
      const k = `${g.teacherId}|${l.day}`;
      byTeacherDay.set(k, [...(byTeacherDay.get(k) ?? []), l]);
    }
  }
  for (const [k, list] of byTeacherDay) {
    const [teacherId, dayStr] = k.split("|");
    const day = Number(dayStr) as Day;
    const t = teacherById.get(teacherId);
    if (!t) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = iv(list[i]);
        const b = iv(list[j]);
        if (a && b && overlaps(a.start, a.end, b.start, b.end)) {
          out.push(
            v("error", "teacher-clash", `${t.name}, ${dayName(day)}: пересечение уроков по времени.`, {
              teacherId,
              day,
              lessonIds: [list[i].id, list[j].id],
            }),
          );
        }
      }
    }
    const wr = teacherWindows(list.map((l) => ({ shift: l.shift, period: l.period })));
    if (wr.maxRun > state.settings.maxTeacherWindows) {
      out.push(
        v("error", "teacher-windows", `${t.name}, ${dayName(day)}: ${wr.maxRun} окон подряд (допустимо не более ${state.settings.maxTeacherWindows}).`, {
          teacherId,
          day,
          lessonIds: list.map((l) => l.id),
        }),
      );
    } else if (wr.total > 0) {
      out.push(
        v("info", "teacher-windows-soft", `${t.name}, ${dayName(day)}: окон за день — ${wr.total}.`, { teacherId, day }),
      );
    }
    if (t.maxLessonsPerDay != null && list.length > t.maxLessonsPerDay) {
      out.push(
        v("warn", "teacher-day-limit", `${t.name}, ${dayName(day)}: ${list.length} уроков при лимите ${t.maxLessonsPerDay}.`, { teacherId, day }),
      );
    }
    for (const l of list) {
      if (t.unavailable.some((u) => u.day === day && u.shift === l.shift && u.period === l.period)) {
        out.push(
          v("error", "teacher-unavailable", `${t.name}: урок в отмеченное как недоступное время (${dayName(day)}, ${l.period} урок).`, {
            teacherId,
            day,
            lessonIds: [l.id],
          }),
        );
      }
      if (!t.subjectIds.includes(l.subjectId)) {
        const subj = subjectById.get(l.subjectId);
        out.push(
          v("warn", "teacher-not-qualified", `${t.name} поставлен урок «${subj?.name ?? "?"}», которого нет в его перечне предметов.`, {
            teacherId,
            day,
            lessonIds: [l.id],
          }),
        );
      }
    }
  }

  // 3. Кабинеты
  const byRoomDay = new Map<string, Lesson[]>();
  for (const l of schedule) {
    for (const g of l.groups) {
      if (!g.roomId) continue;
      const k = `${g.roomId}|${l.day}`;
      byRoomDay.set(k, [...(byRoomDay.get(k) ?? []), l]);
    }
  }
  for (const [k, list] of byRoomDay) {
    const [roomId, dayStr] = k.split("|");
    const day = Number(dayStr) as Day;
    const room = roomById.get(roomId);
    if (!room) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = iv(list[i]);
        const b = iv(list[j]);
        if (a && b && overlaps(a.start, a.end, b.start, b.end)) {
          out.push(
            v("error", "room-clash", `Кабинет ${room.number}, ${dayName(day)}: два урока в одно время.`, {
              roomId,
              day,
              lessonIds: [list[i].id, list[j].id],
            }),
          );
        }
      }
    }
  }

  // 4. Соответствие кабинетов предметам и часы по учебному плану
  const planned = new Map<string, number>();
  for (const cls of state.classes) {
    for (const cs of cls.subjects) {
      if (cs.hoursPerWeek > 0) planned.set(`${cls.id}|${cs.id}`, cs.hoursPerWeek);
    }
  }
  const fact = new Map<string, number>();
  for (const l of schedule) {
    if (!l.classSubjectId) continue;
    const k = `${l.classId}|${l.classSubjectId}`;
    fact.set(k, (fact.get(k) ?? 0) + 1);
    const subject = subjectById.get(l.subjectId);
    const specId = subject?.specializationId ?? null;
    for (const g of l.groups) {
      const room = g.roomId ? roomById.get(g.roomId) : null;
      const cls = classById.get(l.classId);
      if (!room) {
        out.push(
          v("warn", "no-room", `«${cls?.name ?? "?"}», ${dayName(l.day)} ${l.period} урок: кабинет не назначен.`, {
            day: l.day,
            period: l.period,
            lessonIds: [l.id],
          }),
        );
        continue;
      }
      if (specId && room.type === "specialized" && room.specializationId === specId) continue;
      if (specId && room.type === "standard") {
        out.push(
          v("warn", "spec-fallback", `«${cls?.name ?? "?"}», ${dayName(l.day)}: «${subject?.name}» стоит в стандартном кабинете ${room.number} — специализированный был занят.`, {
            roomId: room.id,
            day: l.day,
            lessonIds: [l.id],
          }),
        );
      }
      if (!specId && room.type === "specialized") {
        out.push(
          v("info", "spec-misuse", `«${cls?.name ?? "?"}», ${dayName(l.day)}: «${subject?.name}» занимает специализированный кабинет ${room.number}.`, {
            roomId: room.id,
            day: l.day,
            lessonIds: [l.id],
          }),
        );
      }
      if (specId && room.type === "specialized" && room.specializationId !== specId) {
        out.push(
          v("warn", "spec-wrong", `«${cls?.name ?? "?"}», ${dayName(l.day)}: «${subject?.name}» стоит в кабинете другой специализации (${room.number}).`, {
            roomId: room.id,
            day: l.day,
            lessonIds: [l.id],
          }),
        );
      }
      if (l.groups.length === 2) {
        const rooms = l.groups.map((x) => x.roomId).filter(Boolean);
        if (new Set(rooms).size < rooms.length) {
          out.push(
            v("warn", "group-same-room", `«${cls?.name ?? "?"}», ${dayName(l.day)} ${l.period} урок: обе подгруппы в одном кабинете.`, {
              day: l.day,
              lessonIds: [l.id],
            }),
          );
        }
      }
    }
  }
  for (const [k, hours] of planned) {
    const [classId, csId] = k.split("|");
    const cls = classById.get(classId);
    const cs = cls?.subjects.find((x) => x.id === csId);
    if (!cls || !cs) continue;
    const subject = subjectById.get(cs.subjectId);
    const got = fact.get(k) ?? 0;
    if (got < hours) {
      out.push(
        v("error", "hours-short", `«${cls.name}» → «${subject?.name ?? "?"}»: поставлено ${got} из ${hours} ч/нед.`, {
          classId,
        }),
      );
    } else if (got > hours) {
      out.push(
        v("warn", "hours-extra", `«${cls.name}» → «${subject?.name ?? "?"}»: ${got} уроков вместо ${hours} ч/нед.`, { classId }),
      );
    }
  }

  return out;
}

export function summarize(violations: Violation[]) {
  return {
    errors: violations.filter((x) => x.level === "error").length,
    warnings: violations.filter((x) => x.level === "warn").length,
    info: violations.filter((x) => x.level === "info").length,
  };
}

export function overlapAdvice(state: AppState): { overlap: number; suggested: string } | null {
  const overlap = shiftsOverlapMinutes(state.bells);
  if (overlap <= 0) return null;
  return { overlap, suggested: suggestShift2Start(state.bells, 20) };
}
