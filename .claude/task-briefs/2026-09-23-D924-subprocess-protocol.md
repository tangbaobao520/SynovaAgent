# Task Brief: D924 子进程输出协议规范 + 可执行检查器 + assert.ts 最小修复

> 生成: 2026-09-23 | 分支: feat/d924-subprocess-protocol | 工作树: .synova-wt-d924 | 卡号: D924
> 域: mac（控制塔 / CI） | as any: 0 | 文档: docs/synova/coordination/规范-子进程输出协议-20260923.md

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务在**控制塔/门禁层**（不属于 L1–L5 产品分层；它是"门禁自身的正确性"）。
解决的问题：子进程（curl 等）的 stdout 被当成**多语义通道**使用——把元数据（HTTP 状态码）以
哨兵标记 `__STATUS__:` 追加到负载流（响应体）尾部，再用字符串分割还原。响应体一旦含该标记即解析错乱。

活证据（修复前，实测）：
`scripts/golden-scenarios/common/assert.ts:101` = `spawnSync('curl', ['-sS','-w','\n__STATUS__:%{http_code}', url])`
`scripts/golden-scenarios/common/assert.ts:109` = `const parts = r.stdout.split('__STATUS__:');`

新增/替换/扩展：**新增**可执行检查器 + 规范文档 + 夹具；**替换** `runHttp` 的解析实现（仅 2 处调用点）。

### b) 文件审计
```
scripts/control-tower/check-subprocess-protocol.sh        — ❌ 新建（检查器）
scripts/control-tower/subprocess-protocol-baseline.txt    — ❌ 新建（ratchet 存量清单，空）
tests/control-tower/check-subprocess-protocol.test.sh     — ❌ 新建（三路径 + 变异体夹具）
docs/synova/coordination/规范-子进程输出协议-20260923.md   — ❌ 新建（规范 + 失效条件）
.github/workflows/ci.yml                                  — ⚠️ 改（夹具登记进 control-tower-tests 显式清单）
scripts/golden-scenarios/common/assert.ts                 — ⚠️ 改（裁定 4(a)：:101 + :109 两处调用点）
```
同类既有检查器（口径复用，不重复造）：`scripts/workflow/check-silent-swallow.sh`（吞错门禁，本检查器与其正交）。

### c) 决策
- 无既有覆盖（`git grep -n '__[A-Z][A-Z0-9_]*__'` 在 scripts/ 下仅 assert.ts 2 处）→ **新建**。
- 检查器用 **.sh** 而非 .ts：`tsconfig.json:29` include 仅 `src/**/*.ts, src/**/*.tsx`，
  `vitest.config.ts:28` include 仅 `./tests/**/*.test.ts` ⇒ `scripts/**` 下 .ts **无类型网**，
  故检查器必须自包含为 .sh。
- 变异体判别：反例夹具在 mktemp 副本上把判据改坏 → 夹具必须**报红**（证明判据有判别力）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 调研
- 业界：子进程输出协议的标准做法是**结构化分流**——负载与元数据走不同通道（不同 fd / 不同文件），
  而非"同一流 + 哨兵分割"。curl 官方即提供 `-o <file>`（负载落文件）+ `-w '%{http_code}'`（元数据落 stdout）。
- 顶级团队：CI 断言普遍禁止"混合输出后分割"，因为分割对**负载内容不可控**（响应体可能含标记）。
- memory 历史教训：`docs/synova/research/研究院交接-20260922/双DSH执行提升清单.md:51` 已把
  `assert.ts:101-110` 记为"响应体含该标记即解析错乱（双盲评审交叉确认）"。

### b) Anthropic 决策链 ① SPEC → ② 测试 → ③ 实现 → ④ 接线 → ⑤ 验证
本卡即按此序：先规范（SPEC）→ 先写夹具（含红态）→ 改实现 → 登记 CI → 复跑验收。

### c) 决策参考系
参考：Anthropic（契约优先 + 三态退出码）/ 第一性原理（一个流 = 一个语义通道）/
开源实证（curl `-o` + `-w` 结构化分流）+ 结论：**只改 2 处调用点，不做重构；保留旧语义字节级兼容**。

### d) 执行约束
- 引用铁律 0-2（spec→test→impl→wire）、铁律 11/24/31（静默降级禁止 + degraded 显式）、铁律 47/48（契约优先 + 测试非空壳）。

## Q2: 范围

**做什么：**
- 新建 `scripts/control-tower/check-subprocess-protocol.sh` —— 哨兵混流检查器（三态退出码）
- 新建 `scripts/control-tower/subprocess-protocol-baseline.txt` —— ratchet 存量清单（**空**：修完存量 0）
- 新建 `tests/control-tower/check-subprocess-protocol.test.sh` —— 正常/降级/边界 + 变异体判别 + 排除面
- 新建 `docs/synova/coordination/规范-子进程输出协议-20260923.md` —— 规范 + 存量口径 + **失效条件**
- 改 `.github/workflows/ci.yml` —— 夹具登记进 `control-tower-tests` 显式清单
- 改 `scripts/golden-scenarios/common/assert.ts` —— 裁定 4(a)：**:101 调用点 + :109 解析点**（结构化输出）

**不做什么（含文件路径）：**
- 不改 `scripts/golden-scenarios/common/assert.ts` 的**其他任何部分**（:101/:109 之外零改动，
  仅新增 1 行 `import * as os from 'os';` —— Windows 兼容要求用 `os.tmpdir()` 拼路径，见 Q3 契约）
- 不改 `scripts/pre-commit-check.sh`（避免与 B3 抢文件）
- 不碰 `scripts/audit/**`（K3 专属，红线）
- 不改 `src/**` 产品代码
- 不改 `scripts/golden-scenarios/**/expect.json`（无断言依赖 http body，实测 8 场景零命中）
- 不做一次性特例（预算/豁免走规则，不开口子）

## 写集

> D749 单一事实源（机器块）。格式对齐 `scripts/control-tower/brief_parser.py`。
>
> **补记（施工中发现，留证）**：本块初版遗漏 ⇒ `parse_write_set.present = False`，且 Q2 散文路径带
> `—— 说明` 后缀致 `match_path` 全部失配 ⇒ `staging_guard.py` 的 D329 认领制判本 session「认领为空」，
> 暂存文件被解析给**他卡 brief**（D919 亦声明 `ci.yml`），提交被阻断。补块后 `parse_write_set.present = True`。
> 这正是 D749 欲消灭的"口径不一"（散文口径 vs 机器块口径）。

| 文件 | 类别 |
|---|---|
| `scripts/control-tower/check-subprocess-protocol.sh` | task |
| `scripts/control-tower/subprocess-protocol-baseline.txt` | task |
| `tests/control-tower/check-subprocess-protocol.test.sh` | task |
| `docs/synova/coordination/规范-子进程输出协议-20260923.md` | task |
| `.github/workflows/ci.yml` | task |
| `scripts/golden-scenarios/common/assert.ts` | task |
| `.claude/task-briefs/2026-09-23-D924-subprocess-protocol.md` | task |
| `docs/synova/product-lines/evidence/D924-子进程输出协议-20260923.md` | task |
| `memory/notes/proposed/2026-09-23-d924-subprocess-output-protocol.md` | task |
| `.claude/bypass.log` | builtin（post-commit hook 运行期账本，与写集无关） |

## Q3: 验收 — 入口 → 交互 → 结果

**入口（从哪触发）：**
- 人工/CI：`bash scripts/control-tower/check-subprocess-protocol.sh --dir <repo>`
- CI：`tests/control-tower/check-subprocess-protocol.test.sh` 登记进 `control-tower-tests` job 显式清单

**处理（中间步骤）：**
1. 枚举 `--dir` 下可执行源码文件（`*.sh/.bash/.ts/.tsx/.js/.mjs/.cjs/.py/.yml/.yaml`），排除二进制
2. **R1 哨兵混流**：子进程调用的 `-w`/`--write-out` 模板含自定义哨兵 `__[A-Z][A-Z0-9_]*__` → 命中
3. **R2 哨兵分割解析**：按自定义哨兵做 `split()` / `awk -F` / `IFS=` 分割 → 命中
4. 排除面：`<<<` here-string 行；`-o`/`--output` 已分流行
5. 与 baseline 比对（ratchet：baseline 内允许，**新增即拦**）

**结果（最终展示）：**
命中清单（文件:行:规则）+ 计数；`exit 0` = 无新增违规；`exit 1` = 命中违规；`exit 2` = 检查执行失败/降级

**契约（铁律 47）：**
```
@input   — [--dir <路径>]（默认取脚本上级仓库根）; [--baseline <文件>]; [--verbose]
@output  — stdout: 命中清单 + "SUBPROCESS-PROTOCOL: OK|VIOLATION(n)"; 
           exit 2 时 stderr: "degraded: <原因>" + degraded-events.log 追加一行
@exit    — 0 = 通过（无新增违规）; 1 = 命中违规（业务阻断）; 2 = 检查执行失败/降级（fail-closed，绝不等同通过）
@degraded— 扫描器不可用（git/ls 均不可用）→ exit 2 + stderr "degraded: ..."（铁律 11 显式降级，不静默）
@error   — 错误对象含 .code（SUBPROCESS_SCAN_UNAVAILABLE / SUBPROCESS_BASELINE_UNREADABLE）+ .phase='scan' + .retryable
```

**验收命令（可复制 + 预期退出码）：**
```bash
bash -n scripts/control-tower/check-subprocess-protocol.sh                        # 0 语法
bash tests/control-tower/check-subprocess-protocol.test.sh                        # 0 夹具全绿
bash scripts/control-tower/check-subprocess-protocol.sh --dir .                   # 0 存量 0
bash scripts/workflow/check-silent-swallow.sh --utf8                              # 0 UTF-8 头块
bash scripts/workflow/check-silent-swallow.sh --diff                              # 0 吞错
```
**降级路径验收**：扫描器不可用（注入 `SYNO_SUBPROC_PY=...` 指向不存在解释器 / PATH 受限）→ **exit 2** + 显式 `degraded:`。
**变异体判别验收**：mktemp 副本上把判据改坏（删 R1 或删排除面）→ 夹具**报红**（夹具自身 exit 0 = 正确抓到坏门禁）。
**红证不残留**：仓库内 `grep -c INJECTED-RED` = 0。

## 架构层: 控制塔/门禁层（非 L1–L5 产品分层）

本卡产物全部位于 `scripts/control-tower/` + `tests/control-tower/` + `.github/workflows/` + `docs/synova/coordination/`，
属门禁自身正确性域，不触五层架构边界；唯一产品相邻改动是 `scripts/golden-scenarios/common/assert.ts`（黄金场景基建，控制塔/CI 域，mac）。

## Done 标准: 至少一条可验证的完成标准

1. `bash scripts/control-tower/check-subprocess-protocol.sh --dir .` → **exit 0**，输出存量 **0**（截至 2026-09-23 测量）
2. `bash tests/control-tower/check-subprocess-protocol.test.sh` → **exit 0**（含正常/降级/边界/变异体/排除面五组断言）
3. 反例夹具在"判据改坏"的副本上**报红**（判别力物理证明）
4. `assert.ts` 修复后：`git grep -n '__STATUS__' -- scripts/ -- ':!*.md'` 在**可执行源码**口径下 = 0
5. 新夹具**已登记**进 `.github/workflows/ci.yml` 的 `control-tower-tests` 显式清单（未登记 = 永不运行）
6. 交付含 `git diff --stat` 原始输出 + `git ls-remote --heads origin | grep d924` 回执
