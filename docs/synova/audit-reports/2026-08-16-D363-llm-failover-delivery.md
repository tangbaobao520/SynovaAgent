# D363 交付报告 — LLM 运行时 failover 接线

> 2026-08-16 | 分支: feat/win-d363-llm-failover | Agent: claude-win | 审计方: Kimi K3（待审）
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D363-LLM运行时failover接线-20260816.md
> 提交: 6b2abaa（docs: dev doc §3.2 回填 + §4.5 决策记录 + brief）、162b7700（feat: 写集 1 修改 + 1 新建）

## 一、问题与修复

**问题**（K3 基础设施审计 P1-1 修正结论）：`createProviderChain`（registry.ts:26）已实现运行时 failover，CircuitBreaker 已接线（base.ts:81），但生产路径（tool-loop-executor 消费的 ctx.provider）直调单 provider.chat()，failover 机制建成未接线（M3）。"DeepSeek 挂了自动切 OpenAI"在生产中不成立。

**修复**（写集恰 1 修改 + 1 新建，无越界）：
- `src/agent/conversation-engine.ts` — constructor 注入处单 provider → failover chain：
  - `wrapProviderWithFailover(primary, fallback)`：createProviderChain 包装 + healthCheck 数组→单值契约适配（显式聚合，任一健康即链可用；无 as any）
  - `buildFallbackProvider(primary)`：detectProviderFromUrl 派生备用（主 deepseek→备 openai；主非 deepseek→备 deepseek）；凭据缺失 → null + log 显式"failover 未启用"（不静默单飞）
  - `EngineConfig.fallbackProvider` 注入缝（测试注入 / null 显式禁用）
  - 6 个生产构造点（cli/TUI/chat/MCP/im-inbound/fromState）单点 constructor 生效
- `tests/contract/llm-failover.test.ts` — 17 测试（dev doc 要求 ≥6 断言）

## 二、完成标准逐项验证（DS1-DS6，全部机器可验）

| DS | 要求 | 结果 | 证据 |
|----|------|------|------|
| DS1 | createProviderChain 生产调用 ≥1 | ✅ | `grep -n createProviderChain src/agent/conversation-engine.ts` → :15 import, :284 生产调用 |
| DS2 | 新测试全绿 ≥6 断言 | ✅ | `npx vitest run tests/contract/llm-failover.test.ts` → 17/17（17>6） |
| DS3 | ctx.provider 是 chain | ✅ | tool-loop-executor.ts:38 `const { provider } = this.ctx`，ctx 由 conversation-engine constructor 注入 chain |
| DS4 | 审计基线零新增 | ✅ | 干净 HEAD 对照：基线 PASS:3 WARN:884 FAIL:434 = 变更后 PASS:3 WARN:884 FAIL:434 |
| DS5 | 提交恰为写集 | ✅ | `git diff --name-only HEAD~1..HEAD`（162b7700）= 恰 2 文件 |
| DS6 | 真实 push + CI 绿 | ✅* | push 完成（`git log @{upstream}..HEAD` 空）；CI run 31923053102：Vitest 2 shard ✅ / tsc ✅ / Integration Contract ✅ / Checker Review ✅ / Golden Case ✅；npm audit ❌ 与 Architecture Check ❌ 为 main 预存失败（见下） |

\* DS6 预存失败说明（dev doc DS6 已预见）：main 基线 CI run 31905000615（5e07c578）job 结论与本次完全一致——npm audit ❌、Architecture Check ❌ 在 main 上已失败。Architecture 失败原因 = `src/routes/admin-knowledge.ts:17` L1→L4 跨层（存量违规，不在本任务写集）；`tests/architecture/` 本地 12/12 通过。

## 三、RED → GREEN 证据链

- **RED**（修复前基线测试）：mock 主 provider 抛错 → 单 provider 直调无切换 → 用户看到"抱歉，调用失败"（临时基线测试证 P1 缺陷，交付前已删除）
- **GREEN**：同一场景经 chain → 自动切备用 → 回复来自备用 provider（llm-failover.test.ts 生产路径故障注入 4 测试 + wrapProviderWithFailover 10 测试 + buildFallbackProvider 4 测试）

## 四、基线对照（物理证明，非推理）

| 项 | 干净 HEAD 基线 | 变更后 | 结论 |
|----|--------------|--------|------|
| tsc --noEmit 错误 | 29 | 29 | 零新增（临时基线 worktree 对照，全部在 _extinct/ima/middle-evolution/server 存量） |
| 全量 vitest | 100 failed / 3136 passed | 101 failed / 3152 passed | +17 新测试全过；唯一增量失败 = "新增行业零 .ts 文件修改"（断言 `git diff` 零 .ts 变更，工作树含未提交写集必失败；CI 干净检出通过——CI Vitest 2 shard ✅ 实证） |
| audit-check --full | 3/884/434 | 3/884/434 | 零新增 |
| oxlint 存量告警 | 同款错误（Triple/ReflectionResult 未用 import 等） | 同款（行号 +3 平移） | 零新增 |

## 五、决策记录（dev doc §4.5 已回填，K3 可核）

1. **接线方式**：直接 createProviderChain 注入（非 buildChain）——buildChain 需 await healthCheck 网络请求且零调用；最小机制即可接线。参考：第一性原理 + Anthropic + DeepSeek（最少机制）。
2. **备用 provider 来源**：constructor 环境变量派生 + EngineConfig.fallbackProvider 注入缝——6 构造点单点派生最小改动；凭据缺失 log 显式说明。参考：第一性原理 + Anthropic（显式可验证）。
3. **healthCheck 契约冲突**：显式聚合适配（数组→单值），未用 as unknown as 掩盖——铁律 38 + 铁律 24/31。

## 六、自检 6 问

1. **接线检查** ✅ — wrapProviderWithFailover 由 ConversationEngine constructor 调用（:299-300），buildFallbackProvider 同文件调用；createProviderChain 生产调用 :284；grep 物理证据见 DS1/DS3
2. **异常处理** ✅ — chain 内部 try-catch 有 log（registry.ts 既有"Provider 失败，尝试下一个"）；凭据缺失路径 log.info 显式记录；全失败显式抛"所有 Provider 均失败"（tool-loop 捕获 → 用户可感知"抱歉，调用失败"）；healthCheck 全不健康返回 `{healthy:false, error}` 不静默
3. **类型安全** ✅ — `as any` 0（提交后 as any 计数 28 = 存量；healthCheck 适配用显式聚合非断言掩盖）
4. **测试覆盖** ✅ — 17 测试全部真实断言（主成功不切/主失败切备用/全失败抛错/名称顺序/stream failover/healthCheck 聚合/环境派生 4 例/生产路径故障注入 4 例）
5. **残留清理** ✅ — 临时基线测试 llm-failover.baseline.test.ts 已删除；无死代码（validateResponse/convertTools 未复制进 wrapper）；reference-map.md 已还原
6. **文件驱动** ✅ — 无新增硬编码类型；无新扩展/哨兵；不涉及 manifest/tags

## 七、遗留与后续

- **PR 待创建**（本机 gh/GCM HTTPS 凭据失效，push 走 SSH key）：https://github.com/tangbaobao520/SynovaAgent/pull/new/feat/win-d363-llm-failover —— 需用户在浏览器创建或 `gh auth login` 后执行
- 健康排序升级（buildChain 注入）留待后续任务——当前链按主→备固定顺序，不做健康优先（决策点 1）
- LLMClient 路径（synova-diagnosis-engine-impl.ts）failover 属独立任务（接口不兼容，dev doc §3.3 已排除）
