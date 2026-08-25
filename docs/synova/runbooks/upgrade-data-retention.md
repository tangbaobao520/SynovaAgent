# Runbook: 升级/重装不丢数据（D528，验证点 1-7）

> 目标: 升级/重装桌面端后 `data/synova.db` 物理完好（表/内容/md5 前后一致）——企业数据安全底线。
> 归属: D528（slice L1-C）。K3 审计员可按本 runbook 独立重跑（1-8 复核）。

## 1. 数据目录隔离契约（为什么升级不清数据）

- **物理隔离**: 数据在系统数据目录（userData），安装包只写 `.app`/安装目录——两者物理不相交，升级（替换 .app）不触碰 userData。
  - macOS 实测: `~/Library/Application Support/synova-agent/`（切片 A mac-install-verify.sh 实测，目录名与 productName 不一致——以实测为准）
  - Windows: `%APPDATA%\synova-agent\`（待 win 实测确认——D523 后补测，诚实标注）
- **注入链路**（既有，本 D 实测验证）:
  `electron/main.cjs`（prod dbPath = `app.getPath('userData')/data/synova.db`）
  → `electron/backend-spawn.cjs`（env `SYNOVA_DB_PATH` 注入）
  → `src/config.ts`（只读消费）。
- userData 内资产: `data/synova.db`（SQLite 领域数据）+ `logs/`（运行日志）。

## 2. 安装包升级语义事实表（electron-builder；实测为准，spec §12）

| 路径 | 数据影响 |
|---|---|
| macOS dmg 拖拽/覆盖安装（替换 `/Applications/SynovaAgent.app`） | `~/Library/Application Support/synova-agent/` 不动 ✅ |
| macOS 卸载重装（删 .app 再装） | 数据仍在 userData ✅ |
| Windows NSIS 覆盖安装（更高版本安装器） | 保留 `%APPDATA%\synova-agent\` ✅（默认） |
| Windows NSIS 卸载后重装 | 卸载器默认**不删** userData（`deleteAppDataOnUninstall` 未配置 = false）→ 数据保留 ✅ |
| **会清数据** | 手动删 userData 目录 / 重装系统 / 显式配置 `deleteAppDataOnUninstall: true`（当前未配置） |

- `build-synova.cjs` NSIS 段（oneClick:false + allowToChangeInstallationDirectory:true）无清数据配置——默认保留，**零改动**（D528 实测确认默认行为满足，条件性改动未触发）。
- win 侧升级语义待 win 安装包实测补证（本 runbook 诚实标注；mac 侧由 §3 脚本物理实测）。

## 3. 升级实测（物理断言，可复现幂等）

```bash
# 前置: release/ 下有 dmg（npm run build:backend && electron-renderer build && electron-builder --mac）
bash scripts/desktop/upgrade-data-verify.sh --dry-run          # 契约自检（零副作用 exit 0）
bash scripts/desktop/upgrade-data-verify.sh                    # 完整实测（缺 dmg/工具 → exit 2）
bash scripts/desktop/upgrade-data-verify.sh --installer release/<产物>.dmg
```

流程: 装 v1（临时安装位，不污染 /Applications）→ 造数据（服务写临时 userData 库 + sqlite3 注入哨兵基线/企业事实行）→ 升级 v2（同 dmg 覆盖安装，保留 userData）→ 断言:
- `sqlite3 .tables`（sqlite_master）表清单前后一致
- 关键表行数一致（agent_memory / sessions / sentinel_baseline）
- db 文件 **md5 前后一致**
- `PRAGMA integrity_check` = ok

产物: `scripts/golden-scenarios/evidence/upgrade-data-<date>-<ts>/`（表清单/行数/md5/integrity/summary 断言原文——P2-2 指纹落盘，非 task-state 单一副本）。

> 说明: v1/v2 用同一 dmg 两次安装模拟覆盖安装（覆盖路径语义等价：第二次 cp 替换 .app、userData 不动）。真实双版本（v1.0 → v1.1）升级需两次构建，语义相同。

## 4. 边界与降级

- **多实例保护（D528 实装）**: `electron/main.cjs` `app.requestSingleInstanceLock()`——二次启动实例直接退出，首实例 `second-instance` 事件聚焦已有窗口。防止双开后端写同一 SQLite。lock API 异常 → try/catch + log，不阻断首实例（铁律 24）。
- **db 损坏降级链路**（既有，验证）: db 损坏 → 服务起不来 → `ensureBackend` probeUntil 失败 → `{ started:false, degraded:true, error }` → main.cjs offline 页（显式提示 + console.error）。`upgrade-data-verify.sh` 造数据段 healthz 120s 未就绪即如实 die + server 日志落 evidence（不静默）。
- **备份**: 真实库每日 03:30 `scripts/backup/backup-db.sh`（launchd，铁律 0-4）；本脚本全程临时库，真实 userData 零触碰。

## 5. K3 复核路径

1. `bash scripts/desktop/upgrade-data-verify.sh --dry-run` → exit 0
2. `bash scripts/desktop/upgrade-data-verify.sh`（有 dmg 时）→ exit 0 + `evidence/upgrade-data-*/summary.txt` 含 `verdict: DATA_RETAINED`
3. `npx vitest run tests/electron/upgrade-data-verify.test.ts` → 9/9 绿
4. `grep -n "requestSingleInstanceLock\|second-instance" electron/main.cjs` → 单实例锁在位
