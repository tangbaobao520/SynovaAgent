# Task Brief: RUNTIME Phase 5 — 内存监控 + 关闭取证 + 双FTS5 + 凭据轮换

> 生成: 2026-07-03 | 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §Phase 5
> 交付: worktree session-02 → PR → feat/prompt-architecture

## Q0: 定位

### a) 项目拼图
本任务属于**纵向（基础设施）**。

5 个子任务：
- **5.2 双FTS5** → L4（agent-memory-store.ts 本体层）
- **5.3 内存监控** → 横切（src/services/memory-monitor.ts）+ L1（src/server.ts）
- **5.4 关闭取证** → L1（src/server.ts shutdown）
- **5.5 凭据池轮换** → 横切（src/providers/registry.ts ProviderChain）

5.1（自动更新）本次不做，属 Electron 桌面端范围，非运行时核心。

现有模块：
- `src/l4/agent-memory-store.ts` — 已有 FTS5 表 `agent_messages_fts`，但只用于消息搜索。agent_memory 表无 FTS5
- `src/providers/registry.ts` — 已有 ProviderChain failover（顺序降级），无凭据池轮换
- `src/server.ts` — 已有 Phase 0 全局错误处理器 + SIGTERM/SIGINT 处理，无关闭取证

### b) 文件审计
grep `memory.*monitor\|MemoryMonitor` → 零结果。
grep `trigram\|unicode61\|_containsCJK` → 零结果。
grep `credential.*pool\|credentialPool\|rotateC\|exhausted` → 零结果。

### c) 决策
新建 1 文件 + 修改 4 文件。5.1 排除。

## Q1: 调研

决策链: SPEC → 测试 → 实现 → 接线 → 验证
引用: 铁律 0-2, 7, 24, 31, 38

执行约束:
- rule: "memory-monitor 5分钟间隔 log RSS"
  verify: "grep -n '300000\|5.*min\|process.memoryUsage' src/services/memory-monitor.ts"
- rule: "关闭取证输出 signal/pid/uptime/memory/timestamp"
  verify: "grep -n 'signal.*pid.*uptime\|forensics' src/server.ts"
- rule: "FTS5 必须建两个虚拟表（unicode61 + trigram）"
  verify: "grep -n 'memory_fts\|memory_fts_trigram' src/l4/agent-memory-store.ts"
- rule: "凭据池 401/429 自动轮换"
  verify: "grep -n '401\|429\|exhausted\|rotate' src/providers/registry.ts"

## Q2: 范围

做什么：

5.2 双FTS5：
- agent-memory-store.ts initSchema() 创建 memory_fts (unicode61) 和 memory_fts_trigram (trigram)
- remember() 写入时同步索引到两个 FTS5 表
- 新增 searchMemory(query) 方法，_containsCJK() 自动路由

5.3 内存监控：
- 新建 src/services/memory-monitor.ts
- 启动时 log 基线，每 5 分钟 log RSS，关闭时 log 最终快照
- process.memoryUsage() 不可用时 WARNING 后禁用

5.4 关闭取证：
- server.ts shutdown() 输出 { signal, pid, uptime, memory, timestamp }

5.5 凭据池轮换：
- registry.ts 新增 CredentialPool 类
- 多 API key 池，401/429 标记当前 key exhausted 并轮换
- 单 entry 池无法轮换则 fallback
- Per-entry 耗尽冷却

不做什么：
- ❌ 5.1 自动更新（Electron 桌面端范围）
- ❌ 不涉及 engine-core
- ❌ 不使用 as any

## Q3: 验收

5.2：搜索 "现金流" 能匹配 "现金流动"
5.3：每 5 分钟日志出现 [MEMORY] 条目
5.4：SIGTERM 后日志输出 forensics 对象
5.5：两个 API Key 第一个 429 自动切到第二个

## 本任务在哪一层
横切 L1+L4+providers

## Done 标准
- [ ] FTS5 两个虚拟表在 agent-memory-store initSchema 中创建
- [ ] memory-monitor 5 分钟定时器在 server.ts 注册
- [ ] shutdown forensics 包含 5 个字段
- [ ] CredentialPool 轮换逻辑可测试
- [ ] tsc 零错误
- [ ] vitest 零失败
- [ ] pre-commit 8 组通过
- [ ] PR → CI success
