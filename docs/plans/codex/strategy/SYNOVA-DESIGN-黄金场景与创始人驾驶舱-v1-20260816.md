# SYNOVA-DESIGN — 黄金场景集（GSS）+ 创始人驾驶舱 v1 设计

> **⚠️ 2026-08-16 更新**: 创始人新需求——驾驶舱主视图改为**产品完成度仪表盘**（20 条能力线 × 进度条 × 待办聚合），见 [SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md](SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md)。本设计的 GSS 保留为"验收点证据引擎"，§三驾驶舱规范被取代。

> **版本**: v1.0 | 2026-08-16 | 作者: DeepSeek Harness（Win 会话出设计，Mac 执行）
> **上游提案**: [FOUNDER-OPERATING-MODE.md](../../synova/coordination/FOUNDER-OPERATING-MODE.md)（创始人已批准开工）
> **状态**: 设计定稿，待 Mac Harness 领取执行（认领登记见 §9）
> **对齐**: TASK-ROUTING（基建/架构 → Harness）、MULTI-AGENT-COLLAB D336（红线）、AUDIT-PROTOCOL（K3 材料 +1）、MULTI-MACHINE-PR-WORKFLOW（双机）
> **参考系**: 第一性原理（创始人要"项目真能跑、能看见、能控制"）+ Anthropic（fail-closed、机器可验契约）+ DeepSeek（最少机制：只加一层真值层，不堆脚本）

---

## 〇、设计目标与成功定义

| 目标 | 成功定义 |
|------|---------|
| 完成判定从"提交过"变为"场景跑通" | 8 个黄金场景脚本可复跑，机器断言 exit 0/1，红是红绿是绿 |
| 创始人每天 3 分钟掌握全局 | 驾驶舱一页纸：场景转绿数 / 卡点 / 待裁决项，全部大白话 |
| K3 审计升级为真值复核 | K3 材料 +1（场景证据包），报告 +1 节（场景复核），红线不动 |
| 双机协作不加规则 | 全部沿用 PR 工作流；证据产物只入 git |

---

## 一、总体架构

```
┌──────────────────────────── 真值层（新增，本设计） ────────────────────────────┐
│                                                                              │
│  scripts/golden-scenarios/                                                    │
│  ├─ common/           共享基建: bootstrap / fresh-db / inject / assert        │
│  ├─ GS-01..GS-08/     每个场景: run.sh + fixtures/ + expect.json + README     │
│  ├─ gen-cockpit.py    驾驶舱生成器（输入: evidence + git 事实 + 手动区 yaml）  │
│  └─ evidence/         运行产物（JSON+PNG, git 跟踪）                          │
│        ↓ 产出                                                                 │
│  docs/synova/golden-scenarios/                                                │
│  ├─ cockpit.html            ← 创始人驾驶舱（大白话）                           │
│  ├─ cockpit-state.json      ← 机器状态（驾驶舱数据源）                        │
│  └─ MAPPING.md              ← GS ↔ C线标准 ↔ 权威文档 ↔ D# 映射表             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
         ↑ 触发（Phase 2 接入门禁）              ↑ 消费
  pre-push 关联场景 / CI 周五全量          K3 审计材料 +1 + 创始人每天 3 分钟
```

**设计原则**：
1. 场景脚本 = 纯基建代码（Harness 写，进 K3 审计，无豁免）。
2. 场景断言只认"产品物理输出"（报告内容/表行数/HTTP 响应/exit 码），不认 agent 自述。
3. 全流程跨平台（Win Git Bash + Mac bash 双跑）——沿用 MSYS 路径教训：脚本内只用相对路径。
4. 证据只入 git，不靠"我记得跑过"。
5. **驾驶舱输出（cockpit.html/cockpit-state.json）已被产品完成度仪表盘取代**（见产品完成度仪表盘 v1.4 §五）；本图保留 GSS 作为"验收点证据引擎"的部分，GSS 证据直接供产品进度页消费。

---

## 二、GSS 目录与运行契约（硬规范）

### 2.1 目录结构

```
scripts/golden-scenarios/
├── README.md            # 运行说明 + 红线（谁可跑/证据入 git/禁人工目测）
├── common/
│   ├── bootstrap.ts     # 临时端口起服务（tsx，Windows 兼容）
│   ├── fresh-db.ts      # 建临时库（禁止 cp data/synova.db——铁律 0-4）
│   ├── inject.ts        # 按 fixture 注入（复用 extensions/ontology/field-mappings/）
│   └── assert.ts        # 断言工具（输出 JSON + exit 0/1）
├── GS-01-first-diagnosis/
│   ├── run.sh           # 唯一入口（bash；Win 走 Git Bash，Mac 走系统 bash）
│   ├── fixtures/        # 问卷答案/演示数据（脱敏）
│   ├── expect.json      # 机器可读断言清单
│   └── README.md        # 场景说明 + 对应 C线标准 + 对应 D#
├── GS-02-customer-cycle/   （同构）
├── GS-03-capital-cycle/    （同构）
├── GS-04-talent-cycle/     （同构）
├── GS-05-alert-closure/    （同构）
├── GS-06-evolution-loop/   （同构）
├── GS-07-data-safety/      （同构）
├── GS-08-report-readable/  （同构）
└── evidence/            # 运行产物（git 跟踪；文件名 GS-XX-YYYYMMDD.json/png）
```

### 2.2 run.sh 运行契约（每场景必须满足）

```
1. fresh-db（临时库，测后删除；真实库只读）
2. bootstrap 服务（临时端口；就绪探测 healthz）
3. inject fixture（按场景：crm-standard / erp-standard / hr-standard / 问卷 / 敏感数据）
4. 触发（API 调用 / cron 手动 run / 页面操作——优先 API 级，页面级 Phase 3 补）
5. 断言（逐条执行 expect.json → 结果 JSON）
6. 证据产物写 evidence/GS-XX-<date>.json + 截图（PNG，可选但推荐）
7. exit 0 = 全部断言过；exit 1 = 任一断言失败（失败明细入 JSON）
8. 幂等：重复跑结果一致；中途失败也须清理临时资源
```

### 2.3 断言规范（防"假转绿"——本设计的第一红线）

| 规则 | 说明 |
|------|------|
| 断言 = 产品物理输出 | 如：`报告 JSON 含 "客户集中度过高"`、`sentinel_tickets 表行数 ≥1`、`HTTP 200 + 字段非空` |
| 禁止恒真断言 | `echo true`、无 expect、`|| exit 0` 一律禁止（对齐铁律 48 精神：场景断言不可为空壳） |
| 每条断言 3 行注释 | 写清"这证明产品哪个承诺"（对齐 C线红线：不许把做不到包装成不需要） |
| 断言数量下限 | 每场景 ≥3 条，覆盖：正常路径 + 降级路径（无数据/缺字段）+ 至少 1 条"负向断言"（如：越权必须被拒） |
| 无数据≠无异常 | 断言语义必须区分"真空结果"与"查询失败"（K3 全链路审计 P0-3 教训：禁 fail-open 同态） |

### 2.4 场景 ↔ 标准 ↔ 修复任务映射（MAPPING.md 内容，先定此表）

| ID | 场景 | 数据 | 关键断言（节选） | C线标准 | 依赖修复 |
|----|------|------|----------------|---------|---------|
| GS-01 | 首诊旅程 | 问卷 | 首诊报告产出 ≤3 天路径 + ≥1 盲区命中 | S3-1/R1、S2-3/R3、S0-1 | D232/D233 Electron 一体化、无数据诊断 R2 |
| GS-02 | 客户循环 | crm-standard | Market→Client 收敛 + customer-demand-shift 出 critical | S1-1/S1-4 | D355（类型契约）、D357（CRM 连接器） |
| GS-03 | 资本循环 | erp-standard | manifest 挂载 + cashBalance↔cash 对齐 + 阈值触发 | S1-1/S1-4 | D356（P0-1 一行修）、D355（属性契约+filter bug） |
| GS-04 | 人才循环 | hr-standard | People→Person 收敛 + key-person-risk 产出 | S1-1/S1-4 | D355（类型契约）、D357（HR 连接器） |
| GS-05 | 告警闭环 | 越阈 fixture | sentinel_tickets 有行 + 推送去重键稳定 | S0-3 | D356、D354（N14 去重键） |
| GS-06 | 进化闭环 | 反馈注入 | loop-3/5 真实执行体 + 规则变更可验证 | S5-1/R6 | D333（N13 P0） |
| GS-07 | 数据安全 | 敏感数据 | PII 脱敏 + 越权拒绝 + 本地库不出网 | S3-3 | D338（orgId）、现有 security/ |
| GS-08 | 报告可读 | GS-01 产物 | 一页纸结构 + 移动端渲染 + 10 分钟复述（人测项转 checklist） | S2-1/R5、S0-4 | 报告模板 |

> 转绿顺序建议：GS-03（一行修见效最快，先立信）→ GS-02/GS-04（契约对账）→ GS-05 → GS-01 → GS-06 → GS-07/08。此顺序已含在 D# 排期（§8）。

---

## 三、创始人驾驶舱 v1 规范

### 3.1 数据源与生成

```
gen-cockpit.py 输入:
  1. evidence/ 汇总           → 场景状态（机器事实）
  2. git 事实（D# 状态、PR）   → 开发流四态（复用 gen-task-board.py 思路）
  3. cockpit-override.yaml    → 手动区（待裁决清单；Codex/创始人维护，生成器原样保留）
输出:
  cockpit-state.json          → 机器可读状态（K3 复核对象）
  cockpit.html                → 一页纸驾驶舱
```

### 3.2 状态判定规则（机器可验）

| 状态 | 条件 |
|------|------|
| 🟢 绿 | 最新 evidence exit 0 **且** K3 场景复核通过 |
| 🟡 黄 | 有 evidence 但 K3 未复核，或证据过期 >14 天 |
| 🔴 红 | 最新 evidence exit 1，或从未测 |

### 3.3 页面三块（全大白话，术语映射见 3.4）

```
Synova 驾驶舱 — 今天   场景 2/8 绿   卡点 2 个
① 产品真值（按场景）   每行: 场景名 + 状态 + 一句话卡点 + 证据链接
② 开发流（四态）       待派发 → 进行中 → 待合并 → 待审计（每项挂场景 ID）
③ 需要创始人           裁决项（自带选项+建议+理由，30 秒可裁）/ 待合并 PR（链接）
```

### 3.4 术语映射表（驾驶舱禁用词 → 大白话）

| 内部术语 | 驾驶舱显示 |
|---------|-----------|
| D# / dev doc / DS | 任务编号 / 方案文档 / 验收项 |
| pre-commit 12 组 / 门禁 | 提交检查（已通过/被拦） |
| P0/P1/P2 / K3 审计 | 严重问题 / 建议 / 可选（审计员复核） |
| git hash / branch | 不显示（只给 PR 链接） |
| sentinel / compute / ontology | 监测项 / 计算 / 企业画像 |

---

## 四、与现有体系的集成点

| 集成点 | 内容 | 阶段 |
|--------|------|------|
| dev doc 完成标准 | 三件套：代码提交+门禁绿+关联场景 exit 0（模板改 `task-start.sh` 的 Done 段） | Phase 1 |
| pre-push 门禁 | diff 涉及 `extensions/sentinels/`、`extensions/ontology/field-mappings/`、`src/l4/`、`src/l5/` → 跑关联场景，红则阻断（对齐铁律 0-2 WIRE CHECK 语义扩展：接线验收 = 生产装配路径端到端跑一次） | Phase 2 |
| CI | 周五全量场景回归 workflow（schedule）+ 手动触发 | Phase 2 |
| K3 审计材料 | 7 项 → 7+1：加"场景证据包"（evidence JSON + 重跑命令） | Phase 0 起 |
| 仪表盘登记 | Codex 在 DASHBOARD-CN 登记 D361+ 任务与场景状态 | Phase 0 起 |

---

## 五、K3 审计扩展提案（供 K3 独立定稿——红线：Harness 不编写审计标准）

> 以下仅为"材料与问题清单"，审什么、怎么算过，由 K3 定夺。Harness 只提供线索与证据。

### 5.1 新增审计维度建议（4 项）

| # | 维度 | 审什么 | 对应已知事故模式 |
|---|------|--------|----------------|
| 16 | **场景断言质量** | GSS 每条断言是否可 grep 产品物理输出；有无恒真/空壳断言；负向断言是否存在 | P1-C2 placeholder 假成功 / 铁律 48 空壳测试 |
| 17 | **场景转绿复核** | "GS-XX 转绿"声明 ↔ evidence 文件 ↔ **K3 独立重跑**（T1 干净快照）三对照 | D328 工作区 WIP 污染 / M3 声称不实 |
| 18 | **驾驶舱真值复核** | cockpit-state.json 与 evidence + git 事实一致；驾驶舱绿≠K3 复核红 | D-G2 仪表盘停更 11 天 / CP1 被动记录 |
| 19 | **新门禁 fault injection** | 场景回归接入 pre-push/CI 后：注入故障（破坏场景断言/断库）→ 验证真的拦截 | D328/D329 bypass 空窗 / fail-open |

### 5.2 审计触发与频率建议

- 场景真值复核：**按"场景转绿里程碑"触发**（每 3-5 个场景转绿或每 2 周一次，成本可控 ¥5-20/次），不必每 D# 都审场景。
- 控制塔健康审计触发条件 +1：**场景连续 2 周无新增转绿** 或 **证据与驾驶舱不一致** → 触发。
- 红线重申：GSS 脚本、gen-cockpit.py、驾驶舱生成器均属 Harness 产出 → **进 K3 审计范围，无豁免**。

### 5.3 审计报告格式建议

- 现有模板 + 1 节：**"场景状态复核"**（每场景一行：声明状态 / evidence 核对 / K3 独立重跑结果 / 判定）。
- 结论判定规则：任一场景"声明绿但 K3 重跑红" → 该任务 FAIL（与现有 PASS/CONDITIONAL/FAIL 对齐）。

---

## 六、双机部署与执行交接（Mac 领取清单）

### 6.1 机器分工（不变）

```
Win: Codex(研究/dev doc) + Claude Code(功能实现 D355-D360 等) + Kimi K3(独立审计)
Mac: DeepSeek Harness —— 本设计的全部执行者（GSS 基建/场景脚本/驾驶舱/门禁集成）
```

### 6.2 Mac 开工 30 分钟清单（一次性）

```bash
# 1. clone + 依赖 + hooks（D318 双机身份已支持）
git clone git@github.com:tangbaobao520/SynovaAgent.git
cd SynovaAgent && npm install && npm run hooks:install
# 2. 验证数据备份任务存在（铁律 0-4）
launchctl list | grep synova.backup
# 3. 拉平 + 认领
git fetch --all && git checkout main && git pull --ff-only
# 4. 读三份文档（先对齐再动手，铁律 0）
#    docs/synova/coordination/FOUNDER-OPERATING-MODE.md
#    docs/plans/codex/strategy/SYNOVA-DESIGN-黄金场景与创始人驾驶舱-v1-20260816.md
#    docs/plans/codex/strategy/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md（驾驶舱主视图，本设计 §三 已取代）
# 5. TASK-ROUTING.md 登记: scripts/golden-scenarios/ → 进行中·DeepSeek Harness·日期
```

### 6.3 每阶段交付格式（Mac 收工 5 步）

```bash
# 1. 跑本阶段场景回归（证据入 evidence/）
bash scripts/golden-scenarios/GS-0X/run.sh
# 2. 更新 MAPPING.md + cockpit-state.json（如涉）
# 3. synova-commit（12 组门禁）
# 4. 推分支 + 给创始人 PR 链接（含"场景证据"链接）
# 5. 创始人 Merge 后拉平 + 更新 TASK-ROUTING 状态
```

---

## 七、质量与验收（每阶段 Done 标准）

| 阶段 | Done 标准（可验证） |
|------|--------------------|
| Phase 0（D361-D365） | `grep -rn "echo true\|exit 0" scripts/golden-scenarios/GS-*/run.sh` 零命中（断言非空壳）；三场景（02/03/04）双机（Win Git Bash + Mac）各跑 2 次结果一致；evidence 文件入 git；**产品进度页（产品完成度仪表盘 v1）可打开**（本设计 §三驾驶舱已被其取代） |
| Phase 1（D366） | GS-03 转绿（exit 0）+ evidence 入库 + K3 场景复核通过；GS-02/04 转绿 ≥1；驾驶舱"场景 2/8 → 4/8" |
| Phase 2（D367-D368） | pre-push 关联场景接入并 fault injection 验证拦截；GS-01 首诊旅程转绿；GS-06 进化闭环转绿 |
| Phase 3（D369） | GS-07/08 转绿；MAPPING.md 覆盖 C 线 33 项标准 ≥80%；演示前全量回归绿 |

**门禁红线**：场景脚本违反断言规范（空壳/恒真）→ pre-commit 组 2 精神扩展阻断；违反"证据入 git"→ 阻断。

---

## 八、任务分解（建议 D# 编号，Codex 在仪表盘登记后生效）

| D# | 任务 | 执行者 | 优先级 | 依赖 |
|----|------|--------|:---:|------|
| D361 | GSS 基建：common/ + README + 断言规范 + 断言语义（三态） | Harness (Mac) | P0 | 无 |
| D362 | GS-03 资本循环脚本（含 K3 已给断点：manifest 挂载一行修） | Harness (Mac) | P0 | D361 |
| D363 | GS-02 客户循环脚本 | Harness (Mac) | P0 | D361 |
| D364 | GS-04 人才循环脚本 | Harness (Mac) | P1 | D361 |
| D365 | 驾驶舱 v1：gen-cockpit.py + 模板 + 术语映射 + cockpit-override.yaml | Harness (Mac) | P0 | D361（并行） |
| D366 | 场景驱动修复：D355/D356 按场景转绿验收（契约对账 + manifest + filter bug） | Claude Code (Win) | P0 | D362-364 |
| D367 | 场景回归接入 pre-push + CI 周五全量 | Harness (Mac) | P1 | D366 |
| D368 | GS-01 首诊旅程 + GS-06 进化闭环（配合 D333/D232） | Harness + Claude | P0 | D333、Electron 一体化 |
| D369 | GS-07/08 + MAPPING.md 全量 + C 线挂钩 + 演示清单 | Harness (Mac) | P1 | D368 |

> 注：D# 为建议编号，最终以 Codex 在 DASHBOARD-CN 登记为准（防重号，对齐 DS 对账机制 S-10）。
> 注 2：**D365 驾驶舱生成器已并入产品完成度仪表盘设计**（`gen-progress-page.py`，见产品完成度仪表盘 v1.4 §五）——本表保留原编号供追溯；GSS 场景脚本（D361-D364）与 K3 审计材料（7+1）不受影响。

---

## 九、风险与对策

| 风险 | 对策 |
|------|------|
| 场景脚本变"假绿"（空壳断言） | 断言规范硬红线 + K3 审计维度 16 + pre-commit 扫描 echo true |
| 双机证据不一致 | 证据只入 git；跨平台契约（相对路径）；每场景双机各跑 2 次再标绿 |
| 驾驶舱再失真（D-G2 重演） | cockpit-state.json 机器生成 + K3 维度 18 + 证据过期 14 天自动转黄 |
| 场景回归成本失控 | 全量每周五 1 次 + 关联场景随 PR 增量跑；场景脚本只写"能断言的最小路径"（DeepSeek 最少机制） |
| 与现有门禁冲突（误阻断） | Phase 2 接入前先 dry-run 一周（只报告不阻断），无噪音再转硬阻断 |
| GSS 与 D# 脱节 | 每 D# 在 MAPPING.md 标注服务的 GS；驾驶舱开发流每项挂场景 ID |

---

*设计完。Mac Harness 按 §6.2 领取执行；K3 审计扩展按 §五由 K3 独立定稿；D# 编号按 §八由 Codex 登记。*
