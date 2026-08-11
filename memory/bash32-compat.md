# bash32-compat.md

## 事故

2026-08-11，D321 pre-push 门禁 Mac 兼容修复。三处 bash 3.2 兼容 bug 全部来自 D318「双机可移植」声明未兑现：

1. `scripts/control-tower/verify-parallel.sh:148` — `mapfile -t DOC_ARR <<< "$DOCS"`。`mapfile` 是 bash 4.0+ 专属内建，Mac 默认 bash 3.2 报 `command not found`，pre-push 并行声明验证直接崩溃。
2. `scripts/setup/configure-machine.sh:45,69` + `verify-hooks-installed.sh:59` — `$NAME（` / `$CHP（` 变量名紧贴全角括号 `（`（U+FF08，UTF-8 三字节）。bash 3.2 多字节解析 bug：把 `（` 的字节吞进变量名 → `unbound variable`。修复必须 `${NAME}（` 花括号隔断。

门禁链自身也有同族 bug：`check-plan-integrity.sh` 用 `python` 命令，macOS 只有 `python3` → plan.json 解析全空 → 每次 Mac 提交硬阻断。`pre-commit-check.sh` 6 处 `grep -oP`（PCRE 专属，BSD grep 不支持）打噪音。

## 教训

- **bash 3.2 兼容三原则**：① 禁 bash 4+ 专属内建（mapfile/readarray/declare -A）；② 变量名紧贴非 ASCII 字符必须花括号 `${X}（`；③ GNU 专属 find 选项（-newermt）在 Mac BSD find 上需实测而非假设。
- **Mac 无 `python` 命令**：只有 `python3`。控制塔脚本一律 `python3`。
- **macOS BSD grep 无 `-P`**（PCRE）：`grep -oP` 报 `invalid option -- P`。含 `\K` 的模式需用 sed 重写，纯 ERE 可改 `-oE`。
- 声明「兼容」必须实测：D318 声称兼容 bash 3.2 但 mapfile/全角括号漏网。验证方式是实机 `bash scripts/...` exit 0，不是读文档。

## 免疫

- pre-push/pre-commit 门禁链脚本新增改动后，必须在 bash 3.2 实机跑通 exit 0。
- grep 物理门禁：`grep -rn "mapfile" scripts/` 零残留；`grep -rnE '\$[A-Za-z_][A-Za-z0-9_]*（' scripts/` 零残留。

关联：[[dual-source-fraud]] [[grep-semantic-overreach]] 仓库 `memory/` 下既有教训文件；D321 brief `.claude/task-briefs/D321-bash32-hook-chain.md`。
