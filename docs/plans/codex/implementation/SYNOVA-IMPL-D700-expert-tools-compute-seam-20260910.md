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

### 3.1 写集 (5 修改 + 5 新建 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `expert/fundamental-efficiency/manifest.json` 等 5 个 | 修改 | **删除 `tools` 字段**（死代码，零消费）；保留 `computes`（真实 seam） |
| `expert/{问题域}/compute-map.yaml` ×5 | 新建 | 问题域 → `computes`（从 manifest.computes 复制）+ `edges`（按权威 42 边映射，实现时读 edge-types 对齐） |
| `tests/expert/compute-map-consistency.test.ts` | 新建 | 5 个 compute-map.yaml 的 computes ⊆ manifest.computes、格式合法、问题域名 ∈ 新 6 名 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（edges 映射表、compute-map.yaml 字段名、是否接线到 expert-dispatcher），必须在此节同 commit 回填最终形态。

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
