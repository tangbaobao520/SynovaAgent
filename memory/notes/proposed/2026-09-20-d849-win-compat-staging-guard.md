---
状态: proposed
日期: 2026-09-20
决策: 门禁夹具在跨平台 CI 上必须"链路断裂即红"——夹具底座（沙箱路径命名空间 / git 底座 / 哈希工具 / 未定义函数）一律显式断言，禁止静默 fail-open；Windows 侧无法本地复跑时，失败时把链路证据压进 CI 注解可见的末行 DIAG
理由: D849 实证——staging_guard.test.sh 在 windows-latest 上 12 断言红，根因不是断言写错，而是"夹具底座静默 + 认领链在 Windows 上瞎了"：链路的失效被夹具报成了"门禁正确地没有拦"，即假绿。夹具若能把 fail-open 伪装成通过，它就比没有夹具更危险（会被当作门禁强度的证据引用）
---

## 上下文（D849）

**来源**：CI 实证（PR #657 必需检查 `Control Tower Gate Tests (windows-latest)` 红；main 同 job 全绿）。
注解原文：`场景B(反向仍拦) FAIL / 场景C(持久化) FAIL / 场景D(降级不放行) FAIL / 场景G(降级可见) FAIL / PASS=19 FAIL=12`。
同批 `claim_release.test.sh` 红因 `shasum: command not found`（Windows Git Bash 无该工具）。

**为什么必须做**：slice A（D846/D847）的 PR 叠加在 #657 之上 → 本文件不转绿，A 的 PR 永远过不了必需检查。

## 定位（现象 → 根因 → 改法 → 依据）

| # | 现象 | 根因 | 改法 | 依据（file:line） |
|---|---|---|---|---|
| ① | Windows 上 B/D/G 全丢 block、C 不再 block、A 丢释放依据 | 夹具未让 python→bash 子链的依赖自包含 → 子链里 `git rev-parse --show-toplevel` 不可达 → ROOT 落 `pwd` 回退 = MSYS 专有路径（`/tmp/...`）→ resolver 内嵌 native python 的 `open()`/`os.listdir` 读不到沙箱 → 认领判定静默 fail-open | 夹具显式把 git/python/bash 目录并入 PATH（POSIX 形，MSYS 自动转 native） | `scripts/control-tower/staging_guard.py:153`（裸 `subprocess.run(["bash", ...])`，无自包含 env）；`scripts/workflow/resolve-commit-brief.sh:31`（`git … \|\| pwd`）；同类先例 `scripts/hooks/hook-git-detect.sh:37`（D564） |
| ② | 沙箱路径在 native 进程里不可见 | `mktemp -d` 给 MSYS 专有形（`/tmp/...`）；native python 读成 `C:\tmp\...` | 沙箱路径取 `cygpath -m` 的 mixed 形（`C:/...`）：bash 可 cd/glob、native python 可 open = 同实体 | `tests/control-tower/tag-bypass-wiring.test.sh:313`（本仓既有同款断言） |
| ③ | 链路瞎了却报成"门禁没拦" | 底座 `git init/add/commit` 三行全 `>/dev/null 2>&1`，无任何断言 | 底座断言存在（失败 `exit 2` 带原因）+ 新增"认领链看得见沙箱"前置断言（复刻 guard 的 spawn path） | 夹具旧 `:47-49`、`:68-69` |
| ④ | 场景 G 准备步骤静默失效 | `:185` 调未定义函数 `set_state`（只存在于 `claim_release.test.sh`），夹具无 `set -e` → 只打噪音 | 改 `mk_state`（本文件既有函数） | K3 D841 报告 P2-2 |
| ⑤ | 场景 F 围栏在 Windows 恒绿（假绿） | `shasum` 缺失 → 前后指纹都取到空串 → "空 == 空" | 可移植哈希（`sha256sum`→`shasum`→`python3 hashlib`）+ 哈希不可得时**判红** | 夹具旧 `:34`/`:200`；CI 注解 `shasum: command not found` |
| ⑥ | Windows 侧无法定位 | CI 只把 `tail -8` 注入 `::error` 注解 | 失败时把链路证据（各场景 exit/status + 子链 path 命名空间/git/python 可达性 + resolver 输出）压进**末尾** DIAG 行 | `.github/workflows/ci.yml:272` |
| ⑦ | 场景 A 在 D846 新语义下会红 | 释放判定改读**已提交**卡（`git show HEAD:`），而夹具 `mk_state` 只写工作树 | `mk_state` 写卡后 `git add` + `commit`（NONE 分支不变） | 编码 A D846 实测；`claim_release.py` 证据源 2 |

## 边界与后续

- 只改夹具：`scripts/control-tower/staging_guard.py`、`scripts/workflow/resolve-commit-brief.sh` 零改动。
- **残留（需另开卡，本卡不扩权）**：`resolve-commit-brief.sh` 三处 Windows 脆点——
  (a) `:54` `command -v` **只探存在性不探可用性**（D328 P1-1 同型；本仓 11 处已改"试运行"口径，
  resolver 未改）；(b) `:307` `[ -f "$RESULT" ]`——native python 的 stdout 在 Windows 是 CRLF，
  `$( )` 只剥 `\n` 保留 `\r` → `-f` 恒假（可能使 resolver 在生产 Windows 上返回 fallback brief）；
  (c) `:34` `dirname "${BASH_SOURCE[0]}"`——调用方（`staging_guard.py:154`）传的是 `str(Path)` 反斜杠形，
  coreutils `dirname` 只认 `/` → `RESOLVER_DIR` 退化成 `.` → `PARSER_DIR_W` 指向错误目录 → 降级路径 ImportError。
  三者都在被测实现内，且 (b)(c) 属 D839 引入面，建议随 D846/D847 之后的实现卡处理。
- 待验：CI `Control Tower Gate Tests (windows-latest)` / `(ubuntu-latest)` 双绿（AI 本地无 Windows）。
