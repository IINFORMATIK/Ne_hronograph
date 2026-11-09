"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Lesson } from "@/lib/types";
import { generateSchedule, type GenResult } from "@/lib/engine";
import { summarize, validateSchedule } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { Badge, Btn, Field, Icon, Panel, ProgressBar, Reveal, Segmented, Select } from "@/components/ui";
import { TimetableGrid } from "@/components/Timetable";
import type { ShiftFilter } from "@/lib/time";

const RULES: Array<{ icon: string; title: string; text: string; hard: boolean }> = [
  {
    icon: "pin",
    title: "Специализированные кабинеты в приоритете",
    text: "Физика, химия, информатика, английский, физкультура и ИЗО ставятся в свои кабинеты. Стандартный кабинет используется, только если специализированный занят.",
    hard: true,
  },
  {
    icon: "clock",
    title: "Часы учебного плана",
    text: "Количество уроков предмета за неделю точно соответствует заданной нагрузке класса.",
    hard: true,
  },
  {
    icon: "x",
    title: "Ни одного окна у класса",
    text: "Уроки класса идут подряд с первого номера; пропусков внутри дня не бывает.",
    hard: true,
  },
  {
    icon: "users",
    title: "Не более двух окон у педагога",
    text: "Строгое ограничение на серии свободных уроков между занятиями в течение дня (межсменный перерыв окном не считается).",
    hard: true,
  },
  {
    icon: "swap",
    title: "Без пересечений смен",
    text: "Занятость кабинетов и педагогов считается по реальному времени, поэтому уроки 1-й и 2-й смены не конфликтуют. При перекрытии смен программа предлагает сдвинуть вторую.",
    hard: true,
  },
  {
    icon: "sparkle",
    title: "Не два урока подряд одним педагогом",
    text: "Приоритет против сдвоенных уроков одного предмета у одного педагога (кроме предметов, где пары разрешены: технология, лабораторные).",
    hard: false,
  },
  {
    icon: "layers",
    title: "Сложные предметы — раньше",
    text: "Ранг сложности предмета влияет на место в дне и в неделе: математика и языки утром, ИЗО и физкультура позже.",
    hard: false,
  },
  {
    icon: "door",
    title: "Меньше перемещений",
    text: "Программа старается держать класс в одном кабинете и равномерно распределять предмет по дням недели.",
    hard: false,
  },
];

const tick = () => new Promise<void>((r) => setTimeout(r, 30));

export function GenerateView() {
  const { state, update, toast } = useStore();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("готов к запуску");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<GenResult | null>(null);
  const [candidate, setCandidate] = useState<Lesson[] | null>(null);
  const [budget, setBudget] = useState(state.settings.generatorTimeBudgetMs);
  const [randomness, setRandomness] = useState(state.settings.generatorRandomness);
  const [keepLocked, setKeepLocked] = useState(true);
  const [previewClass, setPreviewClass] = useState(state.classes[0]?.id ?? "");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [advanced, setAdvanced] = useState(false);
  const cancelled = useRef({ current: false });

  const previewState = useMemo(
    () => (candidate ? { ...state, schedule: candidate } : state),
    [state, candidate],
  );
  const report = useMemo(
    () => (candidate ? validateSchedule({ ...state, schedule: candidate }) : []),
    [candidate, state],
  );
  const reportSummary = useMemo(() => summarize(report), [report]);

  async function run() {
    if (state.classes.length === 0) {
      toast("err", "Нет классов — сначала заполните базу данных");
      return;
    }
    setRunning(true);
    cancelled.current.current = false;
    setPhase("Подготовка данных…");
    setProgress(0.03);
    await tick();
    await tick();
    const started = performance.now();
    let res: GenResult;
    try {
      res = generateSchedule(state, {
        timeBudgetMs: budget,
        randomness,
        keepLocked,
        seed: Math.floor(Math.random() * 1e9),
        onProgress: (p) => {
          setPhase(p.phase);
          setProgress(
            Math.min(0.98, 0.05 + (p.elapsed / Math.max(1, budget)) * 0.85 + (p.total ? (p.placed / p.total) * 0.08 : 0)),
          );
        },
        cancelled: cancelled.current,
      });
    } catch (e) {
      setRunning(false);
      setPhase("ошибка");
      toast("err", `Сбой генерации: ${(e as Error).message}`);
      return;
    }
    setProgress(1);
    setPhase(`Готово за ${Math.round(performance.now() - started)} мс`);
    setResult(res);
    setCandidate(res.schedule);
    setPreviewClass(res.schedule[0]?.classId ?? state.classes[0]?.id ?? "");
    setRunning(false);
    if (res.unplaced.length === 0) {
      toast("ok", `Расписание составлено: ${res.stats.placed} из ${res.stats.total} уроков`);
    } else {
      toast("err", `Размещено ${res.stats.placed} из ${res.stats.total}. Не удалось поставить ${res.unplaced.length} урок(ов)`);
    }
  }

  function apply() {
    if (!candidate) return;
    update((draft) => {
      draft.schedule = candidate;
      draft.meta.lastGeneratedAt = new Date().toISOString();
    });
    toast("ok", "Расписание применено и сохранено");
  }

  const weights = state.settings.weights;
  const setWeight = (key: keyof typeof weights, value: number) =>
    update((draft) => {
      draft.settings.weights[key] = value;
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <div className="flex flex-col gap-4">
        <Reveal>
          <Panel
            title="Автоматическая генерация"
            subtitle="Поиск с возвратом, эвристика «сначала самый ограниченный» и доремонт выбросом мешающих уроков"
            actions={
              <Badge tone={running ? "amber" : "mint"}>
                {running ? "идёт подбор" : "движок готов"}
              </Badge>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Бюджет времени: ${(budget / 1000).toFixed(1)} с`} hint="Больше времени — больше вариантов перебирает программа">
                <input
                  type="range"
                  min={1000}
                  max={20000}
                  step={500}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="focus-ring w-full accent-action"
                />
              </Field>
              <Field label={`Случайность: ${Math.round(randomness * 100)}%`} hint="Разнообразие вариантов при повторных запусках">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(randomness * 100)}
                  onChange={(e) => setRandomness(Number(e.target.value) / 100)}
                  className="focus-ring w-full accent-mint"
                />
              </Field>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-panel2/50 px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                checked={keepLocked}
                onChange={(e) => setKeepLocked(e.target.checked)}
                className="h-4 w-4 accent-action"
              />
              <span className="text-chalk">Сохранять закреплённые уроки</span>
              <Icon name="lock" className="ml-auto h-4 w-4 text-dim" />
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Btn variant="primary" size="md" icon="wand" onClick={run} disabled={running}>
                {running ? "Подбираем…" : "Сгенерировать расписание"}
              </Btn>
              {running ? (
                <Btn
                  variant="danger"
                  icon="x"
                  onClick={() => {
                    cancelled.current.current = true;
                    setPhase("остановка…");
                  }}
                >
                  Остановить
                </Btn>
              ) : null}
              {candidate ? (
                <>
                  <Btn variant="soft" icon="check" onClick={apply}>
                    Применить результат
                  </Btn>
                  <Btn variant="ghost" icon="x" onClick={() => { setCandidate(null); setResult(null); }}>
                    Отклонить
                  </Btn>
                </>
              ) : null}
            </div>

            {running || progress > 0 ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-muted">
                  <span className={cn(running && "breathe")}>{phase}</span>
                  <span className="tabular">{Math.round(progress * 100)}%</span>
                </div>
                <ProgressBar value={progress} tone={running ? "amber" : "mint"} />
              </div>
            ) : null}

            <button
              onClick={() => setAdvanced((v) => !v)}
              className="focus-ring mt-4 flex items-center gap-1.5 text-[12px] text-dim transition-colors hover:text-amber"
            >
              <Icon name="chevron" className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-90")} />
              Веса приоритетов (тонкая настройка)
            </button>
            {advanced ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["sameTeacherConsecutive", "Один педагог и предмет подряд"],
                    ["sameSubjectPerDay", "Предмет дважды в день"],
                    ["roomFallback", "Спец. предмет в обычном кабинете"],
                    ["specRoomMisuse", "Чужой специализированный кабинет"],
                    ["roomChange", "Смена кабинета между уроками"],
                    ["teacherWindows", "Окна у педагога"],
                    ["difficultyPosition", "Сложный предмет не с начала дня"],
                    ["subjectSpread", "Неравномерно по неделе"],
                    ["teacherDailyLoad", "Перегрузка педагога за день"],
                    ["homeRoom", "Не в закреплённом кабинете"],
                  ] as Array<[keyof typeof weights, string]>
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={5}
                        value={weights[k]}
                        onChange={(e) => setWeight(k, Number(e.target.value))}
                        className="focus-ring w-full accent-sky"
                      />
                      <span className="w-9 text-right text-[12px] text-muted tabular">{weights[k]}</span>
                    </div>
                  </Field>
                ))}
              </div>
            ) : null}
          </Panel>
        </Reveal>

        <Reveal delay={60}>
          <Panel title="Правила подбора" subtitle="Жёсткие ограничения соблюдаются всегда, приоритеты — по возможности">
            <ul className="grid gap-2 sm:grid-cols-2">
              {RULES.map((r) => (
                <li
                  key={r.title}
                  className="card-hover rounded-xl border border-line bg-panel2/45 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-lg border",
                        r.hard ? "border-mint/40 bg-mint/12 text-mint" : "border-amber/40 bg-amber/12 text-amber",
                      )}
                    >
                      <Icon name={r.icon} className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-[12.5px] font-semibold text-chalk">{r.title}</p>
                    <Badge tone={r.hard ? "mint" : "amber"} className="ml-auto">
                      {r.hard ? "строго" : "приоритет"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-snug text-muted">{r.text}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
      </div>

      <div className="flex flex-col gap-4">
        {result ? (
          <Reveal>
            <Panel
              title="Результат подбора"
              subtitle={`${result.stats.attempts} попыток · ${result.stats.nodes.toLocaleString("ru-RU")} узлов перебора · ${result.stats.ms} мс`}
              actions={
                <div className="flex gap-2">
                  <Badge tone={result.unplaced.length ? "coral" : "mint"}>
                    {result.stats.placed} / {result.stats.total} уроков
                  </Badge>
                  <Badge tone="sky">штраф {result.stats.penalty}</Badge>
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Размещено" value={`${result.stats.placed}`} hint={`из ${result.stats.total} уроков недели`} tone="mint" />
                <Metric
                  label="Нарушений"
                  value={`${reportSummary.errors + reportSummary.warnings}`}
                  hint={`${reportSummary.errors} ошибок · ${reportSummary.warnings} предупреждений`}
                  tone={reportSummary.errors ? "coral" : "amber"}
                />
                <Metric
                  label="Качество"
                  value={`${result.stats.penalty}`}
                  hint={result.stats.improved ? "улучшено перестановками" : "локальное улучшение не дало прироста"}
                  tone="sky"
                />
              </div>

              {result.unplaced.length ? (
                <div className="mt-4 rounded-xl border border-coral/35 bg-coral/8 p-3">
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold text-coral">
                    <Icon name="alert" className="h-4 w-4" />
                    Не удалось разместить {result.unplaced.length} урок(ов)
                  </p>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {result.unplaced.slice(0, 14).map((u, i) => (
                      <li key={i} className="rounded-lg bg-panel2/60 px-2.5 py-1.5 text-[11.5px] text-muted">
                        <span className="font-semibold text-chalk">{u.className}</span> · {u.subjectName}{" "}
                        <span className="text-dim">— {u.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] text-dim">
                    Что сделать: увеличить лимит уроков в день, добавить кабинеты нужной специализации,
                    назначить второго педагога на подгруппу или снизить нагрузку педагога.
                  </p>
                </div>
              ) : null}

              {result.warnings.length ? (
                <ul className="mt-3 grid gap-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg border border-amber/25 bg-amber/8 px-2.5 py-1.5 text-[11.5px] text-amber">
                      <Icon name="info" className="mt-0.5 h-3.5 w-3.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}

              {report.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
                    Контроль результата
                  </p>
                  <ul className="max-h-[190px] space-y-1 overflow-y-auto pr-1">
                    {report.slice(0, 60).map((v) => (
                      <li
                        key={v.id}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 text-[11.5px]",
                          v.level === "error" && "border-coral/40 bg-coral/8 text-coral",
                          v.level === "warn" && "border-amber/30 bg-amber/8 text-amber",
                          v.level === "info" && "border-line bg-panel2/40 text-muted",
                        )}
                      >
                        {v.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          </Reveal>
        ) : null}

        <Panel
          dense
          title="Предпросмотр"
          subtitle="Результат можно рассмотреть до применения — перетаскивание уроков доступно после применения"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-[150px] py-1.5 text-[12.5px]"
                value={previewClass}
                onChange={(e) => setPreviewClass(e.target.value)}
              >
                {state.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Segmented
                value={shiftFilter}
                onChange={(v) => setShiftFilter(v)}
                options={[
                  { value: "all", label: "Обе" },
                  { value: 1, label: "1 см." },
                  { value: 2, label: "2 см." },
                ]}
              />
            </div>
          }
        >
          {candidate && candidate.length ? (
            <TimetableGrid
              state={previewState}
              lessons={candidate.filter((l) => l.classId === previewClass)}
              mode="class"
              shiftFilter={shiftFilter}
              days={
                (state.classes.find((c) => c.id === previewClass)?.workdays ?? state.settings.workdays) as Array<1 | 2 | 3 | 4 | 5>
              }
              title={state.classes.find((c) => c.id === previewClass)?.name}
              caption={`${candidate.length} уроков во всей сетке школы`}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-line2/70 px-6 py-14 text-center text-[13px] text-muted">
              Нажмите «Сгенерировать расписание» — здесь появится предварительная сетка уроков.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "mint" | "amber" | "coral" | "sky";
}) {
  const color = { mint: "text-mint", amber: "text-amber", coral: "text-coral", sky: "text-sky" }[tone];
  return (
    <div className="rounded-xl border border-line bg-panel2/45 px-3 py-2.5">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-dim uppercase">{label}</p>
      <p className={cn("font-display mt-1 text-[24px] leading-none font-bold tabular", color)}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">{hint}</p>
    </div>
  );
}


