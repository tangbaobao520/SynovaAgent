# Task Brief: D663 专家 tools 对齐 compute seam — 删死 tools 字段 + 建 5 个 compute-map.yaml + 一致性测试（增长导航）

> 生成: 2026-09-10 15:51:02 | 分支: main | as any: 0
> Session: D663（独立 clone .sessions/D663/repo，分支 feat/win-d663-tools-compute-seam）
> 唯一契约: docs/plans/codex/implementation/SYNOVA-IMPL-D663-expert-tools-compute-seam-20260910.md

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
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (文件驱动专家)
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
本任务在专家架构 P1 治理线（第六章 §6.7「专家 tools 重对齐到 extensions compute seam 化」）。触达 L3 洞察层的 expert/ 文件驱动数据：5 个问题域专家 manifest.json（fundamental-efficiency/customer-growth/organizational-capability/technology-foundation/competitive-strategy）删死字段 tools（零消费死代码），新建 5 个 compute-map.yaml（第六章 §6.9.4 要求的 问题域→computes+edges seam 映射），加 tests/expert/ 一致性测试。不替换、不扩展现有模块，纯数据面收敛 + 测试护航。增长导航视角：专家是"回答增长卡在哪里"的解读层，compute 是证据层，seam 映射表让"专家声明要算什么"与"真实 compute 实现"对得上。

### b) 文件审计
grep 实测（主区 2026-09-10）：
- expert/fundamental-efficiency/manifest.json:26-32 有死 "tools" 字段（compute-break-even 等无实现小写工具名）
- expert/customer-growth/manifest.json:25-31 同上
- expert/organizational-capability/manifest.json:25-31 同上
- expert/technology-foundation/manifest.json 无顶层 tools 数组（实读核实；仅 entryPoints.tools 为 TOOLS.md 路径引用、dependencies.computes 为嵌套依赖，均保留）——本卡对它只做零残留核实
- expert/competitive-strategy/manifest.json 无 tools/computes/edges 字段（D236 出生即极简）——同上只核实
- expert/competitive-strategy/manifest.json 无 tools/computes/edges 字段（D236 出生即极简）
- expert/host/manifest.json 不在写集（本卡只动 5 个问题域 manifest）
- 全仓 grep `"manifest.tools"|\.tools\b` 在 src/l3/expert-dispatcher.ts、src/agent/expert-router.ts、src/orchestrator/subagent-coordinator.ts 零命中 = tools 零消费
- src/agent/expert-router.ts:150 `computes: data.computes || []` = computes 已接线（保留）
- compute-map.yaml 全仓零存在（新建，无冲突）
- 关系: manifest.json=修改（删字段）；compute-map.yaml=新建（§6.9.4 规格）；测试=新建

### c) 决策
已有覆盖→manifest.computes 已是真实 seam（expert-router 消费），复用其值复制进 compute-map.yaml，不重造 compute 注册。tools 字段名无实现、零接线→按铁律 37 删除（dev doc §4.5 决策点 1 已定：删除非改名）。edges 来源=各 manifest.edges 既有 E-xx ID（42 边因果骨架口径，已对齐权威文档15 附录A 速查表 + extensions/ontology/edge-types + edge-consumption-map.json 实读，不凭记忆）。seam 消费接线（expert-dispatcher 读 compute-map）明确 descope 后续卡（dev doc §3.3）。



## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）:

# 决策参考框架（双参考系）

> 2026-08-13 创始人定 | 用途：遇到难决策/多选项/最佳实践选择时，强制走四步参考，并记录所用参考系
> 触发条件：①多选项需取舍 ②设计/架构方案选择 ③优先级排序 ④"最佳实践是什么"类问题 ⑤实现与文档声称冲突时

## 四步框架

```
① 第一性原理（DeepSeek/梁文峰）：这个问题的最简本质是什么？最少机制能解决吗？
② Anthropic 工程基线：隔离/失败即关闭/脚本验证/机器可验契约——哪条适用？
③ 开源实证（DeepSeek）：有可克隆的代码/架构参考吗？clone 下来看实际做法（成本/效率/结构）
④ 收敛检查：两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
```

## 双参考系边界

| 参考系 | 适用 | 不适用 |
|--------|------|--------|
| **Anthropic 工程实践** | agent 隔离、门禁/fail-closed、脚本化验证、机器可验契约、并行协作 | 成本/产品定位/模型选择 |
| **DeepSeek 第一性原理 + 开源实证** | 产品哲学、成本/效率/架构取舍、反内卷、开源参考（clone 仓库） | 工程流程细节（其仓库是模型/推理代码，非 agent 协作） |

## 梁文峰原则摘要（DeepSeek 参考时使用）

- **第一性原理**：不做无意义的炫技，回到问题本质
- **极致成本**：能用最少机制解决就不用多的（这正好支持"worktree 隔离 = 最少机制"而非 N 个门禁）
- **开源开放**：能参考开源实证就不闭门造车
- **反内卷**：机制是为了减少摩擦，不是为了增加流程

## 记录要求（可验证，不靠记忆）

- Codex 决策：在 dev doc / 本会话回复中**明确写"参考：Anthropic/DeepSeek/第一性原理 + 结论"**
- Claude Code 决策：dev doc 要求完成报告含**决策记录**（决策点 + 参考系 + 理由），K3 审计可核

## 已用案例

| 日期 | 决策 | 参考系 | 结论 |
|------|------|--------|------|
| 2026-08-13 | 并行 agent 冲突（串行 vs 并行） | Anthropic（隔离基线）+ DeepSeek（最少机制） | 收敛：worktree 隔离（D307）优先解锁并行 |


## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC：dev doc SYNOVA-IMPL-D663 §6 DS1-DS8 已定义「怎么算做完」。
② 测试：先写 tests/expert/compute-map-consistency.test.ts 跑红（tools 未删 + map 缺失→fail），再实现跑绿（铁律 0-2 spec→test→impl→wire→review→merge）。
③ 实现：删 5 manifest 的 tools 字段 + 建 5 compute-map.yaml，刚好满足 DS1-DS5。
④ 接线：本卡消费接线=一致性测试本身（descope expert-dispatcher 生产接线，dev doc §5 明示"暂无生产消费"）；manifest.computes 既有消费 expert-router.ts:150 不受影响（删的是 tools 非 computes）。
⑤ 验证：自检 6 问 + DS1-DS8 逐条跑命令。

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 37: dead code 入仓库即违规（tools 死字段的删除依据）
  - 铁律 33: 测试命名约定（tests/expert/compute-map-consistency.test.ts 单测）
  - memory/2026-09-10-d662-expert-residual-sweep.md: DS grep 引号锚定防子串自命中；clone junction 两步法
  - memory/2026-09-08-d598-token-meter.md: clone+junction 下 vitest 须 node --preserve-symlinks

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "只删 tools 不删 computes——computes 是真实 seam（expert-router.ts:150 消费）"
    verify: "grep -c 'COMPUTE-BREAK-EVEN-v1' expert/fundamental-efficiency/manifest.json"
  - rule: "compute-map.yaml 的 computes 必须复制 manifest.computes（真实 ID，不造新名）"
    verify: "npx vitest run tests/expert/compute-map-consistency.test.ts"
  - rule: "不改 compute 注册机制（sog-schema-registry）、不动 src/（DS6 范围一致）"
    verify: "git diff --name-only HEAD^ | grep -c '^src/' （预期 0）"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
决策点 1（tools 字段处置）：参考：第一性原理（死数据最少机制=删除）+ 铁律 37 + dev doc §4.5（零消费实测）→ 结论：删除，不改名。
决策点 2（compute-map.yaml 内容）：参考：第六章 §6.9.4 权威规格（computes+edges 两字段）→ 结论：computes 复制 manifest.computes；edges 复制 manifest.edges（同口径 42 边骨架 ID），competitive-strategy 无 edges/computes 声明→空数组如实映射。
决策点 3（edges 权威对齐）：实读 extensions/ontology/edge-types/*.json + edge-consumption-map.json（42 条池-阀边，类型名键）+ 权威文档15 附录A 42边速查表（E-xx ID 键）→ 结论：E-xx ID 口径与 manifest/测试夹具一致，按 manifest.edges 映射；收敛检查=两口径各司其职（ID 层 vs 类型层），无冲突。

### d) 相关 Note 引用
- [ ] memory/notes/proposed/2026-09-10-d663-tools-compute-seam.md（本任务交付后新建）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- expert/fundamental-efficiency/manifest.json（删除死字段 tools 数组——实测仅 3 个 manifest 有顶层 tools；dev doc 写集名义勘误在 §3.2 回填）
- expert/customer-growth/manifest.json（删除死字段 tools 数组）
- expert/organizational-capability/manifest.json（删除死字段 tools 数组）
- expert/technology-foundation/manifest.json（核实零残留——本无顶层 tools 数组，DS1 rg 五文件覆盖，无实际变更）
- expert/competitive-strategy/manifest.json（核实零残留——D236 极简 manifest，无实际变更）
- expert/fundamental-efficiency/compute-map.yaml（新建——computes/edges 自 manifest 全量复制保序）
- expert/customer-growth/compute-map.yaml（新建——同上）
- expert/organizational-capability/compute-map.yaml（新建——同上）
- expert/technology-foundation/compute-map.yaml（新建——同上）
- expert/competitive-strategy/compute-map.yaml（新建——如实空数组映射）
- tests/expert/compute-map-consistency.test.ts（新建一致性测试——5 map 存在 + computes ⊆ manifest.computes + 问题域名 ∈ 新 6 名 + tools 零残留，先 red 后 green）
- docs/plans/codex/implementation/SYNOVA-IMPL-D663-expert-tools-compute-seam-20260910.md（dev doc §3.1 表展开 + §3.2 同 commit 回填实际写集）
- .claude/task-briefs/2026-09-10-D663-tools-compute-seam.md（brief 簿记）

不做什么（排除项）：
- 不做 expert-dispatcher 消费 compute-map 的生产接线（seam 消费属后续卡，dev doc §3.3 明示 descope）
- 不改 src/ 下任何文件（含 src/agent/expert-router.ts、src/l3/expert-dispatcher.ts、sog-schema-registry）
- 不删 manifest.json 的 computes 字段与 edges 字段（真实 seam，保留）
- 不动 expert/host/manifest.json（host 不在本卡 5 个问题域写集）
- 不动 technology-foundation/manifest.json 的 entryPoints.tools 与 dependencies.computes（路径引用与嵌套依赖，非死 tools 数组）
- 不动 expert/_deprecated/ 下任何文件（已归档，不在 DS1 检查范围）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：`npx vitest run tests/expert/compute-map-consistency.test.ts`（CI 与本地同一入口）；实现层入口 = 5 个 manifest.json + 5 个 compute-map.yaml 落库。
处理（中间经过哪些步骤）：测试读 expert/{问题域}/compute-map.yaml 与 manifest.json → 解析 → 断言 computes ⊆ manifest.computes、问题域名 ∈ 新 6 名、tools 零残留。
结果（最终展示在哪）：vitest 全绿输出 + DS1-DS8 命令逐条证据（rg tools 零命中 / ls 5 map 存在 / tsc 基线零新增 / git diff 写集一致）→ PR CI task-relevant jobs 绿。

## 架构层: L3
L3 洞察层（expert/ 文件驱动数据 + tests/expert 一致性测试；零 src/ 改动）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] DS1 verify: rg '"tools"\s*:\s*\[' expert/fundamental-efficiency/manifest.json expert/customer-growth/manifest.json expert/organizational-capability/manifest.json expert/technology-foundation/manifest.json expert/competitive-strategy/manifest.json → 0 命中
- [ ] DS2 verify: ls expert/fundamental-efficiency/compute-map.yaml expert/customer-growth/compute-map.yaml expert/organizational-capability/compute-map.yaml expert/technology-foundation/compute-map.yaml expert/competitive-strategy/compute-map.yaml → 5 个存在
- [ ] DS3 verify: npx vitest run tests/expert/compute-map-consistency.test.ts → 全绿（先 red 已留痕）
- [ ] DS4 verify: npx vitest run tests/expert/ + tsc --noEmit 报错集=基线零新增
- [ ] DS5 verify: rg "as any|as never|as unknown as" tests/expert/compute-map-consistency.test.ts → 0 命中
- [ ] DS6 verify: git diff --name-only HEAD^ → 恰为 §Q2 写集 + brief 簿记，src/ 零改动
- [ ] DS7 verify: grep -n "no-verify" .claude/bypass.log → 0 命中
- [ ] DS8 verify: git push + PR CI task-relevant jobs 绿

## 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D663-expert-tools-compute-seam-20260910.md（唯一契约，§3.1 写集/§6 DS1-DS8）
- docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章-专家架构权威定义与路线图-20260905.md §6.9.4（compute-map.yaml 规格）/§6.7（P1 tools 重对齐）
- docs/synova/research/权威文档15-企业循环溢出导航系统-20260714/SYNOVA-RESEARCH-第一章-循环配置规范与动态加载机制-v1-0-20260714.md 附录A（42 边 ID 速查）
- extensions/ontology/edge-consumption-map.json + extensions/ontology/edge-types/（边类型权威）

## 接口审计
- src/agent/expert-router.ts: loadExpertManifest
- expert/fundamental-efficiency/manifest.json: tools 数组死字段待删
- expert/technology-foundation/manifest.json: entryPoints 为路径引用保留
- expert/competitive-strategy/manifest.json: 无 tools 与 computes 字段

消费点与死代码判据（grep 实测，dev doc §2.1 复核）：expert-router.ts 内 loadExpertManifest 在 L149 消费 edges、L150 消费 computes —— computes 是真实 seam 消费，删 tools 不影响；`manifest.tools|.tools\b` 在 expert-dispatcher、expert-router、subagent-coordinator 三文件零命中 → manifest 的 tools 字段零消费死代码（skill-installer 的 manifest.tools 属 SKILL manifest；registry yaml 的 tools 属 expert-registry.yaml 自有声明层，均不在本卡写集）。
