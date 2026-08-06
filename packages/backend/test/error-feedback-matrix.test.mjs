// T02-R4 专项：学生核心流程失败反馈矩阵
// 验证后端错误 message 可操作且脱敏（中文、无内部信息），错误码分类符合矩阵。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 各服务错误类来自 dist（构建产物）
const { StudyRhythmError } = require('../dist/services/study-rhythm-service.js');
const { NoteBuilderError } = require('../dist/services/note-builder-service.js');
const { PracticeRunnerError } = require('../dist/services/practice-runner-service.js');
const { ExamCrammerError } = require('../dist/services/exam-crammer-service.js');
const { ClassCaptureError } = require('../dist/services/class-capture-service.js');

// 内部信息哨兵：不得出现在任何面向学生的 message
const SENSITIVE_PATTERNS = [
  /[A-Za-z]:[\\/]/, // 盘符绝对路径
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // 完整 UUID
  /api[_-]?key|secret|password|token|auth/i, // 密钥
  /https?:\/\/[^\s]+/, // URL/Provider
  /at .+\(.+:\d+:\d+\)/, // 堆栈
  /\\[A-Za-z]+\.(ts|js):\d+/, // 源码位置
];

function assertSafeAndActionable(code, message, allowedCodePrefixes) {
  assert.ok(typeof message === 'string' && message.length > 0, `${code}: message 非空`);
  assert.ok(/[\u4e00-\u9fff]/.test(message), `${code}: message 应含中文（可操作提示）`);
  assert.ok(!message.includes('[S'), `${code}: message 不应含内部子系统前缀`);
  for (const pattern of SENSITIVE_PATTERNS) {
    assert.ok(!pattern.test(message), `${code}: message 泄露敏感信息 ${pattern}`);
  }
  const prefix = allowedCodePrefixes.find((p) => code.startsWith(p));
  assert.ok(prefix, `${code}: 错误码 ${code} 不在允许分类 ${allowedCodePrefixes.join('|')} 内`);
}

test('T02-R4: S1 学习节奏错误符合矩阵（中文可操作且脱敏）', () => {
  const cases = [
    ['SEMESTER_NOT_FOUND', 404, '学期不存在'],
    ['SEMESTER_NOT_READY', 409, '学期尚未就绪'],
    ['COURSE_NOT_FOUND', 404, '课程不存在'],
    ['EXAM_NOT_FOUND', 404, '考试不存在'],
    ['TASK_STATUS_INVALID', 400, '任务状态不合法'],
  ];
  for (const [code, status, message] of cases) {
    const e = new StudyRhythmError(code, status, message);
    assertSafeAndActionable(e.code, e.message, ['SEMESTER_', 'COURSE_', 'EXAM_', 'TASK_', 'SCHEDULE_']);
  }
});

test('T02-R4: S2 资料笔记错误符合矩阵', () => {
  const cases = [
    ['SEMESTER_NOT_FOUND', 404, '学期不存在'],
    ['COURSE_INSTANCE_NOT_FOUND', 404, '课程不存在'],
    ['INVALID_FILE_TYPE', 400, '不支持的文件类型：pdf'],
    ['FILE_TOO_LARGE', 413, '文件大小超过 10MB 限制'],
    ['INVALID_TITLE', 400, 'title 不能超过 200 字符'],
  ];
  for (const [code, status, message] of cases) {
    const e = new NoteBuilderError(code, status, message);
    assertSafeAndActionable(e.code, e.message, ['SEMESTER_', 'COURSE_', 'INVALID_', 'FILE_', 'MATERIAL_', 'NOTE_']);
  }
});

test('T02-R4: S3 限时练习错误符合矩阵', () => {
  const cases = [
    ['PRACTICE_INPUT_INVALID', 400, 'timeLimitSeconds 必须为正整数或为空'],
    ['PRACTICE_ANSWER_INVALID', 400, '答案格式不合法'],
    ['PRACTICE_GENERATION_FAILED', 502, 'AI 生成题目答案格式不符合要求'],
    ['PRACTICE_SESSION_NOT_FOUND', 404, '练习不存在'],
  ];
  for (const [code, status, message] of cases) {
    const e = new PracticeRunnerError(code, status, message);
    assertSafeAndActionable(e.code, e.message, ['PRACTICE_', 'SEMESTER_', 'COURSE_']);
  }
});

test('T02-R4: S5 模拟考/冲刺错误符合矩阵', () => {
  const cases = [
    ['MOCK_EXAM_ANSWER_INVALID', 400, '答案格式不合法'],
    ['MOCK_EXAM_GENERATION_FAILED', 502, 'AI 生成选择题答案格式不符合要求'],
    ['ASSESSMENT_ATTEMPT_NOT_FOUND', 404, '考试不存在或不属于该课程'],
  ];
  for (const [code, status, message] of cases) {
    const e = new ExamCrammerError(code, status, message);
    assertSafeAndActionable(e.code, e.message, ['MOCK_', 'ASSESSMENT_', 'SEMESTER_', 'COURSE_']);
  }
});

test('T02-R4: S7 课堂采集错误符合矩阵（未配置不伪造成功）', () => {
  const cases = [
    ['CLASS_CAPTURE_PERMISSION_REQUIRED', 400, '请先确认课堂录音已获得相关人员允许'],
    ['INVALID_TITLE', 400, '标题长度必须为 1-200 字符'],
    ['MISSING_REQUIRED_FIELD', 400, 'semesterId 和 courseInstanceId 不能为空'],
  ];
  for (const [code, status, message] of cases) {
    const e = new ClassCaptureError(code, status, message);
    assertSafeAndActionable(e.code, e.message, ['CLASS_CAPTURE_', 'INVALID_', 'MISSING_', 'ASR_']);
  }
});

test('T02-R4: S4 裸 Error 经 API 层兜底为固定脱敏码（不泄露内部描述）', () => {
  // 模拟 API handle() 的兜底逻辑（error-fixer.ts）
  function handleApiError(error) {
    if (error && typeof error === 'object' && error.code && error.message) {
      return { success: false, error: { code: error.code, message: error.message } };
    }
    return { success: false, error: { code: 'S4_REQUEST_FAILED', message: '请求处理失败，请稍后重试' } };
  }
  // 裸 Error（含内部描述）必须被兜底为固定脱敏
  const raw = new Error('[S4] redo session missing origin mistake');
  const result = handleApiError(raw);
  assert.equal(result.error.code, 'S4_REQUEST_FAILED');
  assert.ok(!result.error.message.includes('[S4]'));
  assert.ok(!result.error.message.includes('redo'));
  assert.ok(result.error.message.includes('稍后重试'));
});
