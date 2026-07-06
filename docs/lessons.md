# AI StudyBuddy 踩坑记录

> 每次踩坑后，将可复用的经验记录在此。
> 通用规则反向补充到 dev-rules.md，形成自我进化闭环。

---

## 记录格式

```
### [日期] 问题简述

**现象**：发生了什么
**原因**：为什么出问题
**解决**：怎么修复的
**教训**：提炼出的通用规则
**补充到**：dev-rules.md 第 X 节
```

---

## 踩坑记录

### 2026-07-06 开源底座不能整仓 fork

**现象**：项目需要借鉴同类 AI 学习/考试系统，但直接选择一个大系统作为底座会导致技术栈、权限模型、产品目标被原项目绑架。
**原因**：AI StudyBuddy 的核心是学生自救闭环和家长温柔可见，不是学校 LMS、教师管理系统或通用 AI 聊天系统。
**解决**：新增 `docs/open-source-foundation.md` 作为开源底座 SoT，明确“不 fork 大系统，保留自有架构，模块化参考 KaoBuddy/MiaowTest/考试粥助手/RAGFlow/Dify/ASR/OCR”。
**教训**：开源搬运要先确定边界：搬流程、模型思想、Prompt 和交互，不搬冲突技术栈；复制源码前先确认 License。
**补充到**：`dev-rules.md` 3.5、`backend-guidelines.md` 6.7、`frontend-guidelines.md` 1.4。
