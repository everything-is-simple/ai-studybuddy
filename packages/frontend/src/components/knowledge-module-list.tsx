import type { KnowledgeModuleDto, StudyTaskDto } from '@ai-studybuddy/shared';

interface KnowledgeModuleListProps {
  modules: KnowledgeModuleDto[];
  tasks: StudyTaskDto[];
}

const IMPORTANCE_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '关键',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '容易',
  medium: '中等',
  hard: '困难',
};

const LEARN_STATUS_LABELS: Record<string, string> = {
  not_started: '未开始',
  learning: '学习中',
  mastered: '已掌握',
};

export function KnowledgeModuleList({ modules, tasks }: KnowledgeModuleListProps) {
  if (modules.length === 0) {
    return <div className="feedback feedback-empty">暂无知识模块</div>;
  }

  return (
    <ul className="knowledge-module-list">
      {modules.map((module) => {
        const relatedTasks = tasks.filter((task) => task.knowledgeModuleId === module.id);
        return (
          <li key={module.id} className="knowledge-module-item">
            <div className="knowledge-module-title">{module.title}</div>
            <div className="knowledge-module-meta">
              <span>重要度：{IMPORTANCE_LABELS[module.importance] ?? module.importance}</span>
              <span>难度：{DIFFICULTY_LABELS[module.difficulty] ?? module.difficulty}</span>
              <span>状态：{LEARN_STATUS_LABELS[module.learnStatus] ?? module.learnStatus}</span>
            </div>
            {module.contentSummary && <p className="knowledge-module-summary">{module.contentSummary}</p>}
            {module.examRelevance && <p className="knowledge-module-exam">考察方向：{module.examRelevance}</p>}
            {module.sourceEvidence && <p className="knowledge-module-source">来源证据：{module.sourceEvidence}</p>}
            {relatedTasks.length > 0 && (
              <div className="knowledge-module-tasks">
                <strong>关联学习任务：</strong>
                <ul>
                  {relatedTasks.map((task) => (
                    <li key={task.id}>
                      {task.title}（{task.status}，优先级 {task.priorityBucket}）
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
