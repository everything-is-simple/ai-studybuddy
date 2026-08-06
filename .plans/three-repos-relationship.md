# AI StudyBuddy 三个仓库关系说明

**更新时间**：2026-07-31

---

## 📂 三个仓库的定位

### 1️⃣ H:\ai-studybuddy - **源码开发仓库**

**Git远程**：`https://github.com/everything-is-simple/ai-studybuddy.git`

**结构**：
```
ai-studybuddy/
├── packages/
│   ├── backend/        # TypeScript源码
│   ├── frontend/       # React + Vite源码
│   └── shared/         # 共享代码
├── scripts/            # 构建和部署脚本
├── docs/               # 文档
└── pnpm-workspace.yaml # Monorepo配置
```

**用途**：
- ✅ 日常开发和代码编辑
- ✅ 功能开发和测试
- ✅ Git版本控制（主仓库）
- ✅ 推送到GitHub保存源码历史

**特点**：
- Monorepo结构（pnpm workspace）
- TypeScript源码
- 包含完整的开发依赖
- 体积较大（包含node_modules）

---

### 2️⃣ H:\StudyBuddy - **部署格式镜像仓库**

**Git远程**：`https://github.com/everything-is-simple/H-StudyBuddy.git`

**结构**：
```
StudyBuddy/
├── app/
│   ├── backend/        # 编译后的JS文件
│   └── shared/         # 编译后的共享代码
├── scripts/            # PowerShell部署脚本
├── deployment/         # 部署配置
├── docs/               # 部署文档
├── install.bat         # 一键安装脚本
└── deployment-manifest.json
```

**用途**：
- ✅ 维护"部署格式"版本在GitHub
- ✅ 便于直接clone作为部署包
- ✅ 独立的Git历史（部署视角）
- ✅ 可选：如果不需要可以废弃

**特点**：
- 扁平结构（非Monorepo）
- 编译后的JS文件
- 不包含源码
- 体积小（不含开发依赖）

**同步方式**：
```powershell
# 从ai-studybuddy同步最新改进
cd H:\
Get-ChildItem H:\StudyBuddy -Exclude .git,.gitignore,.claude | Remove-Item -Recurse -Force
Copy-Item -Recurse -Force H:\ai-studybuddy-runtime\deploy-output\* H:\StudyBuddy\
cd H:\StudyBuddy
git add .
git commit -m "sync: improvements from ai-studybuddy@<commit>"
git push origin main
```

---

### 3️⃣ H:\ai-studybuddy-runtime\deploy-output - **构建产物目录**

**Git**：无（纯构建产物，不受版本控制）

**结构**：
```
deploy-output/
├── app/                # 编译后的应用
├── scripts/            # 部署脚本
├── deployment/         # 部署配置
├── install.bat         # 一键安装
└── deployment-manifest.json
```

**用途**：
- ✅ 从ai-studybuddy自动构建
- ✅ 打包成ZIP用于分发
- ✅ 临时目录（可随时重新构建）

**生成方式**：
```bash
cd H:\ai-studybuddy
pnpm run build:deploy
# 输出到 H:\ai-studybuddy-runtime\deploy-output
```

**打包方式**：
```powershell
cd H:\ai-studybuddy-runtime
Compress-Archive -Path deploy-output\* -DestinationPath AIStudyBuddy-v0.8.0-win64.zip
```

---

## 🔄 完整工作流

### 开发 → 构建 → 部署

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 开发阶段                                                    │
│    H:\ai-studybuddy (源码编辑)                                │
│         ↓ git commit & push                                  │
│    GitHub: ai-studybuddy.git (源码备份)                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 构建阶段                                                    │
│    pnpm run build:deploy                                     │
│         ↓                                                    │
│    H:\ai-studybuddy-runtime\deploy-output (构建产物)         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 打包阶段                                                    │
│    Compress-Archive → AIStudyBuddy-v0.8.0-win64.zip (3.0MB)  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 分发/部署                                                   │
│    方式A: 传输ZIP到目标机 (推荐)                              │
│    方式B: 同步到H:\StudyBuddy → 推送到H-StudyBuddy.git       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 使用场景

### 场景1：日常开发
```bash
cd H:\ai-studybuddy
# 编辑代码
git add .
git commit -m "feat: new feature"
git push origin master
```

### 场景2：测试部署包
```bash
cd H:\ai-studybuddy
pnpm run build:deploy
cd H:\ai-studybuddy-runtime\deploy-output
# 测试install.bat等
```

### 场景3：打包发布
```powershell
cd H:\ai-studybuddy-runtime
Compress-Archive -Path deploy-output\* -DestinationPath AIStudyBuddy-v0.8.0-win64.zip
# 将ZIP复制到目标机
```

### 场景4：同步部署仓库（可选）
```powershell
# 同步deploy-output到StudyBuddy
cd H:\
Get-ChildItem H:\StudyBuddy -Exclude .git,.gitignore,.claude | Remove-Item -Recurse -Force
Copy-Item -Recurse -Force H:\ai-studybuddy-runtime\deploy-output\* H:\StudyBuddy\

cd H:\StudyBuddy
git add .
git commit -m "sync: from ai-studybuddy"
git push origin main
```

---

## 📊 对比表

| 维度 | ai-studybuddy | StudyBuddy | deploy-output |
|---|---|---|---|
| **类型** | 源码仓库 | 部署镜像仓库 | 构建产物 |
| **Git** | ai-studybuddy.git | H-StudyBuddy.git | 无 |
| **结构** | Monorepo | 扁平 | 扁平 |
| **语言** | TypeScript | JavaScript | JavaScript |
| **体积** | 大（GB级） | 小（MB级） | 小（MB级） |
| **用途** | 开发 | 部署版本控制 | 临时构建 |
| **是否需要** | ✅ 必需 | ⚠️ 可选 | ✅ 必需 |

---

## 🚀 移植到新机器

### 推荐方式：使用ZIP包

```bash
# 开发机
H:\ai-studybuddy-runtime\AIStudyBuddy-v0.8.0-win64.zip
    ↓ 传输到新机
# 新机
解压 → install.bat → 完成
```

### 不推荐：克隆StudyBuddy仓库

虽然可以这样做：
```bash
git clone https://github.com/everything-is-simple/H-StudyBuddy.git
```

但这样：
- ❌ 没有install.bat（需要手动创建）
- ❌ 可能不是最新版本（取决于同步频率）
- ❌ 还需要手动bootstrap

**ZIP包更简单、更可靠**。

---

## 💡 建议

### 当前状态（2026-07-31）

✅ **ai-studybuddy**: 最新，包含Day 0所有改进  
✅ **deploy-output**: 最新，已构建  
✅ **AIStudyBuddy-v0.8.0-win64.zip**: 已打包，可用  
✅ **StudyBuddy**: 已同步最新改进（commit e5249fa）  

### 移植建议

**立即可用**：`AIStudyBuddy-v0.8.0-win64.zip` (3.0MB)

**无需同步StudyBuddy**，除非你想在GitHub上维护部署格式的版本历史。

---

## ❓ FAQ

**Q: 为什么有两个Git仓库？**  
A: ai-studybuddy保存源码历史，H-StudyBuddy保存部署格式历史。H-StudyBuddy是可选的，主要为了方便直接clone部署包。

**Q: deploy-output可以删除吗？**  
A: 可以。它是构建产物，可随时通过`pnpm run build:deploy`重新生成。

**Q: StudyBuddy必须保留吗？**  
A: 不必须。如果你只用ZIP包分发，可以删除StudyBuddy仓库。

**Q: 三者哪个用于移植？**  
A: 打包后的ZIP（来自deploy-output）。不要直接复制ai-studybuddy或StudyBuddy目录。

---

**最后更新**：2026-07-31，Day 0完成后同步
