# Repository Guidelines

## Project Structure & Module Organization

This repository is currently documentation-first. The active design source of truth lives in `docs/`.

- `docs/00-文档索引-Index.md`: start here; it lists valid documents and warns against archived drafts.
- `docs/01-总PRD-产品需求-Product-Requirements.md`: product scope and MVP boundaries.
- `docs/02-七子系统地图-Scenario-Systems.md`: seven subsystem map and dependencies.
- `docs/subsystems/03-S1学习节奏子系统PRD-StudyRhythm.md`: first subsystem PRD.
- `docs/04-开发任务清单-Todo-List.md`: implementation roadmap.
- `docs/05-开源组件装配-Open-Source-Foundation.md`: component-first integration rules.
- `docs/06-本地目录治理-Dev-Environment.md`: local directory governance.
- `docs/07-文档策略-Design-Docs-Strategy.md`: document strategy.

Archived drafts are stored outside the repo in `G:\ai-studybuddy-backup`; do not restore them into `docs/` unless explicitly instructed.

## Build, Test, and Development Commands

There is no application source code yet, so no build or test command is currently defined. Useful checks:

```powershell
git status --short
rg -n "ARCHITECTURE.md|test-plan.md|backend-guidelines.md" docs
```

Use the `rg` check to detect accidental references to removed draft documents.

## Coding Style & Naming Conventions

For documents, use Markdown with concise headings and actionable bullet points. File names must follow:

```text
NN-中文说明-English-Name.md
```

Examples: `01-总PRD-产品需求-Product-Requirements.md`, `05-开源组件装配-Open-Source-Foundation.md`.

Use Chinese for clarity, with English only as an aid. Keep paths absolute when referring to local Windows directories.

## Testing Guidelines

For documentation changes, verify:

- `git diff --check` passes.
- `docs/00-文档索引-Index.md` matches actual files.
- Old draft document names appear only as warnings, not active references.

When source code is added, add test commands and coverage expectations here.

## Commit & Pull Request Guidelines

Follow the existing commit style: short imperative messages with a scope, e.g. `docs: number active design documents`. PRs should include:

- Summary of changed documents.
- Reason for the change.
- Verification performed, such as `git diff --check`.
- Screenshots only if UI documents or rendered diagrams change.

## Agent-Specific Instructions

Always read `docs/00-文档索引-Index.md` first. Treat `docs/01-*` and `docs/02-*` as the current product truth. Do not use archived drafts as active guidance.

Before creating any new design document, follow the documented gate:

1. Read `docs/00-文档索引-Index.md`.
2. Check whether the target document already exists.
3. Check whether its trigger condition is met.
4. If not met, do not create it; explain that it is not time yet.
5. If met, create it using `NN-中文标题-English-Title.md`.
6. Update `docs/00-文档索引-Index.md` in the same change.
7. Run `scripts/check-docs-governance.ps1` before committing.
