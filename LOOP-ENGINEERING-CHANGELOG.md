# Loop Engineering 版本更新日志

> 从"每犯一错加一脚本"到"免疫系统 — 一次错误、一条约束、永久防止"。

---

## V4.1.2 (2026-06-24)

### 新增
- **SessionStart 流程锁前置** — hook-session-start.sh：会话启动时检查 workflow-state，未完成则写入 `.claude/session-locked`，hook-block-write 阻断所有非 task-start 的写操作
- **免疫细胞 #8: stub-implementation-pattern** — 检测 `listForTeam(teamId){return this.list()}` 式空实现，参数未使用即阻断

### 修复
- V4.1.1 PreToolUse 只拦截 Write/Edit，Bash/Git 操作完全绕过 → SessionStart 从源头锁流程

### 文件
- `scripts/hooks/hook-session-start.sh` ✅ 新增
- `memory/stub-implementation-pattern.md` ✅ 新增

---

## V4.1.1 (2026-06-24)

### 变更
- **pre-commit extensions/ 覆盖** — NEW_IMPL 从 `^src/` 扩展为 `^src/|^extensions/`
- **测试路径映射扩展** — 支持 `extensions/sentinels/{name}/(aggregate|computes/{fn}).ts` → `tests/sentinels/`
- 15 个 compute+aggregate 测试（45 tests 全部通过）

### 修复
- 16 个函数零测试的问题 → 补全测试 + CI 结果文件
- `check-file-driven.sh` SOGNodeType 检查排除白名单文件

### 文件
- `scripts/pre-commit-check.sh` 🔧 改造
- `tests/sentinels/*` 15 个测试文件 ✅ 新增

---

## V4.1 (2026-06-24)

### 新增
- **免疫系统** — hook-check-memory 升级为免疫执行引擎
  - 匹配 memory/ → 读 constraint 字段 → 执行 bash → 比较 expected → `severity=block` 阻断 / `severity=warn` 写入 STATE.md
- **7 个免疫细胞**：
  - `dual-source-fraud` (block) — 双数据源，15 次
  - `q0-skipped` (block) — Q0 跳过，3 次
  - `grep-semantic-overreach` (block) — bash 语义误判，1 次
  - `plan-actual-mismatch` (warn) — 计划与实际不符，5 次
  - `q0c-cancelled-without-followup` (warn) — Q0c 取消无跟踪，12 次
  - `info-injection-ignored` (warn) — 软机制被无视，∞次
  - `lessons-file-lost` (warn) — 踩坑录丢失，1 次
- **STATE.md** — 运行状态 + 免疫警告累计
- **check-lessons-learned.sh** — 错误沉淀 → memory/ 条目 + class 去重
- **plan-integrity 验证** — plan-schema +principles/approach/memory_refs，pre-commit 组6物理验证
- **Q1/Q2 问法重写** — Anthropic-only 决策链路 + 重写/复用二选一

### 修复
- Q0 只在 PreToolUse（V3.8）强制执行 → 改为 task-start 三问 + Q0b grep-output 强制
- 信息注入型检查 100% 无效 → 改为硬阻断（constraint 自动执行）

### 文件
- `scripts/hooks/hook-check-memory.sh` 🔧 改造
- `scripts/check-lessons-learned.sh` ✅ 新增
- `scripts/check-plan-integrity.sh` ✅ 新增
- `STATE.md` ✅ 新增
- `memory/*.md` 7 个免疫细胞 ✅ 新增

---

## V3.9 (2026-06-23)

### 变更
- **Done 可证伪性** — 每个 `- [x]` 必须包含 `verify:` 命令
- **能力验收 CI** — acceptance 测试必须 CI 通过
- **Q0c 跟踪** — cancel 任务必须有 `follow_up` 字段
- **双日志分离** — `pre-commit-failures.log`（门禁故障）vs `bypass.log`（人为绕过）

### 修复
- as any 跳过注释行（不再误报注释中的 `as any = 0`）
- empty catch 接收 `degraded`/`throw`/`log` 三种信号
- 接线只查"被引用"这个物理事实（搜索全 src/）

---

## V3.8 (2026-06-23)

### 新增
- **Q0 PreToolUse 强制执行** — 写代码前必须填 Q0a 项目拼图 + Q0b 文件审计 + Q0c 决策
- **反向 Q0c 审计** — 15 个双数据源发现 + 消除（取消新模块，保留旧系统）
- **CLAUDE.md 完整重构** — L0 进化/反馈闭环/企业事实层/三层粒度/数据安全/V3.8 流程

### 修复
- hook-block-write.sh V3.5 → V3.8（Q0 第 0 号检查）

---

## V3.7 (2026-06-23)

### 核心变化
- **bash 退位** — 不再做语义判断（as any 注释误报、接线深度检查）
- **agent 进位** — 语义判断交给 agent 自检
- **plan.json** — 分阶段任务的结构化支持（deferred wiring/test_pairing）
- **双日志** — 门禁故障 ≠ 人为绕过

### 修复
- plan.json 感知的 plan_aware_check — 架构步骤不是偷懒

---

## V3.6 (2026-06-22)

### 变更
- 20 项独立检查 → 8 组合并（按根因归类，共享 grep）
- 新增第 8 组：文件驱动架构完整性（manifest/tags/回归/目录/pizza-chain）
- Task Brief 11 字段 → 5 核心字段
- check-file-driven.sh — 文件驱动架构门禁

---

## V3.5 (2026-06-21)

### 变更
- 8 组 pre-commit 物理阻断
- 桥接文件欺诈检测（铁律 46/47）
- 接线深度检查（import 但未调用）
- 桩测试检测（≥3 expect）
- 硬编码业务数据扫描

---

## V3.1 (2026-06-19)

### 变更
- +产品对齐检查 Q1-Q4
- 答案设计信度 > 纯输出

---

## V3.0 (2026-06-17)

### 核心重构
- 38 项 → 5 项 pre-commit（全 <5s）
- 12 脚本 → 8 脚本
- 提交耗时 90s → <5s
- Agent 自检 5 问（接线/异常/类型/测试/残留）
- task-start 3 问（Q1 调研 / Q2 范围 / Q3 验收）

### 原则
"越少越会被执行。" — V3.0 核心哲学

---

## V2.5 (2026-06-16)

### 初始版本
- 38 项 pre-commit 硬阻断
- 6 个执法脚本（check-empty-modules/check-manual-drift/check-test-quality/check-wire-full/check-vertical-slice/hook-check-memory）
- 3 层阻断（PreToolUse → PostToolUse → pre-commit）
- 提交耗时 40-90 秒
- 1,862 行 bash 脚本

---

## V4.2.1 (2026-06-24) — 免疫系统增强

### 新增
- **免疫细胞 #9: plan-actual-closure** (warn) — 声明完成但从未对比文档与代码的 gap
- **免疫细胞 #2: q0c-cancelled-without-followup 升级** (block) — 取消任务必须补完
- **修复提示字段** — 所有免疫细胞现在带 `remediation:` 字段，告诉 agent 怎么做才对

### 已知缺口（当前文件驱动覆盖率 45%）
| 维度 | 缺口 | 计划 |
|------|------|------|
| 行业模板 | 4 个行业 0 子目录 | C1 |
| 报告格式 | 0 .hbs 文件 | A2 |
| 数据策略 | policies/ 不存在 | D2 |
| 引擎配置 | engine/ 不存在 | D1 |
| 专家工具 | tools/ 不存在 | E1 |
| 国际化 | en-US 缺 expert-prompts | A1 |
| 通知 | 缺 email/feishu-approval | A3 |
| 哨兵 | 11 缺 manifest+aggregate | B1-B4 |
