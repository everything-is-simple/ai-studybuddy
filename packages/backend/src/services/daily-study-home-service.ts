import fs from 'fs';
import type { DatabaseType } from '../db/connection';
import { openExistingDbAtPath } from '../db/connection';
import { getGlobalDbPath, getSemesterDbPath } from '../db/paths';
import type {
  DailyStudyHomeDto,
  DailyStudyHomeExamDto,
  DailyStudyHomeMaterialDto,
  DailyStudyHomeScheduleDto,
  DailyStudyHomeNextActionDto,
  DailyStudyHomeTaskDto,
  StudyTaskType,
} from '@ai-studybuddy/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DailyStudyHomeError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'DailyStudyHomeError';
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_REGEX.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const checked = new Date(Date.UTC(year, month - 1, day));
  return checked.getUTCFullYear() === year && checked.getUTCMonth() === month - 1 && checked.getUTCDate() === day;
}

function addCalendarDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

function calendarDayDistance(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000);
}

function timeDay(value: string): string {
  return value.slice(0, 10);
}

function weekdayForCalendarDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

interface TaskRow {
  id: string;
  title: string;
  course_instance_id: string;
  course_name: string;
  deadline_at: string | null;
  type: StudyTaskType;
}

export class DailyStudyHomeService {
  private openReadySemesterDb(semesterId: unknown): DatabaseType {
    if (typeof semesterId !== 'string' || !UUID_REGEX.test(semesterId)) {
      throw new DailyStudyHomeError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    let globalDb: DatabaseType | undefined;
    try {
      globalDb = openExistingDbAtPath(getGlobalDbPath());
      const row = globalDb.prepare('SELECT ready FROM semesters WHERE id = ?').get(semesterId) as { ready: number } | undefined;
      if (!row) throw new DailyStudyHomeError('SEMESTER_NOT_FOUND', 404, '学期不存在');
      if (row.ready !== 1) throw new DailyStudyHomeError('SEMESTER_NOT_READY', 409, '学期尚未就绪');
    } catch (error) {
      if (error instanceof DailyStudyHomeError) throw error;
      throw new DailyStudyHomeError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    } finally {
      globalDb?.close();
    }
    const semesterDbPath = getSemesterDbPath(semesterId);
    if (!fs.existsSync(semesterDbPath)) throw new DailyStudyHomeError('SEMESTER_DB_NOT_FOUND', 500, '学期数据库不存在');
    return openExistingDbAtPath(semesterDbPath);
  }

  getHome(semesterId: unknown, date: unknown): DailyStudyHomeDto {
    if (typeof semesterId !== 'string' || !UUID_REGEX.test(semesterId)) {
      throw new DailyStudyHomeError('SEMESTER_NOT_FOUND', 404, '学期不存在');
    }
    if (!validDate(date)) throw new DailyStudyHomeError('INVALID_DATE', 400, 'date 必须是有效的 YYYY-MM-DD 日历日期');
    const db = this.openReadySemesterDb(semesterId);
    try {
      const mapTask = (row: TaskRow): DailyStudyHomeTaskDto => ({
        id: row.id,
        title: row.title,
        courseName: row.course_name,
        ...(row.deadline_at ? { deadlineAt: row.deadline_at } : {}),
        type: row.type,
      });
      const openTasks = db.prepare(`
        SELECT t.id, t.title, t.course_instance_id, c.name AS course_name, t.deadline_at, t.type
        FROM study_tasks t JOIN course_instances c ON c.id = t.course_instance_id
        WHERE t.status NOT IN ('done', 'skipped')
        ORDER BY CASE WHEN t.deadline_at IS NULL THEN 1 ELSE 0 END, t.deadline_at ASC, t.created_at ASC, t.id ASC
      `).all() as TaskRow[];
      const todayTasks = openTasks.filter((task) => task.deadline_at && timeDay(task.deadline_at) === date).map(mapTask);
      const tomorrowTasks = openTasks.filter((task) => task.deadline_at && timeDay(task.deadline_at) === addCalendarDays(date, 1)).map(mapTask);
      const errorReviews = openTasks.filter((task) => task.type === 'error_review').map(mapTask);
      const tomorrowSchedule = (db.prepare(`
        SELECT s.id, s.course_instance_id, c.name AS course_name, s.start_time, s.end_time, s.location
        FROM schedule_entries s JOIN course_instances c ON c.id = s.course_instance_id
        WHERE s.weekday = ?
        ORDER BY s.start_time ASC, s.end_time ASC, c.name ASC, s.id ASC
      `).all(weekdayForCalendarDate(addCalendarDays(date, 1))) as Array<{
        id: string; course_instance_id: string; course_name: string; start_time: string; end_time: string; location: string | null;
      }>).map((entry): DailyStudyHomeScheduleDto => ({
        id: entry.id,
        courseInstanceId: entry.course_instance_id,
        courseName: entry.course_name,
        startTime: entry.start_time,
        endTime: entry.end_time,
        ...(entry.location ? { location: entry.location } : {}),
      }));
      const upcomingExams = (db.prepare(`
        SELECT a.id, a.name, a.exam_at, c.name AS course_name
        FROM assessment_attempts a JOIN course_instances c ON c.id = a.course_instance_id
        WHERE a.confirmation_status = 'confirmed' AND substr(a.exam_at, 1, 10) >= ?
        ORDER BY a.exam_at ASC, a.id ASC LIMIT 5
      `).all(date) as Array<{ id: string; name: string; exam_at: string; course_name: string }>).map((exam): DailyStudyHomeExamDto => ({
        id: exam.id,
        name: exam.name,
        courseName: exam.course_name,
        examAt: exam.exam_at,
        daysUntil: calendarDayDistance(date, timeDay(exam.exam_at)),
      }));
      const pendingQualityMaterials = (db.prepare(`
        SELECT m.id, m.course_instance_id, c.name AS course_name, COALESCE(m.title, m.original_filename, m.id) AS title, m.status
        FROM materials m JOIN course_instances c ON c.id = m.course_instance_id
        WHERE m.status IN ('pending_quality_check', 'conversion_failed')
        ORDER BY m.updated_at ASC, m.id ASC LIMIT 8
      `).all() as Array<{ id: string; course_instance_id: string; course_name: string; title: string; status: 'pending_quality_check' | 'conversion_failed' }>).map((material): DailyStudyHomeMaterialDto => ({
        id: material.id,
        courseInstanceId: material.course_instance_id,
        courseName: material.course_name,
        title: material.title,
        status: material.status,
      }));

      let nextAction: DailyStudyHomeNextActionDto | null = null;
      if (pendingQualityMaterials[0]) {
        const material = pendingQualityMaterials[0];
        nextAction = {
          kind: 'quality_material',
          title: `${material.status === 'conversion_failed' ? '修正资料' : '补充资料'}：${material.title}`,
          path: `/materials?courseInstanceId=${material.courseInstanceId}`,
        };
      } else if (todayTasks[0]) {
        nextAction = { kind: 'today_task', title: todayTasks[0].title, path: `/courses/${openTasks.find((task) => task.id === todayTasks[0].id)?.course_instance_id}` };
      } else if (tomorrowTasks[0]) {
        nextAction = { kind: 'tomorrow_task', title: tomorrowTasks[0].title, path: `/courses/${openTasks.find((task) => task.id === tomorrowTasks[0].id)?.course_instance_id}` };
      } else if (errorReviews[0]) {
        nextAction = { kind: 'error_review', title: errorReviews[0].title, path: `/courses/${openTasks.find((task) => task.id === errorReviews[0].id)?.course_instance_id}` };
      } else if (upcomingExams[0]) {
        nextAction = { kind: 'upcoming_exam', title: `准备考试：${upcomingExams[0].name}`, path: `/exams/${upcomingExams[0].id}` };
      }

      return { semesterId, date, todayTasks, tomorrowTasks, tomorrowSchedule, upcomingExams, pendingQualityMaterials, errorReviews, nextAction };
    } finally {
      db.close();
    }
  }
}
