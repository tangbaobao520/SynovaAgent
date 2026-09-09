# Task Brief: D600 CFG 产品化——诊断第一命令（reportDepth/template 客户配置驱动 + config/dump 检查表面）

> 生成: 2026-09-09 | 分支: feat/win-d600-cfg-first-command（基于 origin/feat/d599-customer-config-package，堆叠交付） | as any: 0
> spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-D600-cfg-productize-first-command-20260908.md
> Session: D600 | 隔离 clone: .sessions/D600/repo

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行——这就是增长导航。
目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
本任务把 D599 客户配置包从「解析了但没消费」推进到「诊断第一命令真实消费」：报告深度/模板由客户配置驱动，运营者获得 config/dump 检查表面——多客户扩展的行为差异化命门。

### 三层解耦体系

**纵向解耦：五层物理隔离** — 本任务只改 L1（src/routes/diagnosis.ts + src/routes/config.ts + src/server.ts 挂载），消费 src/config/customer-config-package.ts 支撑机制（D599 已交付；L1→支撑机制同 D599 方向，合法）。
**横向解耦：Monorepo 包** — 不触及。
**扩展解耦：文件驱动** — 新客户报告行为差异化 = 在 customer-config/{orgId}/config.yml 写 diagnosis.reportDepth/diagnosis.template，零代码改动。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 L1-L5 代码/架构）
本任务属 L1 交互层接线。现状（spec §2.2 grep 实证，D599 分支基座）：src/routes/diagnosis.ts consult 已 resolveCustomerConfig(teamId) 但 config 字段未驱动任何行为——reportDepth 仍是硬编码 fallback（诊断路由 L461 实测）；dumpLayers 已交付但零生产消费（无 dump 端点）。新增：诊断消费 customerConfig.config（reportDepth/template 驱动）+ src/routes/config.ts GET /api/config/dump 检查表面 + src/server.ts app.use 挂载。

### b) 文件审计
grep resolveCustomerConfig|dumpLayers|config/dump 在 src/routes/ src/services/ → 仅 diagnosis.ts 消费 provenance（挂报告），无 dump 端点、无 config 驱动行为（spec §2.3 实测）。expert/ sentinel/ extensions/ 无既有覆盖。既有相近物：src/l3/report-template-loader.ts 的 knowledge/custom/{client_id}/ 两层模板覆盖——与四层机制并存，统一属 CFG 后续切片（本卡不做，见 Q2 排除项）。关系：在 D599 机制上做「消费 + dump 表面」，不重写四层解析。

### c) 决策
D599 已覆盖解析机制 → 复用 resolveCustomerConfig/dumpLayers，不新建。无覆盖（消费面+dump 表面）→ 本卡实现。无冲突。
冲突取舍 → 走 DECISION-REFERENCE 四步框架，结论写入 Q1c 决策参考系。

## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）按 task-start 注入器惯例记录：

四步框架：①第一性原理（最简本质/最少机制）②Anthropic 工程基线（隔离/失败即关闭/机器可验契约）③开源实证（DSH 源码已读）④收敛检查（双参考系指向同一答案=大概率正确）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC：spec §6 DS1-DS8 为 Done 机器可验契约；§5 接线表为生产调用点契约。
② 测试：先写 tests/routes/diagnosis-customer-config.test.ts + tests/routes/config.test.ts 跑红（config 未消费→恒 raw→red；无 dump 端点→404→red），再实现跑绿（≥8 用例，每用例 ≥3 expect，覆盖正常/降级/边界）。
③ 实现：消费面只做 reportDepth/template 两键（spec §3.3 descope 阈值/专家集/凭证）；非法配置值跳过回退下一优先级（不炸诊断）；dump 端点只读不写。
④ 接线：customerConfig.config 在 diagnosis.ts consult 生产路径真实消费（grep ≥1 非挂报告消费点）；configRoutes 在 src/server.ts app.use 挂载（对齐 diagnosisRoutes 先例 src/server.ts:41/354）。
⑤ 验证：自检 6 问 + DS1-DS8 逐条跑。

引用依据：铁律 0-2（spec→test→impl→wire）、铁律 7（入口/链路/结果）、铁律 11/24+31（degraded 传播）、铁律 33（测试命名）、铁律 38/CT-46（as any/as never/as unknown as 零容忍）、铁律 47/48（契约+非空壳）、memory D598（clone+junction vitest 须 node --preserve-symlinks；DS3 注释勿写字面量包名）、D575（组2b 配对映射命名偏差登记法）、D470/D588（跨午夜 CI UTC 日期 → brief 双日期镜像追踪）。

### b) Q1c 决策参考系
- 决策点 1（reportDepth 优先级）：参考：Anthropic/第一性原理 + 结论 = scope.reportDepth > scope.depth > 客户配置 > 'raw'（显式请求 > 隐式配置 > 硬编码兜底，spec §4.5 已定，本卡照做）。
- 决策点 2（config 命名空间键）：参考：DSH settings namespace kebab-case + 结论 = diagnosis.reportDepth / diagnosis.template（小驼峰嵌套 diagnosis 命名空间）。
- 决策点 3（dump 端点）：参考：施工图 §5.4「--dump-config 可检查实际生效配置」+ 结论 = GET /api/config/dump?orgId= 只读检查表面，逐层 provenance 返回。
- 决策点 4（测试文件名）：参考：组2b 配对映射硬规则（src/routes/config.ts → tests/routes/config.test.ts，D575 登记偏差先例）+ 结论 = 测试命名 tests/routes/config.test.ts（spec §3.1 原名 config-dump.test.ts 的登记偏差，§3.2 同 commit 回填）。

### c) 本任务执行约束（组 6 可验证）
- rule: "customerConfig.config 必须在 src/routes/diagnosis.ts 生产路径真实消费 reportDepth/template（非仅挂 provenance）"
  verify: "grep -n customerConfig.config src/routes/diagnosis.ts"
- rule: "GET /api/config/dump 端点必须存在于 src/routes/config.ts 且 src/server.ts app.use 挂载"
  verify: "grep -n config/dump src/routes/config.ts src/server.ts"
- rule: "零 DSH 包依赖 + as any/as never/as unknown as 零命中"
  verify: "grep -rn 'as any' src/routes/config.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/routes/diagnosis.ts（修改，consult 消费 customerConfig.config：readDiagnosisConfig 命名空间读取 + reportDepth 优先级链 scope.reportDepth > scope.depth > diagnosis.reportDepth > raw（非法值跳过）+ 一页纸模板 diagnosis.template（ceo|flywheel）覆盖既有映射 + report.customerConfig 挂 applied 可观测）
- src/routes/config.ts（新建，GET /api/config/dump?orgId= → resolveCustomerConfig 复用 D599 → ok/orgId/config/provenance/degraded/audit 逐层带来源；orgId 缺省 400；解析失败 degraded 不抛，铁律 24/31）
- src/server.ts（修改，import configRoutes + app.use 挂载，对齐 diagnosisRoutes 先例）
- tests/routes/diagnosis-customer-config.test.ts（新建，≥5 用例：配置驱动 reportDepth/scope 优先/无包回退 raw/broken 包 degraded 不阻断/template 驱动）
- tests/routes/config.test.ts（新建，≥5 用例：四层 provenance/泄漏剥离/orgId 缺省 400/无包 degraded/非法 orgId 不逃逸）
- docs/plans/codex/implementation/SYNOVA-IMPL-D600-cfg-productize-first-command-20260908.md（修改，§3.2 同 commit 回填最终形态）
- .claude/task-briefs/2026-09-08-D600-cfg-first-command.md（新建，CI UTC 窗口镜像，D470 先例）
- .claude/task-briefs/2026-09-09-D600-cfg-first-command.md（新建，本 brief canonical）

写集（G12c 对照表）：

| 文件 | 操作 |
|---|---|
| src/routes/diagnosis.ts | 修改 |
| src/routes/config.ts | 新建 |
| src/server.ts | 修改 |
| tests/routes/diagnosis-customer-config.test.ts | 新建 |
| tests/routes/config.test.ts | 新建 |
| docs/plans/codex/implementation/SYNOVA-IMPL-D600-cfg-productize-first-command-20260908.md | 修改（§3.2 回填） |
| .claude/task-briefs/2026-09-08-D600-cfg-first-command.md | 新建（CI 镜像） |
| .claude/task-briefs/2026-09-09-D600-cfg-first-command.md | 新建（本 brief） |

不做什么（含文件路径，路径紧跟动词）：
不改 src/config/config-layers.ts、src/config/customer-config-package.ts（D599 机制，只复用不重写）
不消费 阈值/启用专家集/凭证 到诊断管线（spec §3.3：阈值属 src/sentinel/ DSH 线；专家集待 registry 改名 P1；凭证属后续 CFG 切片）
不改 src/sentinel/、src/agent/sentinel-service.ts（DSH 线地盘）
不统一 src/l3/report-template-loader.ts 的 knowledge/custom/{client_id}/ 与四层机制（CFG 报告样式统一后续切片）
不引 DSH 包依赖、不 copy DSH 代码（G1/G4 红线）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：① GA 调 POST /api/diagnosis/consult（teamId=orgId）；② 运营者调 GET /api/config/dump?orgId=xxx
处理（中间步骤）：① consult 内 resolveCustomerConfig → 命名空间 diagnosis.reportDepth/template 经类型守卫读取 → 优先级链合成 reportDepth → assembleReport/renderOnePager 按其驱动；② dump 路由 resolveCustomerConfig → provenance（dumpLayers 逐层来源）+ 泄漏剥离后 config
结果（最终展示在哪）：① SSE complete 帧 report.assembled.depth = 配置驱动深度 + report.customerConfig.applied 可回查；② dump JSON 响应含逐层 provenance + degraded 标记；GA/运营者可见

## 架构层: L1（src/routes/ + src/server.ts 挂载）
L1 routes/diagnosis.ts + routes/config.ts 消费 src/config/ 支撑机制（D599 同方向）；不触 L3/L4/L5

#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达: verify: grep -rn "customerConfig.config\|config.diagnosis" src/routes/diagnosis.ts（≥1 生产消费点，DS1）
- [ ] 链路走通: verify: grep -rn "config/dump" src/routes/config.ts src/server.ts（端点+挂载，DS2）
- [ ] 零 DSH 依赖: verify: grep -rn "deepseek-ai" src/（0 命中，DS3）
- [ ] 结果可见: verify: node --preserve-symlinks node_modules/vitest/vitest.mjs run tests/routes/diagnosis-customer-config.test.ts tests/routes/config.test.ts（red→green ≥8 用例全绿，DS4）
- [ ] 零回归: verify: tsc --noEmit（28 = 基线零新增，DS5）+ 相关 routes 套件全绿
- [ ] 类型安全: verify: grep -rn "as any\|as never\|as unknown as" src/routes/diagnosis.ts src/routes/config.ts（0 命中，DS6）
- [ ] 范围一致: verify: git diff --name-only HEAD^（与写集一致，DS7）
- [ ] 无绕过: verify: grep -n "no-verify" .claude/bypass.log（0 命中，DS8）+ push + CI 绿
