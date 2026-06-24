# Loop Engineering v3.0 — 设计文档

> 2026-06-17 发布。面向另一个 Claude 实例的完整复制指南。

---

## 一、这是什么

Loop Engineering 是一套确保 AI agent（Claude Code）高质量执行开发任务的物理强制体系。

它的核心问题是：**用户用自然语言描述需求，agent 写代码。中间没有人类 code review。怎么确保 agent 不偷懒、不走捷径、不犯重复错误？**

v2.5 犯了一个根本性错误：每犯一次错就加一个 bash 脚本，最终堆出 38 项 pre-commit 检查和 12 个脚本（1,862 行）。提交耗时 40-90 秒，导致 `--no-verify` 泛滥——一个被绕过的门禁等于没有门禁。

v3.0 的设计哲学翻转：**agent 本身就是执法机制，bash 只做 agent 做不到的事。**

---

## 二、五层执法架构

```
📋 任务启动 (人工触发)    task-start.sh — 3 问把意图翻译成规格
🧠 写前注入 (自动触发)    hook-check-memory.sh — 从 memory/ 注入历史教训
✍️ 写后验证 (自动触发)    verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest
🔴 提交阻断 (自动触发)    pre-commit 5 项 — 全部 <1s
🚀 推送阻断 (自动触发)    pre-push 1 项 — secrets 终扫
```

每层各司其职，不重复。tsc + vitest 只在 PostToolUse 跑一次。

---

## 三、各组件详解

### 3.1 任务启动 — task-start.sh

**触发**: 人工运行 `bash scripts/workflow/task-start.sh "任务描述"`

**做的事**:
1. 展示代码库快照（分支、as any 计数）
2. 提出 3 个问题，引导 agent 在写代码前想清楚
3. 调用 generate-task-brief.py 生成 task brief 模板

**3 个问题**:

```
Q1: 调研 — 这件事以前怎么做的？
  a) 训练数据里的业界最佳实践、设计模式、架构方案
  b) 如果是 Anthropic 或顶级工程团队，会怎么分解这个任务
  c) 搜索 memory/ 目录，以前做过类似的事吗？犯过什么错

Q2: 范围 — 最简方案是什么？
  最小可行实现是什么？什么可以不做？MVP 边界在哪里？

Q3: 验收 — 做完后用户能看到什么？
  从哪条路径触发？入口→交互→结果，三环节各是什么？
```

**设计意图**: Q1 利用了三层外部智慧（训练数据 / 顶级团队思维 / 自己的错误记忆），用户不需要提供技术答案。Q2 防止过度工程。Q3 防止接线失败——先定义"用户怎么触发"，再写代码。

### 3.2 写前注入 — hook-check-memory.sh

**触发**: PreToolUse hook，每次 Edit/Write 前自动运行

**做的事**: 从今日 task brief 提取关键词 → 搜索 memory/*.md → 匹配的教训输出 Why + How to apply → harness 自动注入到 system-reminder

**不阻断**。纯信息注入型 hook。

**注册位置**: `.claude/settings.local.json` → `hooks.PreToolUse[0].hooks[0]`

### 3.3 写后验证 — verify-incremental.sh

**触发**: PostToolUse hook，每次 Edit/Write 后自动运行

**分层验证**:
- L1: oxlint 语法检查（<1s，只查改动文件）
- L2: tsc --noEmit --incremental（利用 .tsbuildinfo 缓存）
- L3: vitest run --changed（只跑相关测试）
- L4: 接线审计 + 架构边界

失败 → 错误输出到终端 → agent 修正 → 再次 Write → 再次验证 → loop-state.json 记录轮次（最多 5 轮）

**注册位置**: `.claude/settings.local.json` → `hooks.PostToolUse`

### 3.4 提交阻断 — pre-commit 5 项

**触发**: `git commit` → `.git/hooks/pre-commit` → `pre-commit-check.sh`

**5 项硬阻断**（全部 <1s，纯 grep）:

| # | 检查 | 为什么需要物理阻断 | 历史事故 |
|---|------|-------------------|---------|
| 1 | `as any` = 0 | agent 会偷懒用 as any 绕过类型检查 | 47 次 |
| 2 | empty catch 有 log.warn | agent 会写空 catch 吞异常 | 静默故障 |
| 3 | secrets 扫描（API key/Token） | absolute 必须 | API key 暴露 |
| 4 | 新 src/ 文件 → 必须有 tests/ 配对 | agent 可能跳过测试 | 4 次接线失败 |
| 5 | 新 export → 必须有生产入口调用 | agent 写了代码不接线 | 4 次接线失败 |

**注意 pre-commit 不跑 tsc 和 vitest**（PostToolUse 已跑过），所以 <5 秒完成。

### 3.5 推送阻断 — pre-push 1 项

**触发**: `git push` → `.git/hooks/pre-push` → `pre-push-check.sh`

**唯一检查**: secrets 终扫。API key 一旦推到 GitHub，轮换成本极高。这是最后防线。

**不跑 tsc/vitest/架构/接线**——这些在 PostToolUse 和 pre-commit 已经覆盖了。

### 3.6 Agent 自检 5 问

**这不是 bash 脚本**。这是写在 CLAUDE.md 里的指令。每次 agent 写完代码，必须逐项回答：

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳测试）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

**为什么 agent 自检比 bash 脚本好**: agent 理解代码语义。bash 只会 grep 模式匹配——比如 `'community'` 被 check-secrets.sh 误判为硬编码凭证，但 agent 知道那是模块 ID 不是密码。

---

## 四、文件清单（你需要创建/修改的文件）

### 4.1 新建或完全重写的脚本

| 文件 | 行数 | 说明 |
|------|------|------|
| `scripts/pre-commit-check.sh` | 129 | 5 项硬阻断（从 500 行砍下来） |
| `scripts/pre-push-check.sh` | 40 | 1 道门（从 123 行砍下来） |
| `scripts/workflow/task-start.sh` | 90 | 3 问版本 |
| `scripts/workflow/generate-task-brief.py` | 68 | 新模板（Q1/Q2/Q3） |
| `scripts/workflow/decide-next.sh` | 58 | 精简版（修复过时内容） |

### 4.2 需要删除的脚本（v2.5 遗留）

```
scripts/checks/check-manual-drift.sh   ← 脆弱：文档数字 vs 代码计数对比
scripts/checks/check-vertical-slice.sh ← agent 自检 Q3 验收覆盖
scripts/generate-state-md.sh           ← STATE.md 无人阅读
scripts/check-reality.sh               ← @state 注释 ≠ 正确性
```

### 4.3 需要修改的配置文件

**`.claude/settings.local.json`**:

PreToolUse 链（按顺序）:
```json
"PreToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [
      {
        "type": "command",
        "command": "bash scripts/hooks/hook-check-memory.sh",
        "statusMessage": "注入历史教训..."
      },
      {
        "type": "command",
        "command": "bash scripts/workflow/hook-block-write.sh"
      },
      {
        "type": "command",
        "command": "bash scripts/hooks/hook-enforce-v25.sh",
        "statusMessage": "验证 v2.5 合规..."
      }
    ]
  }
]
```

PostToolUse:
```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [
      {
        "type": "command",
        "command": "bash scripts/workflow/verify-incremental.sh",
        "statusMessage": "验证改动..."
      }
    ]
  }
]
```

**删除 SessionStart hook**（task brief 提醒已被 task-start.sh 覆盖）。

**`.git/hooks/pre-commit`**:
```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-commit-check.sh"
```

**`.git/hooks/pre-push`**:
```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-push-check.sh"
```

**`.git/hooks/commit-msg`**:
```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"
```

**`.git/hooks/post-commit`**:
```bash
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/workflow/decide-next.sh"
```

### 4.4 `package.json` 删除的 npm scripts

```json
// 删除以下 5 行：
"check:empty-modules": "bash scripts/checks/check-empty-modules.sh",
"check:manual-drift": "bash scripts/checks/check-manual-drift.sh",
"check:test-quality": "bash scripts/checks/check-test-quality.sh",
"check:wire-full": "bash scripts/checks/check-wire-full.sh",
"check:vertical-slice": "bash scripts/checks/check-vertical-slice.sh",
```

---

## 五、CLAUDE.md 更新

在你的 CLAUDE.md 中，把旧的 Loop Engineering 章节替换为以下内容：

````markdown
## Loop Engineering v3.0 — 精简物理执法 + Agent 自检

### 执法架构: 五层精简

```
📋 任务启动 (人工)   →  task-start.sh — 3 问翻译意图→规格
🧠 写前注入 (自动)    →  hook-check-memory.sh — 历史教训
✍️ 写后验证 (自动)    →  verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest → L4 接线
🔴 提交阻断 (自动)    →  pre-commit 5 项 — 全部 <1s
🚀 推送阻断 (自动)    →  pre-push 1 项 — secrets 终扫
```

### pre-commit 5 项硬阻断

| # | 检查 | 历史事故 |
|---|------|---------|
| 1 | `as any` = 0 | 47 次 |
| 2 | empty catch 有 log.warn | 静默吞异常 |
| 3 | secrets 扫描 | API key 暴露 |
| 4 | 新文件有测试 | 接线失败 |
| 5 | 新 export 有调用方 | 接线失败 |

### Agent 自检 5 问（每次写完代码必答）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？
3. 类型安全: as any = 0？
4. 测试覆盖: 测试有 expect() 断言？
5. 残留清理: 有死代码吗？旧文件删了？
```

### task-start.sh 3 问

```
Q1 调研: a) 业界最佳实践 b) 顶级团队怎么做 c) memory/ 里我们犯过的错
Q2 范围: 最简实现是什么？什么可以不做？
Q3 验收: 入口→交互→结果，三环节各是什么？
```
````

---

## 六、设计原则（给另一个 Claude 的说明）

1. **少即是多** — 5 项检查全通过 > 38 项检查全被绕过。门禁的执行率比覆盖率重要。

2. **bash 只做 agent 做不到的事** — agent 会偷懒写 `as any`、会忘记接线、会吞异常。bash grep 能抓住这些。但 agent 理解语义——架构边界、测试质量、代码审查这些交给 agent 自检更准确。

3. **不重复** — tsc 跑一次就够（PostToolUse）。pre-commit 和 pre-push 不重复跑。

4. **每次提交 <5 秒** — 如果门禁太慢，agent 会绕过它。Windows 上尤其重要。

5. **task brief 是整条链的输入** — 从 task-start 的 3 问，到 hook-check-memory 的关键词匹配，到 pre-commit 的 task brief 存在检查——全部围绕 task brief 展开。

6. **memory/ 是活的知识库** — 每次犯新错，写一个 memory 文件（带 Why + How to apply），而不是加一个 bash 脚本。memory 文件被 hook-check-memory 自动注入，agent 在下一次相关任务中就能学到教训。

---

## 七、memory/ 目录约定

```
memory/
  MEMORY.md              ← 索引文件（每行: - [标题](文件.md) — 一句话描述）
  session-YYYY-MM-DD.md  ← 会话记录
  project-state-*.md     ← 项目状态快照
  *.md                   ← 教训文件
```

**教训文件格式**:
```markdown
---
name: short-slug
description: 一句话描述
metadata:
  type: feedback | project | reference
---

事实描述

**Why:** 为什么会犯这个错
**How to apply:** 怎么避免

关联: [[related-memory]]
```

---

## 八、给另一个 Claude 的安装步骤

1. 复制本目录下所有脚本到你的 `scripts/` 目录
2. 修改 `.claude/settings.local.json`（按 4.3 节）
3. 修改 `.git/hooks/pre-commit`、`pre-push`、`commit-msg`、`post-commit`（按 4.3 节）
4. 更新 `CLAUDE.md`（按第五节）
5. 清理 `package.json` 中已删除的 npm scripts（按 4.4 节）
6. 删除 v2.5 遗留的 4 个死脚本（按 4.2 节）
7. 创建 `memory/` 目录和 `MEMORY.md` 索引文件
8. 验证: 跑一次 `bash scripts/workflow/task-start.sh "测试任务"` → 检查 task brief 是否正确生成 → 做一个小改动 → `git commit` 看 pre-commit 是否在 <5s 内通过
