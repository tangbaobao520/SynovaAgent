# Loop Engineering 系统 — 完整安装手册

> 版本: 1.0 | 日期: 2026-06-14 | 来源: SynovaAgent 生产验证
> 目标读者: 另一个 Claude Code 实例（在新项目中复现此系统）

---

## 概述

Loop Engineering 是一套**物理强制**的代码质量自动化系统，覆盖从"想清楚做什么"到"部署上线"的全流程。核心原则：**零 AI 自律，全部物理阻断**。

三个层次：
- **L1** — 会话内自动循环（写一步验一步，最多 5 轮修正）
- **L2** — 双智能体交叉验证（pre-push 架构审计）
- **L3** — 哨兵工单闭环（Cron → 自动发现 → 工单 → 跟踪修复）

---

## 一、文件清单（需创建的全部文件）

### 1.1 Hook 配置

```
.claude/settings.local.json
```

### 1.2 Git Hooks（4 个）

```
.git/hooks/pre-commit      → 委托 scripts/pre-commit-check.sh
.git/hooks/commit-msg      → 委托 scripts/commit-msg-check.sh
.git/hooks/post-commit     → 委托 scripts/workflow/decide-next.sh
.git/hooks/pre-push        → 委托 scripts/pre-push-check.sh
```

### 1.3 核心门禁脚本（12 个）

```
scripts/pre-commit-check.sh          # 33+ 项硬阻断，pre-commit 主入口
scripts/pre-push-check.sh            # 6 道门，pre-push 主入口
scripts/commit-msg-check.sh          # Conventional Commits 格式强制
scripts/check-architecture.sh        # 五层架构边界检查
scripts/check-secrets.sh             # 密钥/凭证扫描
scripts/check-security.sh            # eval/new Function/http:// 检查
scripts/check-reality.sh             # 诚实门禁（@state 注释一致性）
scripts/check-tech-debt.sh           # TECH_DEBT.md 技术债务追踪
scripts/anthropic-decide.sh          # Anthropic 决策树
scripts/generate-state-md.sh         # 代码健康度快照生成
```

### 1.4 工作流脚本（14 个）

```
scripts/workflow/task-start.sh               # 节点①: 开始新任务
scripts/workflow/generate-task-brief.py       # Task brief 模板生成器
scripts/workflow/hook-check-brief.sh          # SessionStart: 检查今日 brief
scripts/workflow/hook-block-write.sh          # PreToolUse: 写代码前阻断
scripts/workflow/verify-incremental.sh        # PostToolUse: 写代码后增量验证
scripts/workflow/check-spec.sh                # SPEC 门禁
scripts/workflow/check-test-first.sh          # 测试先行门禁
scripts/workflow/check-boundaries-incremental.sh  # 增量架构边界检查
scripts/workflow/check-dataflow-alignment.sh  # 数据流关键词 reconciliation
scripts/workflow/wire-check.sh                # 接线审计（铁律 0-2 Step 5）
scripts/workflow/checkpoint-design.sh         # 节点②: 设计完成验证
scripts/workflow/checkpoint-impl.sh           # 节点③: 实现完成验证
scripts/workflow/checkpoint-deploy.sh         # 节点⑥: 部署后验证
scripts/workflow/checkpoint-runtime.sh        # 节点⑦: 运行时监控 (Cron)
scripts/workflow/decide-next.sh               # post-commit 决策建议
scripts/workflow/run-auditor.sh               # ArchitectureAuditor 启动器
```

### 1.5 辅助文件

```
.claude/loop-state.json        # 循环计数器（自动创建/删除）
.claude/task-briefs/           # Task brief 存档目录
SPEC.md                        # 全局定位文档（feat/ 分支必须有）
STATE.md                       # 代码健康度快照（auto-generated）
TECH_DEBT.md                   # 技术债务追踪表
```

### 1.6 package.json scripts

```json
{
  "scripts": {
    "check:iron-laws": "bash scripts/pre-commit-check.sh",
    "check:architecture": "bash scripts/check-architecture.sh",
    "check:secrets": "bash scripts/check-secrets.sh",
    "check:security": "bash scripts/check-security.sh",
    "check:wire": "bash scripts/workflow/wire-check.sh",
    "check:impl": "bash scripts/workflow/checkpoint-impl.sh",
    "check:all": "bash scripts/pre-push-check.sh",
    "workflow:start": "bash scripts/workflow/task-start.sh",
    "workflow:impl": "bash scripts/workflow/checkpoint-impl.sh",
    "workflow:design": "bash scripts/workflow/checkpoint-design.sh",
    "workflow:deploy": "bash scripts/workflow/checkpoint-deploy.sh",
    "workflow:wire": "bash scripts/workflow/wire-check.sh",
    "hooks:install": "bash scripts/install-hooks.sh"
  }
}
```

---

## 二、Hook 配置（.claude/settings.local.json）

这是 Claude Code 的物理强制入口。放在项目根目录。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "command": "bash scripts/workflow/hook-check-brief.sh"
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash scripts/workflow/hook-block-write.sh"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash scripts/workflow/verify-incremental.sh",
        "statusMessage": "验证改动..."
      }
    ]
  }
}
```

**效果**：
- **SessionStart**：每次新会话开始时检查今天是否有 task brief
- **PreToolUse**：每次 Edit/Write 之前，验证 task brief 质量 + 接口真实性 + 架构层级对齐
- **PostToolUse**：每次 Edit/Write 之后，运行 vitest + 接线审计 + 架构检查 + 空 catch 检测

---

## 三、7 节点工作流（Anthropic 工程流程）

### 节点 ① 任务开始 → task-start.sh

**触发**：开始写任何代码前，手动运行。
**命令**：`bash scripts/workflow/task-start.sh "任务简述"`
**产出**：`.claude/task-briefs/{date}-{slug}.md`

**检查项**：
1. 代码库健康度（vitest / tsc / as any 计数）
2. 影响范围分析（grep 任务关键词）
3. 铁律提醒清单
4. 分支检查（禁止在 main 上开发）

**Task Brief 模板**（6 个强制字段，全部非空才允许写代码）：
```markdown
## 项目身份  — 项目是什么，核心能力
## 本任务在哪一层  — L1/L2/L3/L4/L5
## 文档引用  — 全量对齐手册相关节号
## 接口审计  — 文件名:函数名(参数) → 返回类型
## 数据流  — 输入 → 经过哪些文件 → 输出（必须含 → 箭头）
## 用户旅程  — 谁→什么场景→做了什么→看到什么
## Done 标准  — [ ] 入口可触达 / [ ] 链路走通 / [ ] 结果可见
```

### 节点 ② 设计完成 → checkpoint-design.sh

**触发**：写设计文档后，写代码前。
**命令**：`bash scripts/workflow/checkpoint-design.sh docs/research/my-feature.html`
**硬阻断**：缺少触发定义或结果呈现 → 不准写代码

**5 个检查**：
1. 触发定义（谁触发 / 何时 / 入口）
2. 结果呈现（用户在哪看到 / 什么形式）
3. 垂直切片（完整端到端链路）
4. 架构层级标注（L1-L5，禁止跨层）
5. OpenClaw 边界（不依赖 Agent 不原生支持的能力）

### 节点 ③ 实现完成 → checkpoint-impl.sh

**触发**：声称"做完了"之前。
**命令**：`bash scripts/workflow/checkpoint-impl.sh <新函数名>`
**硬阻断**：接线未完成 / 测试失败 / tsc 错误 / iron-law 违规 → 不准 commit

**5 个检查**：
1. 接线验证（新函数在入口文件中有引用？）
2. 测试状态（vitest 全量通过？）
3. TypeScript 编译（src/ 零错误？）
4. 铁律门禁（as any / Mock / TODO？）
5. 变更统计（文件增删比例）

### 节点 ④ 提交前 → pre-commit（33 项硬阻断）

**触发**：`git commit` 自动触发。
**文件**：`.git/hooks/pre-commit` → `scripts/pre-commit-check.sh`

**完整硬阻断清单**：

| 铁律 | 检查内容 | 阻断条件 |
|------|---------|---------|
| 0-2 | Task brief 存在 + 用户旅程/Done 已填 | 任一为空 |
| 0-2 | SPEC.md 存在（feat/ 分支） | 不存在 |
| 0-2 | 设计文档（feat/ 分支） | 不存在 |
| 0-2 | 每个 public export 有测试 | 存在无测试的 export |
| 38 | `as any` 零容忍 | 搜索到即阻断 |
| 8 | Mock/TODO 残留 | 搜索到即阻断 |
| 9 | CJS `require()` 残留 | 搜索到即阻断 |
| — | `.only()` / `.skip()` 在测试中 | 搜索到即阻断 |
| — | `.env` 含真实 API Key（暂存时） | 搜索到即阻断 |
| — | Secrets 扫描（全工作区 + .claude/） | 搜索到 API Key |
| — | 安全扫描（eval / new Function / http://） | 搜索到即阻断 |
| 37 | 单文件 >1000 行 | 存在 >1000 行文件 |
| 33 | 新测试文件命名不规范 | 非 .test. 或 .spec. |
| — | "pre-existing"/"known-failure" 标记 | 搜索到即阻断 |
| 0-2 | 单模块提交（最多 1 个新实现文件） | 超过 1 个 |
| 0-2 | impl/test 成对（实现文件必须有对应测试） | 无对应测试 |
| 0-2 | 接线审计（新 export 在生产入口有引用） | 零引用 |
| 24+31 | 空 catch 无 log | 搜索到即阻断 |
| 0-2 | tsc `src/` 零错误 | >0 个错误 |
| 34 | `--no-verify` 滥用（>2 次/天） | 超过限制 |
| — | DiagnosticModule 注册数不超基线 | 超过基线 |
| — | 诚实门禁（@state 注释一致性） | 不一致 |
| — | SOG-001 物理删除禁止 | 搜索到 DELETE FROM |
| 34 | 分支命名（feat/fix/chore/docs/test/refactor） | 不符合 |

**TUI/前端专项**（如适用）：
| 40-1 | ink patch 文件存在 | 缺失 |
| 40-2 | postinstall: patch-package | 缺失 |
| 40-3 | React.memo 在 Message/StreamingText | 缺失 |
| 41 | use-streaming 无 LineBuffer 等类 | 搜索到 |
| 44 | 无 justifyContent="flex-end" | 搜索到 |

**警告（不阻断）**：
| 37 | 文件 >500 行（建议拆分）|
| 11 | console.log 在非 CLI/TUI 代码 |
| 11+24+31 | 空 catch 补充检查 |
| — | 技术债务追踪 |
| — | 数据流关键词 reconciliation |

### 节点 ⑤ 推送前 → pre-push（6 道门）

**触发**：`git push` 自动触发。
**文件**：`.git/hooks/pre-push` → `scripts/pre-push-check.sh`

**6 道门**（任一道失败则禁止 push）：
1. **Anthropic 决策树**（最终裁决：测试全过？有阻塞 commit？有 critical bug？用户可见缺口？静默失败？）
2. **tsc --noEmit**（src/ 零错误）
3. **vitest run**（全量测试，零失败）
4. **铁律门禁**（pre-commit 的二次验证）
5. **接线审计**（所有 commits since origin/main 的新 export 都已接线）
6. **架构边界**（完整 6 规则跨层检查）
7. **ArchitectureAuditor**（可选，通过 `RUN_ARCH_AUDIT=1` 启用）

### 节点 ⑥ 部署后 → checkpoint-deploy.sh

**触发**：部署到服务器后，手动运行。
**命令**：`bash scripts/workflow/checkpoint-deploy.sh https://your-server.com`
**检查**：health 端点 / 核心 API 端点 / HTTPS 可达性

### 节点 ⑦ 运行时 → checkpoint-runtime.sh (Cron)

**触发**：每 30 分钟 Cron 自动。
**命令**：`bash scripts/workflow/checkpoint-runtime.sh https://your-server.com`
**检查**：服务可达性 / 降级模式 / 数据库大小 / 日志错误率

---

## 四、L1 循环机制（verify-incremental.sh）

这是会话内"写一步验一步"的核心引擎。PostToolUse hook 在每次 Edit/Write 后自动触发。

**循环计数器**：`.claude/loop-state.json`
```json
{
  "iteration": 1,
  "maxIterations": 5
}
```

**流程**：
```
Write → PostToolUse → verify-incremental.sh
  → 7 步检查
  → 失败 → 错误输出 → AI 自动修正 → 再次 Write → 再次验证
  → iteration++ → 最多 5 轮
  → 5 轮后仍失败 → 停止，等人工介入
  → 全部通过 → 删除 loop-state.json（计数器重置）
```

**7 步检查**：
1. 循环计数（>5 → 停止）
2. vitest --related（只跑关联测试）
3. 接线审计（新文件的新 export 在入口中？）
4. 增量架构边界（只查本次改动文件）
5. 静默失败检测（新增 catch 块有 log？）
6. 用户可见缺口检测（新增 export 但无路由变更？→ 警告）
7. 全部通过 → 删除 loop-state.json

---

## 五、L2 双智能体交叉验证

**触发**：pre-push 第 7 道门，通过环境变量 `RUN_ARCH_AUDIT=1` 启用。

**机制**：
1. `run-auditor.sh` 生成审计 prompt（含 task brief + git diff）
2. 启动 ArchitectureAuditor Agent（独立 Claude Code 子进程）
3. 检查 4 个维度：接口真实性 / 架构边界 / 数据流完整性 / 哨兵信号消费
4. 输出 `AUDIT_PASSED=true` 或 `AUDIT_FAILED=true`
5. FAIL → 拒绝推送

---

## 六、L3 哨兵工单闭环

```
Cron → Sentinel 巡检 → 异常发现 → SignalAggregator 聚合
  → 严重度升级 → ExpertDispatcher 路由
  → critical 级别 → 自动创建工单 (SQLite sentinel_tickets)
  → GET /api/sentinel/tickets → FDE 查询 → 人工处理 → 关闭工单
```

---

## 七、铁律速查表（写进 CLAUDE.md）

以下铁律应写进项目的 CLAUDE.md，作为 AI 的上下文约束：

```
### 零、协作与流程
铁律 0: 协作对齐前置——先对齐再动手，禁止假设共识。
铁律 0-2: 测试先行 + 接线验收——spec → test → impl → wire → review → merge。
铁律 1: 垂直切片交付。按用户可见的行为拆，不按技术层拆。
铁律 4: 交付不完整——写了代码没接线 = 未完成。
铁律 5: 后端能力 ≠ 用户可用的功能。
铁律 7: 每次接受任务确认 Done 标准。默认：入口可触达 + 完整链路走通 + 结果可见。

### 二、代码质量
铁律 8: Mock/TODO 不留到交付代码。
铁律 9: 关键变更 grep 全仓库传播。
铁律 11: 静默降级禁止。catch 必须 log.warn/error + 返回 degraded: true。
铁律 12: 集成测试 cover 真实路由，不 mock 管线。

### 三、错误处理
铁律 24: 异常处理审计——catch 必须有 log.error/warn + degraded + 区分 ENOENT 等。
铁律 31: 降级信号传播。每个可独立失败的模块返回 degraded 标记。
铁律 32: 错误分类强制。catch 块包装为 .code + .phase + .retryable。

### 四、自动化优先
铁律 33: 测试命名 * .test.ts / * .integration.test.ts / * .e2e.test.ts
铁律 34: Feature Branch 强制。禁止在 main 上直接 commit。
铁律 35: 自动化优先。能变 tsc/ESLint 规则的不靠文档。
铁律 36: vitest 全量通过才合并。
铁律 37: Dead code 入仓库即违规。

### 五、类型安全与架构
铁律 38: as any 零容忍。
铁律 39: 五层架构边界。每层只与相邻层通信。
```

---

## 八、在新项目中安装

### Step 1: 复制 scripts/ 目录

从本仓库复制以下文件到新项目，保持目录结构：

```
scripts/
  pre-commit-check.sh
  pre-push-check.sh
  commit-msg-check.sh
  check-architecture.sh
  check-secrets.sh
  check-security.sh
  check-reality.sh
  check-tech-debt.sh
  anthropic-decide.sh
  generate-state-md.sh
  install-hooks.sh
  workflow/
    task-start.sh
    generate-task-brief.py
    hook-check-brief.sh
    hook-block-write.sh
    verify-incremental.sh
    check-spec.sh
    check-test-first.sh
    check-boundaries-incremental.sh
    check-dataflow-alignment.sh
    wire-check.sh
    checkpoint-design.sh
    checkpoint-impl.sh
    checkpoint-deploy.sh
    checkpoint-runtime.sh
    decide-next.sh
    run-auditor.sh
```

### Step 2: 适配脚本中的项目特定部分

以下脚本需要根据新项目修改：

1. **hook-block-write.sh** — 修改项目身份关键词（如 `增长导航` → 新项目的核心定位）
2. **check-architecture.sh** — 修改层级路径映射（如 `routes/` → L1, `agent/` → L2 等）
3. **wire-check.sh** — 修改入口文件列表（`server.ts`, `routes/`, `agent/`, `cli.ts` → 新项目的入口）
4. **check-boundaries-incremental.sh** — 同上，修改层级→路径映射
5. **generate-task-brief.py** — 修改项目身份模板文本
6. **check-secrets.sh** — 修改已知安全变量白名单（如 `FEISHU_APP_ID`）
7. **task-start.sh** — 修改项目身份检查逻辑
8. **check-spec.sh** — 修改 SPEC 必需字段（如果与默认不同）
9. **check-test-first.sh** — 检查测试目录路径和文件命名约定
10. **decide-next.sh** — 修改决策逻辑（skeleton/placeholder 检测逻辑）

### Step 3: 创建 .claude/settings.local.json

复制第二部分中的 JSON 配置。注意：
- 如果新项目在 Windows 上运行，确保 hook 命令使用 `bash` 前缀
- 如果新项目是纯前端（无 Express 服务器），调整 checkpoint-deploy.sh 的 URL 模式
- 如果新项目不需要 SPEC.md，可以移除 check-spec.sh 相关的门禁

### Step 4: 安装 Git Hooks

```bash
bash scripts/install-hooks.sh
```

或手动创建 4 个符号链接/脚本：

```bash
# .git/hooks/pre-commit
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-commit-check.sh"

# .git/hooks/commit-msg
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"

# .git/hooks/post-commit
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/workflow/decide-next.sh"

# .git/hooks/pre-push
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-push-check.sh"
```

### Step 5: 初始化辅助文件

```bash
touch TECH_DEBT.md
echo "# SPEC" > SPEC.md  # 后续按实际填写
bash scripts/generate-state-md.sh  # 生成初始 STATE.md
```

### Step 6: 更新 CLAUDE.md

在新项目的 CLAUDE.md 中加入铁律速查表（第七部分）。

### Step 7: 验证

```bash
# 测试门禁是否正常工作
npm run check:iron-laws
npm run check:architecture

# 测试工作流
bash scripts/workflow/task-start.sh "测试任务"
```

---

## 九、已知限制与注意事项

### 9.1 全仓扫描 vs 增量扫描

pre-commit 和 pre-push 的 tsc + empty catch 检查是**全仓库扫描**。这意味着库存量违规会阻断所有新提交。建议：
- 首次安装后，先集中修复所有存量违规，再做新功能
- 或在 hook 中增加 `git diff --cached` 过滤，只检查本次改动文件

### 9.2 Windows 兼容性

脚本使用 bash（通过 Git Bash）。Windows 下 `grep`/`sed` 行为可能有差异。主要问题：
- 行尾符（CRLF vs LF）
- `grep -c` 返回值可能带 `\r`
- `npx` 子进程 spawn 开销较大

### 9.3 语言/框架适配

当前脚本针对 TypeScript + vitest + Express。适配其他技术栈：
- **Python**：tsc → mypy/pyright，vitest → pytest
- **Rust**：tsc → cargo check，vitest → cargo test
- **纯前端**：移除服务器端点检查，改用 playwright/Cypress E2E

### 9.4 性能

- `tsc --noEmit` 在大项目中可能需要 30+ 秒
- `vitest run` 全量测试可能需要数分钟
- 建议在 pre-commit 中只做增量检查，pre-push 中做全量

---

## 十、维护

### 日常

- 每次 git push 成功后，运行 `bash scripts/workflow/checkpoint-deploy.sh [服务器URL]`
- 每 30 分钟 Cron 运行 `checkpoint-runtime.sh`

### 定期

- 审查 `TECH_DEBT.md`，安排修复
- 更新 `STATE.md`：`bash scripts/generate-state-md.sh`
- 审查 pre-commit 警告趋势，决定是否升级为硬阻断

### 修改门禁规则

编辑 `scripts/pre-commit-check.sh`：
- 从 `hard_check` 改为 `warn_check` → 降级为警告
- 从 `warn_check` 改为 `hard_check` → 升级为硬阻断
- 新增检查：添加新的 `hard_check "检查名称" "$MATCHES"` 或 `warn_check` 调用
