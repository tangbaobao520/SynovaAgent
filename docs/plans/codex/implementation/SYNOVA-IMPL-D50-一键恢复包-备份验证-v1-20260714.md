# SynovaAgent — D50 一键恢复包+备份验证 实施方案 v1.0

> 2026-07-14 | 第9份权威文档（部署运维）第四章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- 分支: `feat/prompt-architecture`
- D47: 数据目录注册 ✅ (`src/deploy/data-directory.ts`)
- D48: 静默升级+版本回滚 ✅ (`src/deploy/rollback.ts` — 已有 SnapshotResult/RollbackResult 类型)
- D49: 独立看门狗+三层监控 ✅
- 可复用基建（grep验证过的真实接口）:
  - `src/deploy/rollback.ts:22` — `SnapshotResult {path, created, size, error?}` — D50复用
  - `src/deploy/rollback.ts:30` — `RollbackResult {success, available, warnings, path?, error?}` — D50复用
  - `src/deploy/data-directory.ts` — `getDataDirectory()` — D50 数据源定位
  - D49 `system-health.ts:44` — `BackupInfo {lastBackupAt, success, sizeBytes, detail?}` — D50填充此类型
- 不可复用的旧代码: 无（D50是全新模块，D48 rollback是升级回滚，D50是数据备份恢复——两个不同场景）
- 权威文档 §4.1 核心哲学: "降维到用户自救——一个加密自解压恢复包。不用复杂的增量备份策略。"

---

## 做了什么

### 1. src/deploy/recovery-pack.ts — 一键恢复包生成器（新建）

**核心设计哲学**（权威文档§4.1）: 本地SQLite数据库几MB到几百MB，不需要增量/WAL/checksum复杂策略。用户最怕系统打不开且完全没自救能力。

**RecoveryPackBuilder 类:**
```typescript
// 生成加密恢复包
createRecoveryPack(password: string): RecoveryPackResult
// 验证恢复包完整性
verifyRecoveryPack(packPath: string, password: string): VerifyResult
// 从恢复包恢复数据
restoreFromPack(packPath: string, password: string, targetDir?: string): RestoreResult
```

**包内容**（权威文档§4.2）:
- `synova.db` — SQLite数据库单文件
- `config.yaml` — 配置（API keys脱敏，结构保留）
- `baselines/` — 哨兵基线数据
- `version.txt` — 当前版本号
- `.pack-meta.json` — 元数据（生成时间/源数据目录/checksum）

**加密**: AES-256-CBC，密码为用户设定的恢复密码（首次安装设）。加密后为自包含二进制包（.synova-recovery 扩展名）。

**生成频率**: 每24小时自动。错过窗口→设备下次在线立即生成。手动触发支持。

### 2. src/deploy/backup-scheduler.ts — 备份调度器（新建）

**机会窗口备份策略**（权威文档§4.3）:
```typescript
class BackupScheduler {
  schedule(): void           // 注册24小时间隔定时器
  checkMissedWindow(): void  // 启动时检测是否错过→立即执行
  triggerManual(): void      // 手动触发
  getStatus(): BackupStatus  // 查询最近备份状态
}
```

- 触发: window.setInterval(24h)。启动时 checkMissedWindow() 补齐
- 失败: 连续3次→下次在线推送"备份已延迟X天，建议手动触发"
- 保留: 本地最近5个，远程最近30个，自动滚动删除

### 3. src/deploy/backup-verify.ts — 备份验证器（新建）

**本地月度验证**（权威文档§4.4）:
```typescript
verifyLocalBackup(packPath: string, password: string): VerifyResult
// 自动解压 → SQLite PRAGMA integrity_check → YAML语法 → checksum
```

**远程可用性探测**: 每周1次，下载加密包的元数据块（<1KB），验证checksum和完整性签名。

### 4. src/server.ts — 备份API路由（修改）

新增端点:
```
POST /api/backup/create          — 手动触发备份包生成
GET  /api/backup/status           — 查询备份状态
POST /api/backup/restore          — 从恢复包恢复数据（需管理员权限）
POST /api/backup/verify           — 验证指定恢复包
```

通过 PolicyEngine(D38) 保护 restore 端点（仅 GA 角色）。

### 5. D49 system-health.ts 修复 — 填充 BackupInfo（修改）

`collectLastBackup()` 当前返回 `null`。D50完成后改为读取最新恢复包元数据，返回 `BackupInfo` 结构。

---

## 不做什么

- 不做增量备份（权威文档明确"不要复杂的增量备份策略"）
- 不做WAL增量/checksum验证/DR演练（过度设计）
- 不实现远程推送（WebDAV/S3/NAS — D52规模化运维处理）
- 不修改 D48 rollback.ts（快照回滚和恢复包是两个独立机制）
- 不修改 D47 data-directory.ts

---

## 架构层

L4（部署基础设施: `src/deploy/recovery-pack.ts` + `backup-scheduler.ts` + `backup-verify.ts`）+ L1（交互: routes/backup.ts）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | recovery-pack.ts | 3h | 核心加密打包+解包逻辑 |
| 2 | backup-verify.ts | 1.5h | 验证逻辑（复用车轮） |
| 3 | backup-scheduler.ts | 1.5h | 调度+机会窗口 |
| 4 | routes/backup.ts + server.ts | 1h | API+接线 |
| 5 | 修复 system-health.ts BackupInfo | 0.5h | D49补充 |
| 6 | 测试文件 | 2h | 3个测试文件 |

**总工时: 9.5h（约1.5工作日）**

---

## 完成标准

```
[ ] recovery-pack.ts: createRecoveryPack — 加密打包(AES-256) + .synova-recovery扩展名
[ ] recovery-pack.ts: verifyRecoveryPack — 解密+checksum验证+元数据解析
[ ] recovery-pack.ts: restoreFromPack — 解密→解压→验证→释放到D47数据目录
[ ] recovery-pack.ts: 解密失败→明确错误提示，不崩溃
[ ] backup-scheduler.ts: 24小时间隔 + checkMissedWindow补齐
[ ] backup-scheduler.ts: 连续3次失败→推送通知"备份已延迟"
[ ] backup-scheduler.ts: 本地保留5个+自动滚动删除
[ ] backup-verify.ts: SQLite PRAGMA integrity_check + YAML语法 + checksum
[ ] backup-verify.ts: 远程头部探测(<1KB) + 每周1次
[ ] routes/backup.ts: create/status/restore/verify 4个端点
[ ] routes/backup.ts: restore端点 PolicyEngine权限保护（仅GA）
[ ] system-health.ts: collectLastBackup() 返回实际BackupInfo
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=15测试: recovery-pack 6(打包/验证/恢复/解密失败/空密码/损坏包) + scheduler 5(正常/错过窗口/3次失败/手动/状态) + verify 4(本地/远程/checksum失败/YAML语法)
```

---

## 权威文档引用

- 第9份权威文档: 部署运维权威规范 第四章（备份与灾难恢复）
  - §4.1: 设计哲学 — 降维到用户自救
  - §4.2: 一键灾难恢复包 — 内容/加密/推送/恢复
  - §4.3: 机会窗口备份策略 — 触发/失败/保留
  - §4.4: 恢复包验证机制 — 本地月度+远程头部探测
  - §4.5: 恢复Runbook（用户版） — 5步恢复流程

- 代码依赖（grep验证过的真实接口）:
  - `src/deploy/rollback.ts:22` — `SnapshotResult` 类型
  - `src/deploy/rollback.ts:30` — `RollbackResult` 类型
  - `src/deploy/data-directory.ts` — `getDataDirectory()`
  - `src/monitoring/system-health.ts:44` — `BackupInfo` 接口