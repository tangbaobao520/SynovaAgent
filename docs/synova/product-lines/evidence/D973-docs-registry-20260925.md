# D973 交付回执 — 文档登记清零 + 登记对账探针

> 卡片: `task-state/D973.json` | 执行: coder-b（并行 CTO 小队） | 日期: 2026-09-25
> 分支: `docs/d973-docs-registry`（base = `origin/main` `057d8ca0`）
> 结论: **可提请独立审计**（本件不写「通过」；通过与否归 CTO 收件闸 + K3 终审）

## 〇、收尾三件

| # | 件 | 位置 |
|---|---|---|
| 1 | diff | `git show --stat 97c7693d^`（6 文件 / 654 insertions） |
| 2 | 自验结论 | 本文件 §二（判据逐条挂命令原始输出） |
| 3 | 遗留清单 | 本文件 §四 |

## 一、「未登记」判定口径 v1（判据①）

> **面（判定面 v1）** = `docs/authority/**` ∪ `docs/synova/coordination/CTO-*.md`
> ∪ `docs/synova/coordination/号段水位.md` ∪ `docs/synova/product-lines/evidence/**`
> 内的 **tracked** `.md`/`.yaml`；
> **排除** = 与登记门禁同款的 EXCLUDE 正则
> （`^tmp/|\.claude/|memory/|docs/plans/codex/implementation/|docs/synova/audit-reports/|docs/authority/chronicle-drafts/|docs/synova/DASHBOARD.*\.md$|/archive/|/Archive/`）
> + 台账自身；
> **判「未登记」** = 该路径 **既非**台账声明的精确 `path`、**也不**落在声明的目录条目（尾 `/`）下、
> **也不**命中声明的通配（含 `*`，按 basename，如 `WORKLOG-*.md`）。

**为什么是这个面（第一性原理）**：全仓 tracked `.md/.yaml` = **2188** 份，`docs/synova/coordination/**` = **215** 份
⇒ 全量登记既不现实、也不承载治理语义。台账自述定位是「治理锚点台账」，锚点住在 authority（权威层）
与 coordination（控制塔/CTO 产出），交付回执住在 evidence（M5 强制落点）⇒ 取**最小有义面**。

**为什么不用整文本子串匹配**（原门禁语义）：首轮「改坏即红」实证它**恒绿** ——
把台账里 `CTO-看板-自动.md` 的 `path` 改坏后探针仍 `exit 0`（因为坏行本身仍含该 basename 子串）；
同时它把 `docs/synova/product-lines/evidence/README.md` **误判为已登记**
（命中了 `D:/novis-backup-20260526/…/README.md` 这条遗留条目的子串）。⇒ 升级为解析真实 `path` 值。

## 二、声称 ↔ 证据逐条对应

### ① 口径 + 计数命令 + 原始输出

```
$ bash scripts/control-tower/probes/docs-registry-probe.sh
── 文档登记对账（docs-registry-probe / 判定面 v1）──
  台账: …/docs/authority/DOCS-REGISTRY.yaml
  判定面: docs/authority/,docs/synova/coordination/CTO-,docs/synova/coordination/号段水位.md,docs/synova/product-lines/evidence/
  面内文档数 = 41
  已登记数   = 41
  未登记数   = 0
✅ 登记一致（判定面内 41 份文档全部已登记）
probe_exit=0
```

登记前实测（同一口径，脚本化点数）：面内 41 份，**未登记 29 份**（清单含两条点名文档）。
登记后新增 **30** 条：`DOC-0119` … `DOC-0148`（其中 `DOC-0148` 是升级为精确匹配后**新暴露**的
`docs/synova/product-lines/evidence/README.md`）。

### ② 两条点名文档已登记（grep 原始输出）

```
$ grep -c 'CTO-固化-II-研究院权威结论-20260924.md' docs/authority/DOCS-REGISTRY.yaml   → 1
$ grep -c 'CTO-看板-自动.md'                      docs/authority/DOCS-REGISTRY.yaml   → 1
```
两份本次均**新登记**（登记前 `grep -c` 均为 **0**，与卡面前提一致）。

### ③ 改坏即红（判据③）

**首轮（子串匹配）失败留痕** —— 把 `CTO-看板-自动.md` 那条 `path` 改坏：

```
306:    path: docs/synova/coordination/CTO-看板-自动.md.broken  # INJECTED-RED
$ bash scripts/control-tower/probes/docs-registry-probe.sh
  未登记数   = 0
✅ 登记一致 …        probe_exit=0        ← 假绿！子串匹配使判据失效
```
⇒ 据此把匹配语义改为「解析真实 path 值」。

**改后（精确匹配）同一注入**：

```
$ bash scripts/control-tower/probes/docs-registry-probe.sh
  面内文档数 = 41
  已登记数   = 39
  未登记数   = 2
DRIFT: 以下 2 份文档在判定面内但未登记进台账：
    ❌ docs/synova/coordination/CTO-看板-自动.md
    ❌ docs/synova/product-lines/evidence/README.md
  probe_exit=1
```

恢复 + 登记 `README.md` 后：

```
$ grep -c 'INJECTED-RED' docs/authority/DOCS-REGISTRY.yaml     → 0
$ bash scripts/control-tower/probes/docs-registry-probe.sh     → 未登记数 = 0, exit 0
```

### ④ 配对测试

```
$ bash tests/control-tower/docs-registry-probe.test.sh
  ✅ ① 全部已登记 exit 0 ／ ① 输出含一致 ／ ① 输出面内计数
  ✅ ⑤ 有未登记 exit 1 ／ ⑤ 输出含 DRIFT ／ ⑤ 逐条点名未登记文件
  ✅ ⑦ 目录条目覆盖其下文档 → exit 0
  ✅ ⑦b 仅正文提及 ≠ 已登记 → exit 1 ／ ⑦b 输出仍点名该文件
  ✅ ⑥ audit-reports 被排除 → exit 0 ／ ⑥ 面内只计 1 份
  ✅ ⑨ 面板改到 audit-reports 后 exit 2（EXCLUDE 使其为零面）
  ✅ ⑧ --list exit 0 ／ ⑧ --list 打印未登记路径 ／ ⑧ --list 未打印报告体
  ✅ ② 台账缺失 exit 2（fail-closed）／ ② 输出含 fail-closed
  ✅ ③ 零面 exit 2 ／ ③ 输出说明零面
  ✅ ④ 非 git 目录 exit 2 ／ ④ 输出含 fail-closed
  ✅ ⑩ 探针路径符合 probes/*-probe.sh 发现面
✅ 全部通过: 22 项（22 通过 / 0 失败）        exit=0

$ SYNO_TEST_ARM=1 SYNO_CT_STAGED="scripts/control-tower/probes/docs-registry-probe.sh" \
    bash scripts/control-tower/ct-test-gate.sh
SYNC-OK: 控制塔脚本配对测试全绿 (1 个脚本)      exit=0

$ SYNO_GATEKEEPER_ACK=1 bash scripts/pre-commit-check.sh     → ✅ 全部 13 组通过 exit=0
```

### ⑤ YAML 合法性 —— **卡面原始命令在本机跑不通，已改等价解析器**

```
$ python3 -c "import yaml;yaml.safe_load(open('docs/authority/DOCS-REGISTRY.yaml'))"
ModuleNotFoundError: No module named 'yaml'          ← 本机无 PyYAML（实测）

$ ruby -ryaml -e "YAML.load_file('docs/authority/DOCS-REGISTRY.yaml')"
Psych::SyntaxError: found unknown escape character while parsing a quoted scalar at line 118 column 11   ← 修前：台账是非法 YAML

$ node -e "const fs=require('fs'),y=require('js-yaml');const d=y.load(fs.readFileSync('docs/authority/DOCS-REGISTRY.yaml','utf8'));console.log('PARSE OK documents =',(d.documents||[]).length);"
PARSE OK documents = 69                              ← 修后：合法（js-yaml 为等价解析器）
```

**修的是哪一处**：`:118` `note: "ClawOrg 文档中心 README（E:\ClawOrg-BOX 时代的目录规范）"` ——
双引号标量里的 `\C` 是未知转义 ⇒ 改为单引号 `'…（E:\ClawOrg-BOX …）'`（单引号内反斜杠字面量）。
全文件仅此 1 处反斜杠（`grep -c '\\'` = 1）。

## 三、Agent 自检 5 问

1. **接线**：探针落 `scripts/control-tower/probes/*-probe.sh`（D1008 通用 runner 的发现面）；
   测试第 ⑩ 项断言该面成立。本卡不改 runner。
2. **异常/降级**：4 类降级全部显式（台账缺失 / 面内零文档 / 非 git / 无 Python → exit 2；不静默）。
3. **类型安全**：无 TS 代码。
4. **测试质量**：22 项断言，覆盖正常（①）/ 降级（②③④）/ 边界（⑤⑥⑦⑦b⑧⑨）+ 接线（⑩）；
   「改坏即红」已验证且**首轮抓出了真缺陷**（子串匹配恒绿）。
5. **残留清理**：`INJECTED-RED` 在 `docs/authority/DOCS-REGISTRY.yaml` 计数 0、在本次 diff 新增面计数 0；
   未改门禁本体、未动他人写集。

## 四、遗留清单（未清项）

1. **卡面判据⑤ 原始命令不可执行**：本机无 PyYAML（`ModuleNotFoundError`）⇒ 改用 `node + js-yaml`
   等价解析器。**若 CI 环境有 PyYAML，原始命令应能通过**（台账已验证为合法 YAML）；本机未验证该分支。
2. **登记门禁扫描面更正**：门禁实际是 **untracked 新增 ∪ staged 新增**（`doc-registry-gate.sh:41-43`），
   非卡面所述「仅 untracked」。卡面「工作树 untracked=0 ⇒ 检查 0 个文档」只在**无暂存**时成立。
3. **CI 会硬拦未登记新增 `.md`**：`ci.yml:84-87` 以 `SYNO_CI=1` 跑 `pre-commit-check.sh` ⇒ D2 软提示在 CI 转硬。
   ⇒ **D1013 的 `号段水位.md` 与两份 evidence 回执（D1011/D1013）必须登记**，否则其 PR 的 CI 会红。
   本卡已**前瞻登记** `docs/synova/coordination/号段水位.md`（DOC-0146），但 D1011/D1013 的 evidence 回执
   在**各自分支上新建**，其登记需按分支补 —— **合并顺序影响 CI 是否变红，已报队长**。
4. **M5/M6 与登记门禁的摩擦（待 CTO 决策）**：M5 要求每任务落 evidence 回执，而 D2 要求每个新增 `.md` 登记
   ⇒ 每次交付都要顺带改 `DOCS-REGISTRY.yaml`。本卡把 evidence 面纳入判定面使其**可见**，但摩擦本身未消除
   （可选处置：把 `docs/synova/product-lines/evidence/` 加入门禁 EXCLUDE，或在 M6 流程里固化「回执 + 登记」同提交）。
5. **探针不含「幽灵条目」硬判据**：台账里声明的路径若在工作树与 `origin/main` 都不存在，本卡**未**判 DRIFT
   （跨分支/前瞻登记期属正常，硬判会误报）。当前 8 条 `D:/novis-backup-*` 遗留条目亦不在仓库内，
   属历史遗留，本卡未清理（超出写集语义）。
6. **未跑重型验证**：本卡为治理脚本 + 台账，无产品码改动。

## 五、SHA 回执

```
$ git rev-parse HEAD | cut -c1-12
97c7693dbc58
$ git ls-remote --heads origin docs/d973-docs-registry | cut -c1-12
97c7693dbc58
$ git log -3 --format='%h %s'
97c7693d chore: bypass COMMITTED 登记 (auto hook, D521)     ← post-commit hook 影子登记
<实体>   docs(D973): 文档登记清零（口径收窄 + 匹配语义升级）+ 登记对账探针
057d8ca0 feat(D964-P1b): check-citations 加 archive/** 豁免根（归档断链不误拦） (#771)   ← base
```

本地 HEAD 与远端 **12 位一致**（`97c7693dbc58`）。

---

## 六、D973 改号 + verifier 退回修复（2026-09-25 二轮）

### 6.1 改号（CTO 裁决：D1000–D1099 属 Win 侧号段）

| 项 | 旧 | 新 |
|---|---|---|
| 卡号 | D1012 | **D973** |
| 分支 | `docs/d1012-docs-registry` | `docs/d973-docs-registry` |
| task-state | `task-state/D1012.json` | `task-state/D973.json` |
| brief | `.claude/task-briefs/2026-09-25-D1012-docs-registry.md` | `…-D973-docs-registry.md` |
| Note | `memory/notes/proposed/2026-09-25-d1012-docs-registry-probe.md` | `…-d973-docs-registry-probe.md` |
| 本回执 | `…/evidence/D1012-docs-registry-20260925.md` | `…/evidence/D973-docs-registry-20260925.md` |

做法：`git branch -m` + `git mv`（4 文件）+ 内容全量替换 `D1012`→`D973` / `d1012`→`d973`
（含 `DOCS-REGISTRY.yaml` 内 DOC-0149 的 `path` 与注释、探针/测试注释、Note 的「任务:」字段）。
**无 force push**；旧远端分支名按队长指令删除（取号器拒绝面匹配分支名里的 `d<num>`，留旧名仍撞号）。
残留检查：`git grep -c 'D1012\|d1012'` → **0**。

### 6.2 verifier 退回修复（方案①）——`--list` 退出码语义

**退回成立**（我复核确认）：探针原 `:174-176`

```bash
if [ "${LIST_ONLY}" -eq 1 ]; then
  printf '%s\n' "$UNREG_LIST"
  exit 0            # ← 无条件 exit 0，与 $UNREG 无关
fi
```

同一仓库状态（未登记 2）下：不带 `--list` → `exit 1`（正确报 DRIFT）；带 `--list` → **`exit 0`（有未登记却报「一致」）**。
契约头原写 `0 = 未登记 0（一致）／1 = DRIFT／2 = fail-closed`，**无 `--list` 例外**；而 `--list` 自述「脚本可消费」
⇒ 消费方读 `rc` 会误判。测试还把该错误行为**固化**（原断言「有未登记 → exit 0」）⇒ CI 永远绿。

**修复**：`--list` 只改**输出形态**，不改**退出码语义** —— 按 `${UNREG}` 返回 0/1。

```
if [ "${LIST_ONLY}" -eq 1 ]; then
  printf '%s\n' "$UNREG_LIST"
  if [ "${UNREG}" -gt 0 ]; then exit 1; fi
  exit 0
fi
```

契约头同步写明：「**--list 与不带 --list 完全同码**（无例外分支）」+ `@exit-exception` 仅 `--help`。

**测试同步**（不再固化错误）：原 ⑧「有未登记 → exit 0」改为「有未登记 → **exit 1**（与不带同码）」，
并新增 ⑧b（无未登记 → exit 0 且清单为空）与 ⑧c（同一状态下两者**必须同码**的回归守卫）。
测试 **22 → 25 项**，全绿。

### 6.3 「无条件 exit 0」同类自查（请你要求）

逐条核查探针内全部 `exit` 语句：

| 行 | 语句 | 判定 |
|---|---|---|
| `-h/--help` | `exit 0` | **约定惯例**（只打印用法，不作「一致」声明）⇒ 已在契约头 `@exit-exception` 显式登记 |
| 未知参数 | `exit 2` | fail-closed ✓ |
| 无 Python / 无仓库根 / 台账缺失 / 子进程无输出 / ERR= / 计数非数字 / 零面 | `exit 2` | fail-closed ✓ |
| `--list`（原 :176） | `exit 0` | ❌ **唯一缺陷**，已修 |
| DRIFT 分支 | `exit 1` | 条件化 ✓ |
| 一致分支 | `exit 0` | 条件化 ✓ |

⇒ **同类仅此 1 处**，无其他「无条件 exit 0」。

### 6.4 D708 夹带修复（本批系统性缺口）

`task-state/D973.json` 的 `write_set` 补入本卡自产治理产物
`docs/synova/product-lines/evidence/D973-docs-registry-20260925.md`
（原缺失 ⇒ D708 判「写集外文件夹带」⇒ `quality` 红 ⇒ `test` 被 skip ⇒ 必需 Vitest 永不报告）。
brief 的 Q2「做什么」清单同步补入该文件（G12 范围一致性）。
write_set 现 7 项：台账 / 探针 / 配对测试 / Note / brief / task-state 自身 / 本回执。

### 6.5 二轮实测（新分支上复跑）

```
$ bash scripts/control-tower/probes/docs-registry-probe.sh
  面内文档数 = 42
  已登记数   = 42
  未登记数   = 0
✅ 登记一致（判定面内 42 份文档全部已登记）        exit=0

$ bash tests/control-tower/docs-registry-probe.test.sh
  ✅ ⑧ --list 有未登记 → exit 1（与不带 --list 同码）（= 1）
  ✅ ⑧b --list 无未登记 → exit 0（= 0）／⑧b 清单为空（= ）
  ✅ ⑧c --list 与不带 --list 同码（有未登记 = 1）（= 1）
✅ 全部通过: 25 项（25 通过 / 0 失败）             exit=0
```

面内 41 → 42 的差分说明：本回执自身在首轮提交前为 **untracked**（`git ls-files` 不计），
首轮提交后转为 tracked ⇒ 进入判定面并已在台账登记（DOC-0149）。

### 6.6 更正：CI 硬红归因（队长已实测，我采纳）

我首轮登记的担忧「新增未登记 `.md` 会让 CI 硬红」**已被队长实测否定**：PR #791 的 `Iron laws check` 通过，
其中 `✅ D2 登记门禁: 检查 0 个文档，0 个未登记`；**真正的红是 step 10 的 D708 夹带**（即 6.4）。
⇒ 本卡**未**为登记门禁做任何改动；`号段水位.md` 的登记（DOC-0146）按队长指示保留。
