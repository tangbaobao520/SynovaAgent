# Task Brief: D970 — D735 Stage 2 bypass 账本出库（证据链保全；门禁语义变更→K3 事后审）
> 认领: 🧭 coder-a（并行 CTO 小队 A）｜ 分支: fix/d970-bypass-ledger-stage2 ｜ 基线: origin/main 057d8ca0
#CRITERIA: A

## Q0: 定位
### a) 拼图
D735 分两阶段把 bypass 证据账本移出 git。**Stage 1（PR #541 / e484ae8b）已并入 main**（per-session 落点 + 双写兼容）。本卡 = **Stage 2**：停写旧路径 + 删除影子登记提交 + 旧路径出库 + 历史证据冻结归档。它是 **5 条 dirty PR 的唯一根因修复**。
### b) 文件审计
- `.gitattributes:14` 声明 `.claude/bypass.log merge=union`（:8/:16 是**注释**，属性行共 2 条：:14 与 :20）。
- `post-commit.sh` 双写（旧路径直写 + `bypass-ledger.sh append`）且每次提交跟一个影子登记提交（D521/CT-43）。
- `bypass-ledger.sh`（Stage 1）已提供 `path/append/sources/read` 四子命令。
- 复现要点（verifier 证实）: `git merge-tree --write-tree` **读 worktree 的 `.gitattributes`**。
### c) 决策
`union` 在 GitHub 服务端**不生效**（本地 git 生效 ⇒ 本地 merge-tree 骗了我们）。⇒ 出库（去根因），不做「重算清障」；证据链改用**冻结归档**承载（下见 Q1c）。

## Q1: 调研
铁律 11/31（降级显式不静默）、铁律 47（契约优先）、ctrl-tower 模式 1（三态退出码）、模式 5（env 注入缝做测试隔离）、D370（`$VAR` 紧贴全角标点）。
历史教训：D331（证据链对账）、D451（纯补记豁免）、D508/D513（陈旧 tracking ref 致补记循环）、D521/CT-43（影子登记提交）、D524/D530 CT-45（Gatekeeper 熔断误伤）、D735 Stage 1（本 Note）。

### Q1c: 决策参考系（D333 四步）
- **①第一性原理**：证据必须能被任意 clone 读到；「多写者写同一个被跟踪文件」本身就是冲突根因。
- **②Anthropic 基线**：运行期产物与版本化产物分离；不可变 + 可核。
- **③开源实证**：追踪型 append-only 共享日志在并发分支下必然需要 `union` 之类补丁 → 已知反模式。
- **④收敛检查**：本卡硬要求 `check-bypass-log.sh` **语义不变** ⇒ 不能在本卡改判据 ⇒ 选 **甲（冻结归档）**，并把「未来跨机缺口」**显式登记**。
- **结论**：`参考：第一性原理 + Anthropic 基线 + 开源实证 + 收敛检查 + 结论：选甲（冻结归档）+ 显式登记缺口`。

## Q2: 范围 — 最简方案
做什么：
- .gitattributes
- .gitignore
- scripts/hooks/post-commit.sh
- scripts/control-tower/bypass-ledger.sh
- scripts/control-tower/check-bypass-log.sh
- scripts/pre-commit-check.sh
- tests/control-tower/bypass-ledger.test.sh
- tests/control-tower/check-bypass-log.test.sh
- tests/control-tower/bypass-union-merge.test.sh
- tests/control-tower/post-commit.test.sh
- tests/control-tower/post-commit-marker.test.sh
- tests/control-tower/pre-commit-bypass-read.test.sh
不做什么（含文件路径）：
- 不改 scripts/control-tower/synova-commit （旧路径次写者；最高风险脚本，本卡不动 → 立后续卡）
- 不改 .claude/reference-map.md （同类第二例：与 `.gitattributes:20` 同型的 union 属性，本卡保留，需升级）
- 不改 tests/control-tower/fastlane-bypass-only.test.sh （环境依赖型红：仅暂存 doc-only 时出现，纯净 clone 亦复现，非本卡）
- 不改 tests/control-tower/tag-bypass-wiring.test.sh （基线即红：纯净 clone 亦红，非本卡）
- 不改 scripts/audit/k3-batch-gate.sh （K3 专属域，禁碰）
- 不改 docs/synova/audit-reports/INDEX.md （K3 审计报告域）

## Q3: 验收
入口: `git push`（pre-push 门禁 5 → `check-bypass-log.sh`）；本地 `pre-commit-check.sh` 的 Gatekeeper 与组 7c。
处理: 证据写 per-session（git 忽略）→ 读面 = 冻结归档 + 旧路径（若存在）+ 全部 per-session（写入与读取两侧同步切换）。
结果: 分支不再产生 `.claude/bypass.log` 变更；D331 对账通过；Gatekeeper/组 7c 仍看得见证据（不静默失能）。

## 架构层: scripts（控制塔）+ 仓库跟踪策略
## Done 标准
- [ ] verify: `git check-attr merge -- .claude/bypass.log`（输出 `merge: unspecified`）
- [ ] verify: `git diff --numstat -- .gitattributes`（输出恰为 `0	1	.gitattributes`）
- [ ] verify: `bash tests/control-tower/bypass-ledger.test.sh`（exit 0）
- [ ] verify: `bash tests/control-tower/check-bypass-log.test.sh`（exit 0）
- [ ] verify: `bash tests/control-tower/pre-commit-bypass-read.test.sh`（exit 0，含 3 条改坏即红夹具 + 逐字不变）
- [ ] verify: `bash scripts/workflow/check-silent-swallow.sh --diff`（exit 0，无新增静默吞错）
