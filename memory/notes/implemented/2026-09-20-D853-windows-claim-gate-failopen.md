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

## 第二轮（CTO 授权扩写集，2026-09-20）：CI 诊断 + 链断 fail-closed

- **Windows 真病因**（CI 注解原文，队长代读）：`DIAG2 PROBE_RC=1 PY=NONE:NONE OUT=Windows Subsystem for Linux
  has no installed distributions` → 子链里起来的 **不是 Git Bash，而是 WSL 桩** `C:\Windows\System32\bash.exe`
  → resolver 根本没执行 → 认领判定整条 fail-open。我第一轮的 PYBIN 试运行修复**生效且必要**（`PY=NONE:NONE`
  如实报出"探到但不可用"），但只把症状暴露出来：**病因是"选错 bash"**。
- 处置（均在 CTO 授权写集内）：
  ① `staging_guard.py` 新增 `_find_bash()`/`_bash_env()`（windows-compat 模式 1）：SYNO_BASH → Git Bash 安装位
     → PATH 上的 bash **逐个试运行**（`-c "echo SYNO_BASH_OK"`）→ 全败**显式降级**；调用 resolver 时传
     `env=_bash_env(bash)`（MSYS PATH 前置 Git 的 usr/bin）。
  ② `staging_guard.py` 新增 `parse_resolver_degraded()` + `_fail_closed()`：resolver 自报链断
     （`SYNO-RESOLVER-DEGRADED`）→ **block + degraded + 点名**（拿不到认领列表 ≠ 没有认领）。
     与既有"registry 缺失 → fail-open pass"方向相反——认领维度是保护维度，与 release 维度同哲学（fail-closed）。
  ③ `resolve-commit-brief.sh` 在 python/git 不可用时发 `SYNO-RESOLVER-DEGRADED\t<原因>`
     （与 guard 的 `RESOLVER_DEGRADED_MARK` **同字面量**；夹具场景 H 有双端一致性断言守漂移）。
  ④ `tests/control-tower/staging_guard.test.sh` 新增场景 H（链断 → exit 1/block/degraded + 双端标记一致）：
     本树 PASS=38 FAIL=0；**基线（5b7d0326 + 新夹具）红 3 断言**（实际 pass/exit 0）= 判别性成立。
- **ubuntu 回归定位手段**（`synova-commit.test.sh` pass=16 fail=1，CI-only）：本地三路复现均 17/0
  （CI 环境变量组 / detached HEAD / ci.yml 全 43 项同 shell 串跑）→ 按 CTO 授权在该夹具**失败时**把
  `DIAG-FAIL <失败断言名>` + `DIAG-ENV bash/py/git/rc` 打进**末尾 8 行**（CI 注解唯一可见区；❌ 行原本被
  其后的 ✅⑥⑦⑧ 挤出可见区）。诊断已自检（注入失败 → 末尾两行如期出现；正常态零新增输出）。
- 顺带修掉一个真实缺陷：`staging_guard.py` **从未 import os**，我第一版 `_find_bash` 因此 NameError，
  被 `check_staging` 外层 `except Exception` 吞成 **fail-open pass**（夹具当场全场景 ec0/pass）——
  这正是本卡要治的那类静默放行；已补 `import os` 并复跑全绿。

## 第三轮（2026-09-20）：② 双平台共有 + 夹具 bash 自包含

- **关键事实**：ubuntu 与 windows **同一个断言**红（`DIAG-FAIL ② 应拦, 实际 exit=0`）→ 不是平台差异，是
  **"CI 环境"输入差异**。本地六路复现全 17/0（含 `env -i` 无 HOME gitconfig + CI 变量组、detached HEAD、
  ci.yml 全 43 项同 shell 串跑）→ 只能靠 CI 注解定位。
- 处置：把 ② 的链路证据做进末尾 8 行 —— `staged=[暂存区实况] gl=[synova-commit 在 guard 段打的那行]
  grc=<直调 guard rc> status=<block|warn|pass|degraded>`。四态即四类根因：崩了（guard 异常→调用点降级放行）/
  跳了（暂存区为空或 python 不可用）/ 降了 / 放了（registry 没看到 other-sess）。
- 夹具自身 bash 自包含（清 windows `PROBE_RC=1`）：native python 解析裸 `bash` 走 **Windows PATH** →
  WSL 桩；MSYS 形 PATH 前置对 native 子进程无效 → 必须**显式绝对路径**（`_pick_bash()` 逐个试运行，
  与 `staging_guard._find_bash` 同口径）；夹具三处 bash 调用统一；PROBE 增 `BASH=<basename>`。
- 未做（等注解）：② 的根因修法。**不猜修**——若注解显示"崩了"，则修调用点（`synova-commit` 的 guard 段
  在 rc≠0 非 block 时降级放行 = fail-open，需 CTO 授权扩写集）；若"放了"，则修 registry 状态一致性；
  若"跳了"，则修暂存区前置。三者修法完全不同，故先取证据。

## 第四轮（2026-09-20，CTO 授权扩写集 2）：调用点 fail-closed

- `synova-commit` 的 guard 段旧行为：`rc≠0` 且 `status≠block` → `⚠ 降级放行，请检查其日志` = **fail-open**
  （"guard 不可用"被翻译成"放行"）。改为 `❌ … fail-closed 阻断` + 打印原始输出 + `exit 1`，
  与 `staging_guard._fail_closed()` 同口径（认领维度 = 保护维度）。
- **独立可证的洞**（不依赖 CI 注解）：夹具 ⑨ 在沙箱里把 guard 弄成不可用（语法错误 → 编译期失败），
  旧实现 `rc=0`（放行）、新实现 `rc=1`（阻断 + 点名）→ 判别性成立。
- 夹具 ④ 从"grep 旧文案（降级放行）"升级为"grep 异常命名 + fail-closed"（旧实现上红）；
  ② 增加"registry 登记成功"前置断言（旧写法把准备步骤失败 `>/dev/null 2>&1` 吞掉 → 误诊为"门禁不拦"）。
- 边界：**只改** guard 异常处置那一段；synova-commit 其余逻辑（D839 交付、K3 已审）未动。
- **追加授权后已补**（第四轮第 2 项）：`synova-commit` 里"python3/python/py 试运行均不可用 →
  `GUARD_STATUS=degraded` → 跳过 guard"那条分支，旧行为同为放行语义 → 改为 **fail-closed 阻断 + 点名**。
  夹具 ⑩ 行为面：沙箱 PATH 前置三个坏 python shim → 旧实现 `rc=0`（放行）/ 新实现 `rc=1`（阻断 + 点名）
  → 判别性成立。至此 `synova-commit` 的两条放行语义（异常 / python 不可用）都已收干净。

## 第六轮（2026-09-20）：H 前提修正 + H2 契约级

- CI 断言级证据：`DIAG-H rc=1 mark=[SYNO-RESOLVER-DEGRADED] out=[]`（直调断链+发标记）但 guard `ec0/warn`
  ⇒ 根因是**夹具前提在 Windows 不成立**：`_bash_env()` 前置 `sys.executable` 所在目录（hostedtoolcache 有可用
  python3）→ PATH 上的坏 shim 被反超 → 链没断 → guard 走正常判定，命中场景 C 留下的 D901 已释放台账 → warn。
  **不是 guard 没接标记**（那条路由 H2 确定覆盖）。
- H 改为**前提探针门控**（未发标记 → 显式打印"前提不可造/不适用"，不计分也不静默通过）；
  新增 **H2 契约级**（桩 resolver 只发标记 + exit 1 → guard 必须 `exit 1`+`block`+`degraded`+点名），
  与环境无关，基线 guard 上红 3 条（判别性）。staging_guard 夹具 42/0。
- `claim_release.test.sh`：`DIAG-FAIL` ≤26 字符/条（4 条断言名活过注解预算）+ 新增 `DIAG-⑧`
  （str/Path 原始差异），下一轮定位 Windows str/Path 分歧。

## 第八轮（2026-09-20）：claim_release 夹具路径命名空间（收尾轮）

- CI：`staging_guard` 转绿（H 前提门控 + H2 契约级在 Windows 验证成立）；剩 `claim_release.test.sh` ⑧×2/⑪×2。
- 根因：**该夹具的沙箱路径未做 D849 的 `cygpath -m` 归一化**（兄弟夹具做了，注释里记的正是这个坑）→ Windows 上
  `$SB` 是 MSYS 形 → native python 读成 `C:\tmp\...` → 夹具的 `sys.path.insert`/`open()` 与 CLI 的 `--repo $SB`
  落在不同根 → `FileNotFoundError`（⑧ 炸在夹具内联脚本；⑪ 是夹具**读**台账失败，不是 `save_ledger` 写失败）。
- 证据：AST 逐条列模块级语句（无 import 期 FS 访问）+ 用不存在路径做 sys.path 首项导入仍 import OK
  ⇒ 生产 import 无嫌疑；⑪ 的失败值是读失败；D849 同款前例在仓内。
- 处置：夹具 `SB_RAW`+`cygpath -m`（POSIX 原值，零行为变化）；**生产侧不改**（`ledger_path`/`save_ledger`
  一律从 `repo` 入参构造，调用方给原生形即正确）。诊断预算重排 ⑪→⑧→FAILLOG→ENV（407/450 字符）。

## 残余（显式登记，未静默放过）

- 假 git 若同时①输出合法 `git version N.`②不在临时目录③不在被判定的仓库内，仍可能被采信
  （无外部信任锚；需本地任意代码执行权限才能布置）—— 与 D846 台账残余同族，登记待 CTO 裁决。
- `staging_guard.py:172-173` 的"claimed 为空即跳过认领制"结构性 fail-open 不在本卡写集（已另立卡）。
- `write_lock.py` 回收路径 judge-then-unlink 竞态不在本卡写集（已另立卡）。
