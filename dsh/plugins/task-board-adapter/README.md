# @synova/task-board-adapter

把 Synova 任务体（`task-state/D###.json`，git 跟踪、仓库为准）**单向镜像**到 dsh-web-ui 任务看板。

- **回填**：启动时立即同步全部 D# 任务进看板；
- **持续**：每 5 分钟增量同步（配置 `intervalMs` 可调）；新任务自动出现，状态变化自动反映；
- **只读单向**：仓库 → 看板；从不写回 task-state（认领制/门禁不被绕过）；
- **跨机器**：task-state 是 git 单据，任一机器（Win/Mac）clone 仓库 + 装本插件即看到同一份任务。

## 安装

```bash
bash dsh/plugins/task-board-adapter/scripts/install.sh
# 然后重启 dsh web，刷新浏览器
```

等效官方方式（推荐，需 pnpm）：`dsh plugin --profile web add file:$(pwd)/dsh/plugins/task-board-adapter`

## 状态映射

| Synova 状态 | 看板列 | 说明 |
|---|---|---|
| spec_done | todo | 规格定，待开工 |
| claimed | running | 已认领 |
| impl_done | running | 代码写完未过 K3 审计（防假完成，创始人已确认） |
| audited | done | K3 审完 |
| failed | failed | — |
| 其他 | todo | 未知状态落入待办并告警 |

映射可在 profile patch 层通过 `config.statusMapping` 覆盖。

## 配置（cordis.patch.yml 的 config）

| 键 | 默认 | 说明 |
|---|---|---|
| repoRoot | process.cwd()（launchd 下为 /Users/wane/SynovaAgent） | Synova 仓库根 |
| apiBase | http://127.0.0.1:3080 | dsh web 地址（任务板 API） |
| intervalMs | 300000 | 同步间隔（ms） |
| statusMapping | 见上表 | 覆盖映射 |

## 同步机制（为什么安全）

- 写入走任务板官方 loopback API 的 `import` 动作（同源门禁：本机 socket + Host + Origin 标记，适配器是合法调用方）；
- `import` 按任务 id（D#）合并、updatedAt 新者胜 → 每次同步以新 sourceId 全量导入，镜像始终收敛；
- requestId 幂等（任务板 256 指纹缓存），重试安全；
- 不直接写账本文件（Host 持锁），不 fork 上游，不碰仓库。

## 验证

```bash
npm test            # node --test（正常/降级/边界 14 例）
# 集成：同步后读取 ~/.dsh/task-board/ledger-v2.json 与 task-state/ 对账
```

## 回滚

- 移除 bundle：`dsh plugin --profile web remove @synova/task-board-adapter`（或手动删 cordis.patch.yml 条目 + node_modules 目录）；
- 看板任务清理：任务板 UI 归档/删除（适配器不写回仓库，无仓库侧残留）。
