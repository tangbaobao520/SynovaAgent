# Task Brief: D599 客户配置包机制蓝本（DSH B-09+B-10）

> 生成: 2026-09-08 | 分支: feat/d599-customer-config-package | as any: 0
> spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md
> Session: D599 | 隔离 clone: .sessions/D599/repo

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行——这就是增长导航。
目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
本任务正是多客户扩展的机制命门：同一套核心引擎，如何为不同客户加载不同配置（四层叠加「调校单」），而不改代码。

### 三层解耦体系

**纵向解耦：五层物理隔离** — 本任务新建 src/config/（支撑层机制蓝本），由 L1 routes/diagnosis.ts 消费（L1→支撑机制，方向合法）。
**横向解耦：Monorepo 包** — 不触及。
**扩展解耦：文件驱动** — 本任务的本质：客户配置包 = 目录即包（customer-config/{orgId}/config.yml），新客户 = 加目录，不改代码。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 L1-L5 代码/架构）
本任务属基础设施机制层（src/config/ 新建）。该层现状：src/config.ts 单文件配置 + src/services/config-recovery.ts 单文件恢复，均无「客户配置包/四层叠加」概念（spec §2.2 缺陷 A/B/C 已 grep 实证）。新增：config-layers.ts（B-10 四层叠加纯机制）+ customer-config-package.ts（B-09 目录发现/挂载/泄漏审计）。扩展 src/routes/diagnosis.ts consult 生产路径消费解析结果（可观测，不消费阈值/专家集/报告样式/凭证——descope 到 S1-6）。

### b) 文件审计
grep mergeLayers|config-layer|dumpConfig|customer-config|客户配置包 在 src/ packages/ → 零命中（spec §2.3 实测）。expert/ sentinel/ extensions/ knowledge/ theory/ skills/ 中无既有覆盖。既有相近物均非本卡范围：rbac.ts=权限角色、auth.ts:28=身份 orgId、expert-registry.yaml=单层全局专家注册、config-recovery.ts=单文件恢复。关系：新建（机制层零重复）。

### c) 决策
无既有覆盖 → 新建 src/config/ 机制蓝本。三决策点走 DECISION-REFERENCE（见 Q1c）。
冲突取舍/多选项/架构选择 → 走 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md），结论写入 Q1c 决策参考系。

## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）已按 task-start 注入器全文注入（本 brief 摘录记录）：

四步框架：①第一性原理（最简本质/最少机制）②Anthropic 工程基线（隔离/失败即关闭/机器可验契约）③开源实证（DSH 源码已读）④收敛检查（双参考系指向同一答案=大概率正确）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC：spec §6 DS1-DS8 为 Done 机器可验契约。
② 测试：先写 tests/config/*.test.ts 跑红（模块不存在→fail），再实现跑绿（≥14 用例，每用例 ≥3 expect，覆盖正常/降级/边界）。
③ 实现：DSH 源码已读自研（discovery.ts first-root-wins/broken 上报、mount.ts leakedServices 审计拒绝、settings/index.ts mergeLayers/deepEqualJson/settingsNamespace、settings-file patchNode 本卡不做）。零 @deepseek-ai 依赖。
④ 接线：resolveCustomerConfig 在 src/routes/diagnosis.ts consult 生产路径调用（grep ≥1 生产调用点），结果进 SSE 可观测事件。
⑤ 验证：自检 6 问 + DS1-DS8 逐条跑。

引用依据：铁律 0-2（spec→test→impl→wire）、铁律 7（入口/链路/结果）、铁律 24+31（degraded 传播）、铁律 32（.code+.phase+.retryable）、铁律 33/38/46/47/48、memory D598（clone+junction vitest 须 node --preserve-symlinks）、D488（hook ROOT=主区）。

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "四层叠加必须有序覆盖且数组整值替换（workspace>customer>industry>default），禁止逐元素合并"
    verify: "grep -n 'mergeLayers' src/config/config-layers.ts"
  - rule: "resolveCustomerConfig/discoverCustomerConfigPackages 必须在 src/routes/diagnosis.ts 生产路径被调（测试调用不计）"
    verify: "grep -rn 'resolveCustomerConfig' src/routes/diagnosis.ts"
  - rule: "零 @deepseek-ai 依赖 + as any/as never/as unknown as 零命中"
    verify: "grep -rn '@deepseek-ai' src/ ; grep -rn 'as any' src/config/"

### c) 决策参考系
  ① 第一性原理 — 多客户配置的最简本质 = 「有序文档叠加 + 来源可查 + 不写进程全局」，四层 reduce-merge 即最少机制。
  ② Anthropic 工程基线 — fail-closed（非法层文档拒绝）、发现健康上报而非静默跳过、per-org 隔离（客户配置不得写全局单例）。
  ③ 开源实证 — DSH settings mergeLayers（plain object 递归/数组整值替换/undefined 稀疏）+ agent-presets discovery（first-root-wins/broken 上报）+ mount（leakedServices 拒绝）已读源码。
  ④ 收敛检查 — 三决策点（数组整值替换/目录即包/只返回 detached 结果）双参考系收敛，无分歧。
决策记录: 参考：Anthropic/DeepSeek(DSH源码)/第一性原理 + 结论=mergeLayers 数组整值替换、包=customer-config/{orgId}/ 目录、mount 只返回 detached 解析结果不写进程级状态。

### d) 相关 Note 引用
- [ ] memory/2026-09-08-d599-customer-config-package.md（交付后新建 proposed）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/config/config-layers.ts（新建，B-10：mergeLayers 对象递归/数组整值替换/undefined 稀疏 + deepEqualJson + configNamespace kebab-case 校验 + resolveLayers default→industry→customer→workspace 有序覆盖 + dumpLayers 逐层来源 provenance）
- src/config/customer-config-package.ts（新建，B-09：discoverCustomerConfigPackages first-root-wins + broken 上报不跳过 + mountCustomerConfig per-org 隔离 detached + leakedGlobalConfig 审计拒绝进程级全局泄漏 + resolveCustomerConfig 接线入口）
- src/routes/diagnosis.ts（修改，consult 生产路径调用 resolveCustomerConfig(teamId)，解析结果经 SSE config_resolved 事件可观测）
- tests/config/config-layers.test.ts（新建，≥8 用例）
- tests/config/customer-config-package.test.ts（新建，≥6 用例）

写集（G12c 对照表）：

| 文件 | 操作 |
|---|---|
| src/config/config-layers.ts | 新建 |
| src/config/customer-config-package.ts | 新建 |
| src/routes/diagnosis.ts | 修改 |
| tests/config/config-layers.test.ts | 新建 |
| tests/config/customer-config-package.test.ts | 新建 |
| docs/plans/codex/implementation/SYNOVA-IMPL-D599-customer-config-package-20260908.md | 修改（§3.2 同 commit 回填） |
| .claude/plan.json | 修改（wiring deferred 声明随 PR 提交，D588/D333 先例；S1-6 产品化=接线阶段） |
| .claude/task-briefs/2026-09-08-D599-customer-config-package.md | 新建（本 brief） |

不做什么（含文件路径，路径紧跟动词）：
不改 src/sentinel/（DSH 线地盘）
不消费 阈值/启用专家集/报告样式/凭证 到诊断管线（属 S1-6 产品化后续）
不做 patchNode 注释保留 + chokidar 热重载 + 跨进程写锁（B-08 后续）
不改 src/middleware/rbac.ts、src/l3/expert-registry.ts、src/services/config-recovery.ts、src/config.ts（均非本卡写集）
不引 @deepseek-ai 依赖、不 copy DSH 代码（G1/G4 红线）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：GA 调 POST /api/diagnosis/consult（consult 生产路径，orgId=teamId）
处理（中间步骤）：consult 内 resolveCustomerConfig(teamId) → discoverCustomerConfigPackages（first-root-wins/broken 上报）→ 四层 resolveLayers（default→industry→customer→workspace）→ leakedGlobalConfig 审计剥离 → detached 结果
结果（最终展示在哪）：SSE 流 config_resolved 事件（含逐层来源 provenance + degraded 标记），GA 客户端可见；log.info 记录解析来源

## 架构层: 基础设施（src/config/ 支撑机制 + L1 routes 消费）
L1 routes/diagnosis.ts 消费；src/config/ 为跨层支撑机制（非 L3/L4/L5 业务层，不触五层边界铁律 39）

#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达: verify: grep -rn "resolveCustomerConfig" src/routes/diagnosis.ts（≥1 生产调用点）
- [ ] 链路走通: verify: grep -n "mergeLayers" src/config/config-layers.ts && grep -n "resolveLayers" src/config/config-layers.ts && grep -n "dumpLayers" src/config/config-layers.ts
- [ ] 结果可见: verify: node --preserve-symlinks node_modules/vitest/vitest.mjs run tests/config/ tests/routes/（相关套件全绿）
- [ ] 零 DSH 依赖: verify: grep -rn "@deepseek-ai" src/（0 命中）
- [ ] 类型安全: verify: grep -rn "as any\|as never\|as unknown as" src/config/ src/routes/diagnosis.ts（0 命中）
- [ ] 零回归: verify: npx tsc --noEmit（28 = 基线零新增）
- [ ] 无绕过: verify: grep -n "no-verify" .claude/bypass.log（0 命中）
