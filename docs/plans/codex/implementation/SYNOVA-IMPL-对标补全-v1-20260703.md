# SynovaAgent — 对标补全实施方案 v1.0

> 2026-07-03 | 基于 SYNOVA-ANALYSIS-对标分析-v1 + SYNOVA-DESIGN-运行时卓越-v2 | 目标: Claude Code 可逐 Phase 执行

---

## 实施约束

- 五层架构：所有新增代码落在正确层级。L1 交互 / L2 编排 / L3 洞察 / L4 本体 / L5 存储
- 铁律 0-2：spec → test → impl → wire → review，先写测试再写实现
- 铁律 4：入口 → 交互 → 结果三环节缺一不可
- 铁律 24/31：每个 catch 必须 log + 返回 degraded
- 铁律 38：as any 零容忍
- 文件驱动扩展：新增能力靠 JSON/Markdown 文件，不改 TypeScript（除非核心引擎）

---

## 当前交付状态

### 已交付（RUNTIME Phase 0-5，代码已存在）

| # | 项目 | 文件 |
|---|------|------|
| B1 | 全局异常兜底 | `src/services/runtime-global-handlers.ts` |
| B2 | 启动恢复 + 优雅关闭 | `src/services/restart-recovery.ts` + `graceful-shutdown.ts` |
| B3 | 持久投递队列 + 卡住会话检测 | `src/l4/delivery-queue.ts` + `delivery-queue-store.ts` |
| B4 | 速率限制 | `src/middleware/rate-limit.ts` |
| B5 | 上下文压缩增强 | `src/orchestrator/context-compressor.ts` |
| B6 | 内存监控 + 关闭取证 | `src/services/memory-monitor.ts` |
| B7 | 双 FTS5 + 凭据轮换 | `src/security/credential-vault.ts` |
| B8 | Electron 自动更新 | `electron-main.ts` autoUpdater |
| B9 | 桌面 Phase 0-2 | JWT + GA + GraphStore + 审计 + 行为监控 + 欢迎页 + Composer + 面板 |

### 待交付（对标分析 P0/P1）

| # | 项目 | 优先级 |
|---|------|--------|
| G1 | 上下文可插拔引擎（非 LLM 路径 + 降级） | P0 |
| G2 | IM 多平台适配器（飞书/WeCom/钉钉） | P0 |
| G3 | 升级链 7-14-28 天自动升级 | P0 |
| G4 | 工具调用守卫（循环检测 + 重复失败阻断） | P1 |
| G5 | CJK FTS5 分词器 | P1 |
| G6 | JSONL 回放测试框架 | P1 |

---

## Phase 1: 上下文可插拔引擎（G1 — P0）

**目标**: 文件驱动压缩策略，LLM 不可用时自动降级到 truncate_oldest。

### 新建文件

| 文件 | 层 | 说明 |
|------|-----|------|
| `extensions/context-strategies/default.json` | L2 扩展 | 默认压缩策略（窗口大小、保留规则、降级路径） |
| `src/orchestrator/context-engine.ts` | L2 | 加载策略 → 评估触发 → 执行压缩 → 写回，LLM 不可用降级 |
| `tests/orchestrator/context-engine.test.ts` | — | 策略加载 / LLM 可用压缩 / LLM 降级 / 窗口溢出 / 空上下文 |

### 策略 JSON 结构

```json
{
  "$id": "context-strategy/default",
  "version": 1,
  "maxTokens": 8000,
  "triggers": { "tokenThreshold": 6400, "messageCountThreshold": 40 },
  "retention": {
    "keepSystemPrompt": true,
    "keepLastNMessages": 10,
    "keepExpertConclusions": true,
    "keepSentinelFindings": true
  },
  "fallback": { "whenLLMUnavailable": "truncate_oldest", "whenTimeout": "skip_compression" }
}
```

### 接口

```typescript
export interface ContextEngine {
  shouldCompress(messages: Message[], tokenCount: number): boolean;
  compress(messages: Message[], tokenCount: number): Promise<CompressResult>;
  getStats(): { totalCompressions: number; avgSavings: number; degradedCount: number };
}
```

### 接线点

`src/orchestrator/conversation-engine.ts` — 每次 LLM 调用前调用 `contextEngine.shouldCompress()`。LLM 不可用 → `truncate_oldest` → 保留 system prompt + 最后 10 条 + 专家结论 → `degraded: true`。

### 验收

```bash
# 策略加载：启动时自动加载 extensions/context-strategies/default.json
# LLM 压缩：token > 6400 → LLM 压缩 → 上下文缩减 >= 30%
# LLM 降级：LLM 不可用 → truncate_oldest → 不超限 → degraded: true
# 文件扩展：新增 saas.json → 重启后自动加载，不改代码
```

---

## Phase 2: IM 多平台适配器（G2 — P0）

**目标**: 飞书/WeCom/钉钉三平台统一入口，文件驱动平台配置。

### 架构

```
飞书 Webhook → IM Gateway (鉴权+格式转换) → ConversationEngine → ExpertDispatcher
WeCom Webhook ──→
钉钉 Webhook ──→
```

### 新建文件

| 文件 | 层 | 说明 |
|------|-----|------|
| `extensions/adapters/feishu.json` | L1 配置 | 飞书应用凭证 + Webhook 配置（GA 可编辑） |
| `extensions/adapters/wecom.json` | L1 配置 | 企业微信配置 |
| `extensions/adapters/dingtalk.json` | L1 配置 | 钉钉配置 |
| `src/services/im-gateway.ts` | L1/L2 | 接收 webhook → 验签 → 格式转换 → 注入 ConversationEngine |
| `src/routes/im-webhook.ts` | L1 | POST /api/im/feishu /wecom /dingtalk |
| `tests/services/im-gateway.test.ts` | — | 验签通过/失败/格式转换/限流/多平台/未知平台 |

### 统一消息格式

```typescript
interface IMMessage {
  platform: 'feishu' | 'wecom' | 'dingtalk';
  userId: string;
  userName: string;
  orgId: string;
  content: string;
  timestamp: number;
  raw: Record<string, unknown>;
}
```

### 接线点

`src/server.ts` — `app.use('/api/im', imWebhookRoutes)`；`src/agent/conversation-engine.ts` — 新增 `handleIMMessage(msg)`。

### 验收

```bash
# 飞书消息：POST /api/im/feishu with X-Lark-Signature → 200 → 进入对话引擎
# 验签失败：签名不匹配 → 401
# 限流：单用户 10 条/分钟 → 429，排队不丢消息
```

---

## Phase 3: 升级链（G3 — P0）

**目标**: 对接人连续忽略告警后自动升级。数据改善才停止升级，不是已读就停。

### 升级规则 JSON

`extensions/policies/escalation-rules.json`:
```json
{
  "$id": "escalation-rules/default",
  "rules": [
    { "severity": "critical", "ignoreDays": 3, "escalateTo": "owner", "channels": ["electron", "email"] },
    { "severity": "warning", "ignoreDays": 7, "escalateTo": "department_head", "channels": ["electron"] },
    { "severity": "warning", "cumulativeIgnores": 3, "escalateTo": "owner", "channels": ["email"] },
    { "severity": "info", "cumulativeIgnores": 5, "escalateTo": "liaison", "channels": ["weekly_report"] }
  ]
}
```

### 新建文件

| 文件 | 层 | 说明 |
|------|-----|------|
| `extensions/policies/escalation-rules.json` | L2 配置 | 升级规则（GA 可编辑） |
| `src/services/escalation-engine.ts` | L2 | 每次哨兵告警后评估升级条件 |
| `tests/services/escalation-engine.test.ts` | — | critical 忽略/累计忽略/数据改善停止/老板路由/部门路由 |

### 核心逻辑

对接人的行动反馈到数据层后（哨兵计算结果得到正反馈），升级链自动停止。不是对接人已读就停。

```typescript
interface EscalationEngine {
  evaluate(alert: SentinelAlert, ignoreCount: number, ignoreDays: number): EscalationDecision | null;
  getEscalationHistory(orgId: string): EscalationRecord[];
}
```

### 接线点

哨兵告警通知流程中，推送前调用 `escalationEngine.evaluate()`。哨兵值恢复到正常范围 → 升级链自动终止。

### 验收

```bash
# critical 忽略 3 天 → 推送老板 Electron + 邮件
# warning 累计忽视 3 次 → 推送老板邮件
# 哨兵值恢复正常 → 升级链自动终止
```

---

## Phase 4: 工具守卫 + CJK FTS5 + JSONL（G4/G5/G6 — P1）

**目标**: LLM 工具调用安全防护 + 中文全文搜索 + 回归测试框架。

### 新建文件

| 文件 | 层 | 说明 |
|------|-----|------|
| `src/l3/tool-guard.ts` | L3 | 循环检测 / 重复失败阻断 / 参数校验 |
| `extensions/frameworks/fts5-cjk-tokenizer.json` | L5 配置 | CJK 分词器配置 |
| `tests/l3/tool-guard.test.ts` | — | 循环检测 / 失败阻断 / 参数校验 / 放行正常 |
| `tests/fixtures/jsonl/` | — | 回放测试数据目录 |
| `tests/fixtures/runner.ts` | — | JSONL 回放执行器：历史对话 → 重放 → 对比输出 → 发现退化 |

### 工具守卫接口

```typescript
interface ToolGuard {
  beforeCall(tool: string, args: Record<string, unknown>, history: ToolCallRecord[]): { allow: boolean; reason?: string };
  afterCall(tool: string, result: unknown, duration: number): void;
  getLoopDetections(): LoopRecord[];
}
```

### 验收

```bash
# 循环检测：同一工具连续 3 次相同参数 → 阻断
# 重复失败：同一工具连续 3 次失败 → 阻断，建议人工介入
# JSONL 回放：历史对话 → 重放 → 对比当前输出 → 发现退化
```

---

## 实施优先级

| 顺序 | Phase | 工时 | 阻塞项 |
|------|-------|------|--------|
| 1 | Phase 1: 上下文可插拔引擎 | 12h | 无 |
| 2 | Phase 3: 升级链 | 10h | 无 |
| 3 | Phase 2: IM 多平台适配器 | 16h | 需要飞书/WeCom/钉钉开发者账号 |
| 4 | Phase 4: 工具守卫 + CJK FTS5 + JSONL | 14h | 无 |

**总计约 52 工时（约 7 个工作日）**

---

## 与其他实施方案的关系

- **RUNTIME-IMPL**: 已交付运行时基础设施（异常兜底/优雅关闭/WAL/速率限制/内存监控），互补不重叠
- **DESKTOP-IMPL**: 前端健壮性（ErrorBoundary/IME/SSE 重连/窗口持久化/状态栏/安静模式）归 DESKTOP Phase 3-6，本方案不重复

**设计文档**: [strategy/SYNOVA-ANALYSIS-对标分析-v1-20260703.html](D:/novis-backup-20260526/Novis/synova-agent/docs/plans/codex/strategy/SYNOVA-ANALYSIS-对标分析-v1-20260703.html)
**运行时设计**: [strategy/SYNOVA-DESIGN-运行时卓越-v2-20260701.html](D:/novis-backup-20260526/Novis/synova-agent/docs/plans/codex/strategy/SYNOVA-DESIGN-运行时卓越-v2-20260701.html)