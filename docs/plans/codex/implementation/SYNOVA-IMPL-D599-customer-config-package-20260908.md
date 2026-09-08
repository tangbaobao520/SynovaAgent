<!--
  SYNOVA-IMPL-D599: 客户配置包机制蓝本（DSH 借鉴卡 B-09 + B-10）
  状态: dev doc | 2026-09-08 | 优先级 P1（多客户扩展命门）
  权威文档: docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §B-09/§B-10/§7；docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md §5.4
  借鉴: DSH agent-presets + settings/settings-file（读源码自研，零代码依赖，G1/G4）——packages/preset/agent-presets/src/{discovery,mount,authoring,metadata}.ts + packages/settings/{settings,settings-file}/src/index.ts
  依赖: 无（复用 D588 会话投影/B-08 原子写理念，均为已交付或同级借鉴，非前置阻塞）
  并行: 无（写集 src/config/ 新建 + src/routes/diagnosis.ts 修改；与在途 B 组其余卡/S1-5 零交集）
-->

# SYNOVA-IMPL-D599：客户配置包机制蓝本（DSH 借鉴卡 B-09 + B-10）

> 状态：dev doc | 2026-09-08 | 优先级 P1（多客户扩展命门）
> 归属：Claude 线（src/config/ 新建 + src/routes/diagnosis.ts）
> 借鉴：DSH agent-presets + settings（读源码自研，零代码依赖，G1/G4）
> 借鉴锚点（真实源码 0.1.1-rc.2）：`D:\deepseek-harness\packages\preset\agent-presets\src\{discovery.ts, mount.ts, authoring.ts, metadata.ts}` + `D:\deepseek-harness\packages\settings\{settings,settings-file}\src\index.ts`

## 1. 权威文档引用

- **DSH 借鉴指引 v2 §B-09（preset=目录 + leakedServices 泄漏审计）**：`agent.cordis.yml` 组合文件 + `preset.yml` 元数据 + `mountPreset` + `leakedServices`（行发布进程级 service → 拒绝挂载）。Synova 落点 = **CFG 客户配置包机制蓝本（scope layering）+ 诊断/导航模式映射**；产品缺口 = 插件化扩展 0%。
- **DSH 借鉴指引 v2 §B-10（配置三层 + 可 dump）**：`mergeLayers`（对象递归/数组整值替换）、namespace 注册制、`patchNode` 注释保留叶子级 patch、CLI `--dump-config` 逐层带来源。Synova 落点 = **CFG 四层叠加实现蓝本 + 支持诊断第一命令**；产品缺口 = 权限治理 0%。
- **施工图 §5.4 客户配置包详解（多客户时代命门机制）**：四层叠加 `Layer0 全局默认 → Layer1 行业 → Layer2 客户 → Layer3 工作区`，引擎不变，每客户一份「调校单」；借鉴 DSH profile/bundle「有序层级、上层覆盖下层、`--dump-config` 可检查实际生效配置」三件套。
- **施工图 §5.2 矩阵缺口 #9/#10/#16**：租户级配置分层 / 哨兵阈值基线参数 / 凭证管理——三者均为「客户配置包」缺口，本卡只交付机制蓝本，不消费阈值/专家集/凭证（见 §3.3 不做的事）。
- **铁律 47/48**（契约优先 + 测试非空壳）；**铁律 24/31**（降级 log.warn + degraded）；**铁律 32**（.code+.phase+.retryable）。

## 2. 代码审计——现状（file:line，实测）

### 2.1 DSH 范式（已读源码）

- **B-09 agent-presets**：`discovery.ts`——`COMPOSITION_FILE='agent.cordis.yml'`、`scanRoot`/`discoverPresets`（roots 按优先级 first-root-wins；broken 预设「缺失/不可加载」上报 roster 而非静默跳过）；`mount.ts`——`mountPreset` 两道守卫（`inactiveRows` 未激活行拒绝 + `leakedServices` 发布 root realm 进程级 service 拒绝）；`authoring.ts`——`writableRoot`=首个 `trust:'user'` root，copy 从不覆盖；`metadata.ts`——`METADATA_FILE='preset.yml'`，display text only，坏元数据不阻断挂载。
- **B-10 settings**：`settings/src/index.ts`——`mergeLayers`（plain object 递归合并、数组/标量整值替换、`undefined` 稀疏 patch 不删下层键）、`settingsNamespace`（`/^[a-z][a-z0-9-]*$/` kebab-case）、解析序 `schema defaults → base → user`、`SettingsDescriptor`（`{value, base, user}` 逐层来源）、`SettingsConflictError`（revision 乐观并发）；`settings-file/src/index.ts`——`patchNode`（注释保留叶子级 diff）、`writeFileAtomic`+`withFileLock`（跨进程写锁，B-08）、chokidar 热重载。

### 2.2 Synova 现状（缺陷，grep 实测）

- **缺陷 A（无「客户配置包」概念）**：`grep -rn "mergeLayers\|config-layer\|dump-config\|dumpConfig\|customer-config\|客户配置包" src/ packages/` 零命中——「同一套核心如何为不同客户加载不同配置」完全缺失，阈值/边权重/启用专家集/提示词/报告样式全是全局一套。
- **缺陷 B（租户雏形但无配置分层）**：`src/middleware/auth.ts:28` 有 `orgId`（租户 ID），`src/middleware/rbac.ts` 有五角色 + `canAccessWorkspace`/`canModifyWorkspace`（D239/D242），但均为**权限/身份**，不是**配置分层**；`src/l4/data-purger.ts` 按 `tenantId` 隔离数据，也无配置分层。
- **缺陷 C（文件驱动单层）**：`expert/expert-registry.yaml`（`src/l3/expert-registry.ts` 读取）是唯一事实源但**单层全局**；`src/services/config-recovery.ts`/`src/config-file.ts`/`src/services/llm-credential-store.ts` 均为单文件配置，无四层叠加、无 dump-config 逐层来源。

### 2.3 无重复造轮子审计（S-14，DSH 迁移排查）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep 现有实现 | `grep -rn "mergeLayers\|dumpConfig\|customer-config\|config-layer" src/ packages/ synova_worker/` → 零命中 |
| 施工图可借鉴清单对照 | 本卡正属 B-09/B-10 借鉴卡；借鉴理念（mergeLayers 递归/数组整值替换 + preset=目录 discovery + leak 审计 + dump 逐层来源）自研，不引 `@deepseek-ai` |
| 既有层确认 | `rbac.ts`=权限角色、`auth.ts`=身份 orgId、`expert-registry.yaml`=单层全局、`config-recovery.ts`=单文件恢复——**均非四层叠加/客户配置包，本卡不重写，只新增机制层** |
| 结论 | 新建 `src/config/` 机制蓝本（config-layers + customer-config-package），打通 orgId→四层叠加→dump 来源，不消费阈值/专家集/凭证（S1-6 后续） |

## 3. 实现方案

### 3.1 写集 (1 修改 + 2 新建 + 2 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/config/config-layers.ts` | 新建 | B-10 核心：`mergeLayers`（对象递归/数组整值替换/undefined 稀疏）+ `deepEqualJson` + `configNamespace`（kebab-case 校验）+ `resolveLayers`（default→industry→customer→workspace 有序覆盖）+ `dumpLayers`（逐层带来源 provenance） |
| `src/config/customer-config-package.ts` | 新建 | B-09 核心：`discoverCustomerConfigPackages`（first-root-wins + broken 上报不跳过）+ `mountCustomerConfig`（per-org 解析，无全局泄漏）+ `leakedGlobalConfig`（审计：行发布进程级全局 service/状态 → 拒绝） |
| `src/routes/diagnosis.ts` | 修改 | consult 生产路径调用 `resolveCustomerConfig(orgId)`，四层解析结果用于真实可观测行为（诊断第一命令，见 §5 接线） |
| `tests/config/config-layers.test.ts` | 新建 | 单测：mergeLayers 递归/数组替换/undefined 稀疏/边界 + resolveLayers 四层覆盖 + dumpLayers 来源 + configNamespace 校验 |
| `tests/config/customer-config-package.test.ts` | 新建 | 单测：discovery first-root-wins/broken 上报 + mount per-org 隔离 + leakedGlobalConfig 审计拒绝 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（diagnosis 消费点/四层默认值/leak 审计判定口径），必须在此节同 commit 回填最终形态，不留「方案 vs 代码」漂移。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不消费阈值/启用专家集/报告样式/凭证到诊断管线 | 属 S1-6（CFG 客户配置包产品化）后续任务，本卡只交机制蓝本 |
| 不新建 Sentinel / 不改 `src/sentinel/` | DSH 线地盘 |
| 不做 `patchNode` 注释保留叶子级 diff + chokidar 热重载 + 跨进程写锁 | B-08 原子写 + 配置热重载属后续，本卡只交 resolve/dump/discovery/audit 纯机制 |
| 不引 `@deepseek-ai`、不 copy DSH 代码 | G1/G4 红线 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（实现前模块不存在 → 文件 fail），第二步实现跑绿。每用例 ≥3 expect，覆盖正常/降级/边界。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/config/config-layers.test.ts` | 单测 | ≥8 | mergeLayers 递归合并不覆盖未提供键、数组/标量整值替换、undefined 稀疏不删下层、resolveLayers 四层有序覆盖（workspace>customer>industry>default）、dumpLayers 逐层来源、configNamespace 非法拒绝、deepEqualJson 边界、非法入参 fail-closed |
| `tests/config/customer-config-package.test.ts` | 单测 | ≥6 | discovery first-root-wins、broken（缺 composition/坏 yaml）上报不跳过、mount per-org 隔离（A 客户配置不泄漏到 B）、leakedGlobalConfig 审计拒绝全局泄漏、空 root 返回空、重复 id 拒绝 |

RED 必须覆盖失败模式（S-5）：`mergeLayers` 数组应整值替换而非逐元素合并（修复前无此函数 → red）；`leakedGlobalConfig` 检测到行发布进程级全局状态返回非空（修复前无审计 → red）。

### 4.5 决策参考（S-12）

- **决策点 1（mergeLayers 数组语义）**：参考系 = DSH `mergeLayers`「plain object 递归、数组/scalar 整值替换」——采纳**整值替换**（避免哨兵阈值数组逐元素合并产生不可控混合）。
- **决策点 2（客户配置包载体）**：参考系 = DSH `preset=目录`（目录名=id，composition+metadata 分离）——采纳**目录=客户包**（`customer-config/{orgId}/config.yml`），first-root-wins + broken 上报。
- **决策点 3（leak 审计范围）**：参考系 = DSH `leakedServices`（发布 root realm 进程级 → 拒绝）——采纳**客户配置不得写入任何进程级/全局单例**（只返回 detached 解析结果）。

## 5. 接线要求（生产调用点，S-3）

| 新 export/函数 | 调用方 | 确认方式 |
|---|---|---|
| `resolveCustomerConfig`/`discoverCustomerConfigPackages`/`leakedGlobalConfig` | `src/routes/diagnosis.ts`（consult 生产路径） | `grep -rn "resolveCustomerConfig\|discoverCustomerConfigPackages" src/routes/diagnosis.ts` 命中 ≥1 生产调用点（测试调用不计） |
| `mergeLayers`/`resolveLayers`/`dumpLayers` | `src/config/customer-config-package.ts` 内部 + diagnosis.ts 消费 | `grep -rn "resolveLayers\|dumpLayers" src/config/ src/routes/diagnosis.ts` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 接线**：`grep -rn "resolveCustomerConfig\|discoverCustomerConfigPackages" src/routes/diagnosis.ts` 命中 ≥1 生产调用点。
- **DS2 四层机制**：`grep -rn "mergeLayers\|resolveLayers\|dumpLayers\|configNamespace" src/config/config-layers.ts` 命中（四层叠加 + 逐层来源存在）。
- **DS3 零依赖**：`grep -rn "@deepseek-ai" src/` 零结果。
- **DS4 测试 red→green**：`npx vitest run tests/config/config-layers.test.ts tests/config/customer-config-package.test.ts` 先 red（模块不存在）→ green（≥14 用例全 pass，非空壳）。
- **DS5 零回归**：`npx vitest run tests/config/ tests/routes/diagnosis*` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/config/ src/routes/diagnosis.ts` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集文件（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] DSH agent-presets discovery/mount/authoring/metadata + settings/settings-file 源码已读（file:line 已列）
- [ ] Synova auth/rbac/expert-registry/config-recovery/llm-credential-store 现状 grep 实证
- [ ] 四层叠加（default/industry/customer/workspace）+ dump 逐层来源 + leak 审计已纳入
- [ ] 遵循新专家规范（客户配置包是配置分层，非专家/循环混淆）
- [ ] 告警/权限/阈值消费明确 descope 到 S1-6
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| resolveCustomerConfig/discoverCustomerConfigPackages 已接生产路径 | `grep -rn "resolveCustomerConfig\|discoverCustomerConfigPackages" src/routes/diagnosis.ts` | 命中 ≥1 生产调用点 |
| 四层叠加 + 逐层来源存在 | `grep -rn "mergeLayers\|resolveLayers\|dumpLayers" src/config/config-layers.ts` | 命中 |
| 零 DSH 依赖 | `grep -rn "@deepseek-ai" src/` | 0 命中 |
| 测试 red→green 全绿 | `npx vitest run tests/config/config-layers.test.ts tests/config/customer-config-package.test.ts` | 全 pass（≥14 用例） |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/config/ src/routes/diagnosis.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
