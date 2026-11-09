"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { AppState, Day, Substitution } from "@/lib/types";
import { DAY_NAMES } from "@/lib/types";
import { buildTimeline, dayOfWeekFromISO, formatDateISO } from "@/lib/time";
import {
  autoCoverTeacher,
  createSubstitution,
  findCandidates,
  findGroupMerge,
  saveSubstitution,
  substitutionsForDate,
} from "@/lib/substitutions";
import { cn, compareTeacherNames, groupBy, initials, shortTeacher } from "@/lib/utils";
import { Badge, Btn, EmptyState, Field, Icon, Panel, Reveal, Select, Stat } from "@/components/ui";
import { TimetableGrid } from "@/components/Timetable";

export function SubstitutionsView() {
  const { state, update, toast } = useStore();
  const [date, setDate] = useState(() => formatDateISO(new Date()));
  const [absentId, setAbsentId] = useState<string>("");
  const [reason, setReason] = useState("болезнь");
  const [focusLesson, setFocusLesson] = useState<string | null>(null);

  const day = dayOfWeekFromISO(date) as Day;
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const daySubs = useMemo(() => substitutionsForDate(state, date), [state, date]);
  const dayLessons = useMemo(
    () => state.schedule.filter((l) => l.day === day).sort((a, b) => {
      const start = (lesson: typeof a) => timeline.find((t) => t.shift === lesson.shift && t.period === lesson.period)?.start ?? Number.MAX_SAFE_INTEGER;
      return start(a) - start(b);
    }),
    [state.schedule, day, timeline],
  );
  const absentLessons = useMemo(
    () => dayLessons.filter((l) => l.groups.some((g) => g.teacherId === absentId)),
    [absentId, dayLessons],
  );
  const absentSubs = new Map(daySubs.filter((s) => s.originalTeacherId === absentId).map((s) => [s.lessonId, s]));
  const pendingCount = absentLessons.filter((l) => !absentSubs.has(l.id)).length;
  const teacherById = useMemo(() => new Map(state.teachers.map((t) => [t.id, t])), [state.teachers]);
  const sortedTeachers = useMemo(() => state.teachers.toSorted(compareTeacherNames), [state.teachers]);
  const isWorkday = state.settings.workdays.includes(day);

  function timeOf(period: number, shift: 1 | 2) {
    const t = timeline.find((x) => x.shift === shift && x.period === period);
    return t ? `${String(Math.floor(t.start / 60)).padStart(2, "0")}:${String(t.start % 60).padStart(2, "0")}` : "—";
  }

  function applySub(lessonId: string, teacherId: string | null) {
    const lesson = state.schedule.find((l) => l.id === lessonId);
    if (!lesson?.groups.some((g) => g.teacherId === absentId)) return;
    update((draft) => saveSubstitution(draft, createSubstitution(lesson, date, absentId, teacherId, reason)));
    toast(
      teacherId ? "ok" : "info",
      teacherId
        ? `Замена назначена: ${shortTeacher(teacherById.get(teacherId)?.name ?? "")}`
        : lesson.groups.length > 1 ? "Занятие подгруппы отменено" : "Урок отменён",
    );
  }

  function mergeGroups(lessonId: string) {
    const lesson = state.schedule.find((l) => l.id === lessonId);
    if (!lesson) return;
    const merge = findGroupMerge(state, lesson, date, absentId);
    if (!merge) return;
    const substitution = createSubstitution(lesson, date, absentId, merge.teacher.id, reason);
    update((draft) => saveSubstitution(draft, { ...substitution, roomId: merge.roomId, combinedGroups: true }));
    toast("ok", `${shortTeacher(merge.teacher.name)} ведёт обе подгруппы`);
  }

  function removeSub(id: string) {
    update((draft) => {
      draft.substitutions = draft.substitutions.filter((s) => s.id !== id);
    });
    toast("info", "Замена отменена");
  }

  function coverWholeDay() {
    if (!absentId) return;
    const report = autoCoverTeacher(state, date, absentId, reason);
    if (report.covered.length === 0) {
      toast("err", "У этого педагога нет уроков в выбранный день");
      return;
    }
    update((draft) => {
      for (const { substitution } of report.covered) saveSubstitution(draft, substitution);
    });
    toast(
      report.uncovered.length ? "err" : "ok",
      report.uncovered.length
        ? `Подставлено ${report.covered.length - report.uncovered.length}, отменено ${report.uncovered.length} (свободных педагогов нет)`
        : `Автоматически подставлено замен: ${report.covered.length}`,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SubstitutionPrintSheet state={state} date={date} substitutions={daySubs} timeOf={timeOf} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Дата замен"
          value={<span className="text-[19px]">{new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}</span>}
          hint={`${DAY_NAMES[day]}${isWorkday ? "" : " · не учебный день"}`}
          icon="calendar"
          tone="amber"
        />
        <Stat label="Уроков в этот день" value={dayLessons.length} hint="по всей школе" icon="layers" />
        <Stat
          label="Оформлено замен"
          value={daySubs.length}
          hint={`${daySubs.filter((s) => s.status === "replaced").length} с подстановкой · ${daySubs.filter((s) => s.status === "cancelled").length} отменено`}
          icon="swap"
          tone={daySubs.length ? "coral" : "chalk"}
        />
        <Stat
          label="Требуется решений"
          value={pendingCount}
          hint={absentId ? `педагог: ${shortTeacher(teacherById.get(absentId)?.name ?? "")}` : "выберите отсутствующего педагога"}
          icon="alert"
          tone="mint"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Reveal>
          <Panel title="Подстановка замены" subtitle="Программа ищет педагога, свободного в это время и ведущего данный предмет">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-line bg-panel2/80 px-3 py-2 text-sm text-chalk"
                />
              </Field>
              <Field label="Отсутствующий педагог">
                <Select value={absentId} onChange={(e) => setAbsentId(e.target.value)}>
                  <option value="">— выберите —</option>
                  {sortedTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Причина" className="sm:col-span-2">
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {["болезнь", "курсы повышения квалификации", "командировка", "отпуск", "иная причина"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="primary" icon="sparkle" onClick={coverWholeDay} disabled={pendingCount === 0}>
                Подобрать замены на весь день
              </Btn>
              <Btn variant="ghost" icon="printer" onClick={() => window.print()}>
                Лист замен на печать
              </Btn>
            </div>

            {!isWorkday ? (
              <p className="mt-3 rounded-lg border border-amber/35 bg-amber/8 px-3 py-2 text-[12px] text-amber">
                {DAY_NAMES[day]} не входит в учебные дни школы — уроков в этот день нет.
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              {absentId && absentLessons.length === 0 && isWorkday ? (
                <EmptyState icon="check" title="У этого педагога нет уроков в выбранный день" />
              ) : null}
              {!absentId ? (
                <EmptyState
                  icon="swap"
                  title="Выберите отсутствующего педагога"
                  text="Программа покажет его уроки в этот день и предложит кандидатов на замену с оценкой: ведёт ли педагог этот предмет, работает ли с классом, сколько окон появится."
                />
              ) : null}

              {absentLessons.map((lesson) => {
                const sub = absentSubs.get(lesson.id);
                const group = lesson.groups.find((g) => g.teacherId === absentId);
                const grouped = lesson.groups.length > 1;
                const cls = state.classes.find((c) => c.id === lesson.classId);
                const subject = state.subjects.find((s) => s.id === lesson.subjectId);
                const open = focusLesson === lesson.id || !sub;
                const candidates = open ? findCandidates(state, { date, lessonId: lesson.id, absentTeacherId: absentId }) : [];
                const merge = open && !sub?.combinedGroups ? findGroupMerge(state, lesson, date, absentId) : null;
                return (
                  <div
                    key={lesson.id}
                    className={cn(
                      "rise rounded-xl border p-3",
                      sub ? "border-mint/35 bg-mint/6" : "border-line bg-panel2/45",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-bold text-amber tabular">
                        {timeOf(lesson.period, lesson.shift)}
                      </span>
                      <span className="text-[13px] font-semibold text-chalk">
                        {cls?.name} · {subject?.name}
                      </span>
                      <Badge tone="muted">
                        {lesson.shift} смена · урок {lesson.period}
                      </Badge>
                      <span className="text-[11.5px] text-muted">
                        каб.{" "}
                        {state.rooms.find((r) => r.id === group?.roomId)?.number ?? "—"}
                        {group?.label ? ` · ${group.label}` : ""}
                      </span>
                      <button
                        onClick={() => setFocusLesson(open ? null : lesson.id)}
                        className="focus-ring ml-auto rounded p-1 text-dim hover:text-amber"
                      >
                        <Icon name="chevron" className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
                      </button>
                    </div>

                    {sub ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-panel/70 px-3 py-2 text-[12.5px]">
                        <Icon name={sub.status === "cancelled" ? "x" : "check"} className={cn("h-4 w-4", sub.status === "cancelled" ? "text-coral" : "text-mint")} />
                        {sub.status === "cancelled" ? (
                          <span className="text-coral">{grouped ? "Занятие подгруппы отменено" : "Урок отменён"}</span>
                        ) : (
                          <span className="text-mint">
                            {shortTeacher(teacherById.get(sub.originalTeacherId ?? "")?.name ?? "—")} →{" "}
                            <span className="font-semibold text-chalk">
                              {teacherById.get(sub.replacementTeacherId ?? "")?.name ?? "—"}
                            </span>
                          </span>
                        )}
                        {sub.combinedGroups ? <Badge tone="mint">Объединение подгрупп</Badge> : null}
                        <span className="text-dim">· {sub.reason}</span>
                        <Btn size="xs" variant="ghost" className="ml-auto" onClick={() => removeSub(sub.id)}>
                          Отменить
                        </Btn>
                      </div>
                    ) : null}

                    {open ? (
                      <div className="mt-2 grid gap-1.5">
                        {merge ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel/60 px-2.5 py-2">
                            <span className="text-[12.5px] text-chalk">
                              {shortTeacher(merge.teacher.name)} · каб. {state.rooms.find((r) => r.id === merge.roomId)?.number ?? "—"}
                            </span>
                            <Btn size="xs" variant="soft" className="ml-auto" onClick={() => mergeGroups(lesson.id)}>
                              Взять вторую подгруппу
                            </Btn>
                          </div>
                        ) : null}
                        {candidates.length === 0 && !merge ? (
                          <p className="rounded-lg border border-coral/35 bg-coral/8 px-3 py-2 text-[12px] text-coral">
                            Свободных педагогов в это время нет — урок придётся отменить или перенести.
                          </p>
                        ) : (
                          candidates.slice(0, 5).map((c) => (
                            <div
                              key={c.teacher.id}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel/60 px-2.5 py-2 transition-colors hover:border-line2"
                            >
                              <span className="grid h-7 w-7 place-items-center rounded-lg border border-line2 bg-panel2 text-[10.5px] font-bold text-mint">
                                {initials(c.teacher.name)}
                              </span>
                              <span className="text-[12.5px] font-medium text-chalk">{shortTeacher(c.teacher.name)}</span>
                              <span className="flex flex-wrap gap-1">
                                {c.reasons.slice(0, 3).map((r) => (
                                  <Badge key={r} tone="mint">
                                    {r}
                                  </Badge>
                                ))}
                                {c.warnings.slice(0, 2).map((w) => (
                                  <Badge key={w} tone="amber">
                                    {w}
                                  </Badge>
                                ))}
                              </span>
                              <span className="ml-auto flex items-center gap-2">
                                <span className="text-[11px] text-dim tabular">рейтинг {c.score}</span>
                                <Btn size="xs" variant="soft" icon="check" onClick={() => applySub(lesson.id, c.teacher.id)}>
                                  Назначить
                                </Btn>
                              </span>
                            </div>
                          ))
                        )}
                        <Btn size="xs" variant="danger" icon="x" onClick={() => applySub(lesson.id, null)} className="self-start">
                          {grouped ? "Отменить занятие подгруппы" : "Отменить урок"}
                        </Btn>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Panel>
        </Reveal>

        <div className="flex flex-col gap-4">
          <Reveal delay={60}>
            <Panel
              dense
              title={`Лист замен на ${new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}`}
              subtitle={`${DAY_NAMES[day]} · всего оформлено ${daySubs.length}`}
            >
              {daySubs.length === 0 ? (
                <EmptyState icon="info" title="Замен нет" text="Оформленные замены появятся здесь и будут видны в сетке расписания." />
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] tracking-[0.14em] text-dim uppercase">
                      <th className="px-2 py-1.5">Время</th>
                      <th className="px-2 py-1.5">Класс</th>
                      <th className="px-2 py-1.5">Предмет</th>
                      <th className="px-2 py-1.5">Было</th>
                      <th className="px-2 py-1.5">Стало</th>
                      <th className="px-2 py-1.5">Кабинет</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {daySubs.map((s: Substitution) => (
                      <tr key={s.id} className="border-t border-line/70">
                        <td className="px-2 py-1.5 text-amber tabular">{timeOf(s.period, s.shift)}</td>
                        <td className="px-2 py-1.5 text-chalk">{state.classes.find((c) => c.id === s.classId)?.name}</td>
                        <td className="px-2 py-1.5 text-muted">{state.subjects.find((x) => x.id === s.subjectId)?.name}</td>
                        <td className="px-2 py-1.5 text-muted">{shortTeacher(teacherById.get(s.originalTeacherId ?? "")?.name ?? "—")}</td>
                        <td className={cn("px-2 py-1.5", s.status === "cancelled" ? "text-coral" : "text-mint")}>
                          {s.status === "cancelled" ? (state.schedule.find((l) => l.id === s.lessonId)?.groups.length ?? 0) > 1 ? "подгруппа отменена" : "урок отменён" : shortTeacher(teacherById.get(s.replacementTeacherId ?? "")?.name ?? "—")}
                          {s.combinedGroups ? <span className="block text-dim">обе подгруппы</span> : null}
                        </td>
                        <td className="px-2 py-1.5 text-muted">{state.rooms.find((r) => r.id === s.roomId)?.number ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Btn size="xs" variant="ghost" icon="trash" onClick={() => removeSub(s.id)}>
                            <span className="sr-only">Удалить</span>
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </Reveal>

          <Reveal delay={90}>
            <Panel dense title="Сетка дня" subtitle="Замены подсвечиваются в карточках уроков">
              {dayLessons.length === 0 ? (
                <EmptyState icon="calendar" title="В этот день уроков нет" text="Проверьте дату или сгенерируйте расписание." />
              ) : (
                <TimetableGrid
                  state={state}
                  lessons={dayLessons}
                  mode="class"
                  shiftFilter="all"
                  days={[day]}
                  substitutions={daySubs}
                  printable={false}
                />
              )}
            </Panel>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function SubstitutionPrintSheet({ state, date, substitutions, timeOf }: {
  state: AppState;
  date: string;
  substitutions: Substitution[];
  timeOf: (period: number, shift: 1 | 2) => string;
}) {
  const teachers = new Map(state.teachers.map((teacher) => [teacher.id, shortTeacher(teacher.name)]));
  const classes = new Map(state.classes.map((schoolClass) => [schoolClass.id, schoolClass.name]));
  const subjects = new Map(state.subjects.map((subject) => [subject.id, subject.name]));
  const rooms = new Map(state.rooms.map((room) => [room.id, room.number]));
  const lessonById = new Map(state.schedule.map((lesson) => [lesson.id, lesson]));
  const absences = new Map<string, Set<string>>();

  for (const sub of substitutions) {
    if (!sub.originalTeacherId) continue;
    const reasons = absences.get(sub.originalTeacherId) ?? new Set<string>();
    const reason = sub.reason.replace(/ — замена не найдена$/, "").trim();
    if (reason) reasons.add(reason);
    absences.set(sub.originalTeacherId, reasons);
  }

  const classChanges = [...groupBy(substitutions, (sub) => sub.classId)].sort(([a], [b]) =>
    (classes.get(a) ?? a).localeCompare(classes.get(b) ?? b, "ru", { numeric: true }),
  );

  return (
    <section className="print-area substitution-print-sheet" aria-label="Печатный лист замен">
      <header>
        <p>{state.school.name}</p>
        <h1>Лист замен на {new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}</h1>
      </header>

      {absences.size > 0 ? (
        <section className="substitution-print-absences">
          <h2>Отсутствующие педагоги</h2>
          <ul>
            {[...absences].sort(([a], [b]) => (teachers.get(a) ?? "").localeCompare(teachers.get(b) ?? "", "ru")).map(([id, reasons]) => (
              <li key={id}>
                <strong>{teachers.get(id) ?? "Педагог из архива"}</strong>
                {reasons.size ? ` — ${[...reasons].join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {classChanges.length === 0 ? <p>На эту дату изменений нет.</p> : (
        <table>
          <thead>
            <tr>
              <th scope="col">Урок / время</th>
              <th scope="col">Предмет</th>
              <th scope="col">Изменение</th>
              <th scope="col">Кабинет</th>
            </tr>
          </thead>
          {classChanges.map(([classId, changes]) => (
            <tbody key={classId}>
              <tr className="substitution-print-class">
                <th colSpan={4} scope="rowgroup">{classes.get(classId) ?? "Класс из архива"}</th>
              </tr>
              {changes.map((sub) => {
                const lesson = lessonById.get(sub.lessonId ?? "");
                const grouped = (lesson?.groups.length ?? 0) > 1;
                const group = lesson?.groups.find((g) => g.teacherId === sub.originalTeacherId);
                const original = teachers.get(sub.originalTeacherId ?? "");
                return (
                  <tr key={sub.id}>
                    <td>№ {sub.period} · {timeOf(sub.period, sub.shift)}<br />{sub.shift}-я смена</td>
                    <td>{subjects.get(sub.subjectId) ?? "Предмет из архива"}{group?.label ? <><br />{group.label}</> : null}</td>
                    <td>
                      {sub.status === "cancelled" ? (
                        <strong>{grouped ? "Занятие подгруппы отменено" : "Урок отменён"}</strong>
                      ) : (
                        <>
                          <strong>{teachers.get(sub.replacementTeacherId ?? "") ?? "Замена"}</strong>
                          {sub.combinedGroups ? " · обе подгруппы" : ""}
                        </>
                      )}
                      {original ? <><br />{sub.status === "cancelled" ? original : `вместо ${original}`}</> : null}
                    </td>
                    <td>{sub.status === "cancelled" ? "—" : rooms.get(sub.roomId ?? "") ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}
