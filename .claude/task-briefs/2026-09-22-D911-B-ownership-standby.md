# Task Brief — D911 切片 B 前半｜ownership 代行开关（B1/B2/B4/B5）

> 2026-09-22 | 分支 `feat/D911-ownership-standby`（基础 `origin/main` @ `ee0c4eb1`）
> 派单件：`docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md` §一「切片 B」
> **本件 = 切片 B 前半**：B1（`standby:` 单点开关）/ B2（`--proxy` 代行断言路径）/ B4（缺失=严格、非法=fail-closed）/ B5（未登记目录显式提示）。
> **B3（`check-pr-budget.sh` 的 `## 代行声明` 段落）由另一编码独占**，本件不碰（见「不做什么」）。

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔治理层。`docs/synova/coordination/ownership.yaml` 是模块归属的**机器可读唯一源**，消费者 `scripts/control-tower/check-ownership.py`（域判定 + 生成 `.github/CODEOWNERS`）。`check-ownership.py` 三态：`0` 通过 / `1` 越域或跨域 / `2` 检查执行失败（fail-closed）。本件在既有三态内新增「代行」语义，不新增门禁机制（派单 §〇-c 红线 2）。
### b) 文件审计
实测（本工作树内，命令 + 退出码见 Q1）：
- **修前红（缺陷②D733 复现）**：`check-ownership.py <#696 变更集 15 文件>` → `❌ FAIL 跨域: 变更落在 2 个域 ['mac', 'win']`，`EXIT=1`。win 侧三文件全在 `tests/**` 未登记子目录（`tests/agent/**`、`tests/e2e/**`、顶层 `tests/*.test.ts`）。
- **B5 机制实测成立**：未登记路径 `docs/synova/zzz-未登记/x.md`、`docs/foo/y.md` 均判 `win`（落 `**` 兜底）；已登记目录 `docs/synova/dispatch/**`、`docs/authority/**`、`docs/synova/research/**` 判 `mac`（D914 已补登记）。
- **既有测试基线**：`bash tests/control-tower/check-ownership.test.sh` → `✅ 全部通过: 51 项`，`EXIT=0`。
- YAML 子集解析器（`scripts/product-lines/productline_yaml.py`）陷阱实测：裸标量仅允许 `^[A-Za-z0-9][A-Za-z0-9_.\-/() ]*$` → **中文/含非 ASCII 标量的值必须加双引号**；不支持嵌套「列表-of-映射」→ `domains` 用单行内联列表；`load_ownership()` 目前只读 `rules` / `github` / `domain_neutral`。
### c) 决策
- 代行 = **显式、单点、可逆、逐条打印的开关**，不是自动放行通道：`standby:` 段缺失 → 完全维持现状严格模式（`win 回归 = 删该段`）；段存在但结构非法 → `exit 2` fail-closed。
- 新增能力走**契约优先**（铁律 47）：先在本 brief + 脚本 JSDoc 冻结输入/输出/降级/退出码，再写实现。
- B5 取舍：派单 §三 要求「零新增红 + 既有测试全绿」→ **只做诊断性显式提示，不新增阻断**（如需新增阻断须先报队长）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- **实测优先（禁「文档这么说」）**：本件全部结论均以本工作树内的实跑输出为准，命令与退出码逐条留档 `/tmp/d911b-evidence/`。
- 铁律 11「静默降级禁止」+ 控制塔三态（`ctrl-tower-change` 模式 1）：`0/1/2` 三态分离，`exit 2` 绝不与「通过」混同；任何 fail-open 必须 `⚠️` 显式打印。
- 铁律 47「契约优先」+ 铁律 48「测试不可为空壳」：新增 CLI 路径 = 契约（`contract-template`）先行；测试覆盖正常/降级（fail-closed）/边界三路径。
- `ctrl-tower-change` 模式 5/6：测试用 `mktemp` 沙箱 + 环境变量/`--yaml` 注入缝，零真实仓库污染；改完跑「语法 → UTF-8 → 专项测试 → 门禁自过」验收链。
- `windows-compat`：`scripts/` 下脚本改了要核 PATH/UTF-8/退出码（CI 有 windows-latest 腿）——本件保留 `sys.stdout.reconfigure` + `newline="\n"` 既有强制，测试维持 `PYBIN` 三级探测。
- 同类第 4/5 次历史（D782 / D793 / D795 / D861 / D914）：**每次都是「新目录没登记 → 落 `**` 兜底 = win → 混装 PR 被误报「变更跨域」」**；D914 (#708) 只补了三目录登记，本件 B5 治本（把真正的错「新目录没登记」显式打出来）。
- 创始人口令原文：**「win 机器不在线，所有 domain:win 任务一律 Mac 代行，直到创始人说「win 回归」」** —— 该原文出处为 `.claude/task-briefs/2026-09-22-D861-win测试修复-代行.md:5`，**是转抄件，非创始人原始消息**（如实标注，不据此推断「可以随便改 win 文件」）。
- 参考：Anthropic 工程基线「最小机制 + 显式可逆开关」；第一性原理：**代行是「事实状态」的登记，不是「权限」的授予** → 状态一旦消失就自动回到严格，不需要任何人记得关。

## 写集

> 逐文件行 = 写集单一事实源（D749）。下表是 `scripts/control-tower/brief_parser.py:parse_write_set` 的解析目标（该解析器只认表行）；两种写法同源、逐文件行与表行内容一致。

- `docs/synova/coordination/ownership.yaml`
- `scripts/control-tower/check-ownership.py`
- `.github/CODEOWNERS`
- `tests/control-tower/check-ownership.test.sh`
- `.claude/task-briefs/2026-09-22-D911-B-ownership-standby.md`
- `memory/notes/proposed/2026-09-22-d911-b-ownership-standby.md`

| 文件 | 类别 |
|---|---|
| `docs/synova/coordination/ownership.yaml` | task |
| `scripts/control-tower/check-ownership.py` | task |
| `.github/CODEOWNERS` | task |
| `tests/control-tower/check-ownership.test.sh` | task |
| `.claude/task-briefs/2026-09-22-D911-B-ownership-standby.md` | task |
| `memory/notes/proposed/2026-09-22-d911-b-ownership-standby.md` | task |

## Q2: 范围 — 正确的最简方案
做什么：
- `docs/synova/coordination/ownership.yaml` —— 增 `standby:` 段（单点开关；当前仅 `win`: `offline_since` / `proxy` / `authority` / `domains`），中文值加双引号、`domains` 用单行内联列表
- `scripts/control-tower/check-ownership.py` —— 读 `standby` + 结构校验（缺失=严格，非法=`exit 2`）；新增 `--proxy <域>=<代行域>`（可重复）代行断言路径 + 逐条打印归属与理由；B5 未登记目录显式提示
- `.github/CODEOWNERS` —— 重跑 `python3 scripts/control-tower/check-ownership.py --emit-codeowners` 验漂移（禁手改）。**standby 段刻意不进生成输入**（队长指令：单点开关，不得成为 CODEOWNERS 双写点）→ 删段重跑输出逐字节不变；本次实跑结果与 `origin/main` 版逐字节一致（`cmp` exit 0）、零 diff
- `tests/control-tower/check-ownership.test.sh` —— 新增用例（standby 正常/缺失/非法 + `--proxy` 命中/未命中 + B5 提示）
- `.claude/task-briefs/2026-09-22-D911-B-ownership-standby.md` —— 本 brief
- `memory/notes/proposed/2026-09-22-d911-b-ownership-standby.md` —— 决策 Note（铁律 49）

不做什么（含文件路径）：
- 不改 scripts/control-tower/check-pr-budget.sh（B3 由另一编码独占）
- 不改 tests/control-tower/check-pr-budget.test.sh（同上）
- 不改 scripts/pre-commit-check.sh（切片 C 独占，且与 D869 同文件单写者）
- 不改 .github/workflows/ci.yml（单写者，派单 §〇 硬边界）
- 不改 scripts/product-lines/productline_yaml.py（YAML 子集解析器为共享件；本件只用其现有能力）
- 不改 scripts/audit/audit-rules.sh（审计红线，K3 专属）
- 不改 docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md（派单件为上游权威，只读）

另不新增门禁阻断：B5 只做诊断性显式提示（派单 §三 要求「零新增红 + 既有测试全绿」）；如需新增阻断，先报队长，不自行扩写集。

## Q3: 验收 — 入口 → 交互 → 结果
入口（从哪触发）：`python3 scripts/control-tower/check-ownership.py <文件...> [--owner X] [--proxy win=mac]`
处理（中间步骤）：读 `ownership.yaml` → `standby` 结构校验（缺失=严格 / 非法=exit 2）→ 逐文件解析原始 owner → `--proxy` 命中的文件改判为代行域并记录理由 → 未登记目录（`docs/**` / `tests/**` 子目录无显式规则）显式提示
结果（最终展示）：stdout 逐文件 `<owner>\t<path>`；代行命中行带 `↪ 代行` 与理由；结论行 `✅ PASS` / `❌ FAIL`；退出码 `0` / `1` / `2`

## 架构层: 治理层（控制塔门禁 + 归属台账；不触五层依赖图）

## Done 标准

- [ ] 判别性夹具（修前红 → 修后绿）：`python3 scripts/control-tower/check-ownership.py <#696 变更集>` 修前 `EXIT=1`（已存证）；加 `--proxy win=mac` 后 `EXIT=0` 且逐条打印被代行文件的归属 + 理由（贴原始输出，含命令与退出码）
- [ ] 反例夹具①：不传 `--proxy`（或传不匹配的 `--proxy k3=mac`）→ 仍 `EXIT=1`，不代行
- [ ] 反例夹具②：删掉 `standby:` 段 → 立即恢复 `EXIT=1`（win 回归的可执行验证）
- [ ] 反例夹具③：`standby:` 段格式非法 → `EXIT=2`（fail-closed，`--yaml` 指向临时非法 yaml）
- [ ] 夹具④（B5）：变更集含 `docs/**` 或 `tests/**` 下**无显式规则**的目录 → 输出显式点名 + 登记指引，而不是只报「变更跨域」
- [ ] `bash tests/control-tower/check-ownership.test.sh` → `✅ 全部通过: N 项`（N ≥ 94，既有项不得减）
- [ ] `.github/CODEOWNERS` 与 `--emit-codeowners` 输出逐字节一致（测试 §7 drift 断言绿）；且输出**不含 `standby` 字样**、删 `standby` 段后重跑**逐字节不变**（standby 不是生成输入 = 无双写点）
- [ ] `standby` 段不参与 rules 求值：同一文件在「有/无 standby」两版 yaml 下归属判定与输出逐字节一致
- [ ] 返工1（自验员新发现7）：`offline_since` 非 `YYYY-MM-DD` / 日历越界 → `exit 2`（fail-closed，受控退出无 Traceback）；该字段缺省仍合法可代行
- [ ] 返工2（自验员新发现6）：`--proxy` **域值非法**（`win=bogus` / `bogus=mac`）→ `exit 2`；合法域对但**未授权**（`k3=mac` / `mac=win`）→ 仍 `exit 1` + `⚠️ 不生效`
- [ ] 返工3（自验员新发现8）：B5 文案为「无显式规则的目录」并按层级标注（顶层目录 / 子目录），不再把既有顶层目录称「新目录」；逻辑、阻断、范围不变
- [ ] `bash scripts/pre-commit-check.sh` 零新增红

## 遗留（报队长；不自行扩写集，M2）

1. **派单件字面自相矛盾（不改，已按队长定案）**：`docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md:109`（B4「standby 段缺失/格式非法 → exit 2」）与 `:114`（反例②「删掉 `standby:` 段 → 立即恢复 exit 1」）冲突。队长 2026-09-22 定案：**整段不存在 = 严格模式（exit 1）**；**段内字段缺失/结构非法 = exit 2**。派单件不在本件写集，未改。
2. **B3 未完成（另一编码独占）**：`scripts/control-tower/check-pr-budget.sh:150` 仍以 `"$PYBIN" "$OWNERSHIP" $COUNTED` 调用（未传 `--proxy`）；`## 代行声明` 段落识别（口径 `^#{2,4}\s*代行声明`，收段 `^#{1,4}\s`；完全无 `#{2,4}` 标题 → 不放行）由 B3 承接。本件提供的集成契约 = 命中声明时追加 `--proxy win=mac`。
3. **`.github/CODEOWNERS` 零 diff**：在写集内、`--emit-codeowners` 已重跑，但按队长口径 standby **不得**成为生成输入 → 输出与 `origin/main` 版逐字节一致（sha256 `a645b40f668cb0bc…`），无可提交改动（write scope 项 3 = 实跑校验、零 diff）。
4. **提交/推送未执行**：`synova-commit` 自带 `auto_tag_and_version` + `push_with_tags`（`scripts/control-tower/synova-commit:218` / `:837-843`），本分支 `feat/D911-ownership-standby` 非 `session/*` → 会 push。按队长指令先不提交：文件已 staged、未 commit、未 push，等队长统一安排。
5. **`--proxy` 尚无生产调用方**（除测试）：本件只交付 CLI 路径 + 契约；第一个消费者是 B3。属切片拆分设计，非缺陷。
6. **B5 覆盖范围刻意只含 `docs/**` + `tests/**`**（队长钉死）：`src/**`、`scripts/**` 深层目录不加提示，防给每个深目录 PR 加噪音。
