import type { StudyEventDto } from '@ai-studybuddy/shared';

interface StudyEventListProps {
  events: StudyEventDto[];
}

const EVENT_LABELS: Record<string, string> = {
  assessment_attempt_confirmed: '考试日期已确认',
  study_task_completed: '学习任务已完成',
  material_note_completed: '资料笔记已生成',
  knowledge_module_status_changed: '知识模块状态已更新',
  practice_completed: '限时练习已完成',
  mistake_reviewed: '错题重做结果',
  feedback_review_required: '知识模块需要复习',
  feedback_review_mastered: '错题复习已掌握',
};

const SOURCE_LABELS: Record<StudyEventDto['sourceSystem'], string> = {
  S1: 'S1学习节奏',
  S2: 'S2资料笔记',
  S3: 'S3限时练习',
  S4: 'S4错题改错',
  S5: 'S5期末冲刺',
  S7: 'S7课堂采集',
};

const QUALITY_LABELS: Record<NonNullable<StudyEventDto['qualityGate']>, string> = {
  passed: '已通过',
  pending: '待检查',
  failed: '未通过',
};

export function StudyEventList({ events }: StudyEventListProps) {
  if (events.length === 0) return <p className="text-muted">暂无近期学习活动</p>;

  return (
    <ul className="study-event-list">
      {events.map((event) => (
        <li key={event.id} className="study-event-item">
          <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('zh-CN')}</time>
          <div className="study-event-content">
            <strong>{EVENT_LABELS[event.eventType] ?? '未分类学习活动'}</strong>
            <div className="study-event-meta">
              <span>{SOURCE_LABELS[event.sourceSystem]}</span>
              {event.workloadMinutes !== undefined && <span>{event.workloadMinutes} 分钟</span>}
              {event.qualityGate && <span>{QUALITY_LABELS[event.qualityGate]}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
