# D847 决策①：台账 read-modify-write 进 write_lock 临界区（消 lost-update）
# D847 决策②：事实源不变量 —— 释放判定读哪个仓库由入参决定，不由调用者环境决定

- 状态: implemented（本卡提交即落地；分支 `gate/claim-release-a`）
- 日期: 2026-09-20
- 任务: D847（来源 K3 独立审计 D841 P1-3 + 自验 verifier-1 追加两类失效 + CTO 折入的 GIT_DIR fail-open）
- 决策人: coding-a（小队 门禁加固三卡·切片 A）｜依据 D333 决策四步
- 落地文件: `scripts/control-tower/claim_release.py`、`scripts/control-tower/write_lock.py`

## 决策①：整个 RMW 进临界区（不是只包 os.replace）

**是什么**：新增 `save_ledger_locked(repo, mutate_fn)`——`写锁 → load_ledger → mutate → save_ledger → 解锁`
整段临界区；锁 = 同目录既有 `write_lock.py`（复用，不另造），key = 台账仓库相对路径，
锁目录 `repo/.codex/control-tower/locks`（与 `session_registry` 同目录）。`release_task()` 唯一写入方改走它。

**为什么**：原子替换（tmp + `rename`）只保证"不会读到半写文件"，**不保证读-改-写不丢更新**：
两个进程各自读到同一份旧台账、各自写回 → 后写者覆盖先写者。K3 实测 30 轮第 0 轮即中；
自验 40 轮 × N=8：丢写 40/40、崩溃 20/40。台账是释放语义的唯一显式通道 →
丢一条记录 = 一条认领被永久锁死（或反向：一次释放丢失而无人察觉）。

**顺带修的三处（同族根因）**：
1. `write_lock.acquire()` 由「`exists()` 探测 + 写」改为 **`os.open(O_CREAT|O_EXCL)` 原子获取**
   （`session_registry.py:79` 早就记录了这个 TOCTOU 却留着 → 不修的话"复用 write_lock"只是把赌注从账本挪到锁）。
2. `_is_expired()` 的"损坏锁 = 过期"宽容口径 + 原子创建后的**空窗口**（文件已创建、payload 未写完）
   = 抢活锁 → 8 进程并发第 1 轮即丢 1 条（**本卡夹具当场抓到**）。改法：内容不可解析时退回 **mtime**
   判定，`timeout_sec` 内不算过期（fail-closed，绝不抢活锁）；只有确实陈旧的锁才可回收。
3. 共享 tmp 路径（D846 已加 pid 后缀）+ `release()` 的 `exists()` 移入 try（只读锁目录不再抛 PermissionError，
   回到 D209 §5「锁不可用 → degraded allow」契约）。

**锁失败路径（禁静默，铁律 24/31）**：
- 锁目录/锁文件不可用（只读等）→ **degraded allow** + stderr 告警 + 记录 `lock: "degraded:<原因>"`（事后可核）；
- 争用等待超时（`SYNO_CLAIM_LOCK_WAIT_SEC`，默认 15s）→ **拒绝写入**（`ok=False, code=2`）——
  宁可失败也不丢记录；夹具断言"超时未落台账"；
- `write_lock` 模块不可 import → 拒绝写入（不静默退回无锁 RMW）。

**被否决的方案**：① 乐观 CAS 重试（POSIX 无 rename-if-unchanged，等价于自造更脆的锁，且违反"复用既有机制"）；
② 台账改 append-only JSONL（免丢更新的正解，但改格式会波及 3 个消费点 + 人读流程，超出 K3 要求）→ 记为演进项。

## 决策②：事实源不变量（GIT_DIR fail-open 闭合）

**是什么**：所有 git 子进程显式传清洗环境 `env=_git_env()`（剔除**全部 `GIT_*`**），保留 `-C <repo>`；
`write_lock` 的模块解析钉死在本文件所在目录（`_pin_own_dir_on_path()`）。

**为什么**（自验第二轮实测，非推测）：`GIT_DIR=<外部仓>/.git python3 staging_guard.py …` →
`git -C <repo> show HEAD:…` 仍听 `GIT_DIR` → 读到外部仓 HEAD（他人卡 impl_done）→ `warn/exit 0`
解锁他人认领，而被守护仓库零痕迹。D846 把证据源从工作树搬到 HEAD，但"HEAD 属于哪个仓"仍由调用者
环境决定 → **文件级无痕路径封住了，仓库级还开着**。
`-C` 只改工作目录，不会覆盖 `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`/`GIT_OBJECT_DIRECTORY`/
`GIT_ALTERNATE_OBJECT_DIRECTORIES`/`GIT_COMMON_DIR`/`GIT_NAMESPACE` → 故**全剔**（show/ls-files/status
都不需要它们）；剔除后若 git 找不到仓库 → 显式失败 → fail-closed 阻断（方向正确，不是放宽）。

**同类面排查（已全量核对 `os.environ` + `subprocess.run`）**：仅剩 3 处读环境——
① `_git_env()` 清洗器自身；② `SYNO_CLAIM_LOCK_WAIT_SEC`（测试注入缝，只改等待时长，不改语义）；
③ `SYNO_AGENT`（`--by` 自我声明身份，非事实源，且非 owner 走更严路径）。**无其他点。**

## 验证（先红→后绿，两次原始输出留档）

- 先红（vs D839 原版，共享 tmp + 无锁）：`PASS=53 FAIL=34`；并发 8×2 轮每轮仅 4 条 + 1 进程 rc≠0
  （**丢写与崩溃两类同时命中**）；`GIT_DIR` 外部仓 → 放行；`⑩c/⑩d` 无降级标记。
- 先红（vs D846 版 `13a12923`，pid-tmp 已修但无锁）：`PASS=79 FAIL=8`；并发每轮 2 条（丢写仍在）、
  `GIT_DIR` 外部仓 → **exit 0 放行**（自验第二轮报告的 fail-open 复现）。
- 后绿：`bash tests/control-tower/claim_release.test.sh` → `PASS=87 FAIL=0`（连续 3 次稳定）。
- 独立压测（不走夹具，N=16 × 4 轮）：`坏轮次=0/4`，每轮 16/16 记录、rc≠0 = 0。
- 回归：`test-write-lock.py` 由 `FAILED (errors=1)` → **OK**（D209 degraded 契约恢复）；
  `staging-guard-session.test.py` 仍 5 个预先存在失败（与干净 HEAD 一致）；`test-staging-guard.py` OK。
