import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Единый документ состояния приложения (база школы + сгенерированное расписание).
 * Такой формат выбран намеренно: состояние целиком экспортируется/импортируется
 * одним JSON-файлом и может быть перенесено на другой компьютер.
 */
export const appStates = pgTable("app_states", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  data: jsonb("data").notNull(),
  rev: integer("rev").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Снимки расписания — история версий, к которой можно откатиться. */
export const scheduleVersions = pgTable("schedule_versions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note"),
  data: jsonb("data").notNull(),
  lessonsCount: integer("lessons_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppStateRow = typeof appStates.$inferSelect;
export type ScheduleVersionRow = typeof scheduleVersions.$inferSelect;
