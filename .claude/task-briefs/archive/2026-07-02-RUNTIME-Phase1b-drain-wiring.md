# Task Brief: RUNTIME Phase 1b — drain 真实逻辑 + noteActive 接线

> 生成: 2026-07-02 | 分支: feat/prompt-architecture
> 来源: codex 审查 Phase 1 — 4 项未完成修复
> 交付链路: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

### a) 项目拼图
修复 Phase 1 优雅关闭和启动恢复的 4 项缺陷：

| # | 缺陷 | 影响 | 修复方案 |
|---|------|------|---------|
| 1 | noteActive() 从未被调用 | GracefulShutdown 的 Map 永远为空，drain 永远空排 | 加全局单例 + ConversationEngine 创建会话时注册 |
| 2 | drain() 核心逻辑全是 // Future 注释 | 不通知用户、不保存检查点 | 实现 addMessage + saveDiagnosisCheckpoint |
| 3 | ExpertDispatcher 未扫描 | 崩溃后专家推理丢失 | restart-recovery 扫描未完成专家推理 |
| 4 | DB/LLM 关闭未实现 | 进程退出前 FSYNC 不可靠 | drain 时 WAL checkpoint(try-catch) |

参考实现: OpenClaw active-sessions-shutdown-tracker.ts 的 noteActive/forgetActive 模式

### b) 文件审计
- `src/services/graceful-shutdown.ts` — 已重写 drain() 接受 store 参数，+ 全局 getter
- `src/services/restart-recovery.ts` — 需添加专家推理扫描
- `src/agent/synova-agent.ts` — stop() 需传 store 给 drain()
- `src/agent/conversation-engine.ts` — 需在会话开始/结束处 noteActive/forgetActive
- `src/services/request-context.ts` — 检查是否有会话 ID 上下文

### c) 决策
扩展已有文件，不新建。

## Q1: 调研 — 决策链 + 执行约束

决策链: SPEC → 测试 → 实现 → 接线 → 验证
引用: 铁律 0-2(spec→test→impl), 铁律 7(入口→链路→结果), 铁律 24(log), 铁律 31(degraded), 铁律 38(零 as any)

执行约束:
- rule: "drain() 必须向活跃会话注入 '服务正在重启' 系统消息"
  verify: "grep -n '正在重启\|addMessage' src/services/graceful-shutdown.ts"
- rule: "noteActive 必须在 ConversationEngine 中被调用"
  verify: "grep -rn 'noteActive\|getGlobalGracefulShutdown' src/agent/conversation-engine.ts"
- rule: "synova-agent.ts stop() 必须传 SessionStore 给 drain()"
  verify: "grep -n 'drain.*SessionStore\|drain.*store' src/agent/synova-agent.ts"

## Q2: 范围

做什么：
1. graceful-shutdown.ts — 已完成重写：drain(store) 实现通知+检查点，全局 getter
2. synova-agent.ts — stop() 传入 sessionStore.drain(sessionStore)
3. conversation-engine.ts — 构造/析构时 noteActive/forgetActive
4. restart-recovery.ts — 增加专家推理扫描结果字段

不做什么：
- ❌ 不改 src/orchestrator/conversation-engine.ts 内部逻辑（只加注册/注销）
- ❌ 不改其他模块（cli.ts, tui, routes 等—后续迭代）
- ❌ 不涉及 LLM AbortController（需要独立的基础设施）
- ❌ 不使用 as any

## Q3: 验收

入口: GracefulShutdown.drain() 被 stop() 调用且传入 SessionStore
处理: drain 遍历会话 → addMessage → saveDiagnosisCheckpoint → clear
结果: 日志显示 "排干 X 个活跃会话" + 每个会话收到系统消息 + 检查点持久化

## 本任务在哪一层
L2（synova-agent.ts + conversation-engine.ts 编排层）

## Done 标准
- [ ] drain() 调用 store.addMessage（非注释）
- [ ] drain() 调用 store.saveDiagnosisCheckpoint
- [ ] noteActive 在 conversation-engine.ts 中被调用
- [ ] tsc --noEmit 零错误
- [ ] 测试通过
- [ ] pre-commit 通过
- [ ] CI success
