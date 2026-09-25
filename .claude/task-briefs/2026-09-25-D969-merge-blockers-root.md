# D969 — 三件合并阻塞根治

## Q0: 定位
- 域: mac（控制塔/CI）
- 对象: `scripts/control-tower/synova-commit`、`.gitattributes`、`.github/workflows/ci.yml`、`tests/control-tower/daily-cto-board.test.sh`

## Q1: 调研
- 根因①: `synova-commit` D414 每次提交 `git add .claude/bypass.log` → 全分支必改该文件；而 GitHub 不执行 `.gitattributes` 的 merge=union（自定义 driver 仅本地 `.git/config` 生效）→ 退回三方合并 → 任何 PR 判 dirty
- 根因②: `ci.yml` `on.pull_request.branches=[main]` → base≠main 的 PR 无 CI，而 `Vitest (1/2)`/`Vitest (2/2)` 是必需检查 → 永久 405「2 expected」
- 根因③: `daily-cto-board.sh` 在 main 但缺 `tests/control-tower/daily-cto-board.test.sh` → CT-40 硬门禁堵住所有人「把 main 合进自己分支」

## Q2: 范围
- 做: 上述四项文件的最小必要改动 + 配对测试 + 声明源
- 不做: `scripts/audit/**`、`docs/synova/audit-reports/**`、`src/**`；不改 K3/审计标准

## Q3: 验收
- 入口: 任何 PR 的分支
- 处理: 提交不再改 `.claude/bypass.log`；PR CI 对 base≠main 也触发；CT-40 对 daily-cto-board 绿
- 结果: GitHub `mergeable_state` 不再因 bypass.log 判 dirty

## 架构层
控制塔/CI（非五层产品码）

## Done 标准
1) `git check-attr merge -- .claude/bypass.log` 不再返回 union
2) 新分支提交后 `git diff origin/main --name-only` **不含** `.claude/bypass.log`
3) `ci.yml` 的 `on.pull_request` 无 branches 限制
4) `bash tests/control-tower/daily-cto-board.test.sh` 全绿（CT-40 配对命中）
