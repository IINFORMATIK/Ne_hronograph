"use client";

import { useMemo } from "react";
import { useStore, useLookups } from "@/lib/store";
import { DAY_NAMES, type Day } from "@/lib/types";
import { dayOfWeekFromISO, formatDateISO, shiftsOverlapMinutes } from "@/lib/time";
import { summarize, validateData, validateSchedule } from "@/lib/validate";
import { cn, plural, teacherHomerooms } from "@/lib/utils";
import { Badge, Btn, Icon, Panel, ProgressBar, Reveal, Stat } from "@/components/ui";
import type { TabId } from "@/components/Shell";

export function DashboardView({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { state, loadDemo, exportJSON } = useStore();
  const { teacherLoad, classLoad } = useLookups();

  const scheduleViolations = useMemo(() => validateSchedule(state), [state]);
  const dataViolations = useMemo(() => validateData(state), [state]);
  const scheduleSummary = summarize(scheduleViolations);
  const dataSummary = summarize(dataViolations);

  const plannedHours = useMemo(
    () => state.classes.reduce((sum, c) => sum + classLoad(c.id), 0),
    [state.classes, classLoad],
  );
  const placed = state.schedule.length;
  const readiness = plannedHours ? Math.min(1, placed / plannedHours) : 0;

  const today = dayOfWeekFromISO(formatDateISO(new Date())) as Day;
  const todayLessons = state.schedule.filter((l) => l.day === today).length;
  const overlap = shiftsOverlapMinutes(state.bells);

  const perClass = useMemo(
    () =>
      state.classes
        .map((c) => {
          const planned = classLoad(c.id);
          const fact = state.schedule.filter((l) => l.classId === c.id).length;
          return { cls: c, planned, fact, ratio: planned ? fact / planned : 0 };
        })
        .filter(({ planned, fact }) => planned > fact)
        .sort((a, b) => (b.planned - b.fact) - (a.planned - a.fact) || a.cls.name.localeCompare(b.cls.name, "ru", { numeric: true }))
        .slice(0, 8),
    [state.classes, state.schedule, classLoad],
  );

  const teacherTop = useMemo(
    () =>
      state.teachers
        .map((t) => ({ t, load: teacherLoad(t.id) }))
        .sort((a, b) => b.load - a.load)
        .slice(0, 6),
    [state.teachers, teacherLoad],
  );

  const roomLoad = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of state.schedule) {
      for (const g of l.groups) if (g.roomId) counts.set(g.roomId, (counts.get(g.roomId) ?? 0) + 1);
    }
    return state.rooms
      .map((r) => ({ r, n: counts.get(r.id) ?? 0 }))
      .sort((a, b) => b.n - a.n);
  }, [state.rooms, state.schedule]);

  const specRooms = state.rooms.filter((r) => r.type === "specialized").length;
  const splitSubjects = state.classes.reduce(
    (sum, c) => sum + c.subjects.filter((cs) => cs.groups === 2).length,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка-герой */}
      <section className="rise hairline relative overflow-hidden rounded-[18px] border border-line bg-panel/80">
        <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:p-8">
          <div>
            <p className="font-display text-[10px] font-semibold tracking-[0.34em] text-amber uppercase">
              {state.settings.schoolName}
            </p>
            <h2 className="font-display mt-3 text-[30px] leading-[1.08] font-extrabold tracking-tight text-chalk sm:text-[40px]">
              Расписание собрано
              <span className="block text-mint">
                на {Math.round(readiness * 100)}%
              </span>
            </h2>
            <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted">
              {placed} из {plannedHours} уроков недели распределено по дням, кабинетам и педагогам.
              Учебных дней в неделе: {state.settings.workdays.length}. Сегодня {DAY_NAMES[today].toLowerCase()} —{" "}
              {todayLessons} {plural(todayLessons, "урок", "урока", "уроков")} в сетке.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Btn variant="primary" size="md" icon="wand" onClick={() => onNavigate("generate")}>
                Сгенерировать расписание
              </Btn>
              <Btn size="md" icon="calendar" onClick={() => onNavigate("schedule")}>
                Открыть сетку
              </Btn>
              <Btn size="md" variant="ghost" icon="swap" onClick={() => onNavigate("substitutions")}>
                Замены
              </Btn>
              <Btn size="md" variant="ghost" icon="download" onClick={exportJSON}>
                Экспорт JSON
              </Btn>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3">
            <div className="rounded-xl border border-line bg-panel2/60 p-4">
              <div className="flex items-center justify-between text-[11px] tracking-[0.16em] text-dim uppercase">
                <span>Готовность сетки</span>
                <span className="font-display text-[15px] text-chalk tabular">{Math.round(readiness * 100)}%</span>
              </div>
              <div className="mt-2.5">
                <ProgressBar value={readiness} tone={readiness >= 0.999 ? "mint" : "amber"} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-lg border border-line bg-panel/70 px-2.5 py-2">
                  <p className="text-dim">Ошибок</p>
                  <p className={cn("font-display text-[18px] font-bold tabular", scheduleSummary.errors ? "text-coral" : "text-mint")}>
                    {scheduleSummary.errors}
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-panel/70 px-2.5 py-2">
                  <p className="text-dim">Предупреждений</p>
                  <p className={cn("font-display text-[18px] font-bold tabular", scheduleSummary.warnings ? "text-amber" : "text-mint")}>
                    {scheduleSummary.warnings}
                  </p>
                </div>
              </div>
            </div>
            {overlap > 0 ? (
              <button
                onClick={() => onNavigate("bells")}
                className="focus-ring flex items-center gap-2.5 rounded-xl border border-amber/40 bg-amber/10 px-3.5 py-3 text-left text-[12.5px] text-amber transition-colors hover:bg-amber/16"
              >
                <Icon name="alert" className="h-4 w-4" />
                Смены пересекаются на {overlap} мин — нажмите, чтобы сдвинуть вторую смену
              </button>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl border border-mint/35 bg-mint/8 px-3.5 py-3 text-[12.5px] text-mint">
                <Icon name="check" className="h-4 w-4" />
                Смены не пересекаются по времени
              </div>
            )}
            {dataSummary.errors > 0 ? (
              <button
                onClick={() => onNavigate("classes")}
                className="focus-ring flex items-center gap-2.5 rounded-xl border border-coral/40 bg-coral/10 px-3.5 py-3 text-left text-[12.5px] text-coral"
              >
                <Icon name="alert" className="h-4 w-4" />
                В базе данных {dataSummary.errors} {plural(dataSummary.errors, "ошибка", "ошибки", "ошибок")} — требуется исправление
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Метрики */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 [&>div>button]:h-full [&>div>button]:w-full">
        <Reveal><Stat label="Классов" value={state.classes.length} hint={`${state.classes.filter((c) => c.shift === 1).length} в 1-й смене`} icon="layers" onClick={() => onNavigate("classes")} /></Reveal>
        <Reveal delay={40}><Stat label="Педагогов" value={state.teachers.length} hint={`${state.teachers.filter((t) => teacherHomerooms(t).length > 0).length} классных руководителей`} icon="users" tone="sky" onClick={() => onNavigate("teachers")} /></Reveal>
        <Reveal delay={80}><Stat label="Предметов" value={state.subjects.length} hint={`${state.subjects.filter((s) => s.specializationId).length} требуют спец. кабинет`} icon="book" tone="amber" onClick={() => onNavigate("subjects")} /></Reveal>
        <Reveal delay={120}><Stat label="Кабинетов" value={state.rooms.length} hint={`${specRooms} специализированных`} icon="door" tone="mint" onClick={() => onNavigate("rooms")} /></Reveal>
        <Reveal delay={160}><Stat label="Часов в неделю" value={plannedHours} hint={`${splitSubjects} предметов с подгруппами`} icon="clock" onClick={() => onNavigate("classes")} /></Reveal>
        <Reveal delay={200}><Stat label="Уроков в сетке" value={placed} hint={`максимум ${state.settings.maxLessonsPerDay} в день`} icon="calendar" tone={placed >= plannedHours && plannedHours > 0 ? "mint" : "coral"} onClick={() => onNavigate("schedule")} /></Reveal>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Reveal>
          <Panel title="Готовность по классам" subtitle="Классы с наибольшим числом нераспределённых часов" dense>
            {state.classes.length === 0 ? (
              <div className="p-4">
                <div className="rounded-xl border border-dashed border-line2/70 px-5 py-8 text-center">
                  <p className="text-[13px] text-chalk">Классов пока нет</p>
                  <p className="mt-1 text-[12px] text-muted">
                    Добавьте классы и учебную нагрузку либо загрузите демо-базу.
                  </p>
                  <Btn className="mt-3" variant="primary" icon="sparkle" onClick={loadDemo}>
                    Загрузить демо-школу
                  </Btn>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {perClass.map(({ cls, planned, fact, ratio }) => (
                  <li
                    key={cls.id}
                    className="card-hover flex items-center gap-3 rounded-xl border border-line bg-panel2/40 px-3 py-2.5"
                  >
                    <span className="font-display w-[52px] shrink-0 text-[15px] font-bold text-chalk">{cls.name}</span>
                    <Badge tone={cls.shift === 1 ? "sky" : "amber"}>{cls.shift} смена</Badge>
                    <div className="min-w-0 flex-1">
                      <ProgressBar value={Math.min(1, ratio)} tone={ratio >= 0.999 ? "mint" : "amber"} />
                    </div>
                    <span className="w-[86px] shrink-0 text-right text-[12px] text-muted tabular">
                      {fact} / {planned} ч
                    </span>
                    <span className="w-[74px] shrink-0 text-right text-[11px] text-dim tabular">
                      {cls.maxLessonsPerDay} ур./день
                    </span>
                  </li>
                ))}
                {perClass.length === 0 && (
                  <li className="py-3 text-sm text-muted">Нет классов с недостающими часами.</li>
                )}
              </ul>
            )}
            {state.classes.length > 0 && (
              <Btn className="mt-3" size="sm" onClick={() => onNavigate("classes")}>
                Все классы
              </Btn>
            )}
          </Panel>
        </Reveal>

        <div className="flex flex-col gap-4">
          <Reveal delay={60}>
            <Panel title="Нагрузка педагогов" subtitle="Часов в неделю по учебному плану" dense>
              {teacherTop.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-muted">Педагогов пока нет</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {teacherTop.map(({ t, load }) => {
                    const max = Math.max(1, ...teacherTop.map((x) => x.load));
                    return (
                      <li key={t.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel2/60">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-chalk">{t.name}</span>
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-panel3">
                          <span
                            className="block h-full rounded-full bg-mint transition-[width] duration-500"
                            style={{ width: `${(load / max) * 100}%` }}
                          />
                        </span>
                        <span className="w-10 text-right text-[12px] text-muted tabular">{load}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </Reveal>

          <Reveal delay={100}>
            <Panel title="Что проверить" subtitle="Автоматический контроль данных и расписания" dense>
              {[...dataViolations.filter((v) => v.level !== "info"), ...scheduleViolations.filter((v) => v.level === "error")]
                .slice(0, 7).length === 0 ? (
                <div className="flex items-center gap-2.5 px-3 py-4 text-[12.5px] text-mint">
                  <Icon name="check" className="h-4 w-4" />
                  Критичных проблем нет — можно генерировать расписание
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {[...dataViolations.filter((v) => v.level !== "info"), ...scheduleViolations.filter((v) => v.level === "error")]
                    .slice(0, 7)
                    .map((v) => (
                      <li
                        key={v.id}
                        className={cn(
                          "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug",
                          v.level === "error" ? "border-coral/35 bg-coral/8 text-coral" : "border-amber/30 bg-amber/8 text-amber",
                        )}
                      >
                        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
                        <span className="flex-1">{v.message}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </Reveal>

          <Reveal delay={140}>
            <Panel title="Загрузка кабинетов" subtitle="Сколько уроков в неделю проходит в каждом" dense>
              {roomLoad.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-muted">Кабинетов пока нет</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {roomLoad.slice(0, 22).map(({ r, n }) => (
                    <span
                      key={r.id}
                      title={`${r.type === "specialized" ? "Специализированный" : "Стандартный"} кабинет · ${n} уроков`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px]",
                        n === 0
                          ? "border-line bg-panel2/40 text-dim"
                          : r.type === "specialized"
                            ? "border-sky/35 bg-sky/10 text-sky"
                            : "border-line2 bg-panel2/60 text-muted",
                      )}
                    >
                      {r.number}
                      <span className="font-semibold tabular">{n}</span>
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
