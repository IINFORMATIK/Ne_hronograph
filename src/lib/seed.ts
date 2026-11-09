import type {
  AppState,
  Bell,
  Classroom,
  SchoolClass,
  Settings,
  Specialization,
  Subject,
  Teacher,
} from "./types";
import { DEFAULT_WEIGHTS } from "./types";
import { generateBells } from "./time";

export const SUBJECT_PALETTE = [
  "#E9C46A",
  "#56D6A0",
  "#FF8A6B",
  "#5AA9E6",
  "#86C232",
  "#F4A261",
  "#48BFE3",
  "#E76F51",
  "#90BE6D",
  "#C9A227",
  "#8DA9C4",
  "#FFB703",
  "#2FBF8F",
  "#D4A373",
  "#C1443C",
  "#6B705C",
];

export function defaultSettings(): Settings {
  return {
    schoolName: "Гимназия № 14",
    workdays: [1, 2, 3, 4, 5],
    maxLessonsPerDay: 8,
    lessonMinutes: 45,
    breakMinutes: 10,
    bigBreakMinutes: 20,
    bigBreakAfter: 2,
    shift1Start: "08:00",
    shift2Start: "12:30",
    maxTeacherWindows: 2,
    defaultShiftFilter: "all",
    weights: { ...DEFAULT_WEIGHTS },
    generatorTimeBudgetMs: 6000,
    generatorRandomness: 0.3,
  };
}

export function builtinSpecializations(): Specialization[] {
  const base: Array<[string, string]> = [
    ["spec-english", "Английский язык"],
    ["spec-informatics", "Информатика"],
    ["spec-physics", "Физика"],
    ["spec-chemistry", "Химия"],
    ["spec-pe", "Физкультура"],
    ["spec-art", "ИЗО"],
  ];
  return base.map(([id, name]) => ({ id, name, builtin: true }));
}

interface SubjectSeed {
  id: string;
  name: string;
  short?: string;
  spec?: string;
  color: string;
  difficulty: number;
  allowPairs?: boolean;
}

export function defaultSubjects(specializations: Specialization[]): Subject[] {
  const spec = (key: string) => specializations.find((s) => s.id === key)?.id ?? null;
  const seeds: SubjectSeed[] = [
    { id: "subj-russian", name: "Русский язык", short: "Рус", color: "#E9C46A", difficulty: 5 },
    { id: "subj-literature", name: "Литература", short: "Лит", color: "#D4A373", difficulty: 3 },
    { id: "subj-math", name: "Математика", short: "Мат", color: "#56D6A0", difficulty: 5 },
    { id: "subj-algebra", name: "Алгебра", short: "Алг", color: "#2FBF8F", difficulty: 5 },
    { id: "subj-geometry", name: "Геометрия", short: "Геом", color: "#86C232", difficulty: 4 },
    { id: "subj-physics", name: "Физика", short: "Физ", spec: "spec-physics", color: "#5AA9E6", difficulty: 5, allowPairs: true },
    { id: "subj-chemistry", name: "Химия", short: "Хим", spec: "spec-chemistry", color: "#48BFE3", difficulty: 4, allowPairs: true },
    { id: "subj-biology", name: "Биология", short: "Био", color: "#90BE6D", difficulty: 3 },
    { id: "subj-geography", name: "География", short: "Гео", color: "#C9A227", difficulty: 2 },
    { id: "subj-history", name: "История", short: "Ист", color: "#E76F51", difficulty: 4 },
    { id: "subj-social", name: "Обществознание", short: "Общ", color: "#F4A261", difficulty: 3 },
    { id: "subj-english", name: "Английский язык", short: "Англ", spec: "spec-english", color: "#FF8A6B", difficulty: 4 },
    { id: "subj-informatics", name: "Информатика", short: "Инф", spec: "spec-informatics", color: "#8DA9C4", difficulty: 3 },
    { id: "subj-pe", name: "Физкультура", short: "ФК", spec: "spec-pe", color: "#FFB703", difficulty: 1 },
    { id: "subj-art", name: "ИЗО", short: "ИЗО", spec: "spec-art", color: "#C1443C", difficulty: 1 },
    { id: "subj-music", name: "Музыка", short: "Муз", color: "#F9844A", difficulty: 1 },
    { id: "subj-technology", name: "Технология", short: "Тех", color: "#A47148", difficulty: 1, allowPairs: true },
    { id: "subj-safety", name: "ОБЖ", short: "ОБЖ", color: "#6B705C", difficulty: 2 },
  ];
  return seeds.map((s) => ({
    id: s.id,
    name: s.name,
    short: s.short,
    specializationId: s.spec ? spec(s.spec) : null,
    color: s.color,
    difficulty: s.difficulty,
    allowPairs: s.allowPairs ?? false,
  }));
}

export function defaultBells(settings: Settings): Bell[] {
  const first = generateBells({
    shift: 1,
    count: 7,
    start: settings.shift1Start,
    lessonMinutes: settings.lessonMinutes,
    breakMinutes: settings.breakMinutes,
    bigBreakAfter: settings.bigBreakAfter,
    bigBreakMinutes: settings.bigBreakMinutes,
  });
  const second = generateBells({
    shift: 2,
    count: 6,
    start: settings.shift2Start,
    lessonMinutes: settings.lessonMinutes,
    breakMinutes: settings.breakMinutes,
    bigBreakAfter: settings.bigBreakAfter,
    bigBreakMinutes: settings.bigBreakMinutes,
  });
  return [...first, ...second];
}

export function createEmptyState(): AppState {
  const settings = defaultSettings();
  const specializations = builtinSpecializations();
  const now = new Date().toISOString();
  return {
    format: 1,
    school: { name: settings.schoolName },
    settings,
    specializations,
    subjects: defaultSubjects(specializations),
    rooms: [],
    teachers: [],
    classes: [],
    bells: defaultBells(settings),
    schedule: [],
    substitutions: [],
    meta: { createdAt: now, updatedAt: now, lastGeneratedAt: null },
  };
}

/* ------------------------------------------------------------------ */
/* Демо-школа: кабинеты, педагоги, классы и учебная нагрузка            */
/* ------------------------------------------------------------------ */

function demoRooms(specializations: Specialization[]): Classroom[] {
  const spec = (key: string) => specializations.find((s) => s.id === key)?.id ?? null;
  const standard: Array<[string, number, string?]> = [
    ["101", 28],
    ["102", 28],
    ["103", 30],
    ["104", 30],
    ["105", 30],
    ["106", 26],
    ["107", 26],
    ["109", 24],
    ["110", 24],
    ["205", 24],
    ["206", 24],
  ];
  const rooms: Classroom[] = standard.map(([number, capacity]) => ({
    id: `room-${number}`,
    number,
    type: "standard" as const,
    specializationId: null,
    capacity,
  }));
  const specialized: Array<[string, string, string, number]> = [
    ["201", "Кабинет физики", "spec-physics", 24],
    ["202", "Кабинет химии", "spec-chemistry", 24],
    ["203", "Компьютерный класс", "spec-informatics", 16],
    ["304", "Кабинет английского №1", "spec-english", 16],
    ["305", "Кабинет английского №2", "spec-english", 16],
    ["306", "Кабинет английского №3", "spec-english", 16],
    ["301", "Кабинет ИЗО", "spec-art", 20],
    ["108", "Мастерская", "spec-technology", 20],
    ["gym1", "Спортзал", "spec-pe", 40],
    ["gym2", "Малый спортзал", "spec-pe", 25],
  ];
  for (const [id, note, specKey, capacity] of specialized) {
    rooms.push({
      id: `room-${id}`,
      number: note,
      type: "specialized",
      specializationId: spec(specKey),
      capacity,
    });
  }
  return rooms;
}

interface TeacherSeed {
  id: string;
  name: string;
  homeroom?: string;
  subjects: string[];
  maxPerDay?: number;
}

function demoTeachers(): Teacher[] {
  const seeds: TeacherSeed[] = [
    { id: "t1", name: "Смирнова Ольга Петровна", homeroom: "cls-5a", subjects: ["subj-russian", "subj-literature"] },
    { id: "t2", name: "Ковалёв Андрей Игоревич", homeroom: "cls-7a", subjects: ["subj-math", "subj-algebra", "subj-geometry", "subj-informatics"] },
    { id: "t3", name: "Нгуен Мария Сергеевна", subjects: ["subj-physics", "subj-math"] },
    { id: "t4", name: "Соколова Ирина Викторовна", subjects: ["subj-chemistry", "subj-biology"] },
    { id: "t5", name: "Волков Дмитрий Алексеевич", subjects: ["subj-history", "subj-social", "subj-geography"] },
    { id: "t6", name: "Лебедева Анна Николаевна", subjects: ["subj-english"] },
    { id: "t7", name: "Морозова Екатерина Дмитриевна", subjects: ["subj-english"] },
    { id: "t8", name: "Орлов Сергей Валентинович", subjects: ["subj-pe", "subj-safety"], maxPerDay: 5 },
    { id: "t9", name: "Зайцева Полина Аркадьевна", subjects: ["subj-art", "subj-music", "subj-technology"] },
    { id: "t10", name: "Фёдоров Игорь Станиславович", subjects: ["subj-informatics", "subj-physics"] },
    { id: "t11", name: "Павлова Наталья Юрьевна", homeroom: "cls-6a", subjects: ["subj-russian", "subj-literature"] },
    { id: "t12", name: "Громов Артём Львович", homeroom: "cls-9a", subjects: ["subj-history", "subj-social"] },
    { id: "t13", name: "Егорова Светлана Павловна", homeroom: "cls-10a", subjects: ["subj-math", "subj-algebra", "subj-geometry"] },
    { id: "t14", name: "Титова Юлия Марковна", homeroom: "cls-8a", subjects: ["subj-biology", "subj-chemistry", "subj-safety"] },
  ];
  return seeds.map((s) => ({
    id: s.id,
    name: s.name,
    homeroomClassIds: s.homeroom ? [s.homeroom] : [],
    subjectIds: s.subjects,
    maxLessonsPerDay: s.maxPerDay ?? null,
    unavailable: [],
  }));
}

type Row = [subjectId: string, hours: number, teacherId: string, groups?: 1 | 2, group2?: string];

function demoClasses(): SchoolClass[] {
  const base = {
    workdays: [1, 2, 3, 4, 5] as Array<1 | 2 | 3 | 4 | 5>,
  };
  const defs: Array<{
    id: string;
    name: string;
    grade: number;
    shift: 1 | 2;
    maxLessonsPerDay: number;
    homeRoomId: string;
    rows: Row[];
  }> = [
    {
      id: "cls-5a",
      name: "5А",
      grade: 5,
      shift: 1,
      maxLessonsPerDay: 5,
      homeRoomId: "room-101",
      rows: [
        ["subj-russian", 5, "t1"],
        ["subj-literature", 2, "t1"],
        ["subj-math", 5, "t2"],
        ["subj-english", 2, "t6", 2, "t7"],
        ["subj-history", 1, "t5"],
        ["subj-geography", 1, "t5"],
        ["subj-biology", 1, "t4"],
        ["subj-pe", 3, "t8"],
        ["subj-art", 1, "t9"],
        ["subj-music", 1, "t9"],
        ["subj-technology", 1, "t9"],
        ["subj-informatics", 1, "t10"],
      ],
    },
    {
      id: "cls-6a",
      name: "6А",
      grade: 6,
      shift: 1,
      maxLessonsPerDay: 6,
      homeRoomId: "room-102",
      rows: [
        ["subj-russian", 5, "t11"],
        ["subj-literature", 2, "t11"],
        ["subj-math", 5, "t13"],
        ["subj-english", 3, "t6", 2, "t7"],
        ["subj-history", 2, "t5"],
        ["subj-geography", 1, "t5"],
        ["subj-biology", 1, "t4"],
        ["subj-pe", 2, "t8"],
        ["subj-art", 1, "t9"],
        ["subj-music", 1, "t9"],
        ["subj-technology", 2, "t9"],
        ["subj-informatics", 1, "t10"],
      ],
    },
    {
      id: "cls-7a",
      name: "7А",
      grade: 7,
      shift: 1,
      maxLessonsPerDay: 7,
      homeRoomId: "room-103",
      rows: [
        ["subj-russian", 5, "t1"],
        ["subj-literature", 2, "t1"],
        ["subj-algebra", 3, "t2"],
        ["subj-geometry", 2, "t2"],
        ["subj-english", 3, "t7", 2, "t6"],
        ["subj-physics", 2, "t3"],
        ["subj-history", 2, "t5"],
        ["subj-geography", 2, "t5"],
        ["subj-biology", 2, "t14"],
        ["subj-pe", 2, "t8"],
        ["subj-art", 1, "t9"],
        ["subj-technology", 2, "t9"],
        ["subj-informatics", 1, "t10"],
        ["subj-social", 1, "t12"],
      ],
    },
    {
      id: "cls-8a",
      name: "8А",
      grade: 8,
      shift: 2,
      maxLessonsPerDay: 6,
      homeRoomId: "room-104",
      rows: [
        ["subj-russian", 3, "t11"],
        ["subj-literature", 2, "t11"],
        ["subj-algebra", 3, "t13"],
        ["subj-geometry", 2, "t13"],
        ["subj-english", 3, "t6", 2, "t7"],
        ["subj-physics", 2, "t3"],
        ["subj-chemistry", 2, "t4"],
        ["subj-biology", 2, "t4"],
        ["subj-history", 2, "t12"],
        ["subj-social", 1, "t12"],
        ["subj-geography", 1, "t5"],
        ["subj-pe", 2, "t8"],
        ["subj-informatics", 2, "t10", 2, "t2"],
        ["subj-safety", 1, "t14"],
      ],
    },
    {
      id: "cls-9a",
      name: "9А",
      grade: 9,
      shift: 2,
      maxLessonsPerDay: 6,
      homeRoomId: "room-105",
      rows: [
        ["subj-russian", 3, "t11"],
        ["subj-literature", 2, "t11"],
        ["subj-algebra", 3, "t13"],
        ["subj-geometry", 2, "t13"],
        ["subj-english", 3, "t7", 2, "t6"],
        ["subj-physics", 2, "t3"],
        ["subj-chemistry", 2, "t4"],
        ["subj-biology", 2, "t14"],
        ["subj-history", 3, "t12"],
        ["subj-social", 2, "t12"],
        ["subj-pe", 2, "t8"],
        ["subj-informatics", 2, "t10", 2, "t2"],
        ["subj-safety", 1, "t14"],
      ],
    },
    {
      id: "cls-10a",
      name: "10А",
      grade: 10,
      shift: 2,
      maxLessonsPerDay: 6,
      homeRoomId: "room-106",
      rows: [
        ["subj-russian", 2, "t11"],
        ["subj-literature", 3, "t11"],
        ["subj-algebra", 3, "t13"],
        ["subj-geometry", 2, "t13"],
        ["subj-english", 3, "t6", 2, "t7"],
        ["subj-physics", 2, "t3"],
        ["subj-chemistry", 2, "t4"],
        ["subj-biology", 2, "t14"],
        ["subj-history", 2, "t12"],
        ["subj-social", 2, "t12"],
        ["subj-pe", 2, "t8"],
        ["subj-informatics", 1, "t10", 2, "t2"],
      ],
    },
  ];

  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    grade: d.grade,
    shift: d.shift,
    maxLessonsPerDay: d.maxLessonsPerDay,
    workdays: [...base.workdays],
    homeRoomId: d.homeRoomId,
    subjects: d.rows.map(([subjectId, hoursPerWeek, teacherId, groups, group2], i) => ({
      id: `${d.id}-cs${i + 1}`,
      subjectId,
      teacherId,
      hoursPerWeek,
      groups: (groups ?? 1) as 1 | 2,
      group2TeacherId: group2 ?? null,
      roomSpecializationId: null,
    })),
  }));
}

export function createDemoState(): AppState {
  const state = createEmptyState();
  state.settings.schoolName = "Гимназия № 14";
  state.school.name = state.settings.schoolName;
  // специализация «Технология» добавлена пользователем (не встроенная)
  state.specializations = [
    ...state.specializations,
    { id: "spec-technology", name: "Технология" },
  ];
  const technology = state.subjects.find((s) => s.id === "subj-technology");
  if (technology) technology.specializationId = "spec-technology";
  state.rooms = demoRooms(state.specializations);
  state.teachers = demoTeachers();
  state.classes = demoClasses();
  state.bells = defaultBells(state.settings);
  return state;
}
