# 备份失败+db损坏自动告警 — P0 数据事故防线补漏

> 触发: 2026-08-27 P0 数据事故（synova.db 损坏 7 天 + 备份双重失效，静默无告警）

## 决策
1. **backup-db.sh 健康落盘**：trap EXIT 写 `.claude/backup-health.json`（成功 `status=ok`+时间戳+字节数 / 失败 `status=fail`+exit_code），落盘到仓库内可见位置——备份失败从"躲 /tmp launchd 日志无人看"变成"CTO 开工可读"。
2. **weekly-selfcheck.sh 第⑦项三查**：① backup-health.json 记录失败 → [ALERT]；② data/synova.db integrity_check ≠ ok → [ALERT]；③ iCloud 最新备份 >48h → [ALERT]。复用现有报告机制，[ALERT] 前缀区分告警 vs 文档漂移。
3. **backup-health.json 去跟踪**：运行时产物（每次备份覆盖），同 last-precommit-success 惯例 gitignore，不入 git。

## 教训（监控盲区）
备份失败 + 数据损坏本身**没有告警出口**——错误只写在 /tmp launchd 日志里，靠 CTO 偶然诊断才在 7 天后发现。运维任务的失败状态必须落到"责任人开工必读"的位置（仓库内健康文件 / 仪表盘），不能依赖"有人去看日志"。
