<!--
  SYNOVA-IMPL-D662: 专家名残留全量收口（② analytical-lens 测试债 + ③ skills 域 + ④ _extinct 死代码）
  状态: dev doc | 2026-09-10 | 优先级 P1（权威口径对齐，末梢残留）
  权威文档: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章 §6.6/§6.9 + 第七章 §7.4；docs/authority/AUTHORITY-UPGRADE-NOTICE-20260906.md
  借鉴: 无（机械改名）
  依赖: D650（registry）+ D651（引用）+ D658（哨兵 manifest）已合并；本卡是末梢残留
  并行: 无（写集 tests/expert + tests/skill + extensions/skills/builtin + extensions/sentinels/_extinct；与在途零交集）
-->

# SYNOVA-IMPL-D662：专家名残留全量收口（analytical-lens + skills + _extinct）

> 状态：dev doc | 2026-09-10 | 优先级 P1
> 归属：Win 线（tests/ + extensions/）
> 依赖：D650/D651/D658 已合并，本卡收末梢残留

## 1. 权威文档引用

- **第六章 §6.6 术语表**：问题域专家 = `资金效率/客户增长/组织能力/技术底座/竞争战略`；专家名禁含 cycle。
- **第七章 §7.4 英文名**：`fundamental-efficiency / customer-growth / organizational-capability / technology-foundation / competitive-strategy`。
- **AUTHORITY-UPGRADE-NOTICE-20260906.md**：专家体系以 2026-09-05 研究为准。

## 2. 代码审计——现状（file:line，实测）

### 2.1 迁移映射（旧 8 → 新 5+host，复用 D651 §2.2）

| 旧 | 新 | 中文 |
|---|---|---|
| `finance` | `fundamental-efficiency` | 资金效率 |
| `strategy` | `competitive-strategy` | 竞争战略 |
| `org` | `organizational-capability` | 组织能力 |
| `tech` | `technology-foundation` | 技术底座 |
| `marketing` | `customer-growth` | 客户增长 |
| `action` | `host` | 主持 |
| `business_model` | `competitive-strategy` | 竞争战略 |
| `knowledge` | `host` | 主持 |
| `host` / `multi` | 保留 | 主持 / 跨专家技能 |

### 2.2 三处残留（grep 实测）

- **② `tests/expert/analytical-lens.test.ts:15`**：`EXPERTS = ['finance','strategy','org','marketing','technology-foundation','action','business_model','knowledge','host']`——7 个旧 8 名 + technology-foundation/host（7 例红：`expert/{旧名}/IDENTITY.md` 不存在）。
- **③ `tests/skill/d66-manifests.test.ts:23`**：`VALID_EXPERTS = ['finance','strategy','org','marketing','tech','action','business_model','knowledge','host','multi']`——旧 8 名 + host/multi。
- **③ `extensions/skills/builtin/*/manifest.json`（41 个）**：`expert` 字段旧值分布 host 9 / finance 8 / marketing 5 / knowledge 4 / org 4 / strategy 4 / action 3 / multi 2 / business_model 1 / tech 1。
- **④ `extensions/sentinels/_extinct/*/manifest.json`（12 个）**：`expert` 字段旧 8 名（死代码，sentinel-loader 只扫 `extensions/sentinels/{name}/` 一层，`_extinct/` 不加载，CI tsc 白名单也排除 `_extinct/`）。

### 2.3 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | 三处残留即上文 ②③④，主路由链已由 D650/D651/D658 清空 |
| 施工图可借鉴清单 | 机械改名，非借鉴卡 |
| 既有层确认 | 无重复机制 |
| 结论 | 末梢残留收口，一处迁移表套三处 |

## 3. 实现方案

### 3.1 写集 (2 测试 + 41 skills manifest + 12 _extinct manifest)
| 文件 | 操作 | 说明 |
|---|---|---|
| `tests/expert/analytical-lens.test.ts` | 修改 | `EXPERTS` → 新 6 名（host + fundamental-efficiency + customer-growth + organizational-capability + technology-foundation + competitive-strategy） |
| `tests/skill/d66-manifests.test.ts` | 修改 | `VALID_EXPERTS` → 新 5+host+multi（fundamental-efficiency/competitive-strategy/organizational-capability/technology-foundation/customer-growth/host/multi） |
| `extensions/skills/builtin/*/manifest.json` ×41 | 修改 | `expert` 字段旧 8 → 新（host/multi 保留） |
| `extensions/sentinels/_extinct/*/manifest.json` ×12 | 修改 | `expert` 字段旧 8 → 新（机械一致性，死代码不加载） |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（skills `expert` 字段确数、multi 语义、_extinct 处理），必须在此节同 commit 回填最终形态。

**2026-09-10 交付回填（Win 线，clone @ 478dae53）：**

- **迁移确数**：builtin 41 = 迁移 30 + host 保留 9 + multi 保留 2；_extinct 12 全迁（归档目录未删）。终局分布——builtin：fundamental-efficiency 8 / customer-growth 5 / organizational-capability 4 / competitive-strategy 5 / technology-foundation 1 / host 16（原 9 + action 3 + knowledge 4）/ multi 2；_extinct：fundamental-efficiency 5 / competitive-strategy 5 / organizational-capability 1 / technology-foundation 1。
- **DS2 确数偏离**：DS2「builtin ≥35」不可满足——action(3)+knowledge(4) 映射 host，不在五新域名模式内，builtin 新 5 名实为 **23** 命中；加 _extinct 12 = **35**，即 ≥35 的真实口径为 builtin+_extinct 合计。DS2/§8 对应行的证据命令已按 23+12 执行通过。
- **DS1 第二条命令字面自命中**：`EXPERTS = \[.*(finance|strategy|org|...)` 未锚定引号/词界，而新名 `organizational-capability` 含子串 `org`、`competitive-strategy` 含子串 `strategy`——该命令对任何正确实现恒报 1 命中。意图口径（引号锚定 `'finance'…'knowledge'` 精确值）实测 **0** 残留；DS1 第一条（JSON `"expert": "old"` 模式）实测 **0** 残留。
- **DS4 基线漂移**：`tsc --noEmit` 在分支点 478dae53 实测 **33** 条（doc 写 28 为写卡时点前的旧基线）；基线 worktree 全量对照错误集 **IDENTICAL_ZERO_DELTA**（33=33 逐条恒等，零新增，且错误均不在本卡写集——25 条位于 _extinct `aggregate.ts`，本卡未触碰）。
- **d66 fixture 默认值**：`writeManifest` 默认 `expert` 由旧名改为 `host`（同文件 expert 字段值迁移，防测试 fixture 残留旧名误触 VALID 校验）。
- **analytical-lens RED 佐证**：旧 EXPERTS 含 7 个旧名，`expert/` 目录实测仅存在新 5+host 的 IDENTITY.md（旧 7 名目录不存在）→ 修复前 7 failed 成立；新 6 名 IDENTITY.md 全部存在。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不删 `_extinct/` 目录 | 是退役哨兵归档（CI 白名单排除），非「应删死代码」；本卡只改字段名保持一致 |
| 不改 skill-loader / skill manifest schema | skills 域自洽，本卡只改 `expert` 字段值 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步改测试断言跑红（旧名不再匹配 → fail），第二步改 manifest 跑绿。每用例 ≥3 expect。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/expert/analytical-lens.test.ts` | 单测 | ≥1 | 新 6 名 IDENTITY.md 全部存在（旧 7 名移除后不红） |
| `tests/skill/d66-manifests.test.ts` | 单测 | ≥1 | skills manifest `expert` 字段 ∈ VALID_EXPERTS（新 5+host+multi） |

RED 必须覆盖失败模式（S-5）：analytical-lens 旧 7 名 `IDENTITY.md` 不存在（修复前 7 failed）；skills manifest 旧 8 名不在新 VALID_EXPERTS（修复前失败）。

### 4.5 决策参考（S-12）

- **决策点 1（skills `expert` 是否改名）**：参考系 = 第六章「专家名禁 cycle」+「专家体系完整」——采纳**对齐改名**（skills 是专家能力载体，`expert` 标签应指向新问题域名）。
- **决策点 2（_extinct 处置）**：参考系 = 铁律 37 + `_deprecated/` 归档先例——采纳**只改字段名不删目录**（归档保留，一致性收口）。

## 5. 接线要求

| 改名字段 | 消费方 | 确认方式 |
|---|---|---|
| skills `expert` 字段 | `src/skill/skill-loader.ts`（读 manifest） | `grep -n "expert" src/skill/skill-loader.ts` 命中 |
| analytical-lens `EXPERTS` | 测试自用 | 改名后 vitest 绿 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 三处旧 8 名零残留**：`rg '"expert": "(finance|strategy|org|tech|marketing|action|business_model|knowledge)"' extensions/skills/builtin extensions/sentinels/_extinct tests/skill/d66-manifests.test.ts` 零命中；`rg "EXPERTS = \[.*(finance|strategy|org|marketing|action|business_model|knowledge)" tests/expert/analytical-lens.test.ts` 零命中。
- **DS2 新名落地**：`rg '"expert": "(fundamental-efficiency|competitive-strategy|organizational-capability|technology-foundation|customer-growth)"' extensions/skills/builtin` 命中 ≥35。
- **DS3 测试 red→green**：`npx vitest run tests/expert/analytical-lens.test.ts tests/skill/d66-manifests.test.ts` 先 red → green。
- **DS4 零回归**：`npx vitest run tests/expert/ tests/skill/` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增）。
- **DS5 类型安全**：测试为 ts，`rg "as any\|as never\|as unknown as" tests/expert/analytical-lens.test.ts tests/skill/d66-manifests.test.ts` 零命中（新增行）。
- **DS6 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界（src/ 零改动）。
- **DS7 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
- **DS8 推送+CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿。

## 7. 自检清单

- [ ] 三处残留（②③④）grep 实证（file:line 已列）
- [ ] 迁移映射复用 D651 §2.2（host/multi 保留）
- [ ] _extinct 只改字段名不删目录（归档保留）
- [ ] skills 域自洽不破坏（只改 expert 字段值）
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 三处旧 8 名零残留 | `rg '"expert": "(finance|strategy|org|tech|marketing|action|business_model|knowledge)"' extensions/skills/builtin extensions/sentinels/_extinct tests/skill/d66-manifests.test.ts` | 0 命中 |
| 新名落地 | `rg '"expert": "(fundamental-efficiency|competitive-strategy|organizational-capability|technology-foundation|customer-growth)"' extensions/skills/builtin` | ≥35 命中 |
| 测试 red→green | `npx vitest run tests/expert/analytical-lens.test.ts tests/skill/d66-manifests.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线 |
| as any=0 | `rg "as any" tests/expert/analytical-lens.test.ts tests/skill/d66-manifests.test.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后）+ CI 绿 |
