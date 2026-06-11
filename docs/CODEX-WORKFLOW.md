# Codex 工作流程 — SynovaAgent 自动化开发规范

> 本文档是 Codex（AI 编码智能体）在 SynovaAgent 项目中执行任务时**必须遵守**的工作流程。
> 对标 Claude Code 遵守的 `CLAUDE.md` 铁律体系，但简化为 Codex 可直接执行的检查清单。

---

## ⚠️ 每次任务前强制执行

```
[ ] 阅读本文件 (CODEX-WORKFLOW.md)
[ ] 确认任务目标 + 用户旅程 + Done 标准
[ ] 确认在正确的 feature branch 上 (禁止直接在 main 上 commit)
[ ] 了解本任务属于五层架构哪一层 (L1-L5)
```

---

## 五层架构速查

```
L1 交互层:  src/routes/ src/tui-v2/ src/l1-interaction/
L2 编排层:  src/agent/ src/orchestrator/
L3 洞察层:  src/l3/ src/evidence/ src/expert-platform/
L4 本体层:  src/l4/ packages/engine-core/src/pipeline/diagnosis/
L5 存储层:  src/store/ src/init/
```

**规则**：每层只与相邻层通信。禁止 L1→L4 / L2→L5 / L3→L5 直接调用。

---

## 自动化门禁清单（每批代码必须通过）

### 1. tsc 编译
```bash
npx tsc --noEmit   # 零新增错误
```

### 2. 铁律硬阻断（6 项 — 违反任何一项禁止提交）
```bash
# (1) as any 零容忍 — src/ 目录零出现
grep -rn "as any" src/ --include="*.ts" | grep -v ".test." | grep -v ".d.ts"

# (2) Mock/TODO 残留 — 生产代码不得有 MOCK_* / TODO:后期替换
grep -rn "MOCK_\|TODO.*后期" src/ --include="*.ts" | grep -v ".test."

# (3) CJS require() — 统一 ESM import
grep -rn "require(" src/ --include="*.ts" | grep -v "node_modules" | grep -v ".test." | grep -v "import("

# (4) vitest .only()/.skip() — 不得进入 CI
grep -rn "\.only(\|\.skip(" tests/ --include="*.ts"

# (5) .env 安全 — .env 不得暂存
git diff --cached --name-only | grep "^\.env$"  # 应无输出

# (6) 分支命名 — 必须是 feat/ fix/ chore/ docs/ 前缀
git branch --show-current
```

### 3. Secrets 扫描
```bash
bash scripts/check-secrets.sh  # 全工作区零凭证
```

### 4. 接线审计（新增函数/类必须被生产代码调用）
```bash
FUNC="<你的新函数名>"
grep -rn "${FUNC}" src/server.ts src/routes/ src/agent/conversation-engine.ts src/cli.ts src/index.ts
# 零结果 = 未接线 = 不算完成
```

### 5. 诚实门禁
```bash
bash scripts/check-reality.sh  # 每个新文件必须含 @state: real|skeleton|placeholder
```

---

## 提交规范

### Commit Message 格式
```
feat: <简短中文描述>
fix: <简短中文描述>
chore: <简短中文描述>

- 具体变更点 1
- 具体变更点 2

Co-Authored-By: Codex <codex@openai.com>
```

### 提交前确认
```
[ ] 单模块独立提交（不批量提交多个不相关的模块）
[ ] tsc --noEmit 零新增错误
[ ] 铁律 6 项硬阻断全部通过
[ ] 接线审计通过（新函数被生产入口引用）
[ ] @state: 标记已添加
```

---

## 常见任务模板

### 删除文件
```
1. 确认文件无引用: grep -rn "<文件名>" src/ packages/
2. 逐处迁移引用到新位置
3. 删除文件
4. tsc --noEmit 确认零错误
5. 独立 commit
```

### 修复跨层违规
```
1. 定位违规代码: grep -rn "import.*from.*better-sqlite3\|import Database" src/routes/
2. 替换为 L5 注入接口: import { getDatabase } from '../init/engine-context'
3. 如果路由需要新查询能力 → 先在 L4 补接口，再改 L1
4. tsc --noEmit + 测试全绿
5. 独立 commit
```

### 新建路由
```
1. 确定路由属于 L1
2. 在 src/routes/ 中创建文件
3. 在 src/server.ts 中 import + app.use()
4. 接线审计: grep 新路由名 src/server.ts 确认已挂载
5. 加 @state: real|skeleton|placeholder 标记
6. tsc + 测试 + commit
```

---

## 禁止项

- ❌ 批量提交多个不相关模块
- ❌ 跳过接线审计声称"完成"
- ❌ `as any` — 用 `unknown` + 类型守卫或内联接口替代
- ❌ Mock/TODO 进入生产代码
- ❌ catch 块空吞（必须 `log.warn/error` + 返回 degraded 标记）
- ❌ 在 main 分支上直接 commit（必须 feature branch）
- ❌ 写代码不先读相关文件

---

## 推荐阅读

- `CLAUDE.md` — 38 条铁律全文（本项目根目录）
- `docs/SYNOVA-MASTER-全量对齐手册-20260610.html` — 产品定义书（21 章）
- `docs/SYNOVA-一页纸产品概要-20260610.html` — 一页纸概要

---

> **最后更新**: 2026-06-11
> **维护者**: Claude Code (主) + Codex (执行)
