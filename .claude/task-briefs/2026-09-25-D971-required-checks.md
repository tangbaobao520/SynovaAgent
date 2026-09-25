# Task Brief: D971 — 必需检查三路修复 + 队列并发控制 + 对账探针
> 认领: 🧭 coder-a（并行 CTO 小队 A）｜ 分支: fix/d971-required-checks ｜ 基线: origin/main 481805a8
#CRITERIA: A

## Q0: 定位
### a) 拼图
CI 必需检查体系（`.github/workflows/ci.yml` + branch protection 12 个 required contexts）。本卡修「必需检查结构性无法满足」+ 补栈式 PR 触发面 + 抑制队列积压 + 落**必需检查对账探针**（三条对账机制之一）。
### b) 文件审计
- `ci.yml:105-111` `test` job `needs: quality`；`golden-case` job `needs: test`。两者**都是必需 context**（`Vitest (1/2)`/`(2/2)`、`Golden Case F1 Gate`）。
- 触发面：`push.branches=[main, feat/*]` + `pull_request.branches=[main]`。
- 现存探针目录约定：`scripts/control-tower/probes/*-probe.sh`（D969 已给看板加通用 runner）。
### c) 决策
按 D333 四步（见 Q1c）选 **乙**（保留 `needs` 语义 + `if: always()`）而非甲（删 `needs`）：既保证必需 context **必被实际报告**，又不放弃「quality 红时不白跑 vitest」。

## Q1: 调研
铁律 11/31（降级显式）、铁律 47（契约优先）、ctrl-tower 模式 1（三态退出码）、D971 卡面已实测前提（活体证据 A/B/C + 真病根 1–4）。
历史教训：D515（CI 瘦身只跳 step 不跳 job）、D708（写集对账夹带）、D973（`--list` 无条件 exit 0 被 verifier 退回）、D970（`.claude/bypass.log` 出库后的 modify/delete 冲突配方）。

### Q1c: 决策参考系（D333 四步）
- **①第一性原理**：branch protection 匹配的是**实际上报的 check 名**；job 被 skip ⇒ 名字停在字面未展开的 `Vitest (${{ matrix.shard }})` ⇒ 必需 context 结构性缺失（与触发器无关）。
- **②Anthropic 基线**：门禁必须「可报告 + 可对账」；失败要显式而非消失。`if: always()` + 首步显式 gate 正是「错误显式化」。
- **③开源实证**：GitHub Actions 官方语义——`needs` 默认要求上游 `success()`，`if: always()` 是解除该隐含条件的标准手法；`concurrency.cancel-in-progress` 排除 main 是官方推荐写法（`github.ref != 'refs/heads/main'`）。
- **④收敛检查**：改动面最小（不动 job 名、不动必需 context 清单、不动其它 job）+ 由新增探针把「声明 vs 实际」变成可对账 DRIFT。
- **结论**：`参考：第一性原理 + Anthropic 基线 + GitHub 官方语义 + 收敛检查 + 结论：乙（needs + if: always() + 首步 gate）+ 触发面不加白名单 + concurrency 排除 main`。

## Q2: 范围 — 最简方案
做什么：
- .github/workflows/ci.yml
- scripts/control-tower/probes/required-checks-probe.sh
- tests/control-tower/required-checks-probe.test.sh
不做什么（含文件路径）：
- 不改 scripts/control-tower/daily-cto-board.sh （D969 单写者；探针由它的通用 runner 自动发现）
- 不改 .claude/bypass.log （D970 单写者；本卡仅在出库冲突时按 CTO 配方接受其删除侧）
- 不改 docs/authority/bypass-ledger-archive/README.md （D970 归档写集；本卡不碰）
- 不改 scripts/audit/k3-batch-gate.sh （K3 专属域，禁碰）
- 不改 docs/synova/audit-reports/INDEX.md （K3 审计报告域）

## Q3: 验收
入口: CI 每个 PR 的 check-runs（必需 context 是否被实际报告）；`bash scripts/control-tower/probes/required-checks-probe.sh` 独立复跑。
处理: `test`/`golden-case` 改 `if: always()` + 首步显式 gate；`pull_request` 不限 base；顶层 `concurrency` 取消被取代的 run（main 除外）。
结果: 必需 12 context 在每个 PR 上都被**实际报告**（success/failure 皆可）；探针把「声明 vs 实际」对账为 OK/DRIFT/DEGRADED 三态。

## 架构层: 基础设施（CI/控制塔探针）
## Done 标准
- [ ] verify: `bash tests/control-tower/required-checks-probe.test.sh`（exit 0，18 断言全绿）
- [ ] verify: `SYNO_PROBE_FIXTURE_DIR=<夹具> bash scripts/control-tower/probes/required-checks-probe.sh`（DRIFT 夹具 → exit 1）
- [ ] verify: `node -e 'require("js-yaml").load(require("fs").readFileSync(".github/workflows/ci.yml","utf8"))'`（解析通过）
- [ ] verify: `bash scripts/control-tower/probes/required-checks-probe.sh`（真实 API → `REQUIRED-CHECKS: OK`，12/12）
- [ ] verify: `bash scripts/workflow/check-silent-swallow.sh --diff`（exit 0，无新增静默吞错）
