# D853 决策：Windows 认领制门禁静默 fail-open 根治（试运行探测 + 目标运行时路径命名空间 + 事实源不变量）

- 状态: implemented（本卡提交即落地；分支 `gate/d839-win-chain`）
- 日期: 2026-09-20
- 任务: D853（原拟 D850，撞车作废）｜来源: CI 实证 + CTO 静态复核 + 编码 A 因果实证
- 决策人: coding-a（小队 门禁修复 · 切片 A）｜依据 D333 决策四步
- 落地文件: `scripts/workflow/resolve-commit-brief.sh`、`scripts/control-tower/claim_release.py`
- 夹具: `tests/control-tower/staging_guard.test.sh`（DIAG）、`tests/control-tower/claim_release.test.sh`（+组 15/16）

## 是什么（三条根因 + 一条同类面）

| # | 根因 | 机制 | 修法 |
|---|---|---|---|
| A | PYBIN 探测**只探存在性**（`:52-55` `command -v`） | Windows 上 `python3` = WindowsApps 占位 shim（存在但跑不动）→ 5 处 `"$PYBIN" -c` 全失败 → RESULT 空 → `exit 1` **零输出** → `staging_guard` 按"无认领"跳过 → **该 block 的变 pass** | 照抄仓内既有口径（`verify-parallel.sh:70-77`、`dev-doc-gatekeeper.sh:191-197`）：`command -v "$_c" && "$_c" -c "import sys"`；全候选失败 → **stderr 显式告警**（不静默） |
| B | `claim_release.py` 只 `stdout.reconfigure(utf-8)` | Windows 管道 cp1252 → 中文 stderr 被 backslashreplace 成 `\uXXXX` → 夹具断言「契约不满足」恒红、算子读不懂报错 | stdout+stderr **双** reconfigure UTF-8（与调用者 locale 无关，不改语义） |
| C | `$ROOT`（MSYS 形 `/d/...`）被注入 python 代码串 + 被当 stdout 输出 | MSYS 只转 argv、**不转**脚本内字符串里的路径 → native python ①`os.listdir` 读不到（候选池空→零输出）②下游 `staging_guard` 读 stdout 里的 brief 路径失败 → `genuine=False` → 跳过认领判定（**两层都静默 fail-open**） | 统一 ROOT 为混合形（`cygpath -m` → `C:/...`）：bash 可 cd/glob、native python 可 open/readdir 同实体；POSIX 无 cygpath → 原值（零行为变化） |
| D | resolver 的 `git rev-parse`（`:31`）/`branch`（`:110`）用**未清洗环境**；`claim_release._git` 用**裸 `git`** | `GIT_WORK_TREE=<外部仓>` → ROOT 变外部仓 → 候选池空 → 跳过认领（静默）；PATH 上假 git → `ls-files`/回吐攻击者给的"事实" | resolver：`env -u GIT_*` + git **试运行校验**后的绝对路径；claim_release：`git_bin()`（绝对路径 + `--version` 形如 `git version N.` + 非临时目录 + 非被判定的仓库内）+ `_clean_env()` |

## 为什么（第一性原理）

门禁的价值 = **该拦时拦得住**。resolver 是"认领事实"的生产方；它哑掉时下游**没有任何信号**
（`claimed` 为空 → `staging_guard.py:172-173` 直接跳过认领判定）→ 门禁等价于不存在。
所以三层都要补：①生产方能跑（试运行探测）②它在任何命名空间下读到同一实体（路径转换）
③跑不动时留下**可见**信号（stderr 告警 / degraded）。这与 D846/D847 在 Python 侧确立的
"事实源由入参决定、不由调用者环境决定"是同一条不变量，本卡把它补齐到 bash 侧与工具层。

## 被否决的方案（实测留证）

- **只修 A**：即使 python 完全可用，C 的两层仍让 Windows 全红（ROOT 是 MSYS 形是 Windows 常态）
  → 必须 A+C 一起修；实测两者可独立复现（A：坏 shim → 零输出；C：cygpath 别名判别 → 基线输出真实路径）。
- **只修消费端 `staging_guard.py`（claimed 为空 → block/degraded）**：那是另一张卡（队长已立），
  且不解决"resolver 为何哑"；本卡只保证生产方不再静默哑。
- **ROOT 用 `cygpath -w`（反斜杠形）**：`C:\...` 在 bash 里要转义、在 python 字符串里要 raw，
  易错；`-m`（`C:/...`）两运行时通吃（与 D849 夹具同口径）。
- **`SYNO_GIT_BIN` 之类的注入缝**：会让"事实源由环境决定"重新打开（攻击者设该变量即可换 git）
  → 不设缝；夹具改用 PATH 注入假 git + 直接注入 `_GIT_BIN_CACHE` 测内层守卫。

## 验证（先红 → 后绿，原始输出留档）

- A（坏 shim + 可用回退 `python`）：基线 `rc=1 out=[]`（fail-open 侧）→ 修复 `rc=0 out=[候选 brief]`。
- B（`PYTHONIOENCODING=cp1252`）：基线 `\u274c \u5951\u7ea6\u4e0d\u6ee1\u8db3…` → 修复 `❌ 契约不满足…`。
- C（cygpath → 同实体别名判别）：基线 out 前缀 = **真实路径**（忽略 cygpath）→ 修复 out 前缀 = **别名**（= cygpath 结果进了 ROOT）。
- D-1（`GIT_WORK_TREE` 指外部仓）：修后 resolver 的 ROOT 仍是被守护仓库（`env -u` 生效）。
- D-2（PATH 假 git）：基线 `_git` 返回 `('FAKE-TRACKED-FILE.md\n', None)`（**采信攻击者事实**）→ 修复 `(None, 'git ls-files rc=128')`（用可信 `/usr/bin/git`，不采信假件）。
- 夹具：`claim_release.test.sh` PASS=27→**33**（+组 15 stderr 编码 / 组 16 假 git）；
  `staging_guard.test.sh` PASS=33（DIAG 压短 + PROBE 增 `pyrun`，断言强度不变）。
- 唯一验收判据：CI `Control Tower Gate Tests` windows-latest + ubuntu-latest 双绿（队长并枝触发）。

## 残余（显式登记，未静默放过）

- 假 git 若同时①输出合法 `git version N.`②不在临时目录③不在被判定的仓库内，仍可能被采信
  （无外部信任锚；需本地任意代码执行权限才能布置）—— 与 D846 台账残余同族，登记待 CTO 裁决。
- `staging_guard.py:172-173` 的"claimed 为空即跳过认领制"结构性 fail-open 不在本卡写集（已另立卡）。
- `write_lock.py` 回收路径 judge-then-unlink 竞态不在本卡写集（已另立卡）。
