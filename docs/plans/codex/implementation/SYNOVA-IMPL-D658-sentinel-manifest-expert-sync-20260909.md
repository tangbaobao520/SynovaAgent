<!--
  SYNOVA-IMPL-D658: 哨兵 manifest expert 字段同步（旧 8 → 新 5+host）——专家体系末段残留收口
  状态: dev doc | 2026-09-09 | 优先级 P1（权威口径对齐，末段残留）
  权威文档: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章 §6.6/§6.9 + 第七章 §7.4；docs/authority/AUTHORITY-UPGRADE-NOTICE-20260906.md
  借鉴: 无（机械改名，非 DSH 借鉴卡）
  依赖: D650（registry 改名）+ D651（引用同步）已合并；本卡是末段残留收口
  并行: 无（写集 extensions/sentinels/*/manifest.json 45 文件；与在途任务零交集；extensions/ 属 Win 线，但哨兵体系属 DSH，跨线机械同步交 DSH 预审）
-->

# SYNOVA-IMPL-D658：哨兵 manifest expert 字段同步（旧 8 → 新 5+host）

> 状态：dev doc | 2026-09-09 | 优先级 P1（权威口径对齐，末段残留）
> 归属：Win（extensions/ 属 Claude 线）+ 跨线机械同步（哨兵体系 DSH 线，交 DSH 预审）
> 依赖：D650/D651 已合并（registry v3.0 + 主路由链已对齐新问题域名）

## 1. 权威文档引用

- **第六章 §6.6 术语表**：问题域专家 = `资金效率/客户增长/组织能力/技术底座/竞争战略`；规则「专家名禁含 cycle」。
- **第七章 §7.4 英文名**：`fundamental-efficiency / customer-growth / organizational-capability / technology-foundation / competitive-strategy`。
- **AUTHORITY-UPGRADE-NOTICE-20260906.md**：专家体系以《专家架构重定义与权威口径审计-20260905》为准。

## 2. 代码审计——现状（file:line，实测）

### 2.1 迁移映射（旧 8 → 新 5+host，D651 §2.2 复用）

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

### 2.2 现状（grep 实测）

- **45 个 per-sentinel manifest**（`extensions/sentinels/{name}/manifest.json`，不含顶层 `extensions/sentinels/manifest.json`）含 `"expert"` 字段，全部用旧 8 名。
- `"expert"` 字段旧值分布：strategy 16 / org 14 / finance 11 / tech 9 / business_model 5 / marketing 2。
- `"auxiliaryExperts"` 字段旧值分布：strategy 26 / knowledge 13 / marketing 7 / finance 6 / org 3 / tech 2。
- 样例（`agent-deployment-maturity/manifest.json`）：`"expert": "tech"` + `"auxiliaryExperts": ["org"]` + `"layer": "technology"`（layer 是信号维度，非专家名，**不改**）。
- 顶层 `extensions/sentinels/manifest.json` 的 `sentinels` 分组字段（finance/org/strategy/marketing…）是**哨兵分类名**，非专家名，**不改**；其 `model.tiers.expert` 是文档字符串，**不改**。

### 2.3 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `rg '"expert"|"auxiliaryExperts"' extensions/sentinels/*/manifest.json` → 45 文件旧 8 名；D650/D651 已清空 src/ 主路由链，此处是末段残留 |
| 施工图可借鉴清单 | 纯机械改名，非借鉴卡 |
| 既有层确认 | `src/sentinel/sentinel-loader.ts` 加载 manifest 的 expert 字段做 init 接线验证（唯一消费者）；本卡只改名，不改 loader |
| 结论 | 收口专家体系末段残留，机械对齐 D650/D651 迁移表 |

## 3. 实现方案

### 3.1 写集 (45 修改 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `extensions/sentinels/{name}/manifest.json` ×45 | 修改 | `expert`/`auxiliaryExperts` 字段按 §2.1 映射改名（strategy→competitive-strategy、finance→fundamental-efficiency、org→organizational-capability、tech→technology-foundation、marketing→customer-growth、business_model→competitive-strategy、knowledge/action→host） |
| `tests/expert/manifest-consistency.test.ts` | 修改 | 若该测试扫描 expert 字段，同步新名断言；否则新增 manifest expert 字段一致性断言 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（45 个文件精确清单、测试落点、有无 `expert` 缺省但有 auxiliaryExperts 的文件），必须在此节同 commit 回填最终形态。

> **D658 实测回填（2026-09-09/10 交付，Win clone @origin/main 5494e6f6）：**
> 1. **写集偏差 +1**：`tests/sentinel/sentinel-loader.test.ts` 新增——其 `按专家筛选返回 finance 哨兵` 用例（:27-30）断言 `getSentinelsByExpert('finance')` 且 `manifest.expert === 'finance'`，本卡改名后必然失效；§6 DS5 要求 `tests/sentinel/` 全绿，故随映射同步为 `fundamental-efficiency`（与 manifest 改名后的真实分布一致：6 哨兵 ≥ 原断言阈值 4）。§3.1 写集遗漏，本节回填（D651 §3.2 先例）。
> 2. **分布计数口径修正（§2.2）**：`"expert"` 字段实测分布 org 13 / strategy 11 / tech 8 / finance 6 / business_model 5 / marketing 2 = 45（§2.2 的 16/14/11/9 为字段行窗口口径，非字段值口径）；`"auxiliaryExperts"` 数组项 JSON 项级实测 49 项，全部按 §2.1 映射改新名（§2.2 的 strategy 26/knowledge 13… 为 grep -A3 窗口口径含子串误报）。
> 3. **测试落点（§3.1 第 2 行落定）**：`tests/expert/manifest-consistency.test.ts` 原本只扫 `expert/` 六位专家清单（D567/D650 适配后形态），未扫哨兵 manifest → 按 §4 新增 `D658: 哨兵 manifest expert 字段一致性` describe 块（3 用例：可枚举防缩水 / expert ∈ registry v3.0 零旧 8 名 / auxiliaryExperts ∈ registry v3.0 零旧 8 名），合法值集合复用 `getAllExpertIds()` 同源。
> 4. **DS5 口径**：tsc 基线为**环境相关绝对值**（clone 环境实测 33 条 = TS2307×24 + TS7006×6 + TS2345×3；本 doc 记 28 为主工作区口径）——判据按"零新增逐条 diff"执行：revert→run→restore 实证 33=33 IDENTICAL_ZERO_DELTA。vitest FAIL 集与基线恒等：唯一既有红 = `tests/expert/analytical-lens.test.ts` 7 例（断言旧 8 名 IDENTITY.md 存在，D650 改名 expert/ 目录后基线即红，属 D650 期既有测试债，本卡写集外不修，转台账）。
> 5. **观察登记（本卡不修）**：`tests/skill/d66-manifests.test.ts:23` 本地 `VALID_EXPERTS` 含旧 8 名 + skills 内置 manifest `expert` 字段旧名——skills 域自洽闭环（manifest 值 ⊆ 本地枚举），不受本卡影响，属专家体系另一处残留，另卡收口。
> 6. **DS8 CI job 级基线对照（2026-09-10 补记）**：PR#468 run 34376372668 中 Architecture Check + Control Tower Gate Tests (ubuntu/windows) 三 job 红——**main 基线既有，非本卡引入**：main @5494e6f6（本卡 base，#463 push）run 34368678861、@0c6e52b2 run 34376561252、@30011654 run 34377559486 同三红（job 级对照，D651 豁免先例）；失败用例属 `scripts/control-tower` 域（ct-test-gate「有配对且绿应 exit 0 实际 1」+ alloc-task-id + simulate-ci 内层连带），本卡写集外且开发者不改控制塔门禁（铁律 0-5），本地同测试 PASS（alloc-task-id 15/15、ct-test-gate 6/6）→ CI 环境日期敏感问题转台账 CTO 派工。本卡 task-relevant jobs 全绿：Vitest 1/2+2/2、TypeScript+Lint+Iron Laws、Integration Contract、Golden Case F1、Checker Review、Test-Kit Architecture×2、npm audit。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不改 manifest 的 `layer` 字段 | `layer` 是信号维度（technology/capital/alignment…），非专家名 |
| 不改顶层 `extensions/sentinels/manifest.json` 的 `sentinels` 分组 + `model.tiers` | 分类名 + 文档字符串，非专家名 |
| 不改 `src/sentinel/sentinel-loader.ts` | DSH 线；本卡只改 manifest 数据文件，不改 loader 逻辑 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（manifest expert 字段仍旧名 → 断言失败），第二步改 manifest 跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/expert/manifest-consistency.test.ts` | 单测 | ≥2 | 45 个 manifest 的 `expert`/`auxiliaryExperts` 字段值 ∈ {host, fundamental-efficiency, customer-growth, organizational-capability, technology-foundation, competitive-strategy}，且零旧 8 名 |

RED 必须覆盖失败模式（S-5）：`rg '"expert": "(strategy|org|finance|tech|marketing|business_model|action|knowledge)"' extensions/sentinels/*/manifest.json` 修复前非零 → 修复后零命中。

### 4.5 决策参考（S-12）

- **决策点 1（旧 8 → 新 5+host 的语义映射）**：参考系 = D651 §2.2 迁移表 + 第六章问题域专家 5 个 + host——采纳**逐值机械映射**，不重推（strategy/business_model→competitive-strategy，finance→fundamental-efficiency，org→organizational-capability，tech→technology-foundation，marketing→customer-growth，action/knowledge→host）。
- **决策点 2（auxiliaryExperts 是否保留语义）**：参考系 = 第六章 host 唯一主 agent 统筹、按需激活——采纳**机械改名保留数组结构**（旧 aux 名→新名，不改数组长度/语义）。

## 5. 接线要求（生产调用点，S-3）

| 改名字段 | 消费方 | 确认方式 |
|---|---|---|
| manifest `expert`/`auxiliaryExperts` | `src/sentinel/sentinel-loader.ts`（init 接线验证） | `grep -rn "expert\|auxiliaryExperts" src/sentinel/sentinel-loader.ts` 命中消费点；改名后经 registry v3.0 校验不再指向失效专家名 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 旧 8 名零残留**：`rg '"expert": "(strategy|org|finance|tech|marketing|business_model|action|knowledge)"' extensions/sentinels/*/manifest.json` 零命中。
- **DS2 新名落地**：`rg '"expert": "(fundamental-efficiency|customer-growth|organizational-capability|technology-foundation|competitive-strategy|host)"' extensions/sentinels/*/manifest.json` 命中 ≥40 处。
- **DS3 auxiliaryExperts 同步**：`rg '"auxiliaryExperts"' extensions/sentinels/*/manifest.json | rg 'strategy|org|finance|tech|marketing|business_model|action|knowledge'` 零命中。
- **DS4 测试 red→green**：`npx vitest run tests/expert/manifest-consistency.test.ts` 先 red（旧名断言失败）→ green。
- **DS5 零回归**：`npx vitest run tests/expert/ tests/sentinel/` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`rg "as any\|as never\|as unknown as" tests/expert/manifest-consistency.test.ts` 零命中（manifest 是 json 非 ts，无类型逃逸）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 45 manifest + 1 测试 + spec/brief 簿记，无越界（src/sentinel/、src/cycles/ 零改动）。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] 第六章 §6.6/§6.9 + 第七章 §7.4 英文名迁移表已读（原文引用）
- [ ] 45 个 per-sentinel manifest 现状 grep 实证（file 清单 + 旧值分布）
- [ ] 顶层 manifest 的 `sentinels` 分组 + `model.tiers` + 各 manifest `layer` 字段已显式排除（不改）
- [ ] 旧 8 → 新 5+host 映射逐值对齐 D651 §2.2
- [ ] 跨线披露（哨兵体系 DSH，机械同步交 DSH 预审）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 旧 8 名零残留 | `rg '"expert": "(strategy|org|finance|tech|marketing|business_model|action|knowledge)"' extensions/sentinels/*/manifest.json` | 0 命中 |
| 新名落地 | `rg '"expert": "(fundamental-efficiency|customer-growth|organizational-capability|technology-foundation|competitive-strategy|host)"' extensions/sentinels/*/manifest.json` | ≥40 命中 |
| auxiliaryExperts 同步 | `rg '"auxiliaryExperts"' extensions/sentinels/*/manifest.json | rg 'strategy|org|finance|tech|marketing|business_model|action|knowledge'` | 0 命中 |
| 测试 red→green 全绿 | `npx vitest run tests/expert/manifest-consistency.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
