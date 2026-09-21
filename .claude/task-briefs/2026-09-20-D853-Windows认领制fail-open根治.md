# Task Brief: D853 Windows 认领制门禁 fail-open 根治 — PYBIN 只探存在性 + MSYS 路径喂 native python + stderr 未 UTF-8

> 生成: 2026-09-20 | 任务: **D853**（原拟 D850，撞车作废）| 认领: coding-a ｜ 写集见下方机器块
> 工作树: `/Users/wane/SynovaAgent/.synova-wt-gates-win` ｜ 分支 `gate/d839-win-chain` ｜ 基线 `origin/fix/d839-claim-release`（`5b7d0326`）
> 来源: CI 实证（#657 `Control Tower Gate Tests (windows-latest)` 红）+ CTO 静态复核 + 编码 A 因果实证
> 决策参考: D333 四步（第一性原理 → Anthropic 工程基线 → 仓内实证 → 收敛检查）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务**不进 L1-L5 产品运行时**，属**控制塔门禁层**。
链路（Windows 上静默失效的那条）:
```
git commit → synova-commit → staging_guard.py --session-id <D#> --staged <files>
  → subprocess: bash scripts/workflow/resolve-commit-brief.sh --session <D#> <files>   ← 本卡主战场
      → PYBIN 探测(:52-55) → 5 处 "$PYBIN" -c 内嵌 python（:123/:124/:170/:316/:350）
          → 判定结果写 stdout（候选 brief 路径）；失败 → 末尾 `exit 1` **零输出**
  → 认领判定只在 claimed 非空时执行（staging_guard.py:172-173）→ claimed 空 = **跳过认领制**
```
即：**resolver 一旦哑掉，认领门禁整条消失且不报错**（fail-open）。

### b) 文件审计（本树实读）
- `scripts/workflow/resolve-commit-brief.sh`（374 行）: `:31` ROOT=`git rev-parse --show-toplevel`（**未清洗环境**）；
  `:37` PARSER_DIR_W 用 `cygpath -w`；`:52-55` PYBIN 探测（**只探存在性**）；`:123/:124/:170/:316/:350` `"$PYBIN" -c`；
  `:172/:251/:356/:365/:369` 把 `$ROOT` **直接注入 python 代码串**（Windows 上 `$ROOT` 是 MSYS 形 `/d/...`
  → native python 读不到 → 该分支静默失败）；`:374` `exit 1` 零输出。
- `scripts/control-tower/claim_release.py`（406 行，本卡基线版）: `:326` `_out()` 只 `sys.stdout.reconfigure`；
  `:110/:357/:382/:390` 写 `sys.stderr`（中文）→ Windows 管道 cp1252 → backslashreplace 吃字 → 夹具断言恒红。
- 仓内既有正确口径（**照抄，不另发明**）: `verify-parallel.sh:70-77`、`dev-doc-gatekeeper.sh:191-197`
  （`command -v "$_c" && "$_c" -c "import sys"`）；`ct-test-gate.sh:55` 的 `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE`。
- `tests/control-tower/staging_guard.test.sh`: `:80-90` DIAG 机制、`:176-216` `_probe_chain`（已有 PROBE_RC/PROBE_ENV/路径命名空间）、
  `:356-357` DIAG 打印（150/140 字符 → 超 CI `cut -c1-450` 预算）。

### c) 决策
已有覆盖 → 复用仓内两个"试运行探测"口径 + `cygpath -m` 双命名空间口径（D849 已在夹具里验证过）；
无覆盖 → 新增 ROOT 的 native 形变量 `ROOT_W` 与 env 清洗；冲突 → 无（写集内文件，D839 已 CONDITIONAL PASS + CTO 显式授权）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
### a) 业界最佳实践
- **门禁脚本的"工具可用性"必须试运行验证**：`command -v` 只回答"PATH 里有没有这个名字"，
  不回答"它能不能跑"（WindowsApps 占位 shim、损坏 shim、0 字节 rewrap 都会命中前者、失败后者）。
  等价工程惯例：`which` + `--version`/`-c "import x"` 双重校验（Ansible `command -v` + module probe 同族）。
- **跨运行时传路径必须用目标运行时的命名空间**：MSYS/POSIX 路径喂 native Windows 进程 = 静默读到别处
  （MSYS 只在 argv 层做转换，**不转换嵌进脚本字符串里的路径**）。这就是本卡第二条根因。
- **降级必须可见**（铁律 11/24/31）：解析器哑掉时"什么都不输出 + exit 1"是典型的静默降级。

### b) 顶级团队怎么做
- fail-closed 与 fail-open 分界明确：**降低保护**的动作（释放/放行）拿不到证据必须不走；
  本卡修的是"证据生产方哑掉导致下游按'无证据=无冲突'放行"的链式 fail-open。
- 诊断预算意识：CI 注解只带失败输出的尾部 → 失败信号必须**短且前置**（本卡第 3 条）。

### c) memory / 仓内历史教训
- `verify-parallel.sh:70` 注释直接写着 D330 教训："**探测后试运行验证可用性**"——本卡 A 就是把这条口径
  补到漏网的 resolver 上（D513 已修 commit-msg / pre-push 两处，resolver 是第三处漏网）。
- `staging_guard.test.sh:93-98`（D849 刚落地）：mktemp 的 MSYS 形路径喂 native python 会读到 `C:\tmp\...`
  → 与 `$ROOT` 注入是**同一类**（本次是生产代码而不是夹具）。
- `ct-test-gate.sh:48-54`（D521/D555）：hook 上下文会导出 `GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE`
  → 沙箱提交污染宿主分支 → 仓内已确立"子进程前剥 GIT_*"的口径。
- 铁律 11/24/31（降级不静默/传播）、铁律 47/48（契约优先 + 非空壳测试）、铁律 0-2（测试先行 + 接线验收）、铁律 49（决策沉淀）。

### Q1c) 决策参考系
**参考：第一性原理 + Anthropic 工程基线 + 仓内实证 + 收敛检查**
1. **第一性原理**：门禁的价值 = "该拦时拦得住"。resolver 是证据生产方；它哑掉时下游**没有任何信号**
   → 门禁等价于不存在。故必须 ①让生产方能跑（可用性探测）②让它在任何命名空间下读到同一实体
   ③跑不动时**留可见信号**，而不是"零输出 + exit 1"。
2. **Anthropic 工程基线**：① 复用既有正确口径（不新造探测法）；② 降级可见；③ 变更集最小、不动判定语义
   （本卡只改"怎么找到工具/怎么传路径/怎么写 stderr"，不改任何释放或认领口径）。
3. **仓内实证（本卡实测，非推断）**：
   - 根因 A（模拟"存在但坏"的 `python3` shim）：正常 PATH → resolver `rc=0` 有输出、guard `block`；
     shim PATH → `command -v` 命中 → resolver `rc=1 stdout=[]` → guard `exit=0 status=pass`（**fail-open 复现**）。
   - 根因 B（`PYTHONIOENCODING=cp1252` 模拟 Windows 管道）: stderr 变 `\u274c \u5951\u7ea6\u4e0d\u6ee1\u8db3…`
     → 夹具 `未找到: 契约不满足` 恒红；不设该变量则正常（**判决性差异**）。
   - 根因 C（本卡新发现，与 A 同链）: `$ROOT` 被注入 python 代码串（`:172/:251/:356/:365/:369`），
     Windows 上 `git rev-parse --show-toplevel` 给 MSYS 形 `/d/...` → native python `os.listdir('/d/...')` 失败
     → 落到 `:374 exit 1` 零输出。**这条即使 python 完全可用也照样哑**（A 修好后仍红）→ 必须与 A 一起修。
4. **收敛检查**：三参考系同指——"**探测要试运行、路径要按目标运行时命名空间转换、降级要可见**"。
   直接执行，不升级创始人（技术决策，D333）。

## Q2: 范围 — 正确的最简方案
做什么：
- `scripts/workflow/resolve-commit-brief.sh` — ① PYBIN 探测改"试运行"（照抄 `verify-parallel.sh:70-77` 口径：
  `command -v "$_c" && "$_c" -c "import sys"`），并让"全部候选不可用"时**显式告警**（stderr，不静默）；
  ② 新增 `ROOT_W`（`cygpath -m` 混合形；POSIX 上即原值）并**替换 5 处 python 注入**（`:172/:251/:356/:365/:369`）；
  ③ `git` 调用前剥 `GIT_*`（`env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY
  -u GIT_COMMON_DIR -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE`）+ 用**试运行校验过**的 git 绝对路径；
  ④ 自查：全文件仅 `:54` 一处 `command -v`（已改），无其它"只探存在性"。
- `scripts/control-tower/claim_release.py` — ① `_out()` 同口径补 `sys.stderr.reconfigure(encoding="utf-8")`
  （不改任何语义，只改编码）；② `_git()` 走"试运行校验过的 git 绝对路径 + 剥 `GIT_*`"，
  校验失败 → **拒绝作为证据**（fail-closed + 显式 degraded），绝不静默。
- `tests/control-tower/staging_guard.test.sh` — DIAG 两行压到 ≤75 字符（关键字段前置）+
  `PROBE_ENV` 增加 `pyrun=<python3 试运行 rc>`（判别"找到但跑不动"）。
- `scripts/control-tower/staging_guard.py` — **CTO 授权扩写集**（仅两处）：① `_find_bash()`/`_bash_env()`
  自包含 bash 选择（SYNO_BASH → Git Bash 安装位 → PATH + **试运行校验**；Windows 上裸 `bash` 会命中
  WSL 桩 `C:\Windows\System32\bash.exe`，实测 5 场景全 ec0/pass）；② `parse_resolver_degraded()` +
  `_fail_closed()`：resolver 自报 python/git 不可用（`SYNO-RESOLVER-DEGRADED`）→ **block + degraded + 点名**
  （拿不到认领列表 ≠ 没有认领）。
- `tests/control-tower/synova-commit.test.sh` — **CTO 授权**：失败断言名 + 环境事实（bash/py/git/rc）进**末尾 8 行**
  （CI 注解唯一可见区；32cc6a02 实测 ubuntu 红但注解被 ✅⑥⑦⑧ 挤掉 ❌ 行，无法定位）。
- `tests/control-tower/claim_release.test.sh` — 追加两组回归夹具：
  ① stderr 编码（`PYTHONIOENCODING=cp1252` 下中文必须仍可断言）② PATH 伪造 git（须 fail-closed + 可见降级）。
- `task-state/D853.json`、本 brief、`memory/notes/implemented/2026-09-20-D853-*.md`。
- `scripts/control-tower/synova-commit`（本体，第四轮 CTO 授权进写集）—— 按 2026-09-21 裁决 B（#657 拆两台 PR）
  随**本台 PR-2** 交付：① guard block 文案改打印可执行释放命令（D839 语义，依赖 PR-1 的 guard）；② guard
  异常/ python 不可用分支调用点 fail-closed（D853-5）。合并顺序：先 PR-1 后本台，合 PR-1 后本台 merge main。
- `docs/synova/coordination/小队交付-门禁加固三卡-20260920.md`（M6 收口三件入仓可读）+
  `memory/notes/proposed/2026-09-20-team-gates-closeout.md`（铁律 49 决策沉淀，随交付文档入库）。

不做什么（含文件路径）：
- 不改 `scripts/control-tower/staging_guard.py` 的**释放维度**与 registry 判定段（`:189-194` 不传播 degraded、registry fail-open 语义保持原样）
- 不改 `scripts/control-tower/synova-commit` 的**其余段落**（释放文案与 fail-closed 两处之外，授权边界见第四轮）
- 不改 `scripts/control-tower/write_lock.py`（回收竞态归另卡）
- 不改 `tests/control-tower/write_lock.py` / `scripts/control-tower/write_lock.py`（自验发现的回收竞态归另卡）
- 不改 `tests/control-tower/staging_guard.test.sh` 的**断言强度**（只压 DIAG 打印 + 加 PROBE 事实字段）
- 不改 `scripts/control-tower/session_registry.py`
- 不改 `scripts/audit/check-gates-v2.py`
- 不改 `.github/workflows/ci.yml`
- 不动 `origin/fix/d839-claim-release` 枝（只推自己的 `gate/d839-win-chain`）

## Q3: 验收 — 入口 → 交互 → 结果
入口: `git commit` → synova-commit → `staging_guard.py` → `resolve-commit-brief.sh`（唯一生产调用点）
处理: PYBIN 试运行选可用解释器 → 用 `ROOT_W`（目标运行时命名空间）+ 剥 GIT_* 的 git 读仓库事实 → 输出候选 brief
结果:
  - Windows：resolver `rc=0` 且输出候选 brief → guard 恢复 `block`（该拦的拦住）；
  - Windows：`claim_release.py` stderr 中文完整（夹具断言可匹配）；
  - 失败时 CI 注解里的 DIAG 两行仍带 RC/PY/OUT（≤75 字符，不被 `cut -c1-450` 吃掉）；
  - macOS/ubuntu：两夹具仍全绿（claim_release PASS≥27、staging_guard PASS≥33）。

## 契约（铁律 47：先落契约，再写码）
```
# 不变量 ①：工具可用性 = 存在 **且** 可运行
#   PYBIN 选取规则: 对 python3/python/py 逐个 `command -v "$_c"` 命中后**试运行** `"$_c" -c "import sys"`；
#   试运行失败 → 换下一个候选；全部失败 → PYBIN="" 且 **stderr 显式告警**（不静默）。
#   @exit 全部候选不可用 → 仍 exit 1（语义不变），但已有可见告警（新增）
# 不变量 ②：喂给目标运行时的路径必须是目标运行时的命名空间
#   ROOT（bash 用，POSIX/MSYS 形）与 ROOT_W（python 用，cygpath -m 混合形）分离；
#   所有 python `-c` 内嵌路径一律用 ROOT_W/PARSER_DIR_W。POSIX 上 ROOT_W == ROOT（零行为变化）。
# 不变量 ③：仓库事实只由 `-C <路径>` 入参 + 剥净 GIT_* 的子进程环境决定，不由调用者环境决定
#   （与 D847 在 claim_release.py 确立的同一条，本卡在 bash 侧补齐）
# 不变量 ④（claim_release.py）：stdout/stderr 一律 UTF-8（reconfigure），与调用者 locale/管道无关
#   _git() 契约: git 可执行文件先试运行校验（`--version` 形如 `git version N.`）；
#                校验失败 → 返回 (None, "git 不可用/不可信: <原因>") → 调用方 fail-closed（不当证据）
# 退出码（resolver，不变）: 0 = 找到候选 brief（stdout 单行路径）| 1 = 无候选（stdout 空）
# 退出码（claim_release CLI，不变）: 0 成功 | 1 业务否定 | 2 契约不满足
```

## 第四轮（CTO 授权扩写集 2，2026-09-20）：调用点 fail-closed
- **授权**：`scripts/control-tower/synova-commit` 进写集（CTO 显式授权 + 已登记偏离），边界 = **只改**
  "guard 异常/rc≠0 时如何处置"那一段，口径与 `staging_guard._fail_closed()` 一致，不重构其它逻辑。
- **改什么**：`:601-611` 旧行为「rc≠0 且 status≠block → `⚠ 降级放行，请检查其日志`」= **fail-open**
  （把"guard 不可用"翻译成"放行"）→ 改为 **fail-closed**：`❌ D853: staging-guard 执行异常 (rc=…) —
  认领判定不可用 → fail-closed 阻断` + 打印原始输出前 5 行 + `exit 1`。与 guard 内部 `_fail_closed()` 同哲学：
  认领维度是保护维度，异常 ≠ 没有认领。
- **为什么这不是"顺手重构"**：它与本卡三条根因同族（链断/异常被翻译成放行）——diagnose 出的
  `DIAG-FAIL ② 应拦, 实际 exit=0`（双平台）正是这条路径的候选；且该 fail-open 有**独立可证**的洞（见 ⑨）。
- **夹具升级（强度↑，不是放宽）**：
  · ④ 旧断言只 grep 源码文案「降级放行，请检查其日志」（钉住旧行为）→ 升级为 grep「异常显式命名」+
    「fail-closed 阻断」（旧实现上该断言**红**，见判别性证据）
  · ⑨ **行为面新增**：沙箱注入 guard 不可用（语法错误 → 编译期失败）→ 断言 `exit 1` + 异常点名
    （**旧实现 rc=0** = 判别性成立）
  · ② 前置断言：registry 必须真的登记上 other-sess（旧写法 `>/dev/null 2>&1` 把准备步骤失败也吞了 →
    会把"准备失败"误诊成"门禁不拦"）

## 威胁模型（本卡闭合的锁面：谁能改环境 → 谁就能改"事实"）
| 环境向量 | 基线行为（实测/静态） | 本卡处置 | 残余 |
|---|---|---|---|
| `PYBIN` 命中坏 shim（WindowsApps 占位） | resolver 零输出 → guard **pass**（该 block） | 试运行口径 + 全候选失败显式告警 | 无 python 可用时仍 exit 1（下游 fail-open 属 staging_guard 另卡） |
| `$ROOT` 是 MSYS 形（Windows 常态！） | python 读不到 → 零输出 → guard **pass** | 注入 `ROOT_W`（cygpath -m） | 无 |
| `GIT_WORK_TREE`/`GIT_DIR` 指外部仓（resolver） | ROOT 变外部仓 → 候选池空 → guard **pass**，被守护仓零痕迹 | 剥 `GIT_*` 后再 `rev-parse`/`branch` | 无 |
| `PATH` 里塞假 `git` | 假 git 可回吐任意事实（此处用 `ls-files`/`rev-parse`） | 解析绝对路径 + 试运行校验 `--version` 形如 `git version N.` | 能让假 git 输出合法 version 串的本地进程仍可骗过（无外部信任锚）→ 已登记；本地进程本就等同任意代码执行 |
| `PYTHONIOENCODING`/控制台 cp1252 | stderr 中文被 backslashreplace 吃 → 断言恒红 | stdout+stderr 双 reconfigure UTF-8 | 无 |
| **python 不可用（调用点）** | 旧行为「`GUARD_STATUS=degraded` → 跳过 guard」= 放行 | 调用点 **fail-closed 阻断 + 点名**（第四轮追加授权；夹具 ⑩ 判据：旧实现 rc=0 / 新实现 rc=1） | 无 python 的机器提交被阻断（**有意**：整条控制塔本就依赖 python；出路文案给出） |
| **guard 异常/崩溃（调用点）** | `synova-commit` 旧行为「降级放行」→ 该拦的放行 | 调用点 **fail-closed**（异常 → 阻断 + 点名；授权偏离，见第四轮） | 若 guard 真坏，提交被阻断（**有意的** fail-closed；出路文案给出"移出暂存文件/修好 guard"） |
| guard **内部**链断（bash/python/git 不可用） | `claimed` 空 → 跳过认领判定 | `_fail_closed()`：block + degraded + 点名（第二轮） | 无 |

## 第二轮追加（CTO 授权，2026-09-20）：CI 诊断 + 链断 fail-closed
1. **ubuntu 回归定位**（`synova-commit.test.sh` pass=16 fail=1，本地不可复现：CI 环境变量、detached HEAD、
   ci.yml 全清单同 shell 串跑三种尝试均 17/0）→ 按 CTO 授权把**失败断言名 + 关键环境事实**打进末尾 8 行
   （CI 注解只带 `tail -8`，而 ❌ 行被其后的 ✅⑥⑦⑧ 挤出可见区）。
2. **Windows 真病因**（CI 注解原文：`OUT=Windows Subsystem for Linux has no installed distributions`）：
   子链里起来的不是 Git Bash 而是 **WSL 桩 `C:\Windows\System32\bash.exe`** → resolver 没执行 →
   `PROBE_RC=1` 零输出 → 认领判定整条 fail-open。处置：guard 侧自包含 bash 选择（试运行校验）+ 链断 fail-closed。
3. **契约新增**：`SYNO-RESOLVER-DEGRADED\t<原因>`（resolver 发、guard 解析；**同字面量两端**，
   夹具场景 H 守双端一致）；语义 = 认领判定整条不可用 → block（不是 pass）。

## 第三轮追加（2026-09-20）：② 双平台共有 + 夹具 bash 自包含
1. **ubuntu 与 windows 是同一断言在红**（CI 实测两平台都 `pass=16 fail=1` + `DIAG-FAIL ② 应拦, 实际 exit=0`）
   → 收窄为 **"CI 环境"专属**（本地六路复现全 17/0：终端/管道、CI 环境变量组、detached HEAD、ci.yml 全 43 项
   同 shell 串跑、最 CI 像的最小环境（`env -i` + 无 HOME gitconfig + CI 变量）、git 全局/system config 全屏蔽）。
   → 本轮把 ② 的**链路证据**做成末尾 8 行可见（CI 注解唯一通道）：`DIAG-② staged=[...] gl=[synova-commit 在
   guard 段打印的那行] grc=<直调 guard rc> "status": "<block|warn|pass|degraded>"`，一次注解即可判
   "崩了 / 跳了 / 降了 / 放了"四态中的哪一态。已自检：注入 ② 失败 → 三者如期出现；正常态零新增输出。
2. **夹具自身 bash 自包含**（清 windows A/C/H 的 `PROBE_RC=1`）：`BASH_BIN="$(_pick_bash)"`（SYNO_BASH →
   PATH → /bin/bash → Git Bash 两处，逐个**试运行**）；`_probe_chain` 的 native python 两条 spawn 改为
   显式绝对路径（native python 解析裸 `bash` 走 **Windows PATH** → 命中 **WSL 桩**，MSYS 形 PATH 前置对它无效）；
   夹具自己三处 `bash ...` 调用统一 `"$BASH_BIN"`；PROBE 行加 `BASH=<basename>`（字段前置，活过 DIAG2 截断）。

## 第五轮（2026-09-20）：F12 同款取证通道铺到剩余两夹具
CI 实测（`ddd283ac`）：**ubuntu success**；windows 只剩 `claim_release.test.sh` 与 `staging_guard.test.sh`。
- `staging_guard.test.sh`：`PASS=36 FAIL=2`，`DIAG2 PROBE_RC=0 PY=python3:0 BASH=bash OUT=…D902-b.md`
  → **链已通**（不是生产 fail-open），FAIL=2 落在场景期望/准备面。DIAG1 显示 A/C 的 exit/status **恰是它们期望的**
  （A=ec0/warn、C=ec0/warn），故最可能是 H 的两条断言 → 但**不按推测改期望**：本轮把 `DIAG-FAIL <断言名>`
  压进 tail-8，并新增 `DIAG-H`（在 shim PATH 下直跑 resolver 的 rc / 是否发标记 / 输出）→ 一轮即可点名。
- `claim_release.test.sh`：失败断言被尾部 ✅ 挤出注解可见区（**F12 实证**）→ 照 `synova-commit.test.sh`
  同款加 `DIAG-FAIL` + `DIAG-ENV`（py/bash/git）进 tail-8。
- 两处均为**取证通道**，零语义变更、零断言放宽；自检：注入失败 → `DIAG-FAIL …` 如期出现；正常态输出零变化
  （staging_guard 38/0、claim_release 33/0）。

## 第六轮（2026-09-20）：H 前提修正 + H2 契约级 + 诊断压缩
CI（`e974da23`）断言级证据到位：
- `staging_guard.test.sh`：`DIAG-H rc=1 mark=[SYNO-RESOLVER-DEGRADED] out=[]` → **直调 resolver 确实断链并发标记**，
  但同场景走 guard 是 `ec0/warn`。根因判定：**夹具 H 的"shim 断链"前提在 Windows 上不成立**——
  guard 侧 `_bash_env()` 会把 `Path(sys.executable).parent`（Windows = hostedtoolcache，**里面有可用 python3**）
  前置进 PATH → PATH 上的坏 shim 被"反超" → 链根本没断 → guard 正常判 → 命中场景 C 留下的"D901 已释放"台账 → warn。
  （不是 guard 没接标记：那一路由 H2 全平台确定覆盖。）
- 处置：H 改为**前提探针门控**（直调 resolver 未发标记 → 打印 `⚠ 场景H 前提不可造（…）→ 不适用`，
  **不计分也不静默通过**）；新增 **H2 契约级**：把沙箱 resolver 换成"只发 `SYNO-RESOLVER-DEGRADED` + exit 1"的桩
  → 断言 guard `exit 1` + `status=block` + `degraded:true` + 原因点名。H2 **与环境无关**，
  且在基线 guard（无标记解析）上红 3 条 = 判别性成立。
- `claim_release.test.sh`：`DIAG-FAIL` 条目压到 ≤26 字符（4 条断言名一起活过 `cut -c1-450`）；
  新增 `DIAG-⑧` 打印 `str repo` vs `Path repo` 的原始差异（`BOTH=[…]`），供下一轮定位 Windows 上的 str/Path 分歧。

## 第七轮（2026-09-20）：H 前提探针复刻 guard 环境 + ⑧/⑪ 短 Traceback
CI（`ab88069c`）证据：`DIAG-H … g_deg="degraded": true` + H 端到端仍 `ec0/warn` ⇒ 与判读一致：
**H 走的不是链断那条路**（guard 那次调用里 PATH 上仍有可用 python）。
- **H 的判定（本卡的裁决，附依据）**：H 的端到端两条断言改为**前提门控**——前提探针**复刻 guard 的调用环境**
  （`_find_bash()` + `_bash_env()` + `parse_resolver_degraded()`，且继承场景的坏 shim PATH、用绝对解释器启动）
  → 探针报 `NOMARK` 时打印"前提不可造/该状态在 guard 调用路径上不可达"并**不计分**。
  **依据**：`_bash_env()`（Windows-only）把 `Path(sys.executable).parent` 前置进 PATH ⇒ 只要 guard 在跑，
  它派生的 resolver 一定找得到 python ⇒ "guard 调用路径上 python 不可用"在生产**不可达**；保留计分 = 永久红的
  环境性断言。生产方契约（resolver 发标记）与消费方契约（H2：guard 接住标记 → fail-closed，基线红 3 条）
  **两侧都由确定断言覆盖**，故这不是放宽，而是把不可达状态从"必红"改为"显式不适用 + 有证据"。
  POSIX 上探针报 `MARK` ⇒ 端到端断言照旧执行（本地 43/0）。
- **⑧/⑪ 短 Traceback**：`DIAG-⑧` 对 Traceback 只留**末尾 4 行**（失败帧 + 行号 + 异常行，实测 107 字符）；
  新增 `DIAG-⑪`（release 的 rc / 台账文件是否存在 / 原始输出首 60 字符）——⑧ 与 ⑪ 同走台账写路径，一次取证两边。

## 第八轮（2026-09-20）：claim_release 夹具路径命名空间（D849 同款漏改）
CI（`d44b0cea`）证据：`stageing_guard` 已转绿（H2/前提门控在 CI 验证成立）；只剩 `claim_release.test.sh`
（⑧×2 + ⑪×2），且 `DIAG-⑧` 给出 `File "<string>", line 4` + `⑪` 的失败值里是 **`FileNotFoundError`（读台账）**。
**根因判定（证据链，非猜）**：
1. 生产模块**无 import 期 FS 访问**（AST 逐条列模块级语句验证 + 用不存在路径做 sys.path 首项导入 → import OK）
   ⇒ ⑧ 的炸点不在生产 import。
2. ⑪ 的失败值是**夹具自己的内联 python 读**台账时的 `FileNotFoundError`（`<string>` line 1）——是**读**失败，
   不是 `save_ledger` 写失败（若写炸，CLI 会 traceback，且 `ledger=` 会显示别的东西）。
3. **`claim_release.test.sh` 的沙箱路径从未做 D849 的 `cygpath -m` 归一化**（兄弟夹具 `staging_guard.test.sh:117`
   有，且其注释记的正是同一失效模式）⇒ Windows 上 `$SB` 是 MSYS 形 `/tmp/...`，**native python 读成 `C:\tmp\...`**
   → 夹具的 `sys.path.insert`/`open('$SB/task-state/…')` 与 CLI 的 `--repo $SB` 落在不同根 → ⑧/⑪ 双红。
**处置**：`SB_RAW=$(mktemp -d)` + `SB="$(cygpath -m "$SB_RAW" ...)"`（bash 可 cd/glob、native python 可 open = 同实体；
POSIX 原值零变化），trap 清理 `SB_RAW`。**生产侧无需改动**（`ledger_path()`/`save_ledger()` 一律从 `repo` 入参构造，
调用方传原生形即正确）；诊断预算重排为 ⑪→⑧→FAILLOG→ENV（各 ≤110，合计 407 < 450）。

## 架构层: 基础设施
控制塔门禁层（`scripts/workflow/**` + `scripts/control-tower/**` + `tests/control-tower/**`），不进 L1-L5，不 import `src/**`。

## Done 标准
- [ ] ① PYBIN 试运行口径落地（坏 shim 不被选中）— verify: `grep -q 'import sys' scripts/workflow/resolve-commit-brief.sh`
- [ ] ② 5 处 python 注入全用 `ROOT_W` — verify: `[ "$(grep -c "r'\$ROOT_W\|r'\$PARSER_DIR_W" scripts/workflow/resolve-commit-brief.sh)" -ge 5 ]`
- [ ] ③ resolver 的 git 调用剥 `GIT_*` — verify: `grep -q 'GIT_WORK_TREE\|GIT_DIR' scripts/workflow/resolve-commit-brief.sh`
- [ ] ④ `claim_release.py` stderr 也 UTF-8；`cp1252` 下中文可断言 — verify: `PYTHONIOENCODING=cp1252 python3 scripts/control-tower/claim_release.py --repo /nonexistent scan 2>&1 | grep -q '契约不满足'`
- [ ] ⑤ macOS 两夹具仍绿（>= 基线）— verify: `bash tests/control-tower/claim_release.test.sh 2>&1 | tail -1 | grep -q FAIL=0 && bash tests/control-tower/staging_guard.test.sh 2>&1 | tail -1 | grep -q FAIL=0`
- [ ] ⑥ DIAG 两行 ≤75 字符且含 PROBE RC/PY/OUT — verify: `bash tests/control-tower/staging_guard.test.sh 2>&1 | grep -E '^DIAG' | awk '{ if (length($0) > 78) exit 1 }'`
- [ ] ⑦ CI `Control Tower Gate Tests (windows-latest)` 与 `(ubuntu-latest)` 均绿（队长并枝触发，唯一判据）

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/task-briefs/2026-09-20-D853-Windows认领制fail-open根治.md | task |
| docs/synova/coordination/小队交付-门禁加固三卡-20260920.md | task |
| memory/notes/implemented/2026-09-20-D853-windows-claim-gate-failopen.md | task |
| memory/notes/proposed/2026-09-20-team-gates-closeout.md | task |
| scripts/control-tower/synova-commit | task |
| task-state/D853.json | task |
| tests/control-tower/synova-commit.test.sh | task |

