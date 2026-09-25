# D975 — 三件合并阻塞根治（原 D969 改号）

## Q0: 定位
- 域: mac（控制塔/CI）
- 对象: `.gitattributes`、`scripts/control-tower/synova-commit`、`.github/workflows/ci.yml`、`.claude/reference-map.md`

## Q1: 调研
- 根因: `synova-commit` 的 U1a/D414 块每次提交把 `.claude/bypass.log` 并入索引；`.gitattributes` 声明 `merge=union`（GitHub 不执行自定义 driver）⇒ 每个 PR 判 dirty
- 附带: `ci.yml` 的 `on.pull_request.branches=[main]` ⇒ base≠main 的 PR 拿不到必需检查
- 改号: 原 D969 与 #796 撞号 ⇒ 本卡改 **D975**

## Q2: 范围
- 做: 去 union 声明、账本不入库、放开 PR 触发器、`reference-map.md` 出仓、把 `daily-cto-board.test.sh` 注册进 ci.yml 清单
- 不做: 不碰 `scripts/audit/**`、`docs/synova/audit-reports/**`、`src/**`；不保留自写弱测试（以 #796 的 33 断言版为准）

## Q3: 验收
- 入口: 任何分支提交 / 任何 PR
- 处理: 提交不再改 `.claude/bypass.log`；PR CI 对 base≠main 也触发；配对测试进 CI 清单
- 结果: `mergeable_state` 不再因账本判 dirty

## 架构层
控制塔/CI

## Done 标准
1) `git check-attr merge -- .claude/bypass.log` = `unspecified`（原 union）
2) `grep -c 'FILES+=(".claude/bypass.log")' scripts/control-tower/synova-commit` = 0
3) `ci.yml` 的 `on.pull_request` 无 branches 限制；清单含 `daily-cto-board.test.sh`
4) 与 main 的差异**不含** `.claude/bypass.log`
