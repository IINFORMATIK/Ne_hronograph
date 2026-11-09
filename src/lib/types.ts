export type ID = string;

/** 1 = понедельник … 7 = воскресенье */
export type Day = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RoomType = "standard" | "specialized";
export type Shift = 1 | 2;

export interface Specialization {
  id: ID;
  name: string;
  /** встроенная специализация защищена от случайного удаления */
  builtin?: boolean;
}

export interface Classroom {
  id: ID;
  number: string;
  type: RoomType;
  specializationId: ID | null;
  capacity: number | null;
  note?: string;
}

export interface Subject {
  id: ID;
  name: string;
  short?: string;
  /** за какой специализацией кабинета закреплён предмет */
  specializationId: ID | null;
  color: string;
  /** 1 — лёгкий, 5 — сложный (влияет на размещение в начале дня/недели) */
  difficulty: number;
  /** разрешены ли сдвоенные уроки (пары) */
  allowPairs?: boolean;
}

export interface TeacherUnavailable {
  day: Day;
  /** сквозной номер урока в рамках смены */
  period: number;
  shift: Shift;
}

export interface Teacher {
  id: ID;
  name: string;
  /** классное руководство */
  homeroomClassIds?: ID[];
  /** Поле в старых базах. */
  homeroomClassId?: ID | null;
  subjectIds: ID[];
  maxLessonsPerDay: number | null;
  unavailable: TeacherUnavailable[];
  note?: string;
}

export interface ClassSubject {
  id: ID;
  subjectId: ID;
  teacherId: ID | null;
  hoursPerWeek: number;
  /** 1 — весь класс, 2 — деление на подгруппы */
  groups: 1 | 2;
  group2TeacherId: ID | null;
  /** переопределение требуемой специализации кабинета */
  roomSpecializationId?: ID | null;
}

export interface SchoolClass {
  id: ID;
  name: string;
  grade: number;
  shift: Shift;
  maxLessonsPerDay: number;
  workdays: Day[];
  /** закреплённый (основной) кабинет */
  homeRoomId: ID | null;
  subjects: ClassSubject[];
}

export interface Bell {
  id: ID;
  shift: Shift;
  /** номер урока внутри смены */
  period: number;
  start: string; // "08:30"
  end: string; // "09:15"
}

export interface LessonGroup {
  teacherId: ID | null;
  roomId: ID | null;
  /** наименование подгруппы: "" для всего класса, "1 подгруппа"/"2 подгруппа" */
  label?: string;
}

export interface Lesson {
  id: ID;
  classId: ID;
  day: Day;
  shift: Shift;
  /** номер урока внутри смены */
  period: number;
  subjectId: ID;
  groups: LessonGroup[];
  classSubjectId?: ID;
  locked?: boolean;
  note?: string;
}

export interface Substitution {
  id: ID;
  /** ISO-дата конкретного дня, на который оформлена замена */
  date: string;
  lessonId: ID | null;
  classId: ID;
  day: Day;
  period: number;
  shift: Shift;
  subjectId: ID;
  roomId: ID | null;
  originalTeacherId: ID | null;
  replacementTeacherId: ID | null;
  combinedGroups?: boolean;
  /** null = урок отменён */
  status: "replaced" | "cancelled";
  reason: string;
  createdAt: string;
}

export interface GeneratorWeights {
  sameTeacherConsecutive: number;
  sameSubjectPerDay: number;
  roomFallback: number;
  specRoomMisuse: number;
  roomChange: number;
  teacherWindows: number;
  difficultyPosition: number;
  subjectSpread: number;
  teacherDailyLoad: number;
  homeRoom: number;
}

export interface Settings {
  schoolName: string;
  workdays: Day[];
  /** максимум уроков в школе за день (регулируется администратором) */
  maxLessonsPerDay: number;
  lessonMinutes: number;
  breakMinutes: number;
  bigBreakMinutes: number;
  bigBreakAfter: number;
  shift2Start: string;
  shift1Start: string;
  /** максимум подряд идущих окон у педагога (строго) */
  maxTeacherWindows: number;
  /** показывать обе смены / только первую / только вторую по умолчанию */
  defaultShiftFilter: "all" | Shift;
  weights: GeneratorWeights;
  generatorTimeBudgetMs: number;
  generatorRandomness: number;
}

export interface AppState {
  format: number;
  school: {
    name: string;
  };
  settings: Settings;
  specializations: Specialization[];
  subjects: Subject[];
  rooms: Classroom[];
  teachers: Teacher[];
  classes: SchoolClass[];
  bells: Bell[];
  schedule: Lesson[];
  substitutions: Substitution[];
  meta: {
    createdAt: string;
    updatedAt: string;
    lastGeneratedAt?: string | null;
  };
}

export const DAY_NAMES: Record<Day, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

export const DAY_SHORT: Record<Day, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

export const ALL_DAYS: Day[] = [1, 2, 3, 4, 5, 6, 7];

export const DEFAULT_WEIGHTS: GeneratorWeights = {
  sameTeacherConsecutive: 120,
  sameSubjectPerDay: 60,
  roomFallback: 55,
  specRoomMisuse: 35,
  roomChange: 8,
  teacherWindows: 22,
  difficultyPosition: 10,
  subjectSpread: 12,
  teacherDailyLoad: 6,
  homeRoom: 6,
};
