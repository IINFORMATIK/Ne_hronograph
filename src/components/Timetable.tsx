"use client";

import { Fragment, useMemo, useState } from "react";
import type { AppState, Day, Lesson, Shift, Substitution } from "@/lib/types";
import { DAY_NAMES } from "@/lib/types";
import { buildTimeline, displayNumbers, key, type ShiftFilter } from "@/lib/time";
import { cn, shortTeacher } from "@/lib/utils";
import { Badge, Icon } from "./ui";

export type GridMode = "class" | "teacher" | "room";

interface Props {
  state: AppState;
  lessons: Lesson[];
  mode: GridMode;
  shiftFilter: ShiftFilter;
  days: Day[];
  substitutions?: Substitution[];
  printable?: boolean;
  selectedId?: string | null;
  onSelect?: (lesson: Lesson) => void;
  onDropLesson?: (lessonId: string, day: Day, period: number, shift: Shift) => void;
  title?: string;
  caption?: string;
}

export function TimetableGrid({
  state,
  lessons,
  mode,
  shiftFilter,
  days,
  substitutions = [],
  printable = true,
  selectedId,
  onSelect,
  onDropLesson,
  title,
  caption,
}: Props) {
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const numbers = useMemo(() => displayNumbers(timeline, shiftFilter), [timeline, shiftFilter]);
  const periods = useMemo(() => {
    const list =
      shiftFilter === "all" ? timeline : timeline.filter((t) => t.shift === shiftFilter);
    return list.slice().sort((a, b) => a.globalIndex - b.globalIndex);
  }, [timeline, shiftFilter]);

  const [dragShift, setDragShift] = useState<Shift | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const subjectById = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const teacherById = useMemo(() => new Map(state.teachers.map((t) => [t.id, t])), [state.teachers]);
  const roomById = useMemo(() => new Map(state.rooms.map((r) => [r.id, r])), [state.rooms]);
  const classById = useMemo(() => new Map(state.classes.map((c) => [c.id, c])), [state.classes]);
  const subByLesson = useMemo(() => {
    const byLesson = new Map<string, Substitution[]>();
    for (const sub of substitutions) {
      if (!sub.lessonId) continue;
      const lessonSubs = byLesson.get(sub.lessonId) ?? [];
      lessonSubs.push(sub);
      byLesson.set(sub.lessonId, lessonSubs);
    }
    return byLesson;
  }, [substitutions]);

  const cells = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons) {
      if (shiftFilter !== "all" && l.shift !== shiftFilter) continue;
      const k = `${l.day}|${key(l.shift, l.period)}`;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.period - b.period);
    return m;
  }, [lessons, shiftFilter]);

  const lastOccupiedPeriod = new Map<Shift, number>();
  for (const period of periods) {
    if (days.some((day) => cells.has(`${day}|${key(period.shift, period.period)}`))) {
      lastOccupiedPeriod.set(period.shift, Math.max(lastOccupiedPeriod.get(period.shift) ?? 0, period.period));
    }
  }

  if (periods.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line2/70 px-6 py-12 text-center text-sm text-muted">
        Для выбранной смены нет расписания звонков — добавьте уроки в разделе «Звонки».
      </div>
    );
  }

  return (
    <div className={cn("timetable-week timetable-scroll focus-ring", printable && "print-area")} tabIndex={0} role="region" aria-label="Расписание на неделю">
      {title ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-lg leading-tight font-bold text-chalk">{title}</h3>
            {caption ? <p className="text-xs text-muted">{caption}</p> : null}
          </div>
          {substitutions.length ? (
            <Badge tone="coral">
              <Icon name="swap" className="h-3 w-3" /> замен: {substitutions.length}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1">
        <colgroup>
          <col className="w-[86px]" />
          {days.map((day) => <col key={day} />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="timetable-time w-[86px] rounded-lg bg-panel2/60 px-2 py-2 text-[10.5px] font-semibold tracking-[0.14em] text-dim uppercase">
              Урок
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                className="rounded-lg bg-panel2/60 px-2 py-2 text-[12px] font-semibold tracking-wide text-chalk"
              >
                {DAY_NAMES[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, index) => {
            const num = numbers.get(key(p.shift, p.period)) ?? p.period;
            const mins = Math.floor(p.start / 60);
            const hh = String(mins).padStart(2, "0");
            const mm = String(p.start % 60).padStart(2, "0");
            const eh = String(Math.floor(p.end / 60)).padStart(2, "0");
            const em = String(p.end % 60).padStart(2, "0");
            return (
              <Fragment key={key(p.shift, p.period)}>
                {periods[index - 1]?.shift !== p.shift && (
                  <tr className="timetable-shift" data-print-unused={!lastOccupiedPeriod.has(p.shift) || undefined}>
                    <th colSpan={days.length + 1}>{p.shift}-я смена</th>
                  </tr>
                )}
                <tr data-print-unused={p.period > (lastOccupiedPeriod.get(p.shift) ?? 0) || undefined}>
                  <th scope="row" className="timetable-time rounded-lg border border-line px-2 py-1.5 text-center align-middle">
                    <div className="font-display text-[17px] leading-none font-bold text-action tabular">
                      {num}
                    </div>
                    <div className="mt-1 text-[12px] font-normal leading-tight text-muted tabular">
                      {hh}:{mm}
                      <br />
                      {eh}:{em}
                    </div>
                  </th>
                  {days.map((d) => {
                    const cellKey = `${d}|${key(p.shift, p.period)}`;
                    const list = cells.get(cellKey) ?? [];
                    const canDrop = Boolean(onDropLesson && dragShift === p.shift);
                    const isOver = canDrop && dragOver === cellKey;
                    return (
                      <td
                        key={d}
                        onDragOver={(e) => {
                          if (!canDrop) return;
                          e.preventDefault();
                          setDragOver(cellKey);
                        }}
                        onDragLeave={() => setDragOver((v) => (v === cellKey ? null : v))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          const id = e.dataTransfer.getData("text/lesson-id");
                          if (id && canDrop) onDropLesson?.(id, d, p.period, p.shift);
                        }}
                        className={cn(
                          "rounded-lg border p-1 align-top transition-colors duration-150",
                          list.length
                            ? "border-transparent bg-transparent"
                            : "border-line bg-shell/60",
                          canDrop && "border-dashed border-action/50",
                          isOver && "border-solid border-action bg-action/10",
                        )}
                      >
                        {list.length === 0 ? (
                          <div className="timetable-placeholder flex h-[62px] items-center justify-center text-[10.5px] text-muted">
                            {isOver ? "Перенести сюда" : null}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {list.map((l) => (
                              <LessonChip
                                key={l.id}
                                lesson={l}
                                mode={mode}
                                subjectName={subjectById.get(l.subjectId)?.name ?? "?"}
                                subjectColor={subjectById.get(l.subjectId)?.color ?? "#6d8683"}
                                teacherName={
                                  l.groups
                                    .map((g) => (g.teacherId ? teacherById.get(g.teacherId)?.name : null))
                                    .filter(Boolean)
                                    .map((n) => shortTeacher(n as string))
                                    .join(" · ") || "—"
                                }
                                roomName={
                                  l.groups
                                    .map((g) => (g.roomId ? roomById.get(g.roomId)?.number : null))
                                    .filter(Boolean)
                                    .join(", ") || "—"
                                }
                                className={classById.get(l.classId)?.name ?? "?"}
                                groupDetails={l.groups.some((group) => group.label) ? l.groups.map((group) => ({
                                  label: group.label,
                                  teacher: group.teacherId ? shortTeacher(teacherById.get(group.teacherId)?.name ?? "") : "",
                                  room: group.roomId ? roomById.get(group.roomId)?.number : undefined,
                                })) : []}
                                selected={selectedId === l.id}
                                substitutions={subByLesson.get(l.id)?.map((sub) => {
                                  const from = shortTeacher(teacherById.get(sub.originalTeacherId ?? "")?.name ?? "—");
                                  const to = shortTeacher(teacherById.get(sub.replacementTeacherId ?? "")?.name ?? "—");
                                  if (sub.status === "replaced") return { id: sub.id, label: sub.combinedGroups ? `${to}: обе подгруппы` : `${from} → ${to}` };
                                  return { id: sub.id, label: l.groups.length > 1 ? `${from}: подгруппа отменена` : "Урок отменён" };
                                })}
                                onSelect={onSelect}
                                draggable={!!onDropLesson}
                                onDragChange={(shift) => {
                                  setDragShift(shift);
                                  if (shift === null) setDragOver(null);
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LessonChip({
  lesson,
  mode,
  subjectName,
  subjectColor,
  teacherName,
  roomName,
  className,
  groupDetails,
  selected,
  substitutions = [],
  onSelect,
  draggable,
  onDragChange,
}: {
  lesson: Lesson;
  mode: GridMode;
  subjectName: string;
  subjectColor: string;
  teacherName: string;
  roomName: string;
  className: string;
  groupDetails: { label?: string; teacher: string; room?: string }[];
  selected?: boolean;
  substitutions?: { id: string; label: string }[];
  onSelect?: (l: Lesson) => void;
  draggable?: boolean;
  onDragChange?: (shift: Shift | null) => void;
}) {
  const line1 = mode === "class" ? subjectName : mode === "teacher" ? className : subjectName;
  const line2 =
    mode === "class" ? `${teacherName} · каб. ${roomName}` : mode === "teacher" ? `${subjectName} · каб. ${roomName}` : `${className} · ${teacherName}`;
  const Card = onSelect ? "button" : "div";
  return (
    <Card
      type={onSelect ? "button" : undefined}
      data-selected={selected || undefined}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lesson-id", lesson.id);
        e.dataTransfer.effectAllowed = "move";
        onDragChange?.(lesson.shift);
      }}
      onDragEnd={() => onDragChange?.(null)}
      onClick={() => onSelect?.(lesson)}
      className={cn(
        "lesson-chip focus-ring group relative block w-full break-words rounded-lg border border-line border-l-[3px] bg-panel text-left px-2 py-1.5",
        onSelect && "cursor-pointer",
      )}
      style={{
        borderLeftColor: subjectColor,
      }}
      title={`${subjectName} · ${teacherName} · каб. ${roomName}`}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="text-sm leading-tight font-semibold text-chalk">{line1}</span>
        {lesson.locked ? <Icon name="lock" className="mt-px h-3 w-3 shrink-0 text-action" /> : null}
      </span>
      {groupDetails.length ? (
        <span className="mt-1 block space-y-1 text-xs leading-snug text-muted">
          {mode === "teacher" && <span className="block">{subjectName}</span>}
          {mode === "room" && <span className="block">{className}</span>}
          {groupDetails.map((group, index) => (
            <span key={index} className="block">
              {group.label ? `${group.label} · ` : ""}{group.teacher || "—"} · каб. {group.room || "—"}
            </span>
          ))}
        </span>
      ) : (
        <span className="mt-1 block text-xs leading-snug text-muted">{line2}</span>
      )}
      {substitutions.map((sub) => (
        <span key={sub.id} className="mt-1 flex items-center gap-1 rounded bg-coral/20 px-1 py-0.5 text-[9.5px] font-semibold text-coral">
          <Icon name="swap" className="h-2.5 w-2.5" />
          {sub.label}
        </span>
      ))}
    </Card>
  );
}

/** Сводная сетка: строки — уроки, столбцы — классы, для одного дня. */
export function OverviewGrid({
  state,
  day,
  shiftFilter,
  onSelect,
}: {
  state: AppState;
  day: Day;
  shiftFilter: ShiftFilter;
  onSelect?: (l: Lesson) => void;
}) {
  const timeline = useMemo(() => buildTimeline(state.bells), [state.bells]);
  const numbers = useMemo(() => displayNumbers(timeline, shiftFilter), [timeline, shiftFilter]);
  const periods = useMemo(
    () =>
      (shiftFilter === "all" ? timeline : timeline.filter((t) => t.shift === shiftFilter))
        .slice()
        .sort((a, b) => a.globalIndex - b.globalIndex),
    [timeline, shiftFilter],
  );
  const classes = useMemo(
    () =>
      state.classes
        .filter((c) => shiftFilter === "all" || c.shift === shiftFilter)
        .slice()
        .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
    [state.classes, shiftFilter],
  );
  const subjectById = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const roomById = useMemo(() => new Map(state.rooms.map((r) => [r.id, r])), [state.rooms]);
  const teacherById = useMemo(() => new Map(state.teachers.map((t) => [t.id, t])), [state.teachers]);

  const cells = useMemo(() => {
    const result = new Map<string, Lesson[]>();
    for (const lesson of state.schedule) {
      if (lesson.day !== day) continue;
      const slot = `${lesson.classId}|${key(lesson.shift, lesson.period)}`;
      const lessons = result.get(slot) ?? [];
      lessons.push(lesson);
      result.set(slot, lessons);
    }
    return result;
  }, [day, state.schedule]);

  return (
    <div className="print-area timetable-scroll focus-ring" tabIndex={0} role="region" aria-label="Сводное расписание по классам">
      <table className="w-full min-w-[760px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th scope="col" className="timetable-time w-[70px] rounded-lg bg-panel2/60 px-2 py-2 text-[10.5px] tracking-[0.14em] text-dim uppercase">
              Урок
            </th>
            {classes.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="rounded-lg bg-panel2/60 px-2 py-2 text-[12.5px] font-semibold text-chalk"
              >
                {c.name}
                <span className="ml-1 text-[10px] font-normal text-dim">{c.shift} см.</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, index) => (
            <Fragment key={key(p.shift, p.period)}>
              {periods[index - 1]?.shift !== p.shift && (
                <tr className="timetable-shift"><th colSpan={classes.length + 1}>{p.shift}-я смена</th></tr>
              )}
              <tr>
                <th scope="row" className="timetable-time rounded-lg border border-line px-2 py-1 text-center">
                  <span className="font-display text-[15px] font-bold text-action tabular">
                    {numbers.get(key(p.shift, p.period)) ?? p.period}
                  </span>
                  <span className="block text-[9.5px] text-dim tabular">
                    {String(Math.floor(p.start / 60)).padStart(2, "0")}:
                    {String(p.start % 60).padStart(2, "0")}
                  </span>
                </th>
                {classes.map((c) => {
                  const lessons = cells.get(`${c.id}|${key(p.shift, p.period)}`);
                  if (!lessons?.length) {
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "rounded-lg border border-dashed px-1.5 py-1.5 text-center text-[10px]",
                          c.shift === p.shift ? "border-line/50 text-dim/50" : "border-line/20 text-dim/25",
                        )}
                      >
                        {c.shift === p.shift ? "" : "другая смена"}
                      </td>
                    );
                  }
                  return (
                    <td key={c.id} className="p-0 align-top">
                      {lessons.map((l) => {
                        const subject = subjectById.get(l.subjectId);
                        const Card = onSelect ? "button" : "div";
                        return (
                          <Card
                            type={onSelect ? "button" : undefined}
                            key={l.id}
                            onClick={() => onSelect?.(l)}
                            className={cn(
                              "lesson-chip focus-ring block w-full rounded-lg border border-line border-l-[3px] bg-panel px-2 py-1.5 text-left",
                              onSelect && "cursor-pointer",
                            )}
                            style={{
                              borderLeftColor: subject?.color ?? "#6d8683",
                            }}
                          >
                            <span className="block text-[11.5px] leading-tight font-semibold text-chalk">
                              {subject?.name ?? "?"}
                            </span>
                            <span className="block mt-0.5 truncate text-[10px] text-muted">
                              {l.groups
                                .map((g) => (g.teacherId ? shortTeacher(teacherById.get(g.teacherId)?.name ?? "") : ""))
                                .filter(Boolean)
                                .join(" · ") || "—"}
                              {" · "}
                              {l.groups
                                .map((g) => (g.roomId ? roomById.get(g.roomId)?.number : ""))
                                .filter(Boolean)
                                .join(", ") || "—"}
                            </span>
                          </Card>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
