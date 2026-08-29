---
状态: implemented
日期: 2026-08-30
决策: subprocess 调 bash hook 的场景下，调用方以 SYNO_PYTHON 显式注入确定可用解释器，hook 优先消费、缺省回落 PATH python3
理由: hook 依赖链中的 python3 在 Windows CI 上不可靠（WindowsApps python3 为 Store 占位 stub 执行即 9009，且被 _bash_env 前置在拼接 PATH 中先于可用解释器）——PATH 解析是赌博，显式传递是契约。hook 未注入时回落原行为，Claude Code/Codex 真实会话挂载零变化
---

## 上下文（D564）

PR #305 Windows gate 首测 incident-loop.test.sh 6/8（run 33257792825，check-run
99114428263 annotations 物理证据）。排除法定位双失败 = 断言 6 + 4b（两条 verify）：
唯一依赖子进程 hook 环境的断言。根因链：

```
incident-loop.py verify() → subprocess(bash hook-git-detect.sh, env=_bash_env())
  → _bash_env 拼接 PATH（D316）: [Git bins, sys.executable 目录, WindowsApps, 原 PATH]
  → hook L33 `python3 -c` 解析 → WindowsApps python3 = Store stub（9009 失败）
  → `|| echo ""` → COMMAND 空 → L53 fail-open exit 0 → 输出无「禁止」
  → verify() 判 open → 2 断言失败（6/8）
```

D316 的修复（把 WindowsApps 加进 PATH 找 python3 shim）在 GitHub runner 上反噬：
那个 shim 是坏的占位符。第一性原理：hook 需要「一个可用解释器」，调用方
（incident-loop.py）已知一个（sys.executable）——显式传递，不赌 PATH。

## 落地

- `scripts/control-tower/incident-loop.py` `_bash_env`: `env["SYNO_PYTHON"] = sys.executable`（POSIX/nt 双分支单一语义）
- `scripts/hooks/hook-git-detect.sh`: `PY_BIN="${SYNO_PYTHON:-}"` 优先，空则回落 `command -v python3`（D312 原行为）
- 回归: tests/control-tower/incident-loop.test.sh 4c（PATH 无 python3 下 hook 仍拦 stash，双平台确定性；先红 8/1 → 后绿 9/0）

## 相关 D#

D316（bash 显式查找）、D561（POSIX 候选）、D312（stash 禁令 hook）、D535（incident-loop）

## 边界与后续

- hook-git-guard.sh 内部 `python3` 调用（窗口标记写入）在坏 python3 环境仍是 fail-open
  degraded（窗口不写、不阻断）——本批不改（verify 闭环不依赖窗口），同型根因留待后续批
- 其他 hook（hook-block-write.sh 等）的 python3 依赖同型，未在本批范围（Q2 限定 incident-loop 链）
