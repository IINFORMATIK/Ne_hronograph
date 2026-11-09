"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { ClassSubject, Day, SchoolClass, Shift } from "@/lib/types";
import { DAY_SHORT } from "@/lib/types";
import { bellsForShift } from "@/lib/time";
import { cn, compareTeacherNames, teacherHomerooms, uid } from "@/lib/utils";
import { Badge, Btn, ColorDot, EmptyState, Field, Icon, Input, Modal, Panel, Reveal, SearchInput, Segmented, Select } from "@/components/ui";

export function ClassesView() {
  const { state, update, toast } = useStore();
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.classes
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  }, [state.classes, query]);

  function blankClass(): SchoolClass {
    return {
      id: uid("cls"),
      name: `${state.classes.length + 5}А`,
      grade: 5,
      shift: 1,
      maxLessonsPerDay: state.settings.maxLessonsPerDay > 6 ? 6 : state.settings.maxLessonsPerDay,
      workdays: [...state.settings.workdays],
      homeRoomId: state.rooms.find((r) => r.type === "standard")?.id ?? null,
      subjects: [],
    };
  }

  function save(cls: SchoolClass) {
    update((draft) => {
      const idx = draft.classes.findIndex((c) => c.id === cls.id);
      if (idx >= 0) draft.classes[idx] = cls;
      else draft.classes.push(cls);
      // чистим уроки классов, которых больше нет
      const ids = new Set(draft.classes.map((c) => c.id));
      draft.schedule = draft.schedule.filter((l) => ids.has(l.classId));
    });
    setEditing(null);
    toast("ok", isNew ? `Класс ${cls.name} добавлен` : `Класс ${cls.name} сохранён`);
  }

  function remove(id: string) {
    const cls = state.classes.find((c) => c.id === id);
    if (!cls) return;
    if (!confirm(`Удалить класс ${cls.name} вместе с учебной нагрузкой и его уроками в расписании?`)) return;
    update((draft) => {
      draft.classes = draft.classes.filter((c) => c.id !== id);
      draft.schedule = draft.schedule.filter((l) => l.classId !== id);
      for (const teacher of draft.teachers) {
        const homerooms = teacherHomerooms(teacher);
        if (homerooms.includes(id)) {
          teacher.homeroomClassIds = homerooms.filter((classId) => classId !== id);
          delete teacher.homeroomClassId;
        }
      }
    });
    toast("info", `Класс ${cls.name} удалён`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        dense
        title="Классы и учебная нагрузка"
        subtitle="Смена, лимит уроков в день, учебные дни, предметы с часами, педагогами и подгруппами"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск класса…" className="w-[200px]" />
            <Btn
              variant="primary"
              icon="plus"
              onClick={() => {
                setEditing(blankClass());
                setIsNew(true);
              }}
            >
              Добавить класс
            </Btn>
          </>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="layers"
            title="Классов пока нет"
            text="Добавьте класс, укажите смену, лимит уроков в день и учебную нагрузку по предметам."
            action={
              <Btn variant="primary" icon="plus" onClick={() => { setEditing(blankClass()); setIsNew(true); }}>
                Добавить первый класс
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c, i) => {
              const hours = c.subjects.reduce((s, cs) => s + Math.max(0, cs.hoursPerWeek), 0);
              const capacity =
                Math.min(c.maxLessonsPerDay, state.settings.maxLessonsPerDay, bellsForShift(state.bells, c.shift).length) *
                c.workdays.filter((d) => state.settings.workdays.includes(d)).length;
              const placed = state.schedule.filter((l) => l.classId === c.id).length;
              const over = hours > capacity;
              return (
                <Reveal key={c.id} delay={i * 30}>
                  <article className="card-hover group h-full rounded-[14px] border border-line bg-panel2/40 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-[19px] leading-none font-extrabold text-chalk">{c.name}</h3>
                        <p className="mt-1.5 text-[11.5px] text-dim">
                          {c.grade} класс · {c.shift}-я смена
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <Btn size="xs" variant="ghost" icon="pencil" onClick={() => { setEditing(JSON.parse(JSON.stringify(c))); setIsNew(false); }}>
                          <span className="sr-only">Изменить</span>
                        </Btn>
                        <Btn size="xs" variant="ghost" icon="trash" onClick={() => remove(c.id)}>
                          <span className="sr-only">Удалить</span>
                        </Btn>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.workdays.map((d) => (
                        <span key={d} className="rounded border border-line2 bg-panel/70 px-1.5 py-0.5 text-[10px] text-muted">
                          {DAY_SHORT[d as Day]}
                        </span>
                      ))}
                      <Badge tone={over ? "danger" : "muted"}>
                        {hours} ч / вместимость {capacity}
                      </Badge>
                      {c.homeRoomId ? (
                        <Badge tone="sky">каб. {state.rooms.find((r) => r.id === c.homeRoomId)?.number ?? "—"}</Badge>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
                      <span className="tabular">{c.subjects.length} предметов</span>
                      <span className="text-dim">·</span>
                      <span className="tabular">{c.subjects.filter((cs) => cs.groups === 2).length} с подгруппами</span>
                      <span className="text-dim">·</span>
                      <span className={cn("tabular", placed >= hours && hours > 0 ? "text-mint" : "text-amber")}>
                        в сетке {placed}/{hours}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {c.subjects.slice(0, 10).map((cs) => {
                        const s = state.subjects.find((x) => x.id === cs.subjectId);
                        if (!s) return null;
                        return (
                          <span
                            key={cs.id}
                            title={`${s.name}: ${cs.hoursPerWeek} ч/нед`}
                            className="inline-flex items-center gap-1 rounded border border-line bg-panel/60 px-1.5 py-0.5 text-[10.5px] text-muted"
                          >
                            <ColorDot color={s.color} size={7} />
                            {s.short ?? s.name} {cs.hoursPerWeek}
                            {cs.groups === 2 ? <span className="text-sky">×2</span> : null}
                          </span>
                        );
                      })}
                      {c.subjects.length > 10 ? (
                        <span className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-dim">
                          +{c.subjects.length - 10}
                        </span>
                      ) : null}
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        )}
      </Panel>

      {editing ? (
        <ClassEditor
          key={editing.id}
          cls={editing}
          isNew={isNew}
          state={state}
          onClose={() => setEditing(null)}
          onSave={save}
          onDuplicate={(c) => {
            const copy: SchoolClass = {
              ...JSON.parse(JSON.stringify(c)),
              id: uid("cls"),
              name: `${c.name}-копия`,
              subjects: c.subjects.map((cs) => ({ ...cs, id: uid("cs") })),
            };
            update((draft) => {
              draft.classes.push(copy);
            });
            toast("ok", `Создана копия класса ${c.name}`);
          }}
        />
      ) : null}
    </div>
  );
}

function ClassEditor({
  cls,
  isNew,
  state,
  onClose,
  onSave,
  onDuplicate,
}: {
  cls: SchoolClass;
  isNew: boolean;
  state: ReturnType<typeof useStore>["state"];
  onClose: () => void;
  onSave: (c: SchoolClass) => void;
  onDuplicate: (c: SchoolClass) => void;
}) {
  const [draft, setDraft] = useState<SchoolClass>(cls);
  const [subjectPick, setSubjectPick] = useState<string>(state.subjects[0]?.id ?? "");
  const sortedTeachers = useMemo(() => state.teachers.toSorted(compareTeacherNames), [state.teachers]);

  const hours = draft.subjects.reduce((s, cs) => s + Math.max(0, cs.hoursPerWeek), 0);
  const bellsCount = bellsForShift(state.bells, draft.shift).length;
  const dayCount = draft.workdays.filter((d) => state.settings.workdays.includes(d)).length;
  const capacity = Math.min(draft.maxLessonsPerDay, state.settings.maxLessonsPerDay, bellsCount || draft.maxLessonsPerDay) * dayCount;

  const patch = (p: Partial<SchoolClass>) => setDraft((d) => ({ ...d, ...p }));

  function patchSubject(id: string, p: Partial<ClassSubject>) {
    setDraft((d) => ({ ...d, subjects: d.subjects.map((cs) => (cs.id === id ? { ...cs, ...p } : cs)) }));
  }

  function addSubject() {
    if (!subjectPick) return;
    const subject = state.subjects.find((s) => s.id === subjectPick);
    if (!subject) return;
    const teacher =
      state.teachers.find((t) => t.subjectIds.includes(subjectPick))?.id ?? null;
    const needsSplit = ["Английский язык", "Информатика"].some((n) => subject.name.includes(n));
    const second =
      state.teachers.find((t) => t.id !== teacher && t.subjectIds.includes(subjectPick))?.id ?? null;
    setDraft((d) => ({
      ...d,
      subjects: [
        ...d.subjects,
        {
          id: uid("cs"),
          subjectId: subjectPick,
          teacherId: teacher,
          hoursPerWeek: 1,
          groups: needsSplit && second ? 2 : 1,
          group2TeacherId: needsSplit && second ? second : null,
          roomSpecializationId: null,
        },
      ],
    }));
  }

  function quickFill() {
    // типовая нагрузка: добавляет предметы, которых ещё нет
    const defaults: Array<[string, number]> = [
      ["Русский язык", 5],
      ["Литература", 2],
      ["Математика", 5],
      ["Английский язык", 3],
      ["История", 2],
      ["Физкультура", 2],
      ["Биология", 1],
      ["География", 1],
      ["Музыка", 1],
      ["ИЗО", 1],
    ];
    const existing = new Set(draft.subjects.map((cs) => cs.subjectId));
    const added: ClassSubject[] = [];
    for (const [name, h] of defaults) {
      const subject = state.subjects.find((s) => s.name === name);
      if (!subject || existing.has(subject.id)) continue;
      const teacher = state.teachers.find((t) => t.subjectIds.includes(subject.id))?.id ?? null;
      added.push({
        id: uid("cs"),
        subjectId: subject.id,
        teacherId: teacher,
        hoursPerWeek: h,
        groups: 1,
        group2TeacherId: null,
        roomSpecializationId: null,
      });
    }
    if (added.length === 0) return;
    setDraft((d) => ({ ...d, subjects: [...d.subjects, ...added] }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="xl"
      title={isNew ? "Новый класс" : `Класс ${draft.name}`}
      subtitle="Учебная нагрузка, смена, лимит уроков в день и деление на подгруппы"
      footer={
        <>
          {!isNew ? (
            <Btn variant="ghost" icon="layers" onClick={() => onDuplicate(draft)}>
              Дублировать
            </Btn>
          ) : null}
          <Btn variant="ghost" onClick={onClose}>
            Отмена
          </Btn>
          <Btn variant="primary" icon="check" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>
            Сохранить класс
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Название">
          <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="5А" />
        </Field>
        <Field label="Параллель">
          <Input
            type="number"
            min={1}
            max={11}
            value={draft.grade}
            onChange={(e) => patch({ grade: Number(e.target.value) })}
          />
        </Field>
        <Field label="Смена">
          <Segmented
            value={draft.shift}
            onChange={(v) => patch({ shift: v as Shift })}
            options={[
              { value: 1 as Shift, label: "1 смена" },
              { value: 2 as Shift, label: "2 смена" },
            ]}
          />
        </Field>
        <Field label="Максимум уроков в день">
          <Input
            type="number"
            min={1}
            max={10}
            value={draft.maxLessonsPerDay}
            onChange={(e) => patch({ maxLessonsPerDay: Number(e.target.value) })}
          />
        </Field>
        <Field label="Учебные дни" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {([1, 2, 3, 4, 5, 6, 7] as Day[]).map((d) => {
              const active = draft.workdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    patch({
                      workdays: active ? draft.workdays.filter((x) => x !== d) : [...draft.workdays, d].sort((a, b) => a - b),
                    })
                  }
                  className={cn(
                    "focus-ring rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-panel2/60 text-dim hover:text-muted",
                  )}
                >
                  {DAY_SHORT[d]}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Закреплённый кабинет" className="sm:col-span-2">
          <Select value={draft.homeRoomId ?? ""} onChange={(e) => patch({ homeRoomId: e.target.value || null })}>
            <option value="">— не закреплён —</option>
            {state.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.number} ({r.type === "specialized" ? "спец." : "стандартный"})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[12.5px]",
          hours > capacity ? "border-coral/45 bg-coral/10 text-coral" : "border-mint/35 bg-mint/8 text-mint",
        )}
      >
        <Icon name={hours > capacity ? "alert" : "check"} className="h-4 w-4" />
        <span>
          Нагрузка: <b className="tabular">{hours}</b> ч/нед · вместимость сетки:{" "}
          <b className="tabular">{capacity}</b> ({Math.min(draft.maxLessonsPerDay, state.settings.maxLessonsPerDay, bellsCount || draft.maxLessonsPerDay)} уроков × {dayCount} дн.)
        </span>
        {hours > capacity ? (
          <span>Уменьшите часы или увеличьте лимит уроков / число звонков</span>
        ) : (
          <span>Свободно {capacity - hours} слотов</span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-[11px] font-semibold tracking-[0.2em] text-dim uppercase">
            Предметы класса
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={subjectPick} onChange={(e) => setSubjectPick(e.target.value)} className="w-[210px] py-1.5 text-[12.5px]">
              {state.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Btn size="sm" icon="plus" onClick={addSubject} disabled={!subjectPick}>
              Добавить предмет
            </Btn>
            <Btn size="sm" variant="ghost" icon="sparkle" onClick={quickFill}>
              Типовая нагрузка
            </Btn>
          </div>
        </div>

        {draft.subjects.length === 0 ? (
          <EmptyState icon="book" title="Нагрузка не задана" text="Добавьте предметы и укажите часы в неделю, педагога и деление на подгруппы." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="bg-panel2/70 text-[10.5px] tracking-[0.14em] text-dim uppercase">
                <tr>
                  <th className="px-2.5 py-2 text-left">Предмет</th>
                  <th className="px-2.5 py-2 text-left">Часов/нед</th>
                  <th className="px-2.5 py-2 text-left">Педагог</th>
                  <th className="px-2.5 py-2 text-left">Подгруппы</th>
                  <th className="px-2.5 py-2 text-left">Педагог 2-й подгруппы</th>
                  <th className="px-2.5 py-2 text-left">Кабинет</th>
                  <th className="px-2.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {draft.subjects.map((cs) => {
                  const subject = state.subjects.find((s) => s.id === cs.subjectId);
                  const spec = state.specializations.find((s) => s.id === (cs.roomSpecializationId ?? subject?.specializationId));
                  return (
                    <tr key={cs.id} className="border-t border-line/70 transition-colors hover:bg-panel2/35">
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <ColorDot color={subject?.color ?? "#6d8683"} />
                          <span className="font-medium text-chalk">{subject?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={12}
                          value={cs.hoursPerWeek}
                          onChange={(e) => patchSubject(cs.id, { hoursPerWeek: Number(e.target.value) })}
                          className="focus-ring w-16 rounded-md border border-line bg-panel2 px-2 py-1 text-center text-chalk tabular"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Select
                          value={cs.teacherId ?? ""}
                          onChange={(e) => patchSubject(cs.id, { teacherId: e.target.value || null })}
                          className="min-w-[190px] py-1 text-[12px]"
                        >
                          <option value="">— не назначен —</option>
                          {sortedTeachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {subject && !t.subjectIds.includes(subject.id) ? " ⚠" : ""}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Segmented
                          value={cs.groups}
                          onChange={(v) =>
                            patchSubject(cs.id, {
                              groups: v as 1 | 2,
                              group2TeacherId: v === 1 ? null : cs.group2TeacherId,
                            })
                          }
                          options={[
                            { value: 1 as const, label: "1" },
                            { value: 2 as const, label: "2" },
                          ]}
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        {cs.groups === 2 ? (
                          <Select
                            value={cs.group2TeacherId ?? ""}
                            onChange={(e) => patchSubject(cs.id, { group2TeacherId: e.target.value || null })}
                            className="min-w-[190px] py-1 text-[12px]"
                          >
                            <option value="">— не назначен —</option>
                            {sortedTeachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Select
                          value={
                            cs.roomSpecializationId === undefined
                              ? ""
                              : (cs.roomSpecializationId ?? "none")
                          }
                          onChange={(e) =>
                            patchSubject(cs.id, {
                              roomSpecializationId:
                                e.target.value === ""
                                  ? undefined
                                  : e.target.value === "none"
                                    ? null
                                    : e.target.value,
                            })
                          }
                          className="min-w-[150px] py-1 text-[12px]"
                        >
                          <option value="">
                            {spec ? `по предмету: ${spec.name}` : "как у предмета"}
                          </option>
                          {state.specializations.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value="none">любой кабинет</option>
                        </Select>
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <Btn
                          size="xs"
                          variant="ghost"
                          icon="trash"
                          onClick={() => setDraft((d) => ({ ...d, subjects: d.subjects.filter((x) => x.id !== cs.id) }))}
                        >
                          <span className="sr-only">Удалить</span>
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-dim">
          Английский язык и информатика по умолчанию делятся на две подгруппы; деление можно включить для
          любого предмета — у каждой подгруппы свой педагог и свой кабинет.
        </p>
      </div>
    </Modal>
  );
}
