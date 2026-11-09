"use client";

import { useMemo, useState } from "react";
import { useStore, useLookups } from "@/lib/store";
import type { AppState, Day, Teacher } from "@/lib/types";
import { DAY_SHORT } from "@/lib/types";
import { buildTimeline, key, teacherWindows } from "@/lib/time";
import { cn, compareTeacherNames, initials, plural, shortTeacher, teacherHomerooms, uid } from "@/lib/utils";
import { Badge, Btn, ColorDot, EmptyState, Field, Icon, Input, Modal, Panel, Reveal, SearchInput, Select, Stat } from "@/components/ui";

export function TeachersView() {
  const { state, update, toast } = useStore();
  const { teacherLoad, lessonsOfTeacher } = useLookups();
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.teachers
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .sort(compareTeacherNames);
  }, [state.teachers, query]);

  function blank(): Teacher {
    return {
      id: uid("tch"),
      name: "Новый педагог",
      homeroomClassIds: [],
      subjectIds: [],
      maxLessonsPerDay: null,
      unavailable: [],
    };
  }

  function save(t: Teacher) {
    update((draft) => {
      const idx = draft.teachers.findIndex((x) => x.id === t.id);
      if (idx >= 0) draft.teachers[idx] = t;
      else draft.teachers.push(t);
    });
    setEditing(null);
    toast("ok", isNew ? "Педагог добавлен" : "Данные педагога сохранены");
  }

  function remove(id: string) {
    const t = state.teachers.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Удалить педагога «${t.name}»? Назначения в классах останутся пустыми.`)) return;
    update((draft) => {
      draft.teachers = draft.teachers.filter((x) => x.id !== id);
      for (const c of draft.classes) {
        for (const cs of c.subjects) {
          if (cs.teacherId === id) cs.teacherId = null;
          if (cs.group2TeacherId === id) cs.group2TeacherId = null;
        }
      }
    });
    toast("info", "Педагог удалён");
  }

  const totalLoad = state.teachers.reduce((s, t) => s + teacherLoad(t.id), 0);
  const avg = state.teachers.length ? (totalLoad / state.teachers.length).toFixed(1) : "0";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Педагогов" value={state.teachers.length} hint={`${state.teachers.filter((t) => teacherHomerooms(t).length > 0).length} классных руководителей`} icon="users" tone="sky" />
        <Stat label="Суммарная нагрузка" value={totalLoad} hint="часов в неделю по учебному плану" icon="clock" tone="amber" />
        <Stat label="Средняя нагрузка" value={avg} hint="часов в неделю на педагога" icon="layers" tone="mint" />
        <Stat
          label="С ограничениями"
          value={state.teachers.filter((t) => t.maxLessonsPerDay != null || t.unavailable.length > 0).length}
          hint="недоступные часы и лимит уроков в день"
          icon="sliders"
        />
      </div>

      <Panel
        dense
        title="Педагоги"
        subtitle="Перечень предметов, связь с классами, ограничения по дням и часам"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск педагога…" className="w-[220px]" />
            <Btn variant="primary" icon="plus" onClick={() => { setEditing(blank()); setIsNew(true); }}>
              Добавить педагога
            </Btn>
          </>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title="Педагогов пока нет"
            text="Добавьте педагогов, укажите предметы, которые они ведут, и классное руководство."
            action={
              <Btn variant="primary" icon="plus" onClick={() => { setEditing(blank()); setIsNew(true); }}>
                Добавить педагога
              </Btn>
            }
          />
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t, i) => {
              const load = teacherLoad(t.id);
              const lessons = lessonsOfTeacher(t.id);
              const classes = state.classes.filter((c) =>
                c.subjects.some((cs) => cs.teacherId === t.id || cs.group2TeacherId === t.id),
              );
              const homeroomIds = teacherHomerooms(t);
              const homerooms = state.classes.filter((c) => homeroomIds.includes(c.id)).map((c) => c.name);
              const dayMap = new Map<number, Array<{ shift: 1 | 2; period: number }>>();
              for (const l of lessons) {
                dayMap.set(l.day, [...(dayMap.get(l.day) ?? []), { shift: l.shift, period: l.period }]);
              }
              const totalWindows = Array.from(dayMap.values()).reduce((s, list) => s + teacherWindows(list).total, 0);
              return (
                <Reveal key={t.id} delay={i * 25}>
                  <li className="card-hover group flex h-full flex-col rounded-[14px] border border-line bg-panel2/40 p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line2 bg-panel text-[13px] font-bold text-mint">
                        {initials(t.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-chalk">{t.name}</p>
                        <p className="mt-0.5 text-[11.5px] text-dim">
                          {homerooms.length ? `классный руководитель ${homerooms.join(", ")}` : `ведёт ${classes.length} ${plural(classes.length, "класс", "класса", "классов")}`}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <Btn size="xs" variant="ghost" icon="pencil" onClick={() => { setEditing(JSON.parse(JSON.stringify(t))); setIsNew(false); }}>
                          <span className="sr-only">Изменить</span>
                        </Btn>
                        <Btn size="xs" variant="ghost" icon="trash" onClick={() => remove(t.id)}>
                          <span className="sr-only">Удалить</span>
                        </Btn>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {t.subjectIds.map((sid) => {
                        const s = state.subjects.find((x) => x.id === sid);
                        if (!s) return null;
                        return (
                          <span key={sid} className="inline-flex items-center gap-1 rounded border border-line bg-panel/60 px-1.5 py-0.5 text-[10.5px] text-muted">
                            <ColorDot color={s.color} size={7} />
                            {s.short ?? s.name}
                          </span>
                        );
                      })}
                      {t.subjectIds.length === 0 ? (
                        <span className="text-[11px] text-dim">предметы не указаны</span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11.5px]">
                      <Badge tone="amber">{load} ч/нед</Badge>
                      <Badge tone="muted">{lessons.length} уроков в сетке</Badge>
                      {t.maxLessonsPerDay != null ? <Badge tone="sky">до {t.maxLessonsPerDay}/день</Badge> : null}
                      {t.unavailable.length ? <Badge tone="coral">занято {t.unavailable.length} слотов</Badge> : null}
                      {totalWindows > 0 ? <Badge tone="mint">окон: {totalWindows}</Badge> : null}
                    </div>
                  </li>
                </Reveal>
              );
            })}
          </ul>
        )}
      </Panel>

      {editing ? (
        <TeacherEditor
          key={editing.id}
          teacher={editing}
          state={state}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function TeacherEditor({
  teacher,
  state,
  onClose,
  onSave,
}: {
  teacher: Teacher;
  state: AppState;
  onClose: () => void;
  onSave: (t: Teacher) => void;
}) {
  const [draft, setDraft] = useState<Teacher>(() => {
    const normalized = { ...teacher, homeroomClassIds: teacherHomerooms(teacher) };
    delete normalized.homeroomClassId;
    return normalized;
  });
  const homeroomIds = teacherHomerooms(draft);
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const patch = (p: Partial<Teacher>) => setDraft((d) => ({ ...d, ...p }));

  const classes = state.classes.filter((c) =>
    c.subjects.some((cs) => cs.teacherId === draft.id || cs.group2TeacherId === draft.id),
  );
  const load = classes.reduce(
    (sum, c) =>
      sum +
      c.subjects.reduce(
        (s, cs) => s + (cs.teacherId === draft.id || cs.group2TeacherId === draft.id ? cs.hoursPerWeek : 0),
        0,
      ),
    0,
  );

  const days = state.settings.workdays;

  function toggleUnavailable(day: Day, shift: 1 | 2, period: number) {
    const exists = draft.unavailable.some((u) => u.day === day && u.shift === shift && u.period === period);
    patch({
      unavailable: exists
        ? draft.unavailable.filter((u) => !(u.day === day && u.shift === shift && u.period === period))
        : [...draft.unavailable, { day, shift, period }],
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="xl"
      title={teacher.name === "Новый педагог" ? "Новый педагог" : draft.name}
      subtitle={`Нагрузка по учебному плану: ${load} ч/нед · классов: ${classes.length}`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn variant="primary" icon="check" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>
            Сохранить
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ФИО">
          <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Классное руководство" hint="Можно выбрать несколько классов">
          <Select aria-label="Добавить классное руководство" value="" onChange={(e) => {
            if (e.target.value) patch({ homeroomClassIds: [...homeroomIds, e.target.value] });
          }}>
            <option value="">— добавить класс —</option>
            {state.classes.filter((c) => !homeroomIds.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {homeroomIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {state.classes.filter((c) => homeroomIds.includes(c.id)).map((c) => (
                <Btn key={c.id} size="xs" variant="soft" icon="x" aria-label={`Снять классное руководство ${c.name}`}
                  onClick={() => patch({ homeroomClassIds: homeroomIds.filter((id) => id !== c.id) })}>
                  {c.name}
                </Btn>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label="Максимум уроков в день" hint="Пусто — действует общий лимит школы">
          <Input
            type="number"
            min={0}
            max={10}
            value={draft.maxLessonsPerDay ?? ""}
            onChange={(e) => patch({ maxLessonsPerDay: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="без ограничения"
          />
        </Field>
        <Field label="Заметка">
          <Input value={draft.note ?? ""} onChange={(e) => patch({ note: e.target.value })} placeholder="Например: методический день — среда" />
        </Field>
      </div>

      <div className="mt-4">
        <p className="font-display mb-2 text-[11px] font-semibold tracking-[0.2em] text-dim uppercase">
          Предметы, которые ведёт педагог
        </p>
        <div className="flex flex-wrap gap-1.5">
          {state.subjects.map((s) => {
            const active = draft.subjectIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  patch({
                    subjectIds: active ? draft.subjectIds.filter((x) => x !== s.id) : [...draft.subjectIds, s.id],
                  })
                }
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all",
                  active
                    ? "border-mint/50 bg-mint/12 text-mint"
                    : "border-line bg-panel2/50 text-muted hover:border-line2 hover:text-chalk",
                )}
              >
                <ColorDot color={s.color} size={8} />
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <p className="font-display mb-1 text-[11px] font-semibold tracking-[0.2em] text-dim uppercase">
          Недоступные часы (методические окна, отсутствие)
        </p>
        <p className="mb-2 text-[11.5px] text-dim">
          Клик по клетке запрещает ставить урок в это время. Нумерация уроков сквозная.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-[11.5px]">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] tracking-[0.14em] text-dim uppercase">Урок</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-1.5 text-[11px] text-muted">
                    {DAY_SHORT[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeline.map((t) => (
                <tr key={key(t.shift, t.period)}>
                  <td className="px-2 py-0.5 text-muted tabular">
                    <span className="font-display font-bold text-amber">{t.globalIndex}</span>
                    <span className="ml-1.5 text-[10px] text-dim">
                      {String(Math.floor(t.start / 60)).padStart(2, "0")}:{String(t.start % 60).padStart(2, "0")} · {t.shift} см.
                    </span>
                  </td>
                  {days.map((d) => {
                    const blocked = draft.unavailable.some(
                      (u) => u.day === d && u.shift === t.shift && u.period === t.period,
                    );
                    return (
                      <td key={d} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleUnavailable(d, t.shift, t.period)}
                          className={cn(
                            "focus-ring h-7 w-full rounded border transition-colors",
                            blocked
                              ? "border-coral/50 bg-coral/25 text-coral"
                              : "border-line bg-panel2/50 text-dim hover:border-line2 hover:text-muted",
                          )}
                          title={`${DAY_SHORT[d]}, ${t.globalIndex} урок`}
                        >
                          {blocked ? <Icon name="x" className="mx-auto h-3 w-3" /> : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {draft.unavailable.length ? (
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="coral">запрещено слотов: {draft.unavailable.length}</Badge>
            <Btn size="xs" variant="ghost" icon="x" onClick={() => patch({ unavailable: [] })}>
              Очистить
            </Btn>
          </div>
        ) : null}
      </div>

      {classes.length ? (
        <div className="mt-4">
          <p className="font-display mb-2 text-[11px] font-semibold tracking-[0.2em] text-dim uppercase">
            Связь с классами
          </p>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((c) => (
              <Badge key={c.id} tone={homeroomIds.includes(c.id) ? "amber" : "muted"}>
                {c.name}
                {homeroomIds.includes(c.id) ? " · кл. рук." : ""} ·{" "}
                {c.subjects
                  .filter((cs) => cs.teacherId === draft.id || cs.group2TeacherId === draft.id)
                  .reduce((s, cs) => s + cs.hoursPerWeek, 0)}{" "}
                ч
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-dim">
            {shortTeacher(draft.name)} · нагрузка {load} ч/нед
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
