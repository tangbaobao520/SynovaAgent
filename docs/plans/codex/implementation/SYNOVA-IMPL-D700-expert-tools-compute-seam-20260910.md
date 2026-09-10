<!--
  SYNOVA-IMPL-D700: 专家 tools 对齐 compute seam——删死 tools 字段 + compute-map.yaml（P1 第二件）
  状态: dev doc | 2026-09-10 | 优先级 P1（专家架构 P1 第二件）
  权威文档: docs/synova/research/专家架构重定义与权威口径审计-20260905/第六章 §6.7/§6.9.4
  借鉴: 无（seam 映射对齐权威，非 DSH 借鉴卡）
  依赖: D650（registry 改名）已合并；本卡是 P1 第二件「tools 对齐」
  并行: 无（写集 expert/ 5 个 manifest + 5 个 compute-map.yaml + 测试）
-->

# SYNOVA-IMPL-D700：专家 tools 对齐 compute seam（删死 tools + compute-map.yaml）

> 状态：dev doc | 2026-09-10 | 优先级 P1（专家架构 P1 第二件）
> 归属：Win 线（expert/ + 测试）
> 依赖：D650（registry 改名）已合并

## 1. 权威文档引用

- **第六章 §6.9.4 问题域专家 → compute 的 seam 映射**：专家 manifest 声明「需要某问题域 compute」，seam 解析到真实 compute 实现；`compute-map.yaml` 是「专家 tools 重对齐」的具体载体，**替代当前 manifest 里 `compute-break-even` 等无实现工具名的错位**。
- **第六章 §6.7 文档治理路线图**：P1 部署期「专家 tools 重对齐到 extensions compute（seam 化）」。

## 2. 代码审计——现状（file:line，实测）

### 2.1 缺陷（grep 实测）

- **缺陷 A（tools 字段是死代码）**：`expert/{问题域}/manifest.json` 的 `tools` 字段值是 `compute-break-even`/`compute-dol` 等**无实现工具名**（小写、无 COMPUTE- 前缀、无版本号）；`grep -n "manifest.tools\|\.tools\b" src/l3/expert-dispatcher.ts src/agent/expert-router.ts src/orchestrator/subagent-coordinator.ts` **零命中**——`tools` 字段零消费 = 死代码（铁律 37）。
- **缺陷 B（computes 字段已是对的真实 seam）**：`manifest.computes` 字段值是真实 compute ID（`COMPUTE-BREAK-EVEN-v1`/`COMPUTE-DOL-v2` 等），且**已被消费**（`src/agent/expert-router.ts:150` `computes: data.computes || []`）。
- **缺陷 C（缺 compute-map.yaml）**：第六章 §6.9.4 要求的 `expert/{问题域}/compute-map.yaml`（问题域 → computes + edges）**不存在**。

### 2.2 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `compute-map.yaml` 零存在；`tools` 字段零消费；`computes` 字段已接线（expert-router.ts:150） |
| 施工图可借鉴清单 | 非借鉴卡 |
| 既有层确认 | `computes` 字段已是真实 seam，本卡**删死 tools + 补 compute-map.yaml**，不重造 compute 注册 |
| 结论 | 收口「tools 错位」：删死字段，补权威要求的 seam 映射表 |

## 3. 实现方案

### 3.1 写集 (3 修改 + 6 新建)
| 文件 | 操作 | 说明 |
|---|---|---|
| `expert/fundamental-efficiency/manifest.json` | 修改 | 删除死 `tools` 字段（零消费）；保留 `computes`（真实 seam，expert-router.ts 消费） |
| `expert/customer-growth/manifest.json` | 修改 | 同上 |
| `expert/organizational-capability/manifest.json` | 修改 | 同上 |
| `expert/fundamental-efficiency/compute-map.yaml` | 新建 | 问题域 → computes + edges seam 映射（§6.9.4 规格） |
| `expert/customer-growth/compute-map.yaml` | 新建 | 同上 |
| `expert/organizational-capability/compute-map.yaml` | 新建 | 同上 |
| `expert/technology-foundation/compute-map.yaml` | 新建 | 同上（computes/edges 自 manifest 全量复制） |
| `expert/competitive-strategy/compute-map.yaml` | 新建 | 同上（manifest 无声明，如实空数组） |
| `tests/expert/compute-map-consistency.test.ts` | 新建 | 5 map 存在 + computes ⊆ manifest.computes + 格式合法 + 问题域名 ∈ 新 6 名 |

> 勘误（实现实测，详见 §3.2 回填 1）：原名义「5 修改」中 technology-foundation / competitive-strategy 的 manifest.json 实读无顶层 `tools` 数组，仅做 DS1 零残留核实、无实际变更，故不入写集表。

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（edges 映射表、compute-map.yaml 字段名、是否接线到 expert-dispatcher），必须在此节同 commit 回填最终形态。

**回填（2026-09-10，Win D663 实现同 commit）：**

1. **manifest 实际修改 = 3 个，非 5 个**。实读核实：仅 fundamental-efficiency / customer-growth / organizational-capability 的 manifest.json 有顶层死 `tools` 数组；technology-foundation **从未有**顶层 tools（仅 `entryPoints.tools` 路径引用 + `dependencies.computes` 嵌套依赖，均保留）；competitive-strategy 极简 manifest（D236 起）无 tools/computes/edges。DS1 的 rg 仍覆盖 5 文件零命中（对后者为恒真核实）。
2. **compute-map.yaml 最终形态**（§6.9.4 示例原样）：顶层键 = 问题域名（与目录一致）+ `computes`（flow 列表，自 manifest.computes 全量复制、保序）+ `edges`（flow 列表，自 manifest.edges 全量复制、保序）。competitive-strategy 如实空数组（`computes: []` / `edges: []`，占位 seam 载体，待其 manifest 声明后补齐）。一致性（含数量全等）由 tests/expert/compute-map-consistency.test.ts 锁定。
3. **edges 权威对齐**（实现时实读，非凭记忆）：42 边骨架存在两个口径层——`extensions/ontology/edge-types/*.json` + `edge-consumption-map.json` 用**边类型名**（PRODUCES 等 42 条池-阀边）；expert manifests / 测试夹具 / 权威文档15 附录A 速查表用 **E-xx ID**（E-01..E-42）。compute-map.yaml 取 E-xx ID 层（与 manifest 同口径）；测试校验格式 `^E-\d{2}$` + 范围 1..42，不硬编码速查表子集。
4. **seam 消费接线未做**（§3.3 descope 维持）：全仓 grep `compute-map` 在 src/ 零命中，本卡后仍零命中——生产消费（expert-dispatcher 读 compute-map）留后续卡。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不做「expert-dispatcher 接线 compute-map」 | 属 seam 消费接线（P1 第二件后半段/独立卡），本卡只删死 tools + 建映射表 |
| 不改 compute 注册机制（sog-schema-registry） | DSH/已有，非本卡 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

第一步写测试跑红（tools 字段仍存在 + compute-map.yaml 不存在 → fail），第二步实现跑绿。

| 层 | 类型 | 数量 | 覆盖 |
|---|---|---|---|
| `tests/expert/compute-map-consistency.test.ts` | 单测 | ≥5 | 5 个 compute-map.yaml 存在、computes ⊆ manifest.computes、问题域名 ∈ 新 6 名、tools 字段已删除（grep 零命中） |

RED 必须覆盖失败模式（S-5）：`tools` 字段仍存在（死代码未删）→ red；compute-map.yaml 缺失 → red。

### 4.5 决策参考（S-12）

- **决策点 1（tools 字段处置）**：参考系 = 铁律 37（死代码）+ 实测零消费——采纳**删除**（非改名，因为 tools 名无实现、零接线）。
- **决策点 2（compute-map.yaml 内容）**：参考系 = 第六章 §6.9.4——采纳 `computes`（复制 manifest.computes）+ `edges`（42 边映射，实现时对齐）。

## 5. 接线要求

| 新 export/文件 | 消费方 | 确认方式 |
|---|---|---|
| compute-map.yaml | 暂无生产消费（seam 消费接线属后续卡） | 本卡只落文件 + 一致性测试（descope 消费接线） |
| manifest.computes | `src/agent/expert-router.ts:150`（既有） | 删 tools 后 computes 消费不受影响 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 死 tools 零残留**：`rg '"tools"\s*:\s*\[' expert/fundamental-efficiency/manifest.json expert/customer-growth/manifest.json expert/organizational-capability/manifest.json expert/technology-foundation/manifest.json expert/competitive-strategy/manifest.json` 零命中。
- **DS2 compute-map 落地**：`ls expert/fundamental-efficiency/compute-map.yaml expert/customer-growth/compute-map.yaml expert/organizational-capability/compute-map.yaml expert/technology-foundation/compute-map.yaml expert/competitive-strategy/compute-map.yaml` 5 个存在。
- **DS3 测试 red→green**：`npx vitest run tests/expert/compute-map-consistency.test.ts` 先 red → green。
- **DS4 零回归**：`npx vitest run tests/expert/ tests/agent/expert-router.test.ts` 全绿；`npx tsc --noEmit` 报错集 = 基线（零新增）。
- **DS5 类型安全**：测试为 ts，`rg "as any\|as never\|as unknown as" tests/expert/compute-map-consistency.test.ts` 零命中。
- **DS6 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界（src/ 零改动）。
- **DS7 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
- **DS8 推送+CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空（合并后成立）+ CI task-relevant jobs 绿。

## 7. 自检清单

- [ ] 第六章 §6.9.4 compute-map.yaml 规格已读（原文引用）
- [ ] tools 死代码 + computes 已接线（expert-router.ts:150）grep 实证
- [ ] 5 个 compute-map.yaml 的 computes 复制 manifest.computes（真实 ID）
- [ ] edges 映射实现时对齐 42 边（不凭记忆）
- [ ] seam 消费接线明确 descope（后续卡）
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 死 tools 零残留 | `rg '"tools"' expert/fundamental-efficiency/manifest.json expert/customer-growth/manifest.json expert/organizational-capability/manifest.json expert/technology-foundation/manifest.json expert/competitive-strategy/manifest.json` | 0 命中 |
| compute-map 落地 | `ls expert/*/compute-map.yaml` | 5 个存在 |
| 测试 red→green | `npx vitest run tests/expert/compute-map-consistency.test.ts` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 基线零新增 |
| as any=0 | `rg "as any" tests/expert/compute-map-consistency.test.ts` | 0 命中 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后）+ CI 绿 |
