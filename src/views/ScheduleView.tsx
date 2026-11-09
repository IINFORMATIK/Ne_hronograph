"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, useLookups } from "@/lib/store";
import type { AppState, Day, Lesson, Shift } from "@/lib/types";
import { ALL_DAYS, DAY_NAMES } from "@/lib/types";
import { bellsForShift, buildTimeline, shiftsOverlapMinutes, suggestShift2Start } from "@/lib/time";
import { summarize, validateSchedule } from "@/lib/validate";
import { cn, compareTeacherNames, download, shortTeacher, toCSV } from "@/lib/utils";
import { OverviewGrid, TimetableGrid, type GridMode } from "@/components/Timetable";
import { Badge, Btn, EmptyState, Field, Icon, Modal, Panel, Segmented, Select, Input, Toggle } from "@/components/ui";
import type { ShiftFilter } from "@/lib/time";

export function ScheduleView() {
  const { state, update, toast } = useStore();
  const { classById, teacherById, roomById, subjectById } = useLookups();
  const [mode, setMode] = useState<"class" | "teacher" | "room" | "overview">("class");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>(state.settings.defaultShiftFilter);
  const [classId, setClassId] = useState<string>(state.classes[0]?.id ?? "");
  const sortedTeachers = useMemo(() => state.teachers.toSorted(compareTeacherNames), [state.teachers]);
  const [teacherId, setTeacherId] = useState<string>(sortedTeachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState<string>(state.rooms[0]?.id ?? "");
  const [day, setDay] = useState<Day>(1);
  const [editing, setEditing] = useState<Lesson | "new" | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  const days = useMemo(
    () =>
      (mode === "class" && classById.get(classId)
        ? classById.get(classId)!.workdays.filter((d) => state.settings.workdays.includes(d))
        : state.settings.workdays
      ).slice().sort((a, b) => a - b) as Day[],
    [mode, classId, classById, state.settings.workdays],
  );

  const lessons = useMemo(() => {
    if (mode === "class") return state.schedule.filter((l) => l.classId === classId);
    if (mode === "teacher")
      return state.schedule.filter((l) => l.groups.some((g) => g.teacherId === teacherId));
    if (mode === "room")
      return state.schedule.filter((l) => l.groups.some((g) => g.roomId === roomId));
    return state.schedule;
  }, [mode, state.schedule, classId, teacherId, roomId]);

  const visibleSubjectIds = new Set(
    lessons
      .filter((lesson) =>
        (shiftFilter === "all" || lesson.shift === shiftFilter) &&
        (mode === "overview" ? lesson.day === day : (days.length ? days : state.settings.workdays).includes(lesson.day)),
      )
      .map((lesson) => lesson.subjectId),
  );
  const legendSubjects = showAllSubjects
    ? state.subjects
    : state.subjects.filter((subject) => visibleSubjectIds.has(subject.id));

  const violations = useMemo(() => validateSchedule(state), [state]);
  const summary = summarize(violations);
  const overlap = shiftsOverlapMinutes(state.bells);

  const targetTitle =
    mode === "class"
      ? (classById.get(classId)?.name ?? "—")
      : mode === "teacher"
        ? (teacherById.get(teacherId)?.name ?? "—")
        : mode === "room"
          ? `Кабинет ${roomById.get(roomId)?.number ?? "—"}`
          : "Сводка по школе";

  const targetCaption =
    mode === "class"
      ? `${classById.get(classId)?.shift ?? 1}-я смена · ${lessons.length} уроков в неделю · ${
          classById.get(classId)?.homeRoomId
            ? `основной кабинет ${roomById.get(classById.get(classId)!.homeRoomId!)?.number ?? "—"}`
            : "основной кабинет не закреплён"
        }`
      : mode === "teacher"
        ? `${lessons.length} уроков в неделю · ${teacherById.get(teacherId)?.subjectIds.length ?? 0} предметов`
        : mode === "room"
          ? `${roomById.get(roomId)?.type === "specialized" ? "специализированный" : "стандартный"} кабинет · ${lessons.length} уроков в неделю`
          : `${DAY_NAMES[day]} · все классы`;

  function moveLesson(lessonId: string, targetDay: Day, targetPeriod: number, targetShift: Shift) {
    const lesson = state.schedule.find((l) => l.id === lessonId);
    if (!lesson) return;
    if (targetShift !== lesson.shift) {
      toast("err", `Класс учится в ${lesson.shift}-й смене — перенос в строку другой смены невозможен`);
      return;
    }
    if (lesson.locked) {
      toast("err", "Урок закреплён — сначала снимите закрепление");
      return;
    }
    update((draft) => {
      const occupant = draft.schedule.find(
        (l) => l.classId === lesson.classId && l.day === targetDay && l.period === targetPeriod,
      );
      if (occupant && occupant.id !== lesson.id) {
        const a = { day: lesson.day, period: lesson.period };
        occupant.day = lesson.day;
        occupant.period = lesson.period;
        const target = draft.schedule.find((l) => l.id === lessonId)!;
        target.day = targetDay;
        target.period = targetPeriod;
        void a;
      } else {
        const target = draft.schedule.find((l) => l.id === lessonId)!;
        target.day = targetDay;
        target.period = targetPeriod;
      }
    });
    toast("info", "Урок перенесён — проверьте панель контроля");
  }

  function saveLesson(next: Lesson) {
    update((draft) => {
      const idx = draft.schedule.findIndex((l) => l.id === next.id);
      if (idx >= 0) draft.schedule[idx] = next;
      else draft.schedule.push(next);
    });
    setEditing(null);
    toast("ok", "Урок сохранён");
  }

  function deleteLesson(id: string) {
    update((draft) => {
      draft.schedule = draft.schedule.filter((l) => l.id !== id);
    });
    setEditing(null);
    toast("info", "Урок удалён из расписания");
  }

  function exportCSV() {
    if (lessons.length === 0) {
      toast("err", "Нет уроков для выгрузки");
      return;
    }
    const tl = buildTimeline(state.bells);
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const rows = lessons
      .slice()
      .sort((a, b) => a.day - b.day || a.period - b.period)
      .map((l) => {
        const t = tl.find((x) => x.shift === l.shift && x.period === l.period);
        return {
          "День": DAY_NAMES[l.day],
          "Смена": l.shift,
          "Номер урока": l.period,
          "Время": t ? `${fmt(t.start)}-${fmt(t.end)}` : "",
          "Класс": classById.get(l.classId)?.name ?? "",
          "Предмет": subjectById.get(l.subjectId)?.name ?? "",
          "Педагог": l.groups
            .map((g) => shortTeacher(teacherById.get(g.teacherId ?? "")?.name ?? ""))
            .filter(Boolean)
            .join(", "),
          "Кабинет": l.groups
            .map((g) => roomById.get(g.roomId ?? "")?.number ?? "")
            .filter(Boolean)
            .join(", "),
          "Подгруппы": l.groups
            .map((g) => g.label)
            .filter(Boolean)
            .join(", "),
          "Закреплён": l.locked ? "да" : "",
        };
      });
    download(
      `${(targetTitle || "raspisanie").replace(/[^\w\dА-Яа-яЁё]+/g, "_")}.csv`,
      `\uFEFF${toCSV(rows)}`,
      "text/csv",
    );
    toast("ok", `Выгружено уроков: ${rows.length}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel dense>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: "class", label: "По классу", icon: "layers" },
                { value: "teacher", label: "По педагогу", icon: "users" },
                { value: "room", label: "По кабинету", icon: "door" },
                { value: "overview", label: "Сводка", icon: "grid" },
              ]}
            />
            <Segmented
              value={shiftFilter}
              onChange={(v) => setShiftFilter(v)}
              options={[
                { value: "all", label: "Обе смены" },
                { value: 1, label: "1 смена" },
                { value: 2, label: "2 смена" },
              ]}
            />
          </div>
          {mode === "class" ? (
            <Field label="Класс" className="w-[190px]">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {state.classes.length === 0 && <option value="">— нет классов —</option>}
                {state.classes
                  .slice()
                  .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.shift} смена)
                    </option>
                  ))}
              </Select>
            </Field>
          ) : null}
          {mode === "teacher" ? (
            <Field label="Педагог" className="w-[280px]">
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                {sortedTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "room" ? (
            <Field label="Кабинет" className="w-[280px]">
              <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {state.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} ({r.type === "specialized" ? "специализированный" : "стандартный"})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === "overview" ? (
            <Field label="День недели" className="w-[200px]">
              <Select value={String(day)} onChange={(e) => setDay(Number(e.target.value) as Day)}>
                {state.settings.workdays.map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES[d]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            onClick={() => setShowReport(true)}
            className={cn(
              "focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
              summary.errors
                ? "border-coral/50 bg-coral/12 text-coral hover:bg-coral/20"
                : summary.warnings
                  ? "border-amber/50 bg-amber/12 text-amber hover:bg-amber/20"
                  : "border-mint/45 bg-mint/12 text-mint hover:bg-mint/20",
            )}
          >
            <Icon name={summary.errors ? "alert" : "check"} className="h-4 w-4" />
            Контроль: {summary.errors} ошибок, {summary.warnings} предупреждений
          </button>
          <Btn
            size="sm"
            icon="plus"
            variant="primary"
            onClick={() => {
              if (state.classes.length === 0) {
                toast("err", "Сначала добавьте классы в базу");
                return;
              }
              setEditing("new");
            }}
          >
            Добавить урок
          </Btn>
          <Btn
            size="sm"
            variant="danger"
            icon="trash"
            onClick={() => {
              if (!confirm("Очистить всё расписание? Действие можно отменить (Ctrl+Z).")) return;
              update((draft) => {
                draft.schedule = [];
              });
              toast("info", "Расписание очищено");
            }}
          >
            Очистить
          </Btn>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" icon="tag" onClick={() => setShowLegend((v) => !v)}>
              {showLegend ? "Скрыть легенду" : "Легенда"}
            </Btn>
            <Btn size="sm" variant="ghost" icon="download" onClick={exportCSV}>
              CSV
            </Btn>
            <Btn size="sm" variant="ghost" icon="printer" onClick={() => window.print()}>
              Печать
            </Btn>
          </div>
        </div>
      </Panel>

      {overlap > 0 ? (
        <div className="rise flex flex-wrap items-center gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[12.5px] text-amber">
          <Icon name="alert" className="h-4 w-4" />
          <span>
            Смены пересекаются на {overlap} мин — кабинеты и педагоги 1-й и 2-й смены конфликтуют по
            времени. Рекомендуется начать 2-ю смену в {suggestShift2Start(state.bells, 20)}.
          </span>
          <Btn
            size="xs"
            variant="soft"
            onClick={() => {
              const suggested = suggestShift2Start(state.bells, 20);
              update((draft) => {
                const first = bellsForShift(draft.bells, 2)[0];
                if (!first) return;
                const delta =
                  Number(suggested.slice(0, 2)) * 60 +
                  Number(suggested.slice(3)) -
                  (Number(first.start.slice(0, 2)) * 60 + Number(first.start.slice(3)));
                draft.bells = draft.bells.map((b) => {
                  if (b.shift !== 2) return b;
                  const s = Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3)) + delta;
                  const e = Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3)) + delta;
                  return {
                    ...b,
                    start: `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
                    end: `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`,
                  };
                });
                draft.settings.shift2Start = suggested;
              });
              toast("ok", `Вторая смена сдвинута на ${suggested}`);
            }}
          >
            Сдвинуть 2-ю смену
          </Btn>
        </div>
      ) : null}

      <Panel dense className="min-h-[420px]">
        {state.schedule.length === 0 ? (
          <EmptyState
            icon="wand"
            title="Расписание пустое"
            text="Заполните базу данных (классы, педагоги, предметы, кабинеты, звонки) и запустите автоматическую генерацию — либо добавьте уроки вручную."
            action={
              <div className="flex gap-2">
                <Btn variant="primary" icon="wand" onClick={() => setEditing("new")}>
                  Добавить урок вручную
                </Btn>
              </div>
            }
          />
        ) : mode === "overview" ? (
          <OverviewGrid
            state={state}
            day={day}
            shiftFilter={shiftFilter}
            onSelect={(l) => setEditing(l)}
          />
        ) : (
          <TimetableGrid
            state={state}
            lessons={lessons}
            mode={mode as GridMode}
            shiftFilter={shiftFilter}
            days={days.length ? days : state.settings.workdays}
            selectedId={null}
            onSelect={(l) => setEditing(l)}
            onDropLesson={moveLesson}
            title={targetTitle}
            caption={targetCaption}
          />
        )}

        {showLegend && state.subjects.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
            {legendSubjects.length === 0 && (
              <span className="px-1 py-1 text-xs text-muted">В этой сетке пока нет предметов.</span>
            )}
            {legendSubjects.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel2/50 px-2 py-1 text-[11px] text-muted"
              >
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
                {s.name}
                {s.specializationId ? <Icon name="pin" className="h-3 w-3 text-dim" /> : null}
              </span>
            ))}
            {visibleSubjectIds.size < state.subjects.length && (
              <Btn size="xs" variant="ghost" onClick={() => setShowAllSubjects((value) => !value)}>
                {showAllSubjects ? "Только предметы в сетке" : "Все предметы"}
              </Btn>
            )}
          </div>
        ) : null}
      </Panel>

      <LessonEditor
        state={state}
        target={editing}
        defaultClassId={classId}
        onClose={() => setEditing(null)}
        onSave={saveLesson}
        onDelete={deleteLesson}
      />

      <Modal
        open={showReport}
        onClose={() => setShowReport(false)}
        title="Контроль расписания"
        subtitle={`Ошибок: ${summary.errors} · предупреждений: ${summary.warnings} · заметок: ${summary.info}`}
        width="lg"
      >
        {violations.length === 0 ? (
          <EmptyState icon="check" title="Нарушений не найдено" text="Расписание соответствует всем жёстким ограничениям." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {violations.map((v) => (
              <li
                key={v.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]",
                  v.level === "error" && "border-coral/40 bg-coral/8 text-coral",
                  v.level === "warn" && "border-amber/35 bg-amber/8 text-amber",
                  v.level === "info" && "border-line bg-panel2/50 text-muted",
                )}
              >
                <Icon
                  name={v.level === "error" ? "alert" : v.level === "warn" ? "info" : "info"}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span className="flex-1 leading-snug">{v.message}</span>
                <Badge tone="muted">{v.code}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Редактор урока                                                      */
/* ------------------------------------------------------------------ */

function LessonEditor({
  state,
  target,
  defaultClassId,
  onClose,
  onSave,
  onDelete,
}: {
  state: AppState;
  target: Lesson | "new" | null;
  defaultClassId: string;
  onClose: () => void;
  onSave: (l: Lesson) => void;
  onDelete: (id: string) => void;
}) {
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const openTarget = target === "new" ? null : target;

  useEffect(() => {
    if (target === "new") {
      const cls = state.classes.find((c) => c.id === defaultClassId) ?? state.classes[0];
      const shift = (cls?.shift ?? 1) as Shift;
      const bells = bellsForShift(state.bells, shift);
      const firstDay = state.settings.workdays[0] ?? 1;
      const used = new Set(
        state.schedule.filter((l) => l.classId === cls?.id && l.day === firstDay).map((l) => l.period),
      );
      let period = 1;
      while (used.has(period) && period <= bells.length) period++;
      setDraft({
        id: `lsn_${Math.random().toString(36).slice(2, 9)}`,
        classId: cls?.id ?? "",
        day: firstDay,
        shift,
        period: Math.min(period, Math.max(1, bells.length)),
        subjectId: cls?.subjects[0]?.subjectId ?? state.subjects[0]?.id ?? "",
        groups: [{ teacherId: cls?.subjects[0]?.teacherId ?? null, roomId: cls?.homeRoomId ?? null }],
        locked: false,
      });
    } else if (target) {
      setDraft(JSON.parse(JSON.stringify(target)) as Lesson);
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const sortedTeachers = useMemo(() => state.teachers.toSorted(compareTeacherNames), [state.teachers]);

  if (!target || !draft) return null;
  const cls = state.classes.find((c) => c.id === draft.classId);
  const subject = state.subjects.find((s) => s.id === draft.subjectId);
  const bells = bellsForShift(state.bells, draft.shift);

  const setGroup = (idx: number, patch: Partial<Lesson["groups"][number]>) => {
    const groups = draft.groups.slice();
    while (groups.length <= idx) groups.push({ teacherId: null, roomId: null });
    groups[idx] = { ...groups[idx], ...patch };
    setDraft({ ...draft, groups });
  };

  const globalNum =
    timeline.find((t) => t.shift === draft.shift && t.period === draft.period)?.globalIndex ?? draft.period;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={openTarget ? "Редактирование урока" : "Новый урок"}
      subtitle={
        cls
          ? `${cls.name} · ${DAY_NAMES[draft.day]} · сквозной номер ${globalNum} (${draft.shift}-я смена, урок ${draft.period})`
          : undefined
      }
      width="lg"
      footer={
        <>
          {openTarget ? (
            <Btn variant="danger" icon="trash" onClick={() => onDelete(draft.id)}>
              Удалить урок
            </Btn>
          ) : null}
          <Btn variant="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn
            variant="primary"
            icon="check"
            onClick={() => onSave(draft)}
            disabled={!draft.classId || !draft.subjectId}
          >
            Сохранить
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Класс">
          <Select
            value={draft.classId}
            onChange={(e) => {
              const next = state.classes.find((c) => c.id === e.target.value);
              setDraft({ ...draft, classId: e.target.value, shift: (next?.shift ?? 1) as Shift, period: 1 });
            }}
          >
            {state.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.shift} смена)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Предмет">
          <Select
            value={draft.subjectId}
            onChange={(e) => {
              const cs = cls?.subjects.find((x) => x.subjectId === e.target.value);
              setDraft({
                ...draft,
                subjectId: e.target.value,
                classSubjectId: cs?.id ?? draft.classSubjectId,
                groups: cs
                  ? [
                      { teacherId: cs.teacherId, roomId: draft.groups[0]?.roomId ?? cls?.homeRoomId ?? null },
                      ...(cs.groups === 2
                        ? [{ teacherId: cs.group2TeacherId, roomId: null, label: "2 подгруппа" }]
                        : []),
                    ]
                  : draft.groups,
              });
            }}
          >
            {(cls?.subjects.length ? cls.subjects.map((cs) => cs.subjectId) : state.subjects.map((s) => s.id))
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .map((sid) => (
                <option key={sid} value={sid}>
                  {state.subjects.find((s) => s.id === sid)?.name ?? sid}
                </option>
              ))}
            {cls?.subjects.length ? null : null}
          </Select>
        </Field>
        <Field label="День недели">
          <Select
            value={String(draft.day)}
            onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) as Day })}
          >
            {ALL_DAYS.filter((d) => state.settings.workdays.includes(d)).map((d) => (
              <option key={d} value={d}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Номер урока (в смене)">
          <Select
            value={String(draft.period)}
            onChange={(e) => setDraft({ ...draft, period: Number(e.target.value) })}
          >
            {bells.map((b) => (
              <option key={b.period} value={b.period}>
                {b.period} · {b.start}–{b.end}
              </option>
            ))}
          </Select>
        </Field>

        {draft.groups.map((g, idx) => (
          <div key={idx} className="sm:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
                {draft.groups.length > 1 ? `${idx + 1}-я подгруппа` : "Весь класс"}
              </span>
              {subject?.specializationId ? (
                <Badge tone="sky">
                  нужен кабинет:{" "}
                  {state.specializations.find((s) => s.id === subject.specializationId)?.name}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Педагог">
                <Select value={g.teacherId ?? ""} onChange={(e) => setGroup(idx, { teacherId: e.target.value || null })}>
                  <option value="">— не назначен —</option>
                  {sortedTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.subjectIds.includes(draft.subjectId) ? "" : " (не его предмет)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Кабинет">
                <Select value={g.roomId ?? ""} onChange={(e) => setGroup(idx, { roomId: e.target.value || null })}>
                  <option value="">— без кабинета —</option>
                  {state.rooms
                    .slice()
                    .sort((a, b) => {
                      const spec = subject?.specializationId;
                      const aw = spec && a.specializationId === spec ? 0 : a.type === "standard" ? 1 : 2;
                      const bw = spec && b.specializationId === spec ? 0 : b.type === "standard" ? 1 : 2;
                      return aw - bw || a.number.localeCompare(b.number);
                    })
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.number}
                        {r.type === "specialized"
                          ? ` · ${state.specializations.find((s) => s.id === r.specializationId)?.name ?? "спец."}`
                          : " · стандартный"}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </div>
        ))}

        <div className="sm:col-span-2">
          <Field label="Подгруппы">
            <Segmented
              value={String(draft.groups.length)}
              onChange={(v) => {
                const n = Number(v);
                const groups = draft.groups.slice(0, Math.max(1, n));
                while (groups.length < n) groups.push({ teacherId: null, roomId: null, label: `${groups.length + 1} подгруппа` });
                if (n === 1) groups[0] = { ...groups[0], label: undefined };
                setDraft({ ...draft, groups });
              }}
              options={[
                { value: "1", label: "Весь класс" },
                { value: "2", label: "2 подгруппы" },
              ]}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Примечание">
            <Input
              value={draft.note ?? ""}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Например: урок в музее, деление по уровню…"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Toggle
            checked={!!draft.locked}
            onChange={(v) => setDraft({ ...draft, locked: v })}
            label="Закрепить урок"
            hint="Закреплённые уроки не перемещаются при автоматической генерации"
          />
        </div>
      </div>
    </Modal>
  );
}
