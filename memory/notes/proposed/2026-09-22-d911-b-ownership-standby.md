---
状态: proposed
日期: 2026-09-22
决策: ownership 域门禁的「代行」做成**单点可逆事实登记**（`ownership.yaml` 的 `standby:` 段）而非权限通道——① 段存在 → `check-ownership.py --proxy <域>=<代行域>` 显式断言才改判，逐条打印归属 + 理由；② 段缺失 = 严格模式（现状），故「win 回归 = 删该段」是可执行验证；③ 段存在但结构非法 → fail-closed `exit 2`；④ `docs/**`/`tests/**` 未登记子目录 → 显式点名「新目录没登记」（诊断性提示，不新增阻断）。
理由: ① 实缺陷：win 离线期 Mac 代行件（#696/#703/#705/#706 族）无门禁可走，被迫「拆 PR」绕行；派单 §〇-c 红线 2 明令不新增门禁机制，只做「去误拦 + 判据钉死」。② 同类第 4/5 次（D782 / D793 / D795 / D861 / D914）根因都是「新目录没登记 → 落 `**` 兜底 = win → 混装 PR 被误报『变更跨域』」，执行方看不出真错——诊断性提示优先于新增拦截（派单 §三 要求零新增红 + 既有测试全绿）。③ 事实登记 > 权限授予（第一性原理）：状态消失即自动回严格，不依赖任何人记得关；`standby` 段缺失不是错误（删段 = win 回归 = 合法），只有格式非法才是 `exit 2`。④ 创始人口令原文「win 机器不在线，所有 domain:win 任务一律 Mac 代行，直到创始人说「win 回归」」——`authority` 字段如实标注**转抄来源** `.claude/task-briefs/2026-09-22-D861-win测试修复-代行.md:5`（转抄件，非创始人原始消息）。
---

## 本件落地（切片 B 前半）

- `docs/synova/coordination/ownership.yaml` —— 增 `standby:` 段（当前仅 `win`：`offline_since` / `proxy` / `authority` / `domains`）
- `scripts/control-tower/check-ownership.py` —— 读 `standby` + 结构/字段值校验；新增 `--proxy` 代行断言路径（逐条打印归属与理由）；B5「无显式规则的目录」显式提示
- `.github/CODEOWNERS` —— 由 `--emit-codeowners` 重新生成（禁手改，drift 逐字节断言）
- `tests/control-tower/check-ownership.test.sh` —— 新增 standby/`--proxy`/B5 用例（111 项）

## 三条判据钉死（自验员新发现，2026-09-22 队长裁定；均属 B4/B5 既有范围，不新增机制）

1. **字段值也 fail-closed**：`offline_since` 若存在必须是合法 `YYYY-MM-DD`（10 字符 + 连字符位 + 日历有效），否则 `exit 2`。理由：坏值会被 B2 原样织进「理由」串，而理由串是 K3 可核的**审计链**——坏值进链 = 审计证据不可信，比「少拦一个坏配置」严重。
2. **`--proxy` 值非法 = 坏参数 → `exit 2`**：域不在已知域集合（`win=bogus` / `bogus=mac`）→ `exit 2`；**合法但未授权**的域对（`k3=mac` / `mac=win`）→ 仍 `exit 1` + `⚠️ 不生效`。理由：D328 三态——`1` 必须专指「确实越域」，`2` 专指「判不了/参数坏」；混用会让 K3 无法从退出码区分「真越域」与「调用写错」= 判据漂移。
3. **文案按层级**：B5 统一说「无显式规则的目录」（顶层目录 / 子目录），不把 `tests`、`docs` 这类**既有**顶层目录称「新目录」。逻辑/阻断/范围不变（仍只 `docs/**` + `tests/**`）。

## 显式边界

- **B3 不在本件**：`scripts/control-tower/check-pr-budget.sh`（`## 代行声明` 段落）由另一编码独占，本件零改动。
- **`standby` 不是 CODEOWNERS 的输入**（队长 2026-09-22 定）：单点开关不得成为 `.github/CODEOWNERS` 的**双写点**——否则「win 回归」要改两处。故 `emit_codeowners(rules, github)` **不接受** standby 参数；反证 = 删段后重跑 `--emit-codeowners` 输出**逐字节不变**（测试 §12 断言），`.github/CODEOWNERS` 本次零 diff。
- **不新增阻断**：B5 只做诊断性显式提示（如需新增拦截须先报队长）。
- **不碰共享解析器**：`scripts/product-lines/productline_yaml.py` 零改动，只用其现有子集能力。

## 相关 D#

- 卡：`task-state/D911.json`（上游派单件 `docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md` §一 切片 B）
- 相关 D#: D733（ownership 机器化）、D734（单域判定豁免）、D914（三目录补登记，本件 B5 治本）
- 同族历史：D782 / D793 / D795 / D861（新目录未登记 → 误报跨域）
