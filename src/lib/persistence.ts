import { promises as fs } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db, hasDatabase } from "@/db";
import { appStates, scheduleVersions } from "@/db/schema";

/**
 * Единый слой хранения. Если задан DATABASE_URL — работает через PostgreSQL
 * (Drizzle). Иначе состояние целиком лежит в локальном JSON-файле в каталоге
 * ./data — этого достаточно, чтобы поднять приложение на любом компьютере
 * без установки СУБД. Сам документ — тот же JSON, что экспортируется в UI.
 */

const KEY = "main";

function dataDir() {
  return process.env.JSON_DB_PATH ? path.resolve(process.env.JSON_DB_PATH) : path.join(process.cwd(), "data");
}

function stateFile() {
  return path.join(dataDir(), "app-state.json");
}

function versionsFile() {
  return path.join(dataDir(), "versions.json");
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

/* ------------------------------------------------------------------ */
/* Состояние приложения (единый JSON-документ)                          */
/* ------------------------------------------------------------------ */

export interface AppStateRow {
  data: unknown;
  rev: number;
}

export async function getAppState(): Promise<AppStateRow> {
  if (hasDatabase && db) {
    const rows = await db.select().from(appStates).where(eq(appStates.key, KEY)).limit(1);
    if (rows.length > 0) return { data: rows[0].data, rev: rows[0].rev };
    return { data: null, rev: 0 };
  }
  const file = await readJson<{ data: unknown; rev: number } | null>(stateFile(), null);
  if (file) return { data: file.data, rev: file.rev ?? 1 };
  return { data: null, rev: 0 };
}

export async function putAppState(data: unknown): Promise<{ rev: number }> {
  if (hasDatabase && db) {
    const existing = await db.select({ id: appStates.id, rev: appStates.rev }).from(appStates).where(eq(appStates.key, KEY)).limit(1);
    if (existing.length === 0) {
      const inserted = await db.insert(appStates).values({ key: KEY, data: data as Record<string, unknown>, rev: 1 }).returning({ rev: appStates.rev });
      return { rev: inserted[0]?.rev ?? 1 };
    }
    const nextRev = (existing[0].rev ?? 0) + 1;
    await db.update(appStates).set({ data: data as Record<string, unknown>, rev: nextRev, updatedAt: new Date() }).where(eq(appStates.key, KEY));
    return { rev: nextRev };
  }
  const prev = await readJson<{ data: unknown; rev: number } | null>(stateFile(), null);
  const rev = (prev?.rev ?? 0) + 1;
  await writeJson(stateFile(), { data, rev });
  return { rev };
}

/* ------------------------------------------------------------------ */
/* Версии расписания                                                   */
/* ------------------------------------------------------------------ */

export interface VersionRecord {
  id: number;
  name: string;
  note: string | null;
  data: unknown;
  lessonsCount: number;
  createdAt: string;
}

export async function listVersions(): Promise<VersionRecord[]> {
  if (hasDatabase && db) {
    const rows = await db
      .select({
        id: scheduleVersions.id,
        name: scheduleVersions.name,
        note: scheduleVersions.note,
        lessonsCount: scheduleVersions.lessonsCount,
        createdAt: scheduleVersions.createdAt,
      })
      .from(scheduleVersions)
      .orderBy(desc(scheduleVersions.id))
      .limit(60);
    return rows as unknown as VersionRecord[];
  }
  const list = await readJson<VersionRecord[]>(versionsFile(), []);
  return list.slice().sort((a, b) => b.id - a.id).slice(0, 60);
}

export async function createVersion(name: string, note: string | null, data: unknown): Promise<VersionRecord> {
  const lessonsCount = Array.isArray((data as { schedule?: unknown[] })?.schedule)
    ? (data as { schedule: unknown[] }).schedule.length
    : 0;
  if (hasDatabase && db) {
    const inserted = await db
      .insert(scheduleVersions)
      .values({ name, note, data: data as Record<string, unknown>, lessonsCount })
      .returning({ id: scheduleVersions.id, name: scheduleVersions.name, note: scheduleVersions.note, createdAt: scheduleVersions.createdAt });
    return inserted[0] as unknown as VersionRecord;
  }
  const list = await readJson<VersionRecord[]>(versionsFile(), []);
  const id = list.reduce((m, v) => Math.max(m, v.id), 0) + 1;
  const record: VersionRecord = {
    id,
    name,
    note,
    data,
    lessonsCount,
    createdAt: new Date().toISOString(),
  };
  list.push(record);
  await writeJson(versionsFile(), list);
  return record;
}

export async function getVersion(id: number): Promise<VersionRecord | null> {
  if (hasDatabase && db) {
    const rows = await db.select().from(scheduleVersions).where(eq(scheduleVersions.id, Number(id))).limit(1);
    return (rows[0] as unknown as VersionRecord) ?? null;
  }
  const list = await readJson<VersionRecord[]>(versionsFile(), []);
  return list.find((v) => v.id === id) ?? null;
}

export async function deleteVersion(id: number): Promise<void> {
  if (hasDatabase && db) {
    await db.delete(scheduleVersions).where(eq(scheduleVersions.id, Number(id)));
    return;
  }
  const list = await readJson<VersionRecord[]>(versionsFile(), []);
  await writeJson(versionsFile(), list.filter((v) => v.id !== id));
}

export const storageModeLabel = hasDatabase ? "postgres" : "local";
export { hasDatabase };
