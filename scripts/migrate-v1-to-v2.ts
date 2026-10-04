// Миграция v1 -> v2: node --experimental-strip-types scripts/migrate-v1-to-v2.ts --v1 backup/v1-custom.db --v2 ./dev.db [--admin-password XXX]
// - v1 не трогается (только чтение), бэкап лежит в backup/v1-custom.db
// - id сохраняются 1:1; дубли Lesson(date,classId,subjectId) схлопываются (первый id живёт)
// - пароли: legacy_sha256$<hash>, при первом входе verifyPassword() перехеширует в scrypt
// - админам лучше задать --admin-password (scrypt сразу); без него — legacy + WARN
// - нормализация: даты -> YYYY-MM-DD, оценки -> 5/4/3/2/Н/'', комментарии '' вместо null
// - всё пишется в транзакции, батчами по 500
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(_scrypt);

const ALLOWED_GRADES = new Set(["5", "4", "3", "2", "Н", ""]);

function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? "1" : argv[++i];
    }
  }
  return out;
}

function normDate(raw: unknown): string | null {
  // Excel-сериал из xlsx-импорта v1 (например "46083" -> 2026-03-04)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (/^\d{4,6}(\.0)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normGrade(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (ALLOWED_GRADES.has(s)) return s;
  if (s.toLowerCase() === "н") return "Н";
  return "";
}

async function hashAdmin(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const d = (await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return `scrypt$16384$8$1$${salt.toString("hex")}$${d.toString("hex")}`;
}

const V2_DDL = `
CREATE TABLE IF NOT EXISTS Teacher (id INTEGER PRIMARY KEY, lastName TEXT NOT NULL, firstName TEXT NOT NULL, fullName TEXT NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'учитель', isVospitatel INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Session (id INTEGER PRIMARY KEY, tokenHash TEXT NOT NULL UNIQUE, teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, expiresAt DATETIME NOT NULL, ip TEXT NOT NULL DEFAULT '', userAgent TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Class (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Subject (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Student (id INTEGER PRIMARY KEY, fullName TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, classId INTEGER NOT NULL REFERENCES Class(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS TeacherClass (teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, classId INTEGER NOT NULL REFERENCES Class(id) ON DELETE CASCADE, PRIMARY KEY (teacherId, classId));
CREATE TABLE IF NOT EXISTS TeacherSubject (teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, subjectId INTEGER NOT NULL REFERENCES Subject(id) ON DELETE CASCADE, PRIMARY KEY (teacherId, subjectId));
CREATE TABLE IF NOT EXISTS Lesson (id INTEGER PRIMARY KEY, date TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', homework TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, classId INTEGER NOT NULL REFERENCES Class(id) ON DELETE CASCADE, subjectId INTEGER NOT NULL REFERENCES Subject(id) ON DELETE CASCADE, teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, UNIQUE (date, classId, subjectId));
CREATE TABLE IF NOT EXISTS Grade (id INTEGER PRIMARY KEY, value TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, lessonId INTEGER NOT NULL REFERENCES Lesson(id) ON DELETE CASCADE, studentId INTEGER NOT NULL REFERENCES Student(id) ON DELETE CASCADE, teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, UNIQUE (lessonId, studentId));
CREATE TABLE IF NOT EXISTS Recommendation (id INTEGER PRIMARY KEY, text TEXT NOT NULL, isCurrent INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, studentId INTEGER NOT NULL REFERENCES Student(id) ON DELETE CASCADE, authorId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ActionLog (id INTEGER PRIMARY KEY, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, action TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ResponsibleEducator (teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, classId INTEGER NOT NULL REFERENCES Class(id) ON DELETE CASCADE, PRIMARY KEY (teacherId, classId));
CREATE TABLE IF NOT EXISTS TeacherState (id INTEGER PRIMARY KEY, lastClassId INTEGER, lastSubjectId INTEGER, lastDate TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, teacherId INTEGER NOT NULL UNIQUE REFERENCES Teacher(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_teacher_lastName ON Teacher(lastName);
CREATE INDEX IF NOT EXISTS idx_student_class ON Student(classId);
CREATE INDEX IF NOT EXISTS idx_lesson_date ON Lesson(date);
CREATE INDEX IF NOT EXISTS idx_grade_student ON Grade(studentId);
CREATE INDEX IF NOT EXISTS idx_log_teacher ON ActionLog(teacherId);
`;

async function main() {
  const a = args();
  const v1Path = a["v1"] ?? "backup/v1-custom.db";
  const v2Path = a["v2"] ?? "./dev.db";
  const adminPw: string | undefined = a["admin-password"];

  const v1 = new DatabaseSync(v1Path, { readOnly: true });
  const v2 = new DatabaseSync(v2Path);
  v2.exec("PRAGMA foreign_keys=OFF");
  v2.exec(V2_DDL);

  const stats: Record<string, number> = {};
  const warns: string[] = [];
  const lessonRemap = new Map<number, number>(); // oldLessonId -> keptLessonId

  if (adminPw) (globalThis as any).__adminHash = await hashAdmin(adminPw);

  v2.exec("BEGIN");
  try {
    const runTx = () => {
    // 1. Teacher (пароли -> legacy_sha256$, админам опционально scrypt)
    const teachers = v1.prepare("SELECT * FROM Teacher").all() as any[];
    const insT = v2.prepare(
      "INSERT OR REPLACE INTO Teacher (id,lastName,firstName,fullName,passwordHash,role,isVospitatel,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    for (const t of teachers) {
      let ph = `legacy_sha256$${t.password}`;
      if (t.role === "админ" && adminPw) ph = (globalThis as any).__adminHash;
      insT.run(t.id, t.lastName, t.firstName, t.fullName, ph, t.role ?? "учитель", t.isVospitatel ? 1 : 0, t.createdAt, t.updatedAt);
    }
    stats.Teacher = teachers.length;
    if (teachers.some((t) => t.role === "админ") && !adminPw)
      warns.push("WARN: админу оставлен legacy-пароль — смените через /api/admin/passwords");

    // 2-3. Class, Subject (сохраняем id)
    const classes = v1.prepare("SELECT * FROM Class").all() as any[];
    const insC = v2.prepare("INSERT OR REPLACE INTO Class (id,name,createdAt,updatedAt) VALUES (?,?,?,?)");
    for (const c of classes) insC.run(c.id, c.name, c.createdAt, c.createdAt);
    stats.Class = classes.length;

    const subjects = v1.prepare("SELECT * FROM Subject").all() as any[];
    const insS = v2.prepare("INSERT OR REPLACE INTO Subject (id,name,createdAt,updatedAt) VALUES (?,?,?,?)");
    for (const s of subjects) insS.run(s.id, s.name, s.createdAt, s.createdAt);
    stats.Subject = subjects.length;

    const classIds = new Set(classes.map((c) => c.id));
    const subjectIds = new Set(subjects.map((s) => s.id));
    const teacherIds = new Set(teachers.map((t) => t.id));

    // M2M (в v1 сейчас пустые, но переносим как есть)
    for (const t of ["TeacherClass", "TeacherSubject", "ResponsibleEducator"] as const) {
      try {
        const rows = v1.prepare(`SELECT * FROM ${t}`).all() as any[];
        const col2 = t === "TeacherSubject" ? "subjectId" : "classId";
        const ins = v2.prepare(`INSERT OR IGNORE INTO ${t} (teacherId,${col2}) VALUES (?,?)`);
        let n = 0;
        for (const r of rows) {
          if (!teacherIds.has(r.teacherId)) { warns.push(`SKIP ${t} teacher=${r.teacherId} (нет учителя)`); continue; }
          ins.run(r.teacherId, r[col2]); n++;
        }
        stats[t] = n;
      } catch { stats[t] = 0; }
    }

    // 4. Student (только к существующим классам)
    const students = v1.prepare("SELECT * FROM Student").all() as any[];
    const insSt = v2.prepare("INSERT OR REPLACE INTO Student (id,fullName,active,createdAt,updatedAt,classId) VALUES (?,?,?,?,?,?)");
    let nSt = 0;
    const studentClass = new Map<number, number>();
    for (const s of students) {
      if (!classIds.has(s.classId)) { warns.push(`SKIP Student#${s.id} class=${s.classId} (нет класса)`); continue; }
      insSt.run(s.id, s.fullName, s.active ? 1 : 0, s.createdAt, s.createdAt, s.classId);
      studentClass.set(s.id, s.classId); nSt++;
    }
    stats.Student = nSt;

    // 5. Lesson (нормализация дат, схлопывание дублей)
    const lessons = v1.prepare("SELECT * FROM Lesson ORDER BY id").all() as any[];
    const insL = v2.prepare(
      "INSERT OR REPLACE INTO Lesson (id,date,topic,homework,createdAt,updatedAt,classId,subjectId,teacherId) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    const seen = new Map<string, number>(); // date|class|subject -> keptId
    let nL = 0;
    for (const l of lessons) {
      const d = normDate(l.date);
      if (!d) { warns.push(`SKIP Lesson#${l.id} date=${JSON.stringify(l.date)}`); continue; }
      if (!classIds.has(l.classId) || !subjectIds.has(l.subjectId) || !teacherIds.has(l.teacherId)) {
        warns.push(`SKIP Lesson#${l.id} (битая ссылка)`); continue;
      }
      const key = `${d}|${l.classId}|${l.subjectId}`;
      if (seen.has(key)) {
        lessonRemap.set(l.id, seen.get(key)!);
        warns.push(`DUPE Lesson#${l.id} -> #${seen.get(key)} (${key})`);
        continue;
      }
      seen.set(key, l.id);
      lessonRemap.set(l.id, l.id);
      insL.run(l.id, d, l.topic ?? "", l.homework ?? "", l.createdAt, l.updatedAt, l.classId, l.subjectId, l.teacherId);
      nL++;
    }
    stats.Lesson = nL;

    // 6. Grade (только к живым урокам/ученикам, класс ученика == класс урока)
    const grades = v1.prepare("SELECT * FROM Grade ORDER BY id").all() as any[];
    const insG = v2.prepare(
      "INSERT OR REPLACE INTO Grade (id,value,comment,createdAt,updatedAt,lessonId,studentId,teacherId) VALUES (?,?,?,?,?,?,?,?)"
    );
    const lessonClass = new Map<number, number>();
    for (const [oldId, keptId] of lessonRemap) {
      const row = (lessons as any[]).find((x) => x.id === keptId);
      if (row) lessonClass.set(oldId, row.classId);
    }
    let nG = 0;
    for (const g of grades) {
      const kept = lessonRemap.get(g.lessonId);
      if (kept === undefined) { warns.push(`SKIP Grade#${g.id} lesson=${g.lessonId} (урок отброшен)`); continue; }
      if (!studentClass.has(g.studentId)) { warns.push(`SKIP Grade#${g.id} student=${g.studentId} (нет ученика)`); continue; }
      if (studentClass.get(g.studentId) !== lessonClass.get(g.lessonId)) {
        warns.push(`SKIP Grade#${g.id} (класс ученика != класс урока)`); continue;
      }
      if (!teacherIds.has(g.teacherId)) { warns.push(`SKIP Grade#${g.id} teacher=${g.teacherId}`); continue; }
      insG.run(g.id, normGrade(g.value), g.comment ?? "", g.createdAt, g.createdAt, kept, g.studentId, g.teacherId);
      nG++;
    }
    stats.Grade = nG;

    // 7-8. Recommendation, ActionLog, TeacherState
    const recs = v1.prepare("SELECT * FROM Recommendation").all() as any[];
    const insR = v2.prepare("INSERT OR REPLACE INTO Recommendation (id,text,isCurrent,createdAt,updatedAt,studentId,authorId) VALUES (?,?,?,?,?,?,?)");
    let nR = 0;
    for (const r of recs) {
      if (!studentClass.has(r.studentId) || !teacherIds.has(r.authorId)) { warns.push(`SKIP Recommendation#${r.id}`); continue; }
      insR.run(r.id, r.text, r.isCurrent ? 1 : 0, r.createdAt, r.updatedAt, r.studentId, r.authorId); nR++;
    }
    stats.Recommendation = nR;

    const logs = v1.prepare("SELECT * FROM ActionLog").all() as any[];
    const insA = v2.prepare("INSERT OR REPLACE INTO ActionLog (id,timestamp,action,description,ip,teacherId) VALUES (?,?,?,?,?,?)");
    let nA = 0;
    for (const l of logs) {
      if (!teacherIds.has(l.teacherId)) continue; // логи сирот тихо дропаем
      insA.run(l.id, l.timestamp ?? l.createdAt, l.action, l.description ?? "", "", l.teacherId); nA++;
    }
    stats.ActionLog = nA;

    try {
      const states = v1.prepare("SELECT * FROM TeacherState").all() as any[];
      const insTs = v2.prepare("INSERT OR REPLACE INTO TeacherState (id,lastClassId,lastSubjectId,lastDate,createdAt,updatedAt,teacherId) VALUES (?,?,?,?,?,?,?)");
      for (const s of states) {
        if (!teacherIds.has(s.teacherId)) continue;
        insTs.run(s.id, s.lastClassId, s.lastSubjectId, normDate(s.lastDate) ?? s.lastDate, s.createdAt, s.updatedAt, s.teacherId);
      }
      stats.TeacherState = states.length;
    } catch { stats.TeacherState = 0; }
    }; // end runTx
    runTx();
    v2.exec("COMMIT");
  } catch (e) {
    try { v2.exec("ROLLBACK"); } catch { /* noop */ }
    throw e;
  }

  // Верификация
  const q = (sql: string) => (v2.prepare(sql).get() as any);
  const orphan = {
    student_no_class: q("SELECT COUNT(*) c FROM Student s LEFT JOIN Class c ON c.id=s.classId WHERE c.id IS NULL").c,
    lesson_no_class: q("SELECT COUNT(*) c FROM Lesson l LEFT JOIN Class c ON c.id=l.classId WHERE c.id IS NULL").c,
    lesson_no_subject: q("SELECT COUNT(*) c FROM Lesson l LEFT JOIN Subject s ON s.id=l.subjectId WHERE s.id IS NULL").c,
    grade_no_lesson: q("SELECT COUNT(*) c FROM Grade g LEFT JOIN Lesson l ON l.id=g.lessonId WHERE l.id IS NULL").c,
    grade_no_student: q("SELECT COUNT(*) c FROM Grade g LEFT JOIN Student s ON s.id=g.studentId WHERE s.id IS NULL").c,
  };
  const dupes = v2.prepare("SELECT date,classId,subjectId,COUNT(*) c FROM Lesson GROUP BY date,classId,subjectId HAVING c>1").all();
  const counts: Record<string, number> = {};
  for (const t of ["Teacher", "Class", "Subject", "Student", "Lesson", "Grade", "Recommendation", "ActionLog"]) {
    counts[t] = (v2.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c;
  }

  console.log(JSON.stringify({ v1: v1Path, v2: v2Path, stats, counts, orphan, dupes, warns }, null, 2));
  const bad = Object.values(orphan).some((c) => (c as number) > 0) || (dupes as unknown[]).length > 0;
  if (bad) { console.error("VERIFY FAILED"); process.exit(2); }
  console.log("VERIFY OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
