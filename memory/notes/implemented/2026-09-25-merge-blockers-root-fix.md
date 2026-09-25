# 决策 Note — 三件合并阻塞根治（D969，2026-09-25）

**状态**：implemented（已落位）
**日期**：2026-09-25
**决策**：① `synova-commit` 默认不再把 `.claude/bypass.log` 并入提交（改 per-session 账本，`SYNO_LEGACY_LEDGER_COMMIT=1` 可回旧行为）② 移除 `.gitattributes` 的 `merge=union` 声明 ③ `ci.yml` 的 `on.pull_request` 放开 branches 限制 ④ 补 `tests/control-tower/daily-cto-board.test.sh`
**理由**：GitHub 不执行自定义 merge driver ⇒ `union` 声明使「每个 PR 必假冲突」；`pull_request.branches=[main]` 使 base≠main 的 PR 拿不到必需检查 `Vitest (1/2)(2/2)` ⇒ 永久 405；`daily-cto-board.sh` 缺配对测试 ⇒ CT-40 堵全队本地合 main。三者合计造成 8 条 Win PR + 4 份治理文件长期无法入 main。
**影响面**：全部 PR 的合并通道；证据账本改为 per-session（本地 `.sessions/<sid>/bypass.log`，对账经 `bypass-ledger.sh sources` 取并集，语义不变）
**审计**：门禁/CI 语义变更 ⇒ **K3 事后审**（附改前/改后原始输出与改坏即红）
