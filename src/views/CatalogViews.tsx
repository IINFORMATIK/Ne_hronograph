"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Classroom, RoomType, Specialization, Subject } from "@/lib/types";
import { SUBJECT_PALETTE } from "@/lib/seed";
import { cn, plural, uid } from "@/lib/utils";
import { Badge, Btn, ColorDot, EmptyState, Field, Icon, Input, Panel, Reveal, SearchInput, Segmented, Select, Stat } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Предметы                                                            */
/* ------------------------------------------------------------------ */

export function SubjectsView() {
  const { state, update, toast } = useStore();
  const [query, setQuery] = useState("");

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of state.classes)
      for (const cs of c.subjects) m.set(cs.subjectId, (m.get(cs.subjectId) ?? 0) + cs.hoursPerWeek);
    return m;
  }, [state.classes]);

  const filtered = state.subjects.filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()));

  function addSubject() {
    const s: Subject = {
      id: uid("subj"),
      name: "Новый предмет",
      short: "Нов",
      specializationId: null,
      color: SUBJECT_PALETTE[state.subjects.length % SUBJECT_PALETTE.length],
      difficulty: 3,
      allowPairs: false,
    };
    update((draft) => {
      draft.subjects.push(s);
    });
    toast("ok", "Предмет добавлен — измените название и параметры");
  }

  function patch(id: string, p: Partial<Subject>) {
    update((draft) => {
      const s = draft.subjects.find((x) => x.id === id);
      if (s) Object.assign(s, p);
    });
  }

  function remove(id: string) {
    const s = state.subjects.find((x) => x.id === id);
    if (!s) return;
    const hours = usage.get(id) ?? 0;
    if (hours > 0 && !confirm(`«${s.name}» используется в учебной нагрузке (${hours} ч/нед). Удалить предмет и убрать его из классов?`)) return;
    update((draft) => {
      draft.subjects = draft.subjects.filter((x) => x.id !== id);
      for (const c of draft.classes) c.subjects = c.subjects.filter((cs) => cs.subjectId !== id);
      for (const t of draft.teachers) t.subjectIds = t.subjectIds.filter((x) => x !== id);
      draft.schedule = draft.schedule.filter((l) => l.subjectId !== id);
    });
    toast("info", `Предмет «${s.name}» удалён`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Предметов" value={state.subjects.length} icon="book" tone="amber" />
        <Stat
          label="Требуют спец. кабинет"
          value={state.subjects.filter((s) => s.specializationId).length}
          hint="приоритет специализированных кабинетов"
          icon="pin"
          tone="sky"
        />
        <Stat label="Сложных (4–5)" value={state.subjects.filter((s) => s.difficulty >= 4).length} hint="ставятся раньше в течение дня" icon="layers" tone="mint" />
        <Stat label="Часов в неделю" value={Array.from(usage.values()).reduce((a, b) => a + b, 0)} hint="суммарно по всем классам" icon="clock" />
      </div>

      <Panel
        dense
        title="Предметы"
        subtitle="Название, цвет, специализация кабинета, ранг сложности и разрешение сдвоенных уроков"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск предмета…" className="w-[200px]" />
            <Btn variant="primary" icon="plus" onClick={addSubject}>
              Добавить предмет
            </Btn>
          </>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState icon="book" title="Предметов нет" text="Добавьте предметы учебного плана." action={<Btn variant="primary" icon="plus" onClick={addSubject}>Добавить предмет</Btn>} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead className="bg-panel2/70 text-[10.5px] tracking-[0.14em] text-dim uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Предмет</th>
                  <th className="px-3 py-2 text-left">Кратко</th>
                  <th className="px-3 py-2 text-left">Цвет</th>
                  <th className="px-3 py-2 text-left">Кабинет</th>
                  <th className="px-3 py-2 text-left">Сложность</th>
                  <th className="px-3 py-2 text-left">Пары</th>
                  <th className="px-3 py-2 text-left">Нагрузка</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-line/70 transition-colors hover:bg-panel2/35">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <ColorDot color={s.color} />
                        <Input
                          value={s.name}
                          onChange={(e) => patch(s.id, { name: e.target.value })}
                          className="min-w-[180px] border-transparent bg-transparent py-1 hover:border-line focus:border-amber/60"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={s.short ?? ""}
                        placeholder="—"
                        onChange={(e) => patch(s.id, { short: e.target.value })}
                        className="w-[74px] border-transparent bg-transparent py-1 text-center hover:border-line focus:border-amber/60"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {SUBJECT_PALETTE.slice(0, 6).map((c) => (
                          <button
                            key={c}
                            onClick={() => patch(s.id, { color: c })}
                            className={cn(
                              "focus-ring h-4 w-4 rounded-[4px] border transition-transform hover:scale-115",
                              s.color === c ? "border-chalk" : "border-line2",
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) => patch(s.id, { color: e.target.value })}
                          className="focus-ring h-5 w-6 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={s.specializationId ?? ""}
                        onChange={(e) => patch(s.id, { specializationId: e.target.value || null })}
                        className="min-w-[170px] py-1 text-[12px]"
                      >
                        <option value="">стандартный кабинет</option>
                        {state.specializations.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => patch(s.id, { difficulty: n })}
                            title={`Ранг ${n}`}
                            className={cn(
                              "focus-ring h-6 w-6 rounded text-[11px] font-semibold transition-colors tabular",
                              s.difficulty === n
                                ? "bg-action text-on-action"
                                : n <= s.difficulty
                                  ? "bg-amber/20 text-amber"
                                  : "bg-panel2 text-dim hover:bg-panel3",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => patch(s.id, { allowPairs: !s.allowPairs })}
                        className={cn(
                          "focus-ring rounded-md border px-2 py-1 text-[11px] transition-colors",
                          s.allowPairs ? "border-mint/50 bg-mint/12 text-mint" : "border-line bg-panel2/60 text-dim",
                        )}
                      >
                        {s.allowPairs ? "разрешены" : "не разрешены"}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-muted tabular">
                      {(usage.get(s.id) ?? 0)} ч
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Btn size="xs" variant="ghost" icon="trash" onClick={() => remove(s.id)}>
                        <span className="sr-only">Удалить</span>
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Кабинеты                                                            */
/* ------------------------------------------------------------------ */

export function RoomsView() {
  const { state, update, toast } = useStore();
  const [filter, setFilter] = useState<"all" | RoomType>("all");
  const [query, setQuery] = useState("");

  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of state.schedule)
      for (const g of l.groups) if (g.roomId) m.set(g.roomId, (m.get(g.roomId) ?? 0) + 1);
    return m;
  }, [state.schedule]);

  const rooms = state.rooms
    .filter((r) => (filter === "all" ? true : r.type === filter))
    .filter((r) => !query || r.number.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.type.localeCompare(b.type) || a.number.localeCompare(b.number, "ru", { numeric: true }));

  function addRoom(type: RoomType = "standard") {
    const r: Classroom = {
      id: uid("room"),
      number: `${100 + state.rooms.length + 1}`,
      type,
      specializationId: type === "specialized" ? (state.specializations[0]?.id ?? null) : null,
      capacity: 25,
    };
    update((draft) => {
      draft.rooms.push(r);
    });
    toast("ok", "Кабинет добавлен");
  }

  function patch(id: string, p: Partial<Classroom>) {
    update((draft) => {
      const r = draft.rooms.find((x) => x.id === id);
      if (r) Object.assign(r, p);
      if (p.type === "standard") {
        const rr = draft.rooms.find((x) => x.id === id);
        if (rr) rr.specializationId = null;
      }
    });
  }

  function remove(id: string) {
    const r = state.rooms.find((x) => x.id === id);
    if (!r) return;
    if (!confirm(`Удалить кабинет «${r.number}»?`)) return;
    update((draft) => {
      draft.rooms = draft.rooms.filter((x) => x.id !== id);
      for (const c of draft.classes) if (c.homeRoomId === id) c.homeRoomId = null;
      for (const l of draft.schedule)
        for (const g of l.groups) if (g.roomId === id) g.roomId = null;
    });
    toast("info", `Кабинет ${r.number} удалён`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Кабинетов" value={state.rooms.length} icon="door" tone="amber" />
        <Stat label="Стандартных" value={state.rooms.filter((r) => r.type === "standard").length} hint="используются, когда спец. кабинет занят" icon="grid" />
        <Stat label="Специализированных" value={state.rooms.filter((r) => r.type === "specialized").length} hint="приоритет для профильных предметов" icon="pin" tone="sky" />
        <Stat label="Свободных" value={state.rooms.filter((r) => (load.get(r.id) ?? 0) === 0).length} hint="не задействованы в текущей сетке" icon="check" tone="mint" />
      </div>

      <Panel
        dense
        title="Кабинеты"
        subtitle="Номер, тип (стандартный/специализированный), специализация и вместимость"
        actions={
          <>
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v)}
              options={[
                { value: "all", label: "Все" },
                { value: "standard", label: "Стандартные" },
                { value: "specialized", label: "Специализированные" },
              ]}
            />
            <SearchInput value={query} onChange={setQuery} placeholder="Номер…" className="w-[150px]" />
            <Btn icon="plus" onClick={() => addRoom("standard")}>
              Стандартный
            </Btn>
            <Btn variant="primary" icon="plus" onClick={() => addRoom("specialized")}>
              Специализированный
            </Btn>
          </>
        }
      >
        {rooms.length === 0 ? (
          <EmptyState icon="door" title="Кабинетов нет" text="Добавьте стандартные и специализированные кабинеты — программа будет подбирать их автоматически." action={<Btn variant="primary" icon="plus" onClick={() => addRoom("standard")}>Добавить кабинет</Btn>} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((r, i) => {
              const spec = state.specializations.find((s) => s.id === r.specializationId);
              const n = load.get(r.id) ?? 0;
              const classes = state.classes.filter((c) => c.homeRoomId === r.id);
              return (
                <Reveal key={r.id} delay={i * 20}>
                  <article
                    className={cn(
                      "card-hover h-full rounded-[14px] border p-3.5",
                      r.type === "specialized" ? "border-sky/30 bg-sky/6" : "border-line bg-panel2/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon name="door" className={cn("h-4 w-4", r.type === "specialized" ? "text-sky" : "text-dim")} />
                          <Input
                            value={r.number}
                            onChange={(e) => patch(r.id, { number: e.target.value })}
                            className="font-display w-[150px] border-transparent bg-transparent px-1 py-0 text-[17px] font-bold hover:border-line focus:border-amber/60"
                          />
                        </div>
                        <p className="mt-1 text-[11.5px] text-dim">
                          {r.type === "specialized" ? `специализированный · ${spec?.name ?? "не указана"}` : "стандартный"}
                        </p>
                      </div>
                      <Btn size="xs" variant="ghost" icon="trash" onClick={() => remove(r.id)}>
                        <span className="sr-only">Удалить</span>
                      </Btn>
                    </div>

                    <div className="mt-3 grid gap-2">
                      <Segmented
                        value={r.type}
                        onChange={(v) => patch(r.id, { type: v as RoomType })}
                        options={[
                          { value: "standard" as RoomType, label: "Стандартный" },
                          { value: "specialized" as RoomType, label: "Спец." },
                        ]}
                      />
                      {r.type === "specialized" ? (
                        <Select
                          value={r.specializationId ?? ""}
                          onChange={(e) => patch(r.id, { specializationId: e.target.value || null })}
                          className="py-1.5 text-[12.5px]"
                        >
                          <option value="">— специализация не выбрана —</option>
                          {state.specializations.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                      <Field label="Вместимость">
                        <Input
                          type="number"
                          min={0}
                          value={r.capacity ?? ""}
                          onChange={(e) => patch(r.id, { capacity: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <Badge tone={n ? "amber" : "muted"}>
                        {n} {plural(n, "урок", "урока", "уроков")} в неделю
                      </Badge>
                      {classes.map((c) => (
                        <Badge key={c.id} tone="mint">
                          закреплён за {c.name}
                        </Badge>
                      ))}
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Специализации кабинетов                                             */
/* ------------------------------------------------------------------ */

export function SpecsView() {
  const { state, update, toast } = useStore();
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (state.specializations.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast("err", "Такая специализация уже есть");
      return;
    }
    update((draft) => {
      draft.specializations.push({ id: uid("spec"), name: trimmed });
    });
    setName("");
    toast("ok", `Специализация «${trimmed}» добавлена`);
  }

  function rename(id: string, value: string) {
    update((draft) => {
      const s = draft.specializations.find((x) => x.id === id);
      if (s) s.name = value;
    });
  }

  function remove(id: string) {
    const s = state.specializations.find((x) => x.id === id);
    if (!s) return;
    const rooms = state.rooms.filter((r) => r.specializationId === id).length;
    const subjects = state.subjects.filter((x) => x.specializationId === id).length;
    if (
      (rooms > 0 || subjects > 0) &&
      !confirm(`«${s.name}» используется: кабинетов ${rooms}, предметов ${subjects}. Удалить специализацию и снять привязки?`)
    )
      return;
    update((draft) => {
      draft.specializations = draft.specializations.filter((x) => x.id !== id);
      for (const r of draft.rooms) if (r.specializationId === id) r.specializationId = null;
      for (const sb of draft.subjects) if (sb.specializationId === id) sb.specializationId = null;
      for (const c of draft.classes)
        for (const cs of c.subjects) if (cs.roomSpecializationId === id) cs.roomSpecializationId = undefined;
    });
    toast("info", `Специализация «${s.name}» удалена`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        title="Специализации кабинетов"
        subtitle="Профиль кабинета: предмет, для которого он предназначен в первую очередь"
      >
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Астрономия, Робототехника" className="min-w-[220px] flex-1" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <Btn variant="primary" icon="plus" onClick={add}>
            Добавить
          </Btn>
        </div>

        <ul className="mt-4 flex flex-col gap-1.5">
          {state.specializations.map((s: Specialization) => {
            const rooms = state.rooms.filter((r) => r.specializationId === s.id);
            const subjects = state.subjects.filter((x) => x.specializationId === s.id);
            return (
              <li key={s.id} className="card-hover flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel2/40 px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-sky/40 bg-sky/12 text-sky">
                  <Icon name="tag" className="h-3.5 w-3.5" />
                </span>
                <Input
                  value={s.name}
                  onChange={(e) => rename(s.id, e.target.value)}
                  className="w-[200px] border-transparent bg-transparent py-1 font-medium hover:border-line focus:border-amber/60"
                />
                {s.builtin ? <Badge tone="sky">базовая</Badge> : <Badge tone="muted">своя</Badge>}
                <span className="text-[11.5px] text-dim">
                  кабинетов: {rooms.length} · предметов: {subjects.length}
                </span>
                <Btn size="xs" variant="ghost" icon="trash" className="ml-auto" onClick={() => remove(s.id)}>
                  <span className="sr-only">Удалить</span>
                </Btn>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Как это работает" subtitle="Логика подбора кабинета для урока">
        <ol className="flex flex-col gap-2.5">
          {[
            ["Сначала — свой кабинет", "Если у предмета указана специализация, программа ищет свободный специализированный кабинет с тем же профилем."],
            ["Потом — стандартный", "Только когда все профильные кабинеты заняты в это время, урок ставится в стандартный кабинет."],
            ["Закреплённый кабинет класса", "Для предметов без специализации приоритет отдаётся основному кабинету класса — меньше перемещений."],
            ["Чужой профильный кабинет", "Используется в крайнем случае и помечается в отчёте как предупреждение."],
            ["Подгруппы", "Если предмет делится на подгруппы, программа подбирает отдельный кабинет для каждой из них."],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-line bg-panel2/40 p-3">
              <span className="font-display grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber/15 text-[13px] font-bold text-amber">
                {i + 1}
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-chalk">{title}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
