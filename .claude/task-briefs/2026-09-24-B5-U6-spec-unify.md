# Task Brief: B5-U6 spec 统一与消费者显式降级

> 生成: 2026-09-24 20:07:42 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [ ] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（文件驱动，不改 TypeScript）

本任务属于哪个系统（GA诊断/哨兵/基础设施）？触及哪层？该层现有模块？新增/替换/扩展？
- 系统 = **基础设施/控制塔治理层**（第③面 CTO 健康看板生成器），非 L1-L5 产品代码。
- 触及：`scripts/control-tower/gen-cto-health.py`（生成器本体，第③面消费者）+ `task-state/*.json`（数据形态）。
- 现有模块：`analyze_task_state()`（D393 状态派生）、`render()`（报告渲染）、`_head_tracked_files()`（D412 仓库态校验）。
- 关系 = **扩展/修复**：不改 schema 语义，只统一 `spec` 字段形态 + 给旧形态加**显式降级**。

### b) 文件审计
grep 本任务关键词在 expert/ sentinel/ extensions/ knowledge/ theory/ skills/ 中。列出已有文件驱动模块。关系: 复用 / 扩展 / 新建 / 冲突
- `grep -rn '"spec"' scripts/control-tower/*.py` → 唯一读取 task-state `spec` 字段的消费者是 `gen-cto-health.py:305`（其余命中为 importlib spec，无关）。
- 测试侧已有：`tests/control-tower/gen-cto-health.test.sh`（幂等/指纹）、`gen-cto-health-repro.test.sh`（phantom 三态）、`gen-cto-health-batch-report.test.py`（隔离单测）。
- 关系 = **复用 + 扩写**：不新建消费者、不新建测试文件，在既有测试内增判别性用例。

### c) 决策
已有覆盖→复用，不准新建硬编码。无覆盖→新建走文件驱动（属扩展解耦）。冲突→取消任务，复用已有。
冲突取舍/多选项/架构选择 → 走 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md），结论写入 Q1c 决策参考系。
- 已有覆盖 → **复用**（`gen-cto-health.py` 既有 degraded 通道 + 既有测试骨架）。
- 形态统一方向：`spec` 规范形 = `{"path": …}`；历史 string 形态**不删数据**，向后兼容 + 显式降级。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 定义「怎么算做完」
  ② 测试 — 先写测试，测试 = 产品的一部分
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（新 export 有引用）
     - 错误路径有 log + degraded
     - tsc + vitest 零失败
  ④ 接线 — 端到端走通（入口可触达 + 链路完整 + 结果可见）
  ⑤ 验证 — 自检 6 问（接线/异常/类型/测试/残留/文件驱动）

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: 错误处理 + 降级信号
  - 铁律 33: 测试命名约定
  - memory/ 中的历史教训文件

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
根据决策链和本任务特点，提炼 2-3 条必须遵守的规则。每条 rule 必须包含 verify 命令。
- rule: "禁静默降级：spec 形态异常必须同时出现在 stderr 与报告正文"
  verify: "grep -n 'degraded(spec 形态)' scripts/control-tower/gen-cto-health.py"
- rule: "向后兼容不得丢数据：string 形态若形如路径仍按路径使用"
  verify: "grep -n '_SPEC_PATH_RE' scripts/control-tower/gen-cto-health.py"
- rule: "判别性夹具必须真承重（旧实现下必红）"
  verify: "bash tests/control-tower/gen-cto-health.test.sh"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
按 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md）执行，并将结论记录在本字段：
  ① 第一性原理 — 问题的最简本质是什么？最少机制能解决吗？
  ② Anthropic 工程基线 — 隔离/失败即关闭/脚本验证/机器可验契约，哪条适用？
  ③ 开源实证 — 有可克隆的代码/架构参考吗？clone 下来看实际做法
  ④ 收敛检查 — 两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
决策记录格式（K3 审计可核）: 参考：Anthropic/DeepSeek/第一性原理 + 结论
简单决策（无冲突、单一路径）只需记录参考系名。

### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）
- 见 `memory/notes/proposed/2026-09-24-b5-u6-spec-unify.md`（本卡决策沉淀：形态统一 + 显式降级 + 兼容边界）。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- 四卡 `spec` 统一为规范形 `{"path": <相对路径>}`：
  - `task-state/D928.json`
  - `task-state/D933.json`
  - `task-state/D934.json`
  - `task-state/D936.json`
  - D928/D933 的额外键 `by / at / in_main / note`（内容有实义）**原样搬迁**到同级新键 `spec_meta`（零信息丢失）。
- 消费者 `scripts/control-tower/gen-cto-health.py`：`spec` 非 dict 时**显式降级**（stderr + 报告正文双可见），
  且 string 形态**向后兼容**（形如单一路径者仍按路径使用）；散文/多路径形态不得当路径（旧实现会 `File name too long` 崩溃）。
- 判别性夹具：`tests/control-tower/gen-cto-health.test.sh` 增第 6 节（string→degraded 可见 + path 仍被采用 + 散文不得当路径）。
- 证据件：`docs/synova/product-lines/evidence/B5-U6-改动清单.md`。
- 认领 brief：`.claude/task-briefs/2026-09-24-B5-U6-spec-unify.md`（G12 硬门禁要求「改 scripts/ 需先认领 brief」）。

不做什么：
- 不改 `.github/workflows/ci.yml`（M9→B3→B4 串行单写者，D940 在用）
- 不改 `scripts/control-tower/alloc-task-id.sh`（D940 写集）
- 不改 `scripts/audit/**`（K3 红线）
- 不改 `scripts/control-tower/pre-audit-summary.sh`（U12：不在本卡写集，lead 已裁「暂不纳入」）
- 不做其余 116 张 string 卡的批量归一（后续卡；本卡只归一 4 张）
- 不更新 `docs/synova/CTO-HEALTH.md`（生成物，不在写集；测试副产物已还原）
- 不改 `src/**`、`packages/**`（非本卡域）

## 写集

> D749 机器块（写集单一事实源，G12/check-brief-vs-code 消费）

| 文件 | 类别 |
|---|---|
| `scripts/control-tower/gen-cto-health.py` | task |
| `tests/control-tower/gen-cto-health.test.sh` | task |
| `task-state/D928.json` | task |
| `task-state/D933.json` | task |
| `task-state/D934.json` | task |
| `task-state/D936.json` | task |
| `docs/synova/product-lines/evidence/B5-U6-改动清单.md` | task |
| `memory/notes/proposed/2026-09-24-b5-u6-spec-unify.md` | task |
| `.claude/task-briefs/2026-09-24-B5-U6-spec-unify.md` | builtin（本认领 brief） |
| `.claude/bypass.log` | builtin（hook 运行期账本，每次提交由 hook 追加） |

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
处理（中间经过哪些步骤）：
结果（最终展示在哪）：

## 架构层: 基础设施
L1/L2/L3/L4/L5
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:
