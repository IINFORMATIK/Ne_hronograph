"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Btn, Icon } from "./ui";

export type TabId =
  | "overview"
  | "schedule"
  | "generate"
  | "substitutions"
  | "classes"
  | "teachers"
  | "subjects"
  | "rooms"
  | "specs"
  | "bells"
  | "settings"
  | "data";

interface NavItem {
  id: TabId;
  label: string;
  icon: string;
  hint?: string;
}

const GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Работа",
    items: [
      { id: "overview", label: "Обзор", icon: "grid" },
      { id: "schedule", label: "Расписание", icon: "calendar" },
      { id: "generate", label: "Генерация", icon: "wand", hint: "автоподбор уроков" },
      { id: "substitutions", label: "Замены", icon: "swap", hint: "подстановка педагогов" },
    ],
  },
  {
    title: "База данных",
    items: [
      { id: "classes", label: "Классы", icon: "layers" },
      { id: "teachers", label: "Педагоги", icon: "users" },
      { id: "subjects", label: "Предметы", icon: "book" },
      { id: "rooms", label: "Кабинеты", icon: "door" },
      { id: "specs", label: "Специализации", icon: "tag" },
      { id: "bells", label: "Звонки и смены", icon: "bell" },
    ],
  },
  {
    title: "Система",
    items: [
      { id: "settings", label: "Настройки", icon: "sliders" },
      { id: "data", label: "Данные и версии", icon: "database" },
    ],
  },
];

const THEME_KEY = "school-schedule-theme";

function subscribeToTheme(callback: () => void) {
  window.addEventListener("schedule-theme-change", callback);
  return () => window.removeEventListener("schedule-theme-change", callback);
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  function toggleTheme() {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Switching still works if the browser blocks storage.
    }
    window.dispatchEvent(new Event("schedule-theme-change"));
  }

  return (
    <Btn type="button" variant="outline" size="sm" onClick={toggleTheme} aria-pressed={dark}>
      Тёмная тема
    </Btn>
  );
}

export function Shell({
  active,
  onNavigate,
  children,
}: {
  active: TabId;
  onNavigate: (tab: TabId) => void;
  children: ReactNode;
}) {
  const { state, saveStatus, storageMode, undo, redo, canUndo, canRedo, exportJSON, toasts, dismissToast, saveNow } =
    useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        if (typing) return;
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportJSON();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, exportJSON, saveNow]);

  const saveLabel = {
    idle: "готово к работе",
    saving: "сохранение…",
    saved: "сохранено",
    error: "ошибка сохранения",
    offline: "локально (без сервера)",
  }[saveStatus];

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 flex min-h-screen">
        {/* Боковая навигация */}
        <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line/80 bg-shell lg:flex">
          <div className="flex items-center gap-3 border-b border-line/80 px-5 py-5">
            <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-action/40 bg-action/12 text-action">
              <Icon name="calendar" className="h-5 w-5" />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-shell bg-mint" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[13px] leading-tight font-bold tracking-tight text-chalk">
                Расписание
              </p>
              <p className="truncate text-[10.5px] tracking-[0.14em] text-dim uppercase">
                компоновщик
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {GROUPS.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="mb-2 px-2 text-[9.5px] font-semibold tracking-[0.28em] text-dim uppercase">
                  {group.title}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = active === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                          "nav-item focus-ring group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                          isActive
                            ? "bg-panel3 text-chalk"
                            : "text-muted hover:bg-panel2/70 hover:text-chalk",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1/2 left-0 h-5 w-[2.5px] -translate-y-1/2 rounded-r bg-action transition-all duration-200",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <Icon
                          name={item.icon}
                          className={cn(
                            "h-[17px] w-[17px] transition-colors",
                            isActive ? "text-action" : "text-dim group-hover:text-mint",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] leading-tight font-medium">
                            {item.label}
                          </span>
                          {item.hint && isActive ? (
                            <span className="block text-[10px] leading-tight text-dim">{item.hint}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-line/80 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  saveStatus === "saving" && "breathe bg-amber",
                  saveStatus === "saved" && "bg-mint",
                  saveStatus === "offline" && "bg-sky",
                  (saveStatus === "error" || saveStatus === "idle") && "bg-dim",
                )}
              />
              <span className="text-muted">{saveLabel}</span>
            </div>
            <p className="mt-1 text-[10px] text-dim">
              {storageMode === "server" ? "PostgreSQL + JSON-файл" : "автономно, в этом браузере"} · Ctrl+S
            </p>
          </div>
        </aside>

        {/* Контент */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.26em] text-dim uppercase">
                  {state.settings.schoolName || "Школа"}
                </p>
                <h1 className="font-display truncate text-[19px] leading-tight font-bold text-chalk sm:text-[22px]">
                  {GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "Обзор"}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2/60 p-1">
                  <button
                    onClick={undo}
                    disabled={!canUndo}
                    title="Отменить (Ctrl+Z)"
                    className="focus-ring rounded p-1.5 text-muted transition-colors hover:text-chalk disabled:opacity-30"
                  >
                    <Icon name="undo" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo}
                    title="Вернуть (Ctrl+Shift+Z)"
                    className="focus-ring rounded p-1.5 text-muted transition-colors hover:text-chalk disabled:opacity-30"
                  >
                    <Icon name="redo" className="h-4 w-4" />
                  </button>
                </div>
                <ThemeToggle />
                <Btn variant="ghost" size="sm" icon="download" onClick={exportJSON} title="Экспорт JSON (Ctrl+E)">
                  <span className="hidden sm:inline">Экспорт</span>
                </Btn>
                {active !== "schedule" && (
                  <>
                    <Btn variant="ghost" size="sm" icon="printer" onClick={() => window.print()}>
                      <span className="hidden sm:inline">Печать</span>
                    </Btn>
                    <Btn variant="primary" size="sm" icon="wand" onClick={() => onNavigate("generate")}>
                      Сгенерировать
                    </Btn>
                  </>
                )}
              </div>
            </div>
            {/* мобильная навигация */}
            <nav className="flex gap-1 overflow-x-auto border-t border-line/70 px-3 py-2 lg:hidden">
              {GROUPS.flatMap((g) => g.items).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                    active === item.id
                      ? "border-action/50 bg-action/12 text-action"
                      : "border-line bg-panel2/60 text-muted",
                  )}
                >
                  <Icon name={item.icon} className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">{children}</main>

          <footer className="no-print border-t border-line/60 px-6 py-4 text-[11px] text-dim">
            Данные хранятся одним JSON-документом: экспорт/импорт переносит базу и расписание на другой
            компьютер. Горячие клавиши: Ctrl+Z — отменить, Ctrl+S — сохранить, Ctrl+E — экспорт.
          </footer>
        </div>
      </div>

      {/* Уведомления */}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "slide-in pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] shadow-[0_24px_60px_-30px_rgba(0,0,0,1)] backdrop-blur",
              t.kind === "ok" && "border-mint/40 bg-panel3 text-mint",
              t.kind === "err" && "border-coral/45 bg-panel text-coral",
              t.kind === "info" && "border-line2 bg-panel2/95 text-chalk",
            )}
          >
            <Icon
              name={t.kind === "ok" ? "check" : t.kind === "err" ? "alert" : "info"}
              className="mt-px h-4 w-4"
            />
            <p className="flex-1 leading-snug">{t.text}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="focus-ring rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
