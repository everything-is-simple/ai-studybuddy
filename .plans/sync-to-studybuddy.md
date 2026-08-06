# 同步 ai-studybuddy → StudyBuddy 指南

## 目的

将开发仓库（H:\ai-studybuddy）的最新改进同步到部署格式仓库（H:\StudyBuddy）

---

## 两个仓库的关系

### H:\ai-studybuddy（源码仓库）
- Monorepo结构（packages/）
- TypeScript源码
- Git: ai-studybuddy.git

### H:\StudyBuddy（部署仓库）
- 扁平结构（app/）
- 编译后的JS
- Git: H-StudyBuddy.git（独立仓库）

**关系**：StudyBuddy是ai-studybuddy的"部署格式镜像"

---

## 同步步骤

### 1. 从ai-studybuddy构建最新版本

```bash
cd H:\ai-studybuddy

# 构建部署包（如果deploy-output已是最新则跳过）
pnpm run build:deploy
```

**结果**：`H:\ai-studybuddy-runtime\deploy-output\` 包含最新构建

---

### 2. 同步文件到StudyBuddy

```powershell
# 备份当前StudyBuddy（可选）
cd H:\
Copy-Item -Recurse -Force StudyBuddy StudyBuddy-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')

# 清空除了.git的所有内容
cd H:\StudyBuddy
Get-ChildItem -Exclude .git,.gitignore,.claude | Remove-Item -Recurse -Force

# 复制deploy-output内容
Copy-Item -Recurse -Force H:\ai-studybuddy-runtime\deploy-output\* H:\StudyBuddy\

# 检查
ls
```

---

### 3. 提交到H-StudyBuddy.git

```bash
cd H:\StudyBuddy

# 查看变更
git status

# 添加所有变更
git add .

# 提交（带Day 0标识）
git commit -m "sync: Day 0 improvements from ai-studybuddy@5d74b704

- Node 24 DOMMatrix polyfill
- T04 data durability (integrity check, auto-backup, restore)
- Deployment package improvements

Source: ai-studybuddy commit 5d74b704"

# 推送到GitHub
git push origin main
```

---

### 4. 验证同步

```bash
cd H:\StudyBuddy

# 检查polyfills.cjs是否存在
ls app/backend/polyfills.cjs

# 检查package.json中的--require标志
cat app/backend/package.json | grep "require.*polyfills"

# 检查备份脚本
ls scripts/*.ps1 | grep -E "(backup|restore|schedule)"
```

**预期结果**：
- ✅ `app/backend/polyfills.cjs` 存在
- ✅ `package.json`包含`--require ./polyfills.cjs`
- ✅ 备份脚本完整（backup-data.ps1, restore-data.ps1, schedule-auto-backup.ps1）

---

## 同步后的用途

### 如果你想用StudyBuddy移植到新机

```bash
# 1. 打包StudyBuddy
cd H:\
Compress-Archive -Path StudyBuddy\* -DestinationPath StudyBuddy-v0.8.0.zip

# 2. 复制到新机

# 3. 新机上解压后创建install.bat（参考deploy-output中的）
```

---

## ⚠️ 注意事项

### 这个同步是必要的吗？

**如果你只是想移植到新机**：
- ❌ 不需要同步StudyBuddy
- ✅ 直接用 `AIStudyBuddy-v0.8.0-win64.zip` 即可

**如果你想保持两个仓库同步**（用于版本管理）：
- ✅ 需要定期同步
- ✅ 用于在GitHub上维护"部署格式"版本

---

## 替代方案：废弃StudyBuddy

如果`H:\StudyBuddy`只是临时用的，不需要保持同步，可以：

```bash
# 删除旧的StudyBuddy
cd H:\
rm -rf StudyBuddy

# 直接使用deploy-output
# 所有部署都用 AIStudyBuddy-v0.8.0-win64.zip
```

**这样更简单**，不需要维护两个仓库。
