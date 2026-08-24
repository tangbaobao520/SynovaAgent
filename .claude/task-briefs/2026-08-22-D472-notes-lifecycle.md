# Task Brief: D472 Agent Notes 四态铁律结构化（Stage1-D2）

> 生成: 2026-08-22 | 任务: D472 | 认领: DeepSeek Harness（编码）
> 权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D472-notes-lifecycle-hardening-20260822.md
> 依赖: D395-a（四态目录）/ D406（lessons 改向 proposed）——本任务补"迁移门禁 + 注入过滤 + 字段契约对齐"

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属治理层（L0 开发侧工具链）：把 memory/notes/ 四态生命周期补成闭环。D395-a 已建四态目录 + commit-msg 引用门禁，D406 已改 lessons 写入 proposed/。缺口：① hook-check-memory.sh 读全目录无四态过滤（archived 教训注入噪音）② proposed→implemented 迁移无物理门禁（僵尸条目）③ check-lessons-learned 字段与 README 契约分裂。
### b) 文件审计
- scripts/hooks/hook-check-memory.sh: L21 MEMORY_DIR=$ROOT/memory + L58 find 全目录 → 需改只读 proposed+implemented
- scripts/check-lessons-learned.sh: L46-55 英文十字段头 → 需对齐 README 四字段（状态/日期/决策/理由）+ 保留扩展字段
- scripts/pre-commit-check.sh: 组 6 区域（L596-652）→ 追加 check-notes-lifecycle.sh 条件调用
- scripts/control-tower/check-notes-lifecycle.sh: 新建（迁移门禁）
- memory/notes/README.md: 补迁移门禁小节
### c) 决策
复用 D395-a 四态目录；不重复造 commit-msg 门禁；迁移门禁挂 pre-commit 组 6 区域（物理检查目录状态）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
参考 DSH .agents/notes 四态（proposed/implemented/archived/rejected，实现落地必须 git mv）。决策：① 注入过滤只读活态（K3 §4.2 "archived/rejected 不注入"）② 迁移门禁保守双格式 D# 提取（中文 任务:/相关 D#: 或英文 name:/class:/description: 中的 D\d+）+ task-state impl_done/spec_done 双条件命中才阻断（不误杀真实提议）③ 字段契约改头保留扩展（兼容已有 4 条 proposed Note）。
历史教训：D316 教训注入会被忽略（信息注入型 0% 有效）——但迁移门禁是物理阻断型（pre-commit 硬门禁），100% 有效；hook 注入过滤是本任务的补缺（M7 噪音）。
参考：Anthropic 工程基线（fail-closed + 脚本验证）+ DeepSeek .agents/notes 四态 + 第一性原理（决策生命周期 = 提出→落地→归档，断环在哪就补哪）+ 结论：三处断点分别用"注入过滤 + 物理门禁 + 字段对齐"补。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/hooks/hook-check-memory.sh
- scripts/check-lessons-learned.sh
- scripts/control-tower/check-notes-lifecycle.sh
- scripts/pre-commit-check.sh
- tests/control-tower/check-notes-lifecycle.test.sh
- tests/control-tower/hook-check-memory.test.sh
- memory/notes/README.md
- memory/notes/proposed/2026-08-22-d472-notes-lifecycle.md
- memory/notes/implemented/2026-08-17-d406-lessons-channel.md
- memory/notes/archived/2026-08-17-test-d406.md
- task-state/D472.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D472-notes-lifecycle-hardening-20260822.md
不做什么：
- 不改 scripts/commit-msg-check.sh（D395-a 已交付，本任务不碰）
- 不改 scripts/workflow/generate-task-brief.py（D395-a 已交付，本任务不碰）
- 不改 memory/notes/archived/ 下 20 个旧教训正文（保留可追溯）
- 不改 src/ 任何业务代码（src/store 属 Win，D471 范畴）

## Q3: 验收 — 入口 → 交互 → 结果
入口：pre-commit 提交（proposed/ 有变更时触发）+ PreToolUse hook 注入
处理：check-notes-lifecycle.sh 扫 proposed/ 僵尸条目（D# 提取 + task-state 状态双条件）→ exit 1 阻断或 exit 0 放行；hook 只读 proposed+implemented 注入
结果：archived/rejected 零注入（grep 可查）+ 僵尸 proposed 被门禁点名（测试断言 exit 1）+ 新 lessons Note 头含 状态/日期/决策/理由

## 架构层:
基础设施（L0 治理层，hooks 注入层 + 控制塔门禁）

## Done 标准
- [x] verify: bash tests/control-tower/check-notes-lifecycle.test.sh 全过（≥10 用例，含迁移门禁/字段契约/降级/边界）+ bash tests/control-tower/hook-check-memory.test.sh 全过（注入过滤）
- [x] verify: bash scripts/control-tower/check-notes-lifecycle.sh 对构造僵尸 proposed（中文 任务: DXXX + task-state impl_done）→ exit 1 + 清单点名
- [x] verify: grep -n "proposed\|implemented" scripts/hooks/hook-check-memory.sh 命中 find 范围（非仅注释）
- [x] verify: grep -n "^状态:" scripts/check-lessons-learned.sh 命中模板
- [x] verify: grep -n "check-notes-lifecycle" scripts/pre-commit-check.sh 命中生产调用行
- [x] verify: bash scripts/control-tower/baseline-check.sh 无新增失败；pre-commit 13 组全过
