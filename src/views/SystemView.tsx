"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Shift } from "@/lib/types";
import { DEFAULT_WEIGHTS } from "@/lib/types";
import { validateData, validateSchedule, summarize } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { Badge, Btn, Field, Icon, Input, Panel, Reveal, Segmented, Select, Stat, TextArea } from "@/components/ui";
import type { ShiftFilter } from "@/lib/time";

export function SystemView() {
  const {
    state,
    update,
    replaceState,
    exportJSON,
    importJSON,
    loadDemo,
    loadEmpty,
    storageMode,
    saveStatus,
    lastSavedAt,
    versions,
    refreshVersions,
    saveVersion,
    restoreVersion,
    deleteVersion,
    toast,
    saveNow,
  } = useStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [paste, setPaste] = useState("");
  const [versionName, setVersionName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    void refreshVersions();
  }, [refreshVersions]);

  const bytes = new Blob([JSON.stringify(state)]).size;
  const dataIssues = summarize(validateData(state));
  const scheduleIssues = summarize(validateSchedule(state));

  async function handleFile(file: File) {
    const text = await file.text();
    const ok = importJSON(text);
    if (ok) setPaste("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Размер файла базы"
          value={`${(bytes / 1024).toFixed(1)} КБ`}
          hint={`${state.classes.length} классов · ${state.teachers.length} педагогов · ${state.rooms.length} кабинетов`}
          icon="database"
          tone="amber"
        />
        <Stat
          label="Уроков в сетке"
          value={state.schedule.length}
          hint={`${state.substitutions.length} оформленных замен`}
          icon="calendar"
          tone="sky"
        />
        <Stat
          label="Хранилище"
          value={<span className="text-[19px]">{storageMode === "server" ? "PostgreSQL" : "Браузер"}</span>}
          hint={
            saveStatus === "offline"
              ? "сервер недоступен — данные хранятся локально и будут синхронизированы"
              : lastSavedAt
                ? `сохранено ${new Date(lastSavedAt).toLocaleTimeString("ru-RU")}`
                : "ожидание сохранения"
          }
          icon={storageMode === "server" ? "save" : "unlock"}
          tone={storageMode === "server" ? "mint" : "coral"}
        />
        <Stat
          label="Контроль"
          value={`${dataIssues.errors + scheduleIssues.errors}`}
          hint={`ошибок в данных и расписании · ${dataIssues.warnings + scheduleIssues.warnings} предупреждений`}
          icon="check"
          tone={dataIssues.errors + scheduleIssues.errors ? "coral" : "mint"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Panel title="Школа и правила" subtitle="Общие параметры, влияющие на подбор расписания">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название школы" className="sm:col-span-2">
                <Input
                  value={state.settings.schoolName}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.schoolName = e.target.value;
                      draft.school.name = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="Отображение смен по умолчанию">
                <Segmented
                  value={String(state.settings.defaultShiftFilter)}
                  onChange={(v) =>
                    update((draft) => {
                      draft.settings.defaultShiftFilter = (v === "all" ? "all" : Number(v)) as ShiftFilter;
                    })
                  }
                  options={[
                    { value: "all", label: "Обе" },
                    { value: "1", label: "1 смена" },
                    { value: "2", label: "2 смена" },
                  ]}
                />
              </Field>
              <Field label="Максимум окон у педагога подряд" hint="Строгое ограничение">
                <Select
                  value={String(state.settings.maxTeacherWindows)}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.maxTeacherWindows = Number(e.target.value);
                    })
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "без окон" : `не более ${n}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Бюджет генерации, мс">
                <Input
                  type="number"
                  min={500}
                  max={60000}
                  step={500}
                  value={state.settings.generatorTimeBudgetMs}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.generatorTimeBudgetMs = Number(e.target.value);
                    })
                  }
                />
              </Field>
              <Field label="Случайность подбора (0–1)">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.settings.generatorRandomness}
                  onChange={(e) =>
                    update((draft) => {
                      draft.settings.generatorRandomness = Number(e.target.value);
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn
                size="sm"
                icon="sliders"
                onClick={() =>
                  update((draft) => {
                    draft.settings.weights = { ...DEFAULT_WEIGHTS };
                  })
                }
              >
                Сбросить веса приоритетов
              </Btn>
              <Btn size="sm" variant="ghost" icon="save" onClick={() => void saveNow()}>
                Сохранить сейчас
              </Btn>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={60}>
          <Panel
            title="Файл базы данных (JSON)"
            subtitle="Вся база и расписание хранятся одним документом — его можно перенести на другой компьютер"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
                dragOver ? "border-amber bg-amber/10" : "border-line2/70 bg-panel2/30",
              )}
            >
              <Icon name="upload" className="mx-auto h-6 w-6 text-amber" />
              <p className="mt-2 text-[13px] font-medium text-chalk">Перетащите JSON-файл сюда</p>
              <p className="mt-1 text-[11.5px] text-muted">или выберите файл на диске</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Btn variant="primary" icon="upload" onClick={() => fileRef.current?.click()}>
                  Импорт из файла
                </Btn>
                <Btn icon="download" onClick={exportJSON}>
                  Экспорт в файл
                </Btn>
              </div>
            </div>

            <div className="mt-3">
              <Field label="Или вставьте JSON текстом">
                <TextArea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder='{"format":1,"settings":{…},"classes":[…],"schedule":[…]}'
                  className="font-mono text-[11.5px]"
                />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn
                  size="sm"
                  icon="check"
                  disabled={!paste.trim()}
                  onClick={() => {
                    if (importJSON(paste)) setPaste("");
                  }}
                >
                  Импортировать текст
                </Btn>
                <Btn size="sm" variant="ghost" icon="sparkle" onClick={loadDemo}>
                  Загрузить демо-школу
                </Btn>
                <Btn size="sm" variant="ghost" icon="layers" onClick={loadEmpty}>
                  Пустая база
                </Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  icon="trash"
                  onClick={() => {
                    if (!confirm("Удалить расписание и все замены? База классов и педагогов останется.")) return;
                    update((draft) => {
                      draft.schedule = [];
                      draft.substitutions = [];
                    });
                    toast("info", "Расписание очищено");
                  }}
                >
                  Очистить расписание
                </Btn>
              </div>
            </div>
          </Panel>
        </Reveal>
      </div>

      <Reveal>
        <Panel
          title="Версии расписания"
          subtitle="Снимки состояния в базе данных: можно сохранить, сравнить и откатиться"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder={`Например: ${new Date().toLocaleDateString("ru-RU")} — вариант 1`}
                className="w-[260px] py-1.5 text-[12.5px]"
              />
              <Btn
                size="sm"
                variant="primary"
                icon="save"
                onClick={async () => {
                  const name = versionName.trim() || `Версия от ${new Date().toLocaleString("ru-RU")}`;
                  await saveVersion(name);
                  setVersionName("");
                }}
              >
                Сохранить снимок
              </Btn>
              <Btn size="sm" variant="ghost" icon="undo" onClick={() => void refreshVersions()}>
                Обновить список
              </Btn>
            </div>
          }
          dense
        >
          {versions.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted">
              {storageMode === "server"
                ? "Снимков пока нет — сохраните текущее состояние, чтобы вернуться к нему позже."
                : "Сервер недоступен: история версий работает только при подключённой базе данных."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-panel2/40 px-3 py-2">
                  <Icon name="database" className="h-4 w-4 text-sky" />
                  <span className="text-[13px] font-medium text-chalk">{v.name}</span>
                  <Badge tone="muted">{v.lessonsCount} уроков</Badge>
                  <span className="text-[11.5px] text-dim">
                    {new Date(v.createdAt).toLocaleString("ru-RU")}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <Btn size="xs" variant="soft" icon="undo" onClick={() => void restoreVersion(v.id)}>
                      Восстановить
                    </Btn>
                    <Btn size="xs" variant="ghost" icon="trash" onClick={() => void deleteVersion(v.id)}>
                      <span className="sr-only">Удалить</span>
                    </Btn>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Reveal>

      <Reveal>
        <Panel title="Как устроена программа" subtitle="Коротко о движке и ограничениях">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Поиск с возвратом", "Классы размещаются по очереди, внутри класса — перебор с эвристикой «сначала самый ограниченный урок»."],
              ["Доремонт", "Если урок не встал, программа пробует «выбросить» мешающий урок другого класса и переставить его."],
              ["Окна класса", "Уроки класса всегда занимают периоды подряд с первого — окон не бывает по построению."],
              ["Окна педагога", "Серия свободных уроков между занятиями ограничена; межсменный перерыв окном не считается."],
              ["Время вместо номеров", "Занятость кабинетов и педагогов проверяется по реальным интервалам звонков, поэтому смены не пересекаются."],
              ["Автономность", "Приложение работает без сервера: состояние хранится в браузере и в JSON-файле, который можно перенести."],
            ].map(([t, x]) => (
              <div key={t} className="card-hover rounded-xl border border-line bg-panel2/40 p-3">
                <p className="text-[12.5px] font-semibold text-chalk">{t}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{x}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-dim">
            Горячие клавиши: Ctrl+Z / Ctrl+Shift+Z — отмена и возврат, Ctrl+S — сохранить, Ctrl+E — экспорт
            JSON. Смена класса или педагога в базе помечается в отчёте контроля.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="sky">смена: {(state.settings.defaultShiftFilter === "all" ? "обе" : `${state.settings.defaultShiftFilter as Shift}-я`)}</Badge>
            <Badge tone="mint">учебных дней: {state.settings.workdays.length}</Badge>
            <Badge tone="amber">максимум уроков в день: {state.settings.maxLessonsPerDay}</Badge>
            <Badge tone="muted">подгрупп в базе: {state.classes.reduce((s, c) => s + c.subjects.filter((cs) => cs.groups === 2).length, 0)}</Badge>
          </div>
        </Panel>
      </Reveal>
    </div>
  );
}


