"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Bell, Day, Shift } from "@/lib/types";
import {
  bellsForShift,
  displayNumbers,
  buildTimeline,
  generateBells,
  key,
  shiftSpan,
  shiftsOverlapMinutes,
  suggestShift2Start,
  toMin,
  toStr,
  type ShiftFilter,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge, Btn, DayPicker, Field, Icon, Input, Panel, Reveal, Segmented, Stat } from "@/components/ui";

export function BellsView() {
  const { state, update, toast } = useStore();
  const [filter, setFilter] = useState<ShiftFilter>("all");
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const numbers = useMemo(() => displayNumbers(timeline, filter), [timeline, filter]);
  const s1 = shiftSpan(state.bells, 1);
  const s2 = shiftSpan(state.bells, 2);
  const overlap = shiftsOverlapMinutes(state.bells);

  function patchBell(id: string, p: Partial<Bell>) {
    update((draft) => {
      const b = draft.bells.find((x) => x.id === id);
      if (b) Object.assign(b, p);
    });
  }

  function addPeriod(shift: Shift) {
    const list = bellsForShift(state.bells, shift);
    const last = list[list.length - 1];
    const start = last ? toMin(last.end) + state.settings.breakMinutes : toMin(shift === 1 ? state.settings.shift1Start : state.settings.shift2Start);
    const bell: Bell = {
      id: `bell_${Math.random().toString(36).slice(2, 9)}`,
      shift,
      period: (last?.period ?? 0) + 1,
      start: toStr(start),
      end: toStr(start + state.settings.lessonMinutes),
    };
    update((draft) => {
      draft.bells.push(bell);
    });
    toast("ok", `Добавлен ${bell.period} урок ${shift}-й смены`);
  }

  function removePeriod(shift: Shift) {
    const list = bellsForShift(state.bells, shift);
    const last = list[list.length - 1];
    if (!last) return;
    update((draft) => {
      draft.bells = draft.bells.filter((b) => b.id !== last.id);
    });
    toast("info", "Последний урок смены удалён");
  }

  function regenerate(shift: Shift) {
    const count = bellsForShift(state.bells, shift).length || (shift === 1 ? 7 : 6);
    const start = shift === 1 ? state.settings.shift1Start : state.settings.shift2Start;
    const bells = generateBells({
      shift,
      count,
      start,
      lessonMinutes: state.settings.lessonMinutes,
      breakMinutes: state.settings.breakMinutes,
      bigBreakAfter: state.settings.bigBreakAfter,
      bigBreakMinutes: state.settings.bigBreakMinutes,
    });
    update((draft) => {
      draft.bells = [...draft.bells.filter((b) => b.shift !== shift), ...bells];
      draft.schedule = draft.schedule.filter((l) => l.shift !== shift);
    });
    toast("ok", `Звонки ${shift}-й смены пересчитаны (уроки этой смены удалены из сетки)`);
  }

  function shiftSecond(suggested: string) {
    const delta = toMin(suggested) - (s2?.start ?? toMin(state.settings.shift2Start));
    update((draft) => {
      draft.bells = draft.bells.map((b) =>
        b.shift === 2
          ? { ...b, start: toStr(toMin(b.start) + delta), end: toStr(toMin(b.end) + delta) }
          : b,
      );
      draft.settings.shift2Start = suggested;
    });
    toast("ok", `Вторая смена сдвинута на ${suggested}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="1 смена" value={s1 ? `${toStr(s1.start)}–${toStr(s1.end)}` : "—"} hint={`${s1?.count ?? 0} ${s1?.count === 1 ? "урок" : "уроков"}`} icon="clock" tone="sky" />
        <Stat label="2 смена" value={s2 ? `${toStr(s2.start)}–${toStr(s2.end)}` : "—"} hint={`${s2?.count ?? 0} ${s2?.count === 1 ? "урок" : "уроков"}`} icon="clock" tone="amber" />
        <Stat
          label="Пересечение смен"
          value={overlap ? `${overlap} мин` : "нет"}
          hint={overlap ? "кабинеты и педагоги конфликтуют по времени" : "смены разведены по времени"}
          icon={overlap ? "alert" : "check"}
          tone={overlap ? "coral" : "mint"}
        />
        <Stat label="Уроков в день (школа)" value={state.settings.maxLessonsPerDay} hint="общее ограничение для всех классов" icon="sliders" />
      </div>

      {overlap > 0 ? (
        <div className="rise flex flex-wrap items-center gap-3 rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 text-[12.5px] text-coral">
          <Icon name="alert" className="h-4 w-4" />
          <span className="flex-1">
            Первая смена заканчивается в {s1 ? toStr(s1.end) : "—"}, а вторая начинается в {s2 ? toStr(s2.start) : "—"} —{" "}
            <b>пересечение {overlap} мин</b>. В это время кабинеты и педагоги нужны обеим сменам.
          </span>
          <Btn size="sm" variant="soft" icon="swap" onClick={() => shiftSecond(suggestShift2Start(state.bells, 20))}>
            Сдвинуть 2-ю смену на {suggestShift2Start(state.bells, 20)}
          </Btn>
        </div>
      ) : (
        <div className="rise flex flex-wrap items-center gap-3 rounded-xl border border-mint/35 bg-mint/8 px-4 py-3 text-[12.5px] text-mint">
          <Icon name="check" className="h-4 w-4" />
          <span className="flex-1">Смены не пересекаются: кабинеты и педагоги используются последовательно.</span>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              const target = toStr((s1?.end ?? 780) - 90);
              shiftSecond(target);
            }}
          >
            Сдвинуть 2-ю смену раньше (с перекрытием)
          </Btn>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {([1, 2] as Shift[]).map((shift) => {
          const list = bellsForShift(state.bells, shift);
          return (
            <Reveal key={shift} delay={shift === 2 ? 60 : 0}>
              <Panel
                title={`Звонки · ${shift}-я смена`}
                subtitle={
                  list.length
                    ? `${list.length} уроков · ${toStr(toMin(list[0].start))}–${toStr(toMin(list[list.length - 1].end))}`
                    : "уроки смены не заданы"
                }
                actions={
                  <>
                    <Btn size="xs" icon="plus" onClick={() => addPeriod(shift)}>
                      Урок
                    </Btn>
                    <Btn size="xs" variant="ghost" icon="minus" onClick={() => removePeriod(shift)}>
                      Убрать
                    </Btn>
                    <Btn size="xs" variant="soft" icon="sparkle" onClick={() => regenerate(shift)}>
                      Пересчитать
                    </Btn>
                  </>
                }
                dense
              >
                {list.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12.5px] text-muted">
                    Добавьте уроки смены или нажмите «Пересчитать».
                  </p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <thead className="text-[10px] tracking-[0.14em] text-dim uppercase">
                      <tr>
                        <th className="px-2 py-1.5 text-left">№</th>
                        <th className="px-2 py-1.5 text-left">Начало</th>
                        <th className="px-2 py-1.5 text-left">Конец</th>
                        <th className="px-2 py-1.5 text-left">Длит.</th>
                        <th className="px-2 py-1.5 text-left">Перемена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((b, i) => {
                        const next = list[i + 1];
                        const dur = toMin(b.end) - toMin(b.start);
                        return (
                          <tr key={b.id} className="border-t border-line/70 transition-colors hover:bg-panel2/40">
                            <td className="px-2 py-1">
                              <span className="font-display text-[15px] font-bold text-amber tabular">{b.period}</span>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="time"
                                value={b.start}
                                onChange={(e) => patchBell(b.id, { start: e.target.value })}
                                className="focus-ring rounded-md border border-line bg-panel2 px-2 py-1 text-chalk tabular"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="time"
                                value={b.end}
                                onChange={(e) => patchBell(b.id, { end: e.target.value })}
                                className="focus-ring rounded-md border border-line bg-panel2 px-2 py-1 text-chalk tabular"
                              />
                            </td>
                            <td className={cn("px-2 py-1 tabular", dur === state.settings.lessonMinutes ? "text-muted" : "text-coral")}>
                              {dur} мин
                            </td>
                            <td className="px-2 py-1 text-dim tabular">
                              {next ? `${toMin(next.start) - toMin(b.end)} мин` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="mt-3 grid gap-3 border-t border-line/70 pt-3 sm:grid-cols-2">
                  <Field label={`Начало ${shift}-й смены`}>
                    <Input
                      type="time"
                      value={shift === 1 ? state.settings.shift1Start : state.settings.shift2Start}
                      onChange={(e) =>
                        update((draft) => {
                          if (shift === 1) draft.settings.shift1Start = e.target.value;
                          else draft.settings.shift2Start = e.target.value;
                        })
                      }
                    />
                  </Field>
                  <div className="flex items-end">
                    <Btn icon="sparkle" onClick={() => regenerate(shift)}>
                      Пересчитать звонки от начала смены
                    </Btn>
                  </div>
                </div>
              </Panel>
            </Reveal>
          );
        })}
      </div>

      <Reveal>
        <Panel
          title="Сквозная нумерация уроков"
          subtitle="Как программа нумерует уроки при разных режимах отображения смен"
          actions={
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v)}
              options={[
                { value: "all", label: "Обе смены" },
                { value: 1, label: "Только 1 смена" },
                { value: 2, label: "Только 2 смена" },
              ]}
            />
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <Icon name="info" className="h-4 w-4 text-dim" />
            {filter === "all"
              ? "Обе смены: уроки 2-й смены продолжаются по нумерации после последнего урока 1-й."
              : filter === 1
                ? "Только 1 смена: нумерация начинается с первого урока."
                : "Только 2 смена: нумерация тоже начинается с первого урока."}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {timeline
              .filter((t) => filter === "all" || t.shift === filter)
              .map((t) => {
                const num = numbers.get(key(t.shift, t.period)) ?? t.globalIndex;
                return (
                  <div
                    key={key(t.shift, t.period)}
                    className={cn(
                      "card-hover rounded-lg border px-2.5 py-2 text-center",
                      t.shift === 1 ? "border-sky/30 bg-sky/8" : "border-amber/30 bg-amber/8",
                    )}
                  >
                    <p className="font-display text-[17px] leading-none font-bold text-chalk tabular">{num}</p>
                    <p className="mt-1 text-[10px] text-dim tabular">
                      {String(Math.floor(t.start / 60)).padStart(2, "0")}:{String(t.start % 60).padStart(2, "0")}
                    </p>
                    <p className="text-[9px] tracking-wider text-muted uppercase">
                      {t.shift} см · ур. {t.period}
                    </p>
                  </div>
                );
              })}
          </div>
        </Panel>
      </Reveal>

      <Reveal>
        <Panel title="Учебные дни и длительность" subtitle="Общие параметры недели и уроков">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Field label="Учебные дни недели (по умолчанию понедельник–пятница)">
                <DayPicker
                  value={state.settings.workdays as Day[]}
                  onChange={(days) =>
                    update((draft) => {
                      draft.settings.workdays = days;
                    })
                  }
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="mint">дней в неделе: {state.settings.workdays.length}</Badge>
                <Badge tone="muted">максимум уроков в день: {state.settings.maxLessonsPerDay}</Badge>
                <Badge tone="sky">1 смена: {bellsForShift(state.bells, 1).length} уроков</Badge>
                <Badge tone="amber">2 смена: {bellsForShift(state.bells, 2).length} уроков</Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Максимум уроков в школе за день">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={state.settings.maxLessonsPerDay}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.maxLessonsPerDay = Number(e.target.value);
                    })
                  }
                />
              </Field>
              <Field label="Длительность урока, мин">
                <Input
                  type="number"
                  min={20}
                  max={90}
                  value={state.settings.lessonMinutes}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.lessonMinutes = Number(e.target.value);
                    })
                  }
                />
              </Field>
              <Field label="Обычная перемена, мин">
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={state.settings.breakMinutes}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.breakMinutes = Number(e.target.value);
                    })
                  }
                />
              </Field>
              <Field label="Большая перемена, мин">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={state.settings.bigBreakMinutes}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.bigBreakMinutes = Number(e.target.value);
                    })
                  }
                />
              </Field>
              <Field label="Большая перемена после урока №">
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={state.settings.bigBreakAfter}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.bigBreakAfter = Number(e.target.value);
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </Panel>
      </Reveal>
    </div>
  );
}
