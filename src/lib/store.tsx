"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState } from "./types";
import { DEFAULT_WEIGHTS } from "./types";
import { createDemoState, createEmptyState, defaultSettings, defaultBells } from "./seed";
import { generateSchedule } from "./engine";
import { download } from "./utils";

const LS_KEY = "raspisanie.state.v1";
const API = "/api/db";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

export interface Toast {
  id: string;
  kind: "ok" | "err" | "info";
  text: string;
}

interface VersionMeta {
  id: number;
  name: string;
  note: string | null;
  lessonsCount: number;
  createdAt: string;
}

interface StoreValue {
  state: AppState;
  ready: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  storageMode: "server" | "local";
  canUndo: boolean;
  canRedo: boolean;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: string) => void;
  update: (producer: (draft: AppState) => void, label?: string) => void;
  replaceState: (next: AppState, label?: string) => void;
  undo: () => void;
  redo: () => void;
  loadDemo: () => void;
  loadEmpty: () => void;
  exportJSON: () => void;
  importJSON: (text: string) => boolean;
  versions: VersionMeta[];
  refreshVersions: () => Promise<void>;
  saveVersion: (name: string, note?: string) => Promise<void>;
  restoreVersion: (id: number) => Promise<void>;
  deleteVersion: (id: number) => Promise<void>;
  saveNow: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function normalizeState(raw: unknown): AppState {
  const base = createEmptyState();
  const input = (raw ?? {}) as Partial<AppState>;
  const settings = {
    ...defaultSettings(),
    ...(input.settings ?? {}),
    weights: { ...DEFAULT_WEIGHTS, ...(input.settings?.weights ?? {}) },
  };
  return {
    format: 1,
    school: { name: input.school?.name ?? settings.schoolName },
    settings,
    specializations: input.specializations ?? base.specializations,
    subjects: input.subjects ?? base.subjects,
    rooms: input.rooms ?? [],
    teachers: input.teachers ?? [],
    classes: input.classes ?? [],
    bells: input.bells && input.bells.length ? input.bells : defaultBells(settings),
    schedule: input.schedule ?? [],
    substitutions: input.substitutions ?? [],
    meta: {
      createdAt: input.meta?.createdAt ?? new Date().toISOString(),
      updatedAt: input.meta?.updatedAt ?? new Date().toISOString(),
      lastGeneratedAt: input.meta?.lastGeneratedAt ?? null,
    },
  };
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createEmptyState());
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [storageMode, setStorageMode] = useState<"server" | "local">("server");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const undoRef = useRef<AppState[]>([]);
  const redoRef = useRef<AppState[]>([]);
  const [, force] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const persist = useCallback(
    async (snapshot: AppState) => {
      setSaveStatus("saving");
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
      } catch {
        /* квота переполнена — не критично */
      }
      try {
        const res = await fetch(API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: snapshot }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStorageMode("server");
        setSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
      } catch {
        setStorageMode("local");
        setSaveStatus("offline");
        setLastSavedAt(new Date().toISOString());
      }
    },
    [],
  );

  const schedulePersist = useCallback(
    (snapshot: AppState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(() => {
        void persist(snapshot);
      }, 700);
    },
    [persist],
  );

  // первичная загрузка
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let initial: AppState | null = null;
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data: unknown };
          if (json.data) initial = normalizeState(json.data);
        }
      } catch {
        /* сервер недоступен — работаем автономно */
      }
      if (!initial && typeof window !== "undefined") {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          try {
            initial = normalizeState(JSON.parse(raw));
            setStorageMode("local");
          } catch {
            initial = null;
          }
        }
      }
      if (!initial) {
        initial = createDemoState();
        // сразу подбираем расписание для демо-школы, чтобы приложение открывалось заполненным
        try {
          const res = generateSchedule(initial, { timeBudgetMs: 4000, keepLocked: false });
          initial.schedule = res.schedule;
          initial.meta.lastGeneratedAt = new Date().toISOString();
        } catch {
          initial.schedule = [];
        }
        if (!cancelled) {
          setState(initial);
          stateRef.current = initial;
          setReady(true);
          await persist(initial);
          return;
        }
      }
      if (!cancelled) {
        setState(initial);
        stateRef.current = initial;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const update = useCallback(
    (producer: (draft: AppState) => void) => {
      const previous = stateRef.current;
      const draft = clone(previous);
      producer(draft);
      draft.meta.updatedAt = new Date().toISOString();
      undoRef.current = [...undoRef.current.slice(-49), previous];
      redoRef.current = [];
      stateRef.current = draft;
      setState(draft);
      force((n) => n + 1);
      schedulePersist(draft);
    },
    [schedulePersist],
  );

  const replaceState = useCallback(
    (next: AppState) => {
      const normalized = normalizeState(next);
      const previous = stateRef.current;
      undoRef.current = [...undoRef.current.slice(-49), previous];
      redoRef.current = [];
      stateRef.current = normalized;
      setState(normalized);
      force((n) => n + 1);
      schedulePersist(normalized);
    },
    [schedulePersist],
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current = [...redoRef.current, stateRef.current];
    stateRef.current = prev;
    setState(prev);
    force((n) => n + 1);
    schedulePersist(prev);
  }, [schedulePersist]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current, stateRef.current];
    stateRef.current = next;
    setState(next);
    force((n) => n + 1);
    schedulePersist(next);
  }, [schedulePersist]);

  const loadDemo = useCallback(() => {
    replaceState(createDemoState());
    toast("ok", "Загружена демо-база гимназии № 14");
  }, [replaceState, toast]);

  const loadEmpty = useCallback(() => {
    replaceState(createEmptyState());
    toast("ok", "База очищена, загружен пустой шаблон");
  }, [replaceState, toast]);

  const exportJSON = useCallback(() => {
    const snapshot = clone(stateRef.current);
    snapshot.meta.updatedAt = new Date().toISOString();
    const name = `${snapshot.settings.schoolName.replace(/[^\w\dА-Яа-яЁё-]+/g, "_") || "shkola"}_raspisanie.json`;
    download(name, JSON.stringify(snapshot, null, 2));
    toast("ok", "Файл JSON выгружен");
  }, [toast]);

  const importJSON = useCallback(
    (text: string) => {
      try {
        const parsed = JSON.parse(text) as unknown;
        const normalized = normalizeState(parsed);
        replaceState(normalized);
        toast("ok", `Импортировано: ${normalized.classes.length} кл., ${normalized.teachers.length} пед., ${normalized.schedule.length} уроков`);
        return true;
      } catch {
        toast("err", "Не удалось прочитать файл: ожидался JSON базы расписания");
        return false;
      }
    },
    [replaceState, toast],
  );

  const refreshVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/versions", { cache: "no-store" });
      if (!res.ok) throw new Error("versions");
      const json = (await res.json()) as { versions: VersionMeta[] };
      setVersions(json.versions ?? []);
      setStorageMode("server");
    } catch {
      setVersions([]);
    }
  }, []);

  const saveVersion = useCallback(
    async (name: string, note?: string) => {
      try {
        const res = await fetch("/api/versions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, note, data: clone(stateRef.current) }),
        });
        if (!res.ok) throw new Error("save version");
        await refreshVersions();
        toast("ok", `Версия «${name}» сохранена`);
      } catch {
        toast("err", "Не удалось сохранить версию (сервер недоступен)");
      }
    },
    [refreshVersions, toast],
  );

  const restoreVersion = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/versions/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("restore");
        const json = (await res.json()) as { data: unknown };
        replaceState(normalizeState(json.data));
        toast("ok", "Версия восстановлена");
      } catch {
        toast("err", "Не удалось восстановить версию");
      }
    },
    [replaceState, toast],
  );

  const deleteVersion = useCallback(
    async (id: number) => {
      try {
        await fetch(`/api/versions/${id}`, { method: "DELETE" });
        await refreshVersions();
        toast("info", "Версия удалена");
      } catch {
        toast("err", "Не удалось удалить версию");
      }
    },
    [refreshVersions, toast],
  );

  const saveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(stateRef.current);
  }, [persist]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      ready,
      saveStatus,
      lastSavedAt,
      storageMode,
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0,
      toasts,
      toast,
      dismissToast,
      update,
      replaceState,
      undo,
      redo,
      loadDemo,
      loadEmpty,
      exportJSON,
      importJSON,
      versions,
      refreshVersions,
      saveVersion,
      restoreVersion,
      deleteVersion,
      saveNow,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state,
      ready,
      saveStatus,
      lastSavedAt,
      storageMode,
      toasts,
      versions,
      undoRef.current.length,
      redoRef.current.length,
      toast,
      dismissToast,
      update,
      replaceState,
      undo,
      redo,
      loadDemo,
      loadEmpty,
      exportJSON,
      importJSON,
      refreshVersions,
      saveVersion,
      restoreVersion,
      deleteVersion,
      saveNow,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/** Производные данные, которые нужны почти во всех разделах. */
export function useLookups() {
  const { state } = useStore();
  return useMemo(() => {
    const classById = new Map(state.classes.map((c) => [c.id, c]));
    const teacherById = new Map(state.teachers.map((t) => [t.id, t]));
    const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
    const roomById = new Map(state.rooms.map((r) => [r.id, r]));
    const specById = new Map(state.specializations.map((s) => [s.id, s]));
    const classLoad = (classId: string) =>
      state.classes
        .find((c) => c.id === classId)
        ?.subjects.reduce((sum, cs) => sum + Math.max(0, cs.hoursPerWeek), 0) ?? 0;
    const teacherLoad = (teacherId: string) => {
      let sum = 0;
      for (const c of state.classes) {
        for (const cs of c.subjects) {
          if (cs.teacherId === teacherId) sum += cs.hoursPerWeek;
          if (cs.groups === 2 && cs.group2TeacherId === teacherId) sum += cs.hoursPerWeek;
        }
      }
      return sum;
    };
    const lessonsOfTeacher = (teacherId: string) =>
      state.schedule.filter((l) => l.groups.some((g) => g.teacherId === teacherId));
    return {
      classById,
      teacherById,
      subjectById,
      roomById,
      specById,
      classLoad,
      teacherLoad,
      lessonsOfTeacher,
    };
  }, [state]);
}
