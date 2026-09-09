<!--
  SYNOVA-IMPL-D651: 专家名引用全量同步（补 D650 缺口 + D282 残留）——确保专家体系完整
  状态: dev doc | 2026-09-09 | 优先级 P1（权威口径对齐，收口）
  权威文档: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章 §6.6/§6.9 + 第七章 §7.4；docs/authority/AUTHORITY-UPGRADE-NOTICE-20260906.md
  借鉴: 无（机械引用同步，非 DSH 借鉴卡）
  依赖: D650（registry 改名，执行中）；本卡是其缺口的收口（改 D650 未覆盖的旧名引用）
  并行: 无（写集含 DSH 线 src/sentinel/runner.ts + electron-renderer/Composer.tsx + tests/sentinel/，跨线引用机械同步，交 DSH 预审）
-->

# SYNOVA-IMPL-D651：专家名引用全量同步（补 D650 缺口 + D282 残留）

> 状态：dev doc | 2026-09-09 | 优先级 P1（权威口径对齐，收口）
> 归属：跨线（Win 为主，含 DSH 线机械引用同步，交 DSH 预审）
> 依赖：D650（registry 改名，执行中）——本卡补 D650 写集外的旧专家名引用

## 1. 权威文档引用

- **第六章 §6.6 术语表**：问题域专家 = `资金效率/客户增长/组织能力/技术底座/竞争战略`；规则「专家名禁含 cycle」。
- **第六章 §6.9.1 迁移**：`capital-cycle→资金效率、customer-cycle→客户增长、talent-cycle→组织能力、tech→技术底座、finance-structure→并入资金效率、competitive-strategy→竞争战略、host→保留`。
- **第七章 §7.4 英文名**：`fundamental-efficiency / customer-growth / organizational-capability / technology-foundation / competitive-strategy`。
- **AUTHORITY-UPGRADE-NOTICE-20260906.md**：专家体系以《专家架构重定义与权威口径审计-20260905》为准。

## 2. 代码审计——现状（file:line，实测）

### 2.1 全量旧专家名引用清单（D650 写集外，本卡收口）

| 文件 | 行 | 旧引用 | 语境 | 归属 |
|---|---|---|---|---|
| `src/sentinel/runner.ts` | :77-89 | `LAYER_EXPERTS`（finance-structure/talent-cycle/tech/competitive-strategy） | 信号维度→专家名路由表 | DSH 线 |
| `src/sentinel/runner.ts` | :97-106 | interface 细化路由（finance-structure/talent-cycle/competitive-strategy） | 同上 | DSH 线 |
| `src/tui-v2/chat.tsx` | :43-52 | `EXPERT_DISPLAY_NAMES`（capital-cycle/customer-cycle/talent-cycle/tech/finance-structure/competitive-strategy） | TUI 专家展示标签 | Win |
| `electron-renderer/src/components/Composer.tsx` | :13-22 | `EXPERT_LIST`（strategy/finance/org/tech/marketing/action/business_model/knowledge） | 桌面端专家下拉 | DSH 线 |
| `tests/sentinel/integration-pipeline.test.ts` | :134-135 | `recommendedExperts` 断言 `'org'`/`'tech'` | 哨兵集成测试 | DSH 线 |
| `src/l3/synova-diagnosis-engine-impl.ts` | :271 | `expert: 'org'`（emit 字段） | 专家假设事件标签 | Win（D650 文件内但 L271 不在其映射范围） |

### 2.2 迁移映射（旧→新，完整两段）

**第一段：cycle 名（D650 改名，本卡补引用）**

| 旧 | 新 | 中文 |
|---|---|---|
| `capital-cycle` | `fundamental-efficiency` | 资金效率 |
| `customer-cycle` | `customer-growth` | 客户增长 |
| `talent-cycle` | `organizational-capability` | 组织能力 |
| `tech` | `technology-foundation` | 技术底座 |
| `finance-structure` | `fundamental-efficiency`（并入） | 资金效率 |
| `competitive-strategy` | `competitive-strategy` | 竞争战略（保留） |

**第二段：旧 8 名（D282 残留，本卡一并收口）**

| 旧 | 新 | 中文 |
|---|---|---|
| `strategy` | `competitive-strategy` | 竞争战略 |
| `finance` | `fundamental-efficiency` | 资金效率 |
| `org` | `organizational-capability` | 组织能力 |
| `tech` | `technology-foundation` | 技术底座 |
| `marketing` | `customer-growth` | 客户增长 |
| `action` | `host` | 主持 |
| `business_model` | `competitive-strategy` | 竞争战略 |
| `knowledge` | `host` | 主持 |

### 2.3 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `rg "capital-cycle|customer-cycle|talent-cycle|finance-structure|competitive-strategy|business_model|'action'|'marketing'|'org'" src/ tests/ electron-renderer/` → 上述 6 文件为 D650 写集外残留（src/cycles/ 为资源循环，保留） |
| 施工图可借鉴清单 | 纯机械引用同步，非 DSH 借鉴卡 |
| 既有层确认 | `getAllExpertIds()`（expert-registry 动态读）是唯一事实源；本卡只改「硬编码旧名引用」，不改 registry 加载逻辑 |
| 结论 | 收口 D650 改名 + D282 残留的旧名引用，确保专家体系无死角 |

## 3. 实现方案

### 3.1 写集 (4 修改 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/sentinel/runner.ts` | 修改 | `LAYER_EXPERTS` 值 + interface 细化路由按 §2.2 映射改名（finance-structure→fundamental-efficiency、talent-cycle→organizational-capability、tech→technology-foundation、competitive-strategy 保留） |
| `src/tui-v2/chat.tsx` | 修改 | `EXPERT_DISPLAY_NAMES` 键改名 + 中文标签对齐权威（fundamental-efficiency=资金效率专家、customer-growth=客户增长专家、organizational-capability=组织能力专家、technology-foundation=技术底座专家、competitive-strategy=竞争战略专家、host=主持人） |
| `electron-renderer/src/components/Composer.tsx` | 修改 | `EXPERT_LIST` 旧 8 → 新 6（host + 5 问题域，按 §2.2 第二段映射 + displayName 对齐权威中文） |
| `src/l3/synova-diagnosis-engine-impl.ts` | 修改 | :271 `expert: 'org'` → `expert: 'organizational-capability'` |
| `tests/sentinel/integration-pipeline.test.ts` | 修改 | :134-135 断言 `'org'`→`'organizational-capability'`、`'tech'`→`'technology-foundation'` |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（Composer EXPERT_LIST 最终 6 条 displayName、中文标签措辞、L271 目标值），必须在此节同 commit 回填最终形态。
> 回填（2026-09-09，实现会话实测，逐项与 §3.1/§2.1 对照）：

| # | 偏离/发现 | 最终形态与理由 |
|---|---|---|
| 1 | **D650 已在本卡开工前合入 main**（PR#454，2026-09-09 11:42Z） | 分支直接基于 origin/main（f3df0284），无堆叠；§3.1 中 `src/tui-v2/chat.tsx` 一行**零改动**（D650 已改新键+新标签，基线 grep 零旧名，DS2 的 4 处命中来自 D650） |
| 2 | **§2.1 遗漏第 7 处：`src/sentinel/signal-aggregator.ts:48-58`** | `SIGNAL_TO_EXPERT` 是测试断言的 `recommendedExperts` **唯一生产者**，含 org/tech 及 D282 前死名 strategic/finance/business_model；不改则 DS4 永无法 red→green。已按 §2.2 映射改名（strategy/risk/revenue/financial 行同步收敛去重）并纳入写集 |
| 3 | **§2.1 遗漏配套测试 `tests/sentinel/sentinel-loader.test.ts` 之外的 `tests/sentinel/signal-aggregator.test.ts:15,45-49`** | 断言 toContain('org'/'strategic'/'finance') → 改 organizational-capability/competitive-strategy/fundamental-efficiency（DS5 tests/sentinel 全绿必需） |
| 4 | integration-pipeline.test.ts 断言实测行号 **:58/:133/:134**（本 doc 写 :134-135） | :58 为 §2.1 遗漏的第三处断言（capability 信号），一并改新名并补 toContain('technology-foundation') |
| 5 | **Composer 六条 displayName 措辞** | host=主持人、fundamental-efficiency=资金效率专家、customer-growth=客户增长专家、organizational-capability=组织能力专家、technology-foundation=技术底座专家、**competitive-strategy=竞争与战略专家**（取 manifest.json v3.0 displayName 原值；§3.1 原拟「竞争战略专家」与 D650 已合入的 manifest/chat.tsx 标签不一致，单一事实源一致性优先） |
| 6 | runner.ts:94 `layer === 'interface' \|\| layer === 'interface'` 冗重复条件 | 顺手去重为单条件（≡ 等价改写，行为零变化，在写集 hunk 内） |
| 7 | **§4 RED grep 裸 `business_model` 模式与 §3.3「不改 L538-553」内在冲突** | impl.ts:547 `business_model: 'competitive-strategy'` 是 D650 交付的维度键→专家名映射（键=维度名非专家 ID），DS3 精确模式（id:/expert:/toContain）零命中为准；本卡未改该行 |
| 8 | tsc 基线实测 **28=28 且错误集逐条恒等**（对照法：f3df0284 detached worktree 全量比对，非仅计数） | DS5 通过 |
| 9 | 🚨 **超出本卡范围的残留发现（移交后续卡，本卡不越界）** | `extensions/sentinels/*/manifest.json` **45/45** 的 `expert` 字段仍为旧名（finance/tech/org/strategy/business_model/marketing/action/knowledge）；`tests/sentinel/sentinel-loader.test.ts:27-31` 按旧名 'finance' 断言（真通过非假绿——≥4 manifest 真有旧值）；`src/init/file-driven-loaders.ts:75` `getSentinelsByExpert('finance')` 接线验证同样旧名。定级：**不在关键路由路径**（生产路由走 runner LAYER_EXPERTS + sentinel config.route，manifest.expert 唯一消费者是 init 接线验证），但属「专家体系不完整」同类残留。§2.1 审计 grep 未扫 extensions/ 是漏口。建议后续卡收口（跨 extensions/ + tests/sentinel/ + src/init/，涉 DSH 线数据文件，需创始人排期） |

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不改 `src/cycles/` + `tests/cycles/` | `cash-cycle/customer-cycle/talent-cycle` 此处是资源循环 cycleId，非专家名 |
| 不改 `expert/` + `expert-registry.yaml` + `src/agent/expert-router.ts` + `task-decomposer.ts` + `synova-diagnosis-engine-impl.ts` L538-553 | D650 已覆盖（本卡只补 D650 写集外引用） |
| 不做 Composer 的 UI 交互重构 | 只换 EXPERT_LIST 数据（旧 8 → 新 6），不改组件结构 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步改测试断言跑红（旧名不再匹配 → fail），第二步改代码跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/sentinel/integration-pipeline.test.ts` | 集成 | ≥1 | recommendedExperts 断言改新名（organizational-capability/technology-foundation） |

RED 必须覆盖失败模式（S-5）：`grep -rn "finance-structure\|talent-cycle\|'org'\|'tech'\|business_model\|'marketing'\|'action'" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts` 修复前非零 → 修复后零残留（'tech' 作为子串须排除 technology/technical 等非专家名语境）。

### 4.5 决策参考（S-12）

- **决策点 1（旧 8 名是否本卡收口）**：参考系 = 第六章 §6.6「专家名禁含 cycle」+ 用户「确保专家体系完整实现」+ D282 残留教训——采纳**本卡一并收口**（否则 D282 的「改名不全」历史错误重演）。
- **决策点 2（跨线引用处理）**：参考系 = TASK-ROUTING「Claude PR → DSH 预审」+ D599 verify-parallel 先例——采纳**Win 机械同步 + 显式披露交 DSH 预审**（非绕过，非静默越界）。
- **决策点 3（Composer 旧 8 → 新 6）**：参考系 = 第六章问题域专家 5 个 + host——采纳 **EXPERT_LIST 收敛为 6 条**（host + 5 问题域）。

## 5. 接线要求（生产调用点，S-3）

| 改名引用 | 调用方/消费点 | 确认方式 |
|---|---|---|
| `LAYER_EXPERTS` 新值 | `src/sentinel/runner.ts` routeExpert → 下游 VALID_EXPERTS 校验 | `grep -rn "fundamental-efficiency\|organizational-capability\|technology-foundation" src/sentinel/runner.ts` 命中 |
| `EXPERT_DISPLAY_NAMES` 新键 | `src/tui-v2/chat.tsx` 展示（getAllExpertIds 动态读 registry） | `grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability" src/tui-v2/chat.tsx` 命中 |
| `EXPERT_LIST` 新 id | `electron-renderer/src/components/Composer.tsx` 下拉 | `grep -rn "fundamental-efficiency\|technology-foundation" electron-renderer/src/components/Composer.tsx` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 旧 cycle 名零残留**：`grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts` 零命中。
- **DS2 新名落地**：`grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx` 命中 ≥6 处。
- **DS3 旧 8 名 + tech 残留精确判**：`grep -rnE "id: '(strategy|finance|org|tech|marketing|action|business_model|knowledge)'|expert: 'org'|toContain\('(org|tech)'\)|'tech'" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts` 零命中（精确 id/字段/token，不用裸 'strategy'/'finance'/'org' 子串，避免误匹配新名 competitive-strategy/fundamental-efficiency/organizational-capability）。
- **DS4 测试 red→green**：`npx vitest run tests/sentinel/integration-pipeline.test.ts` 先 red（旧名不匹配）→ green。
- **DS5 零回归**：`npx vitest run tests/sentinel/ tests/agent/expert-router.test.ts tests/agent/task-decomposer.test.ts` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界（src/cycles/ 零改动）。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] 第六章 §6.6/§6.9 + 第七章 §7.4 英文名迁移表已读（原文引用）
- [ ] 全量 grep 已做，6 处 D650 写集外旧名引用全部列齐（file:line 已列）
- [ ] 资源循环（src/cycles/）已显式排除，不改
- [ ] 旧 8 名（D282 残留）一并收口，不重演「改名不全」历史错误
- [ ] 跨线引用（runner.ts/Composer.tsx/integration-pipeline.test.ts）显式披露交 DSH 预审
- [ ] 'tech' 子串误报已用精确模式规避（DS3）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 旧 cycle 名零残留 | `grep -rn "capital-cycle\|customer-cycle\|talent-cycle\|finance-structure" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts` | 0 命中 |
| 新名落地 | `grep -rn "fundamental-efficiency\|customer-growth\|organizational-capability\|technology-foundation" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx` | ≥6 命中 |
| 旧 8 名 + tech 残留精确判 | `grep -rnE "id: '(strategy|finance|org|tech|marketing|action|business_model|knowledge)'|expert: 'org'|toContain\('(org|tech)'\)" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx src/l3/synova-diagnosis-engine-impl.ts tests/sentinel/integration-pipeline.test.ts` | 0 命中 |
| 测试 red→green 全绿 | `npx vitest run tests/sentinel/integration-pipeline.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/sentinel/runner.ts src/tui-v2/chat.tsx electron-renderer/src/components/Composer.tsx` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
