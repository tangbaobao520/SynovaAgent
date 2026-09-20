# D846 决策：释放证据只认「已提交」内容（工作树/索引改动不作为释放依据）

- 状态: implemented（本卡提交即落地；分支 gate/claim-release-a）
- 日期: 2026-09-20
- 任务: D846（来源 K3 独立审计 D841 P1-1）
- 决策人: coding-a（小队 门禁加固三卡·切片 A）｜依据 D333 决策四步
- 落地文件: `scripts/control-tower/claim_release.py`（判定层）+ `tests/control-tower/claim_release.test.sh`（夹具）

## 是什么

认领制「完成即释放」的**证据源可信度分级**从「工作树文件内容」改为：

| 证据源 | 基线（D839） | 本次（D846） |
|---|---|---|
| `task-state/<D#>.json` 的 `status` | 读**工作树**文件（任何人改、不提交即可解锁） | 只读 **`git show HEAD:<path>`**（已提交事实）；工作树/索引与 HEAD 不一致 → `degraded` + 不释放 |
| `task-state/claim-releases.json`（显式释放台账） | 只要 `released:true` 即认 | **必须携带凭证**（`by`/`at`/`reason` 均非空）；记录未提交 → 释放照旧但 `degraded=true` + detail 标注"凭证在 git 历史中不可核" |
| `.codex/control-tower/session-registry.json` archived | 本地文件 | 不变（gitignore，最弱证据源，已在模块头显式登记） |
| 拿不到证据 | fail-closed | fail-closed（不变） |

`release` 子命令加严：`by` 必填非空；**非 owner（或 owner 不明）释放必须有显式理由**（禁默认值/占位值），
记录落盘 `by / reason / at / basis_at_release / owner_at_release`（谁/依据/时间/释放时归属快照）。

## 为什么

1. **第一性原理**：门禁要回答"另一个 session 现在是否还拥有这个文件"——这是关于**共享历史**的事实，
   只能在 git 提交里取；工作树/索引是单机私有可变状态，不构成该事实的证据。
2. **K3 实证（D841 §① P1-1）**：改工作树 `task-state/<他人卡>.json` → status=impl_done（不 add 不 commit）
   即把 `staging_guard` 从 `block/exit 1` 放行成 `warn/exit 0`，改回 `claimed` 后 git 历史零痕迹。
   自验（verifier-1）另证：`git add`（暂存不提交）同样命中。本卡把两条路径一并关闭，并补端到端夹具。
3. **审计基线**：释放是**降低保护**的动作 → 证据必须不可否认（who/why/when/on-what-basis），
   非所有者操作必须给出显式理由（对标 `git`/Kubernetes 强制 `--reason` 的工程实践）。

## 被否决的方案（实测留证）

- **台账也改成"只读已提交"**：D839 的 brief 写集含 `task-state/claim-releases.json` → 提交该台账
  自身会被 D839 未释放的认领 block（=死锁），并让 CTO/派单既定的算子逃生舱
  （`claim_release.py release --task D839`）失效。实测本版逃生舱**立即生效**。
  残余（本地直写带凭证的假台账记录 / 本地 registry 归档）已在模块头威胁模型显式登记，
  建议 CTO 裁决是否单开卡（方案：台账记录只认 HEAD + 提供带提交的释放流程；或下线 registry 证据源）。
- **只在消费端 `staging_guard.py` 兜底**：每个消费端都要重做口径，且 `resolve-commit-brief.sh` 的
  源头剔除会与消费端漂移（D839 已因两处各定义常量踩过一次）→ 一律改在单一事实源。

## 契约（铁律 47）

- `_read_committed_json(repo, rel)`：`git show HEAD:<rel>` → `(data|None, err|None)`；
  err 区分 `ENOENT:HEAD`（正常默认）/ git 层失败 / `JSONDecodeError`（必须告警）。
- `task_status()`：只读已提交；工作树/索引不一致 → `(HEAD status, "…不作为释放依据")`（fail-closed + 可见）。
- `ledger_record_verdict(rec)`：凭证不完备 → 不作证据（点名缺项）。
- `release_task()`：非 owner 无显式理由 → `ok=False, code=2`；**被拒时不写台账**；
  owner 自释放无理由时合成非空 reason（自测期实测：空 reason 会让记录自判"缺凭证"→ 释放静默失效）。
- CLI 退出码三态：0 成功 / 1 业务否定 / 2 契约不满足。

## 验证（先红→后绿，两次原始输出留档）

- 先红：`SYNO_CLAIM_SRC=<HEAD 版实现> bash tests/control-tower/claim_release.test.sh` → `PASS=47 FAIL=18`
  （含端到端：伪造后 `staging_guard` exit 0/`warn`；裸台账记录即解锁；非 owner 无理由落盘）。
- 后绿：`bash tests/control-tower/claim_release.test.sh` → `PASS=65 FAIL=0`。
- 回归：`staging-guard-session.test.py`（5 失败）与 `test-write-lock.py`（1 错误）在**干净 HEAD 上同样失败**
  （已在 `/tmp` 的 `git archive HEAD` 副本上对拍确认），非本卡引入。
- 交叉影响（已交接 D849）：`tests/control-tower/staging_guard.test.sh` 场景 A 依赖"未提交卡"→ 需将其
  `mk_state()` 改为提交（场景 B/C/D/E/F/G 实测不受影响）。
