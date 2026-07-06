 # SynovaAgent — 对标补全实施方案 v1.0

 > 2026-07-03 | 基于 SYNOVA-ANALYSIS-对标分析-v1 + SYNOVA-DESIGN-运行时卓越-v2 | 目标: Claude Code 可逐 Phase 执行

 ---

 ## 实施约束（每次执行必读）

 - **五层架构**：所有新增代码必须落在正确层级。L1 交互 / L2 编排 / L3 洞察 / L4 本体 / L5 存储。
 - **铁律 0-2**：spec → test → impl → wire → review。每个 Phase 先写测试再写实现。
 - **铁律 1**：垂直切片交付，按用户可见的行为拆片。
 - **铁律 4**：入口 → 交互 → 结果三环节缺一不可。
 - **铁律 24/31**：每个 catch 必须 log + 返回 degraded。
 - **铁律 38**：as any 零容忍。
 - **文件驱动扩展**：新增能力靠 JSON/Markdown 文件，不改 TypeScript（除非涉及核心引擎）。

 ---

 ## 当前交付状态总览

 ### 已交付（代码已存在，需核实无退化）

 | # | 项目 | 交付文件 | 来源 |
 |---|------|---------|------|
 | B1 | 全局异常兜底 | `src/services/runtime-global-handlers.ts` | RUNTIME Phase 0 |
 | B2 | 启动恢复 + 优雅关闭 | `src/services/restart-recovery.ts` + `graceful-shutdown.ts` | RUNTIME Phase 1 |
 | B3 | 持久投递队列 + 卡住会话检测 | `src/l4/delivery-queue.ts` + `delivery-queue-store.ts` | RUNTIME Phase 2 |
 | B4 | 速率限制 | `src/middleware/rate-limit.ts` | RUNTIME Phase 3.1 |
 | B5 | 上下文压缩增强 | `src/orchestrator/context-compressor.ts` | RUNTIME Phase 3.3 |
 | B6 | 内存监控 + 关闭取证 | `src/services/memory-monitor.ts` | RUNTIME Phase 5 |
 | B7 | 双 FTS5 + 凭据轮换 | `src/security/credential-vault.ts` + WAL 测试 | RUNTIME Phase 5 |
 | B8 | Electron 自动更新 | `electron-main.ts` autoUpdater | RUNTIME Phase 5.1 |
 | B9 | 桌面 Phase 0-2 | JWT+GA+GraphStore 权限+审计+行为监控+Electron+浅色主题+欢迎页+Composer+面板 | DESKTOP Phase 0-2 |

 ### 待交付（对标分析标记为 P0/P1）

 | # | 项目 | 优先级 | 状态 |
 |---|------|--------|------|
 | G1 | 上下文可插拔引擎（非 LLM 路径） | P0 | ❌ 未实现 |
 | G2 | IM 多平台适配器（飞书/WeCom/钉钉） | P0 | ❌ 未实现 |
 | G3 | 升级链 7-14-28 天自动升级 | P0 | ❌ 设计已出，代码未实现 |
 | G4 | 工具调用守卫（循环检测+失败阻断） | P1 | ❌ 未实现 |
 | G5 | CJK FTS5 分词器 | P1 | ❌ 未实现 |
 | G6 | 可观测性（分布式追踪） | P1 | ⚠️ 部分（内存监控已有） |
 | G7 | JSONL 回放测试框架 | P1 | ❌ 未实现 |
 | G8 | Hook 系统集成架构 | P1 | ❌ 未实现 |

 ### 前端健壮性（运行时设计标记但 RUNTIME 未覆盖，属于 DESKTOP 范围）

 | # | 项目 | 状态 |
 |---|------|------|
 | F1 | React ErrorBoundary 各面板独立 | ❌ 未实现 |
 | F2 | 中文 IME compositionstart/end | ❌ 未实现 |
 | F3 | SSE 自动重连（指数退避 + lastMessageId） | ❌ 未实现 |
 | F4 | 窗口状态持久化（electron-store） | ❌ 未实现 |
 | F5 | 状态栏在线检测 | ❌ 未实现 |
 | F6 | 安静模式/免打扰 | ❌ 未实现 |

 ---

 ## Phase 1: 上下文可插拔引擎（G1 — P0）

 **来源**: SYNOVA-ANALYSIS-对标分析 v1 Section 5
 **目标**: 上下文管理从"固定规则"升级为"可插拔引擎"。支持文件驱动的压缩策略配置，不依赖 LLM 做语义压缩时有回退路径。

 ### 1.1 新建文件

 | 文件 | 层 | 说明 |
 |------|-----|------|
 | `extensions/context-strategies/default.json` | L2 扩展 | 默认压缩策略配置（窗口大小、保留规则、降级路径） |
 | `src/orchestrator/context-engine.ts` | L2 | ContextEngine 主类：加载策略 → 评估触发条件 → 执行压缩 → 写回 |
 | `tests/orchestrator/context-engine.test.ts` | — | 5 个测试：策略加载 / LLM 可用 / LLM 降级 / 窗口溢出 / 空上下文 |

 ### 1.2 策略配置 JSON 结构

 ```json
 {
   "$id": "context-strategy/default",
   "version": 1,
   "maxTokens": 8000,
   "triggers": {
     "tokenThreshold": 6400,
     "messageCountThreshold": 40
   },
   "retention": {
     "keepSystemPrompt": true,
     "keepLastNMessages": 10,
     "keepExpertConclusions": true,
     "keepSentinelFindings": true
   },
   "fallback": {
     "whenLLMUnavailable": "truncate_oldest",
     "whenTimeout": "skip_compression"
   }
 }
 ```

 ### 1.3 ContextEngine 接口

 ```typescript
 export interface ContextEngine {
   shouldCompress(messages: Message[], tokenCount: number): boolean;
   compress(messages: Message[], tokenCount: number): Promise<CompressResult>;
   getStats(): { totalCompressions: number; avgSavings: number; degradedCount: number };
 }
 ```

 ### 1.4 接线点

 - `src/orchestrator/conversation-engine.ts` — 每次 LLM 调用前调用 `contextEngine.shouldCompress()`
 - 降级路径：LLM 不可用 → `truncate_oldest` → 保留 system prompt + 最后 10 条 + 专家结论

 ### 1.5 验收

 ```
 # 策略加载
 预期: 启动时自动加载 extensions/context-strategies/default.json

 # LLM 压缩
 预期: token > 6400 → 调用 LLM 压缩 → 上下文缩减 >= 30%

 # LLM 降级
 预期: LLM 不可用 → truncate_oldest → 上下文不超限 → degraded: true

 # 文件扩展
 预期: 新增 extensions/context-strategies/saas.json → 重启后自动加载
 ```

 ---

 ## Phase 2: IM 多平台适配器（G2 — P0）

 **来源**: SYNOVA-ANALYSIS-对标分析 v1 Section 3
 **目标**: 飞书 + 企业微信 + 钉钉三平台消息接入。统一消息格式，文件驱动平台配置。

 ### 2.1 架构

 ```
 飞书 Webhook → IM Gateway (统一鉴权+格式转换) → ConversationEngine
 WeCom Webhook ──→                                    ↓
 钉钉 Webhook ──→                               ExpertDispatcher
 ```

 ### 2.2 新建文件

 | 文件 | 层 | 说明 |
 |------|-----|------|
 | `extensions/adapters/feishu.json` | L1 配置 | 飞书应用凭证 + Webhook 配置（文件驱动，GA 可编辑） |
 | `extensions/adapters/wecom.json` | L1 配置 | 企业微信配置 |
 | `extensions/adapters/dingtalk.json` | L1 配置 | 钉钉配置 |
 | `src/services/im-gateway.ts` | L1/L2 | IM 消息网关：接收 webhook → 验签 → 格式转换 → 注入 ConversationEngine |
 | `src/routes/im-webhook.ts` | L1 | Webhook 路由：POST /api/im/feishu /wecom /dingtalk |
 | `tests/services/im-gateway.test.ts` | — | 6 个测试：验签通过/失败/格式转换/限流/多平台/未知平台 |

 ### 2.3 统一消息格式

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

 ### 2.4 接线点

 - `src/server.ts` — `app.use('/api/im', imWebhookRoutes)`
 - `src/agent/conversation-engine.ts` — 新增 `handleIMMessage(msg: IMMessage)` 入口

 ### 2.5 验收

 ```
 # 飞书消息
 预期: POST /api/im/feishu with X-Lark-Signature → 200 → 消息进入对话引擎

 # 验签失败
 预期: 签名不匹配 → 401 → 不进入引擎

 # 多平台
 预期: 飞书/WeCom/钉钉使用同一 IMGateway，消息格式统一

 # 限流
 预期: 单用户 10 条/分钟 → 429 → 不丢消息（排队）
 ```

 ---

 ## Phase 3: 升级链（G3 — P0）

 **来源**: SYNOVA-ANALYSIS-对标分析 v1 Section 11-12, PRD v3 Section 11
 **目标**: 对接人连续忽略告警后，7-14-28 天自动升级通知到上级/老板。

 ### 3.1 升级规则（文件驱动）

 `extensions/policies/escalation-rules.json`:
 ```json
 {
   "$id": "escalation-rules/default",
   "rules": [
     {
       "severity": "critical",
       "ignoreDays": 3,
       "escalateTo": "owner",
       "channels": ["electron", "email"]
     },
     {
       "severity": "warning",
       "ignoreDays": 7,
       "escalateTo": "department_head",
       "channels": ["electron"]
     },
     {
       "severity": "warning",
       "cumulativeIgnores": 3,
       "escalateTo": "owner",
       "channels": ["email"]
     },
     {
       "severity": "info",
       "cumulativeIgnores": 5,
       "escalateTo": "liaison",
       "channels": ["weekly_report"]
     }
   ]
 }
 ```

 ### 3.2 新建文件

 | 文件 | 层 | 说明 |
 |------|-----|------|
 | `extensions/policies/escalation-rules.json` | L2 配置 | 升级规则（GA 可编辑） |
 | `src/services/escalation-engine.ts` | L2 | 升级引擎：每次哨兵告警后评估升级条件 |
 | `tests/services/escalation-engine.test.ts` | — | 5 个测试：critical 忽略/累计忽略/非忽略不升级/老板路由/部门负责人路由 |

 ### 3.3 核心逻辑

 对接人的行动反馈到数据层后（哨兵值改善），自动停止升级——不是对接人点击了"已读"就停止，是数据真实改善了才停止。

 ```typescript
 interface EscalationEngine {
   evaluate(alert: SentinelAlert, ignoreCount: number, ignoreDays: number): EscalationDecision | null;
   getEscalationHistory(orgId: string, days?: number): EscalationRecord[];
 }
 ```

 ### 3.4 接线点

 - 哨兵告警通知流程中，推送前调用 `escalationEngine.evaluate()`
 - 数据改善自动停止：哨兵值恢复到正常范围 → 升级链自动终止

 ### 3.5 验收

 ```
 # critical 忽略
 预期: critical 告警 3 天未响应 → 推送老板 Electron + 邮件

 # warning 累计忽略
 预期: 同一 warning 累计忽略 3 次 → 推送老板邮件

 # 数据改善停止升级
 预期: 哨兵值恢复到正常范围 → 升级链自动终止
 ```

 ---

 ## Phase 4: 工具调用守卫 + CJK FTS5 + JSONL 回放（G4/G5/G7 — P1）

 **来源**: SYNOVA-ANALYSIS-对标分析 v1 Section 4
 **目标**: LLM 工具调用的安全防护 + 中文全文搜索 + 回归测试框架

 ### 4.1 新建文件

 | 文件 | 层 | 说明 |
 |------|-----|------|
 | `src/l3/tool-guard.ts` | L3 | 工具调用守卫：循环检测 / 重复失败阻断 / 参数校验 |
 | `extensions/frameworks/fts5-cjk-tokenizer.json` | L5 配置 | CJK 分词器配置 |
 | `tests/l3/tool-guard.test.ts` | — | 4 个测试 |
 | `tests/fixtures/jsonl/` | — | JSONL 回放测试数据目录 |
 | `tests/fixtures/runner.ts` | — | JSONL 回放执行器 |

 ### 4.2 工具守卫接口

 ```typescript
 interface ToolGuard {
   beforeCall(toolName: string, args: Record<string, unknown>, history: ToolCallRecord[]): GuardDecision;
   afterCall(toolName: string, result: unknown, duration: number): void;
   getLoopDetections(): LoopRecord[];
 }

 type GuardDecision =
   | { allow: true }
   | { allow: false; reason: 'loop_detected' | 'repeated_failure' | 'invalid_args' };
 ```

 ### 4.3 验收

 ```
 # 循环检测
 预期: 同一工具连续 3 次相同参数 → 阻断并提示

 # 重复失败
 预期: 同一工具连续失败 3 次 → 阻断，建议人工介入

 # JSONL 回放
 预期: 历史对话 JSONL → 重放 → 对比当前输出 → 发现退化
 ```

 ---

 ## 实施优先级排序

 | 顺序 | Phase | 工时 | 阻塞项 |
 |------|-------|------|--------|
 | 1 | Phase 1: 上下文可插拔引擎 | 12h | 无 |
 | 2 | Phase 3: 升级链 | 10h | 无 |
 | 3 | Phase 2: IM 多平台适配器 | 16h | 需要飞书/WeCom/钉钉开发者账号 |
 | 4 | Phase 4: 工具守卫 + CJK FTS5 + JSONL | 14h | 无 |

 **总计约 52 工时（约 7 个工作日）**

 ---

 ## 与 DESKTOP-IMPL 的关系

 前端健壮性项目（F1-F6：ErrorBoundary / IME / SSE 重连 / 窗口持久化 / 状态栏 / 安静模式）已在运行时卓越性设计中标记，但实现属于 DESKTOP-IMPL Phase 3-6 的范围。本对标补全方案聚焦后端和服务层差距，前端项目由 DESKTOP-IMPL 覆盖，不在此重复。

 ---

 ## 与 RUNTIME-IMPL 的关系

 RUNTIME-IMPL 是运行时基础设施（异常兜底、优雅关闭、WAL、速率限制、内存监控），已交付 Phase 0-5。本方案覆盖的是对标分析中发现的**产品功能差距**（上下文、IM、升级链、工具安全），与 RUNTIME 互补而非重复。

 **设计文档**: [strategy/SYNOVA-ANALYSIS-对标分析-v1-20260703.html](D:/novis-backup-20260526/Novis/synova-agent/docs/plans/codex/strategy/SYNOVA-ANALYSIS-对标分析-v1-20260703.html)
 **运行时设计**: [strategy/SYNOVA-DESIGN-运行时卓越-v2-20260701.html](D:/novis-backup-20260526/Novis/synova-agent/docs/plans/codex/strategy/SYNOVA-DESIGN-运行时卓越-v2-20260701.html)
