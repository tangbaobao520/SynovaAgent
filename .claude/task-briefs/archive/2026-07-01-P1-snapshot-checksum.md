# Task Brief: Phase P1 — 快照校验 + 回滚验证（checksum）

> 生成: 2026-07-01 | 分支: feat/prompt-architecture | ARCH-13 §6.5 风险控制

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 横向（修改已有包）— packages/evolution/src/rule-version-manager.ts

本任务给 RuleVersionManager 添加三道防护：
1. **写时校验**：createSnapshot 计算 SHA256 checksum 随快照存储
2. **读时校验**：listSnapshots 标记损坏快照（checksum 不匹配）
3. **回滚验证**：rollbackTo 执行前验证 checksum，损坏则拒绝回滚

- 性质：加固（不改变已有接口签名，只加校验逻辑）
- 为什么现在做：快照是目前唯一回滚机制，如果快照数据被静默损坏，回滚会写入错误数据，不可逆

### b) 文件审计
- `packages/evolution/src/rule-version-manager.ts` — 唯一修改文件
- `packages/evolution/src/rule-version-manager.ts:24-38` — SnapshotEntry 接口，需加 checksum
- `packages/evolution/src/rule-version-manager.ts:166-173` — createSnapshot 序列化，需改
- `packages/evolution/src/rule-version-manager.ts:206-230` — listSnapshots，需加校验
- `packages/evolution/src/rule-version-manager.ts:231-...` — rollbackTo，需加校验

关系：加固（只改一个文件）

### c) 决策
无冲突。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链

1. **问题**：快照数据存储在 AgentMemoryStore 中，存储层不保证数据完整性。如果写入时进程崩溃（部分写入）、磁盘损坏、或 AgentMemoryStore 升级改了序列化格式，快照数据可能静默损坏。
2. **为什么不依赖 AgentMemoryStore 的完整性**：AgentMemoryStore 是 KV 存储，不提供 checksum/校验功能。完整性是调用方的责任。
3. **为什么用 SHA256**：Node.js 内置 `crypto.createHash('sha256')`，零依赖。快照通常小于 100KB，SHA256 计算时间 <1ms。

引用依据：
- 铁律 24+31: 降级信号（checksum 不匹配 → log.error + 明确错误信息，不静默恢复）
- 铁律 35: 自动化优先 — 写入时自动计算 checksum，不需要手动操作
- ARCH-13 §6.5: 规则冲突检测 — 损坏检测是规则冲突的前置条件

### b) 本任务执行约束
- rule: "checksum 必须在数据序列化后计算，非序列化前（防止序列化不一致）"
  verify: "grep -q 'JSON.stringify.*createHash\|createHash.*JSON.stringify' packages/evolution/src/rule-version-manager.ts"
- rule: "listSnapshots 必须检测并报告损坏快照（不静默忽略）"
  verify: "grep -q 'checksum.*verify\|verify.*checksum\|corrupt\|损坏' packages/evolution/src/rule-version-manager.ts"
- rule: "rollbackTo 必须拒绝 checksum 不匹配的快照"
  verify: "grep -q 'checksum.*mismatch\|checksum.*不匹配\|corrupt\|拒绝' packages/evolution/src/rule-version-manager.ts"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. `SnapshotEntry` 接口新增 `checksum?: string` 可选字段（向后兼容旧快照）
2. `createSnapshot()` 在序列化数据后计算 SHA256，存入 checksum 字段
3. `writeSnapshot()` 新增私有方法：序列化 → checksum → 存储
4. `verifyChecksum(snapshot)` 新增方法：重新计算 data 的 SHA256，与存储的 checksum 对比
5. `listSnapshots()` 列出时计算 checksum，在返回结果中标记损坏状态
6. `rollbackTo()` 在恢复前调用 verifyChecksum，不匹配则返回 errors

不做什么：
- 不改 packages/evolution/src/rule-version-manager.ts（SnapshotEntry 接口） 已有字段（向后兼容）
- 不改 createSnapshot/listSnapshots/rollbackTo 的外部签名
- 不改 src/l4/agent-memory-store.ts
- 不改其他模块

## Q3: 验收 — 入口 → 交互 → 结果

入口：createSnapshot() 写 → listSnapshots() 读 → 验证 checksum
处理：SHA256(data) == stored checksum
结果：损坏的快照在 listSnapshots 中被标记，rollbackTo 拒绝执行

## 本任务在哪一层
L0（packages/evolution/）

## Done 标准
- [x] verify: grep -q 'checksum' packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'createHash' packages/evolution/src/rule-version-manager.ts
- [x] verify: grep -q 'verifyChecksum' packages/evolution/src/rule-version-manager.ts && grep -q 'corrupt' packages/evolution/src/rule-version-manager.ts
- [x] verify: npx tsc --noEmit 2>&1 | grep 'rule-version'; test $? -eq 1
- [x] verify: npx vitest run tests/evolution/rule-version-manager.test.ts 2>&1 | tail -5 | grep -q 'Tests'
