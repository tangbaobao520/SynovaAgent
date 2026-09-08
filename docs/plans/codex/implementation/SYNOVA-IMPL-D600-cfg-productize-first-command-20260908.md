<!--
  SYNOVA-IMPL-D600: CFG 产品化——诊断第一命令（报告深度/模板由客户配置驱动 + dump-config 检查表面）
  状态: dev doc | 2026-09-08 | 优先级 P1（多客户扩展命门）
  权威文档: docs/synova/research/DSH迁移施工图-20260820/DSH迁移施工图-20260820.md §5.4；docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §B-10
  借鉴: DSH settings `--dump-config` 逐层带来源 + B-09/B-10 已交付机制（读源码自研，零代码依赖，G1/G4）
  依赖: D599（B-09+B-10 客户配置包机制蓝本，src/config/config-layers.ts + customer-config-package.ts）
  并行: 无（写集 src/routes/diagnosis.ts + src/routes/config.ts；与在途 B 组其余卡/S1-5 零交集）
-->

# SYNOVA-IMPL-D600：CFG 产品化——诊断第一命令（报告深度/模板由客户配置驱动 + dump-config）

> 状态：dev doc | 2026-09-08 | 优先级 P1（多客户扩展命门）
> 归属：Claude 线（src/routes/diagnosis.ts + src/routes/config.ts）
> 依赖：D599（B-09+B-10 客户配置包机制蓝本，已交付 src/config/config-layers.ts + customer-config-package.ts）

## 1. 权威文档引用

- **施工图 §5.4 客户配置包详解**：四层叠加 `Layer0 全局默认 → Layer1 行业 → Layer2 客户 → Layer3 工作区`；借鉴 DSH「有序层级、上层覆盖下层、`--dump-config` 可检查实际生效配置」三件套；「实现位置在核心服务内」。
- **DSH 借鉴指引 v2 §B-10**：`mergeLayers`/namespace/`patchNode`/`--dump-config` 逐层带来源；Synova 落点 = **CFG 四层叠加实现蓝本 + 支持诊断第一命令**。
- **D599 已交付（依赖）**：`src/config/config-layers.ts`（`resolveLayers`/`dumpLayers`/`mergeLayers`/`configNamespace`）+ `src/config/customer-config-package.ts`（`resolveCustomerConfig(orgId, opts) → MountedCustomerConfig{ orgId, config, provenance, degraded, reason, audit }`、`COMPOSITION_FILE='config.yml'`、`DEFAULT_ROOT_NAME='customer-config'`、`leakedGlobalConfig`）。
- **铁律 24/31**（降级 log.warn + degraded）；**铁律 47/48**（契约 + 测试非空壳）。

## 2. 代码审计——现状（file:line，实测）

### 2.1 D599 交付面（已读源码，git show origin/feat/d599-customer-config-package）

- `src/config/config-layers.ts`：`resolveLayers(layers)` 四层有序覆盖、`dumpLayers(layers)` 逐层来源 `LayerDump[]`、`mergeLayers` 对象递归/数组整值替换、`configNamespace` kebab-case 校验。
- `src/config/customer-config-package.ts`：`resolveCustomerConfig(orgId, {roots, defaultLayer})` 读 `customer-config/{orgId}/config.yml`（+ `industry.yml`/`workspace.yml`）+ default 层 → `resolveLayers` → 返回 `config`（deep frozen、泄漏键已剥离）+ `provenance` + `audit` + `degraded`；`leakedGlobalConfig` 审计 reserved-global/prototype-key。

### 2.2 Synova 现状（缺陷，grep 实测）

- **缺陷 A（配置解析了但不消费）**：`src/routes/diagnosis.ts` consult 路由已 `resolveCustomerConfig(teamId)`，但只把 `provenance`/`audit`/`degraded` 挂到 `report.customerConfig`，**`config` 字段未驱动任何诊断行为**——`reportDepth` 仍是 `scope?.reportDepth || scope?.depth || 'raw'`（硬编码 fallback，`src/routes/diagnosis.ts` consult 路由实测）。
- **缺陷 B（无 dump-config 检查表面）**：`dumpLayers` 已交付但无生产消费——没有 `GET /api/config/dump` 或等价端点让运营者「检查实际生效配置」（`--dump-config` 三件套缺最后一件）。
- **既有部分客户覆盖（需统一进四层）**：`src/l3/report-template-loader.ts:85-118` 已有 `knowledge/custom/{client_id}/report.hbs`（两层：客户自定义 + 系统默认），与 D599 四层机制并存、未统一。

### 2.3 无重复造轮子审计（S-14，DSH 迁移排查）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep 现有实现 | `grep -rn "resolveCustomerConfig\|dumpLayers\|config/dump" src/routes/ src/services/` → 仅 diagnosis.ts 消费 provenance，无 dump 端点、无 config 驱动行为 |
| 施工图可借鉴清单对照 | 本任务属 CFG 产品化（S1-6），复用 D599 机制，不重复造轮子 |
| 既有层确认 | `report-template-loader.ts` 的 `knowledge/custom/{client_id}/` 是两层局部覆盖，本任务统一到四层（default/industry/customer/workspace）而非重建 |
| 结论 | 在 D599 机制上做「消费 + dump 表面」，不新建四层解析 |

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建 + 2 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/routes/diagnosis.ts` | 修改 | 消费 `customerConfig.config`：`reportDepth`/报告模板由客户配置命名空间 `diagnosis.reportDepth`/`diagnosis.template` 驱动（优先级 `scope.reportDepth > scope.depth > 客户配置 > 'raw'`），完成「诊断第一命令」真实接线 |
| `src/routes/config.ts` | 新建 | `GET /api/config/dump?orgId=...` → `resolveCustomerConfig(orgId)` + `dumpLayers` → 返回 `{ orgId, config, provenance, degraded, audit }`（逐层带来源，`--dump-config` 检查表面） |
| `tests/routes/diagnosis-customer-config.test.ts` | 新建 | 集成：客户配置 `diagnosis.reportDepth` 覆盖硬编码 fallback、无配置回退 `'raw'`、broken 包 degraded 回退 |
| `tests/routes/config-dump.test.ts` | 新建 | 集成：dump 端点返回逐层 provenance、`orgId` 缺省/非法降级、leak 剥离后的 config 不含泄漏键 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（config 命名空间键名、dump 端点路径/挂载、reportDepth 优先级顺序），必须在此节同 commit 回填最终形态。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不消费阈值/启用专家集/凭证到诊断管线 | 阈值属 `src/sentinel/`（DSH 线）；专家集需先完成 registry 改名 P1；凭证属后续 CFG 切片 |
| 不改 `src/sentinel/`、`src/agent/sentinel-service.ts` | DSH 线地盘 |
| 不统一 `report-template-loader.ts` 的 `knowledge/custom/{client_id}/` 与四层机制 | 属 CFG 报告样式统一后续切片，本卡只做 reportDepth/template 配置驱动 |
| 不引 `@deepseek-ai`、不 copy DSH 代码 | G1/G4 红线 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（实现前 config 未驱动行为 → 断言失败），第二步实现跑绿。每用例 ≥3 expect，覆盖正常/降级/边界。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/routes/diagnosis-customer-config.test.ts` | 集成 | ≥4 | 客户配置 `diagnosis.reportDepth='ceo'` 驱动报告深度（覆盖 `'raw'` fallback）、无客户配置回退 `'raw'`、broken 包 degraded 不阻断诊断、scope.reportDepth 优先于客户配置（显式请求 > 配置） |
| `tests/routes/config-dump.test.ts` | 集成 | ≥4 | dump 返回逐层 provenance（default/industry/customer/workspace 来源）、config 已剥离泄漏键、orgId 缺省返回 400、resolve 失败降级 degraded 不抛 |

RED 必须覆盖失败模式（S-5）：客户配置 `diagnosis.reportDepth` 应覆盖 `'raw'`（修复前 config 未消费 → 恒 `'raw'` → red）；dump 端点应返回逐层来源（修复前无端点 → 404 → red）。

### 4.5 决策参考（S-12）

- **决策点 1（reportDepth 优先级）**：参考系 = 第一性原理（显式请求覆盖隐式配置）+ DSH settings 分层（用户层 > 默认层）——采纳 `scope.reportDepth > scope.depth > 客户配置 > 'raw'`（显式请求 > 客户配置 > 硬编码兜底）。
- **决策点 2（config 命名空间键）**：参考系 = DSH settings namespace kebab-case——采纳 `diagnosis.reportDepth`/`diagnosis.template`（小驼峰嵌套在 `diagnosis` 命名空间下）。
- **决策点 3（dump 端点）**：参考系 = 施工图 §5.4「`--dump-config` 可检查实际生效配置」——采纳 `GET /api/config/dump?orgId=` 只读检查表面（不写配置）。

## 5. 接线要求（生产调用点，S-3）

| 新 export/函数 | 调用方 | 确认方式 |
|---|---|---|
| 客户配置驱动 reportDepth | `src/routes/diagnosis.ts` consult 生产路径 | `grep -rn "customerConfig.config\|config.diagnosis" src/routes/diagnosis.ts` 命中 ≥1 生产消费点（非仅挂报告） |
| `GET /api/config/dump` 端点 | `src/routes/config.ts`（default export router）+ `src/server.ts`（`app.use` 挂载，对齐 diagnosisRoutes 先例 src/server.ts:41/354） | `grep -rn "config/dump\|/api/config" src/routes/config.ts src/server.ts` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 接线**：`grep -rn "customerConfig.config\|config.diagnosis" src/routes/diagnosis.ts` 命中（config 真实驱动 reportDepth，非仅挂 provenance）。
- **DS2 dump 表面**：`grep -rn "config/dump" src/routes/config.ts src/server.ts` 命中（端点定义 + `app.use` 挂载）。
- **DS3 零依赖**：`grep -rn "@deepseek-ai" src/` 零结果。
- **DS4 测试 red→green**：`npx vitest run tests/routes/diagnosis-customer-config.test.ts tests/routes/config-dump.test.ts` 先 red → green（≥8 用例全 pass，非空壳）。
- **DS5 零回归**：`npx vitest run tests/routes/diagnosis* tests/routes/config*` 全绿；`npx tsc --noEmit` 报错集 = 基线 28（零新增，逐条 diff）。
- **DS6 类型安全**：`grep -rn "as any\|as never\|as unknown as" src/routes/diagnosis.ts src/routes/config.ts` 零命中（新增行）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集文件（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] D599 交付面（config-layers + customer-config-package）源码已读（file:line 已列）
- [ ] diagnosis.ts consult 路由现状 grep 实证（config 已解析未消费）
- [ ] 四层叠加 + dump 逐层来源 + leak 剥离复用 D599，不重复造轮子
- [ ] 阈值/专家集/凭证消费明确 descope（DSH 线 / registry 改名 P1 / 后续切片）
- [ ] 遵循新专家规范（客户配置是配置分层，非专家/循环混淆）
- [ ] 不是凭记忆
- [ ] 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 客户配置驱动 reportDepth | `grep -rn "customerConfig.config\|config.diagnosis" src/routes/diagnosis.ts` | 命中 ≥1 生产消费点 |
| dump 表面存在 | `grep -rn "config/dump" src/routes/config.ts src/server.ts` | 命中 |
| 零 DSH 依赖 | `grep -rn "@deepseek-ai" src/` | 0 命中 |
| 测试 red→green 全绿 | `npx vitest run tests/routes/diagnosis-customer-config.test.ts tests/routes/config-dump.test.ts` | 全 pass（≥8 用例） |
| 零回归 | `npx tsc --noEmit` | 28 = 基线零新增 |
| as any=0 | `grep -rn "as any" src/routes/diagnosis.ts src/routes/config.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 写集一致，无越界 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后成立）+ CI 绿 |
