<!--
  SYNOVA-IMPL-D479: auth legacy orgId 字面 'default' 收敛（D476 遗留③）
  状态: dev doc | 2026-08-23 | 优先级 P2
  权威文档: docs/synova/audit-reports/2026-08-22-D338-org-audit.md + D476 交付报告（遗留③「auth.ts L366 x-synova-token legacy 合成 'default'」）; src/config.ts L96（orgId = SYNOVA_ORG_ID）
  依赖: D476（隔离原则已定：实例默认 org 来自 config.orgId，不硬编码字面 'default'）
  并行: 写集=src/middleware/auth.ts + tests/middleware/，与 D478（server.ts）、D480（report-assembler/routes/diagnosis）**文件级零交集**，可 worktree 隔离并行；与 DSH 线零重叠
-->

# SYNOVA-IMPL-D479 auth legacy orgId 字面 'default' 收敛

## 1. 权威文档引用

* **D476 交付报告遗留③**：「auth.ts L366 x-synova-token legacy 合成 'default'」——D338/D476 确立的隔离原则：实例默认 org 唯一权威是 config.orgId（`SYNOVA_ORG_ID`），代码不得硬编码字面 'default'。
* **config.ts L96**：`const orgId = process.env.SYNOVA_ORG_ID || 'default'` —— 默认 org 的唯一定义点。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：x-synova-token legacy 解析 orgId 回退字面 'default'
* `src/middleware/auth.ts` L366：`orgId: parts[1] || 'default'` —— legacy 格式 token（`role:orgId:userId`）缺 orgId 段时落字面 'default'，绕过 `SYNOVA_ORG_ID` 配置（配置了实例 org 的部署，未带 orgId 的 legacy token 仍进 'default' 命名空间）。

### 缺陷 B：DEV_MODE 自动 admin orgId 字面 'default'
* `src/middleware/auth.ts` L260：`orgId: 'default'` —— DEV_MODE 下自动 admin 会话落字面 'default'；开发机配置 SYNOVA_ORG_ID 时不一致。

## 3. 实现方案

### 3.1 写集 (2 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/auth.ts | 修改 | L366 `parts[1] \|\| 'default'` → `parts[1] \|\| process.env.SYNOVA_ORG_ID \|\| 'default'`；L260 `orgId: 'default'` → `orgId: process.env.SYNOVA_ORG_ID \|\| 'default'`（与 config.ts L96 同源，不 import config 避免循环依赖；'default' 仅作 env 缺失时最终兜底） |
| tests/middleware/auth.test.ts | 修改 | 新增 2 用例：legacy token 无 orgId 段 + SYNOVA_ORG_ID 配置 → auth.orgId = 配置值（red=现状 'default' → green）；DEV_MODE 下 orgId = 配置值（用例结束 restore env，防污染其他用例） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（隔离收敛，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如改为 import config.orgId 或抽共用 helper），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* 不改 x-synova-token 协议本身（向下兼容保留）。
* 不改 JWT 主路径（仅 legacy + DEV_MODE 两处字面）。
* 不碰 D478（server.ts）/ D480（报告链）。

## 4. 测试要求（测试优先：先写 red → 再实现 green）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 单元 tests/middleware/auth.test.ts（修改） | +2 | ①legacy token 无 orgId 段 + SYNOVA_ORG_ID 配置 → auth.orgId = 配置值（red=现状 'default' → green）；②DEV_MODE 下 orgId = 配置值 |

**RED 必须覆盖失败模式（S-5）**：用例①先以现状跑（配置 SYNOVA_ORG_ID=org-x，legacy token 无 orgId 段）→ 断言 auth.orgId === 'org-x' → **修复前失败（'default'）** → 修复后通过。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| 无新增 export（纯收敛） | auth 中间件内部（jwtAuthMiddleware + extractLegacyToken） | `grep -n "SYNOVA_ORG_ID" src/middleware/auth.ts` 命中 2 处 |

## 6. 完成标准

* **DS1 legacy 收敛**：`grep -n "SYNOVA_ORG_ID" src/middleware/auth.ts` 命中（L366 附近）。
* **DS2 DEV_MODE 收敛**：`grep -n "SYNOVA_ORG_ID" src/middleware/auth.ts` 命中（L260 附近，共 2 处）。
* **DS3 测试全绿**：`vitest run tests/middleware/auth.test.ts` 全 pass（red 先行已证）。
* **DS4 零回归**：tests/routes/auth.test.ts + auth.integration.test.ts 绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致，无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 grep 实测，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（字面 'default' → SYNOVA_ORG_ID）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：隔离收敛，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1/DS2 legacy + DEV_MODE 收敛 | grep -n "SYNOVA_ORG_ID" src/middleware/auth.ts | 命中 2 处 |
| DS3 测试全绿 | vitest run tests/middleware/auth.test.ts | 全 pass |
| DS4 零回归 | vitest run tests/routes/auth.test.ts tests/middleware/auth.integration.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：与 D478/D480 **可并行**（写集零交集），必须 worktree 隔离；暂存前查 session-registry（S-9）。
