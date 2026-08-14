<!--
  SYNOVA-IMPL-D352: resolver 硬化（DS13 补做）— PYBIN 可用性探测 + 退出码 0/1/2 语义化
  状态: dev doc | 2026-08-13 | 优先级 P0 (K3 D331 P1-1: DS13 静默消失; D330 残留未闭环)
  权威文档: K3 D330/D331 审计报告 + DECISION-REFERENCE.md（S-12）+ AUDIT-PROTOCOL + AGENTS.md 铁律 24/31
  依赖: D331（已交付，V4.7.3）; D330 的 commit-msg-check PYBIN 模式为对齐基准
  并行: 无（独占 V4.7.4 版本编排；D332 届时顺延 V4.7.5）
-->

# D352: resolver 硬化

> 一句话问题: D331 交付时 DS13（resolve-commit-brief.sh 的 PYBIN 可用性探测 + 退出码 0/1/2 语义化）**静默消失**——交付声明止于 DS12，零 descope。后果（K3 D330/D331 双审残留）：① broken-python3 + 可用 python 环境下 resolver 先死，一致性门禁**仍不拦截**（仅提示）；② 无 brief 正常提交被误标 "degraded: 解析失败"（噪音）。

## 1. 权威文档引用

**来源**: [K3 D331 审计报告](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\audit-reports\2026-08-13-D331.md)（P1-1）

> resolver :48 仍裸 `command -v`、:187 仍 exit 1 二义；D330 报告两个残留仍开放。

**来源**: [DECISION-REFERENCE.md](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\coordination\DECISION-REFERENCE.md)（S-12）

> 决策必走四步（第一性原理 → Anthropic → DeepSeek → 收敛检查）并记录参考系。

**来源**: [AGENTS.md 铁律 24/31](D:\novis-backup-20260526\Novis\synova-agent\AGENTS.md)

> 异常处理必须有 log/degraded；降级信号传播；"检查未执行 ≠ 检查通过"。

## 2. 代码审计——现状 (2026-08-13 实测)

### 2.1 缺陷 A (P0): resolver PYBIN 无可用性探测

[resolve-commit-brief.sh L46-49](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh:46)：

```bash
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
```

`command -v` 只探存在性——Windows Store stub / 损坏 shim 命中后执行即败 → `2>/dev/null || echo 0` 静默归 0 → **门禁不拦截**（K3 故障注入物理复现）。

### 2.2 缺陷 B (P0): 退出码 0/1 二义

[resolve-commit-brief.sh L73/L150/L161/L187](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh:73)：只有 exit 0（有 brief）和 exit 1（无 brief/fail-open）——**"无 brief 正常" 与 "解析失败 degraded" 无法区分** → 无 brief 正常提交被误标 degraded。

### 2.3 缺陷 C (P1): 调用方不检查 resolver 退出码（**4 个调用方，全审**）

全仓 grep `resolve-commit-brief.sh` 调用方（2026-08-13 实测）：

| 调用方 | 位置 | 现状 | 需处理 exit 2 |
|--------|------|------|:---:|
| commit-msg-check.sh | L77 `... | head -1` | 管道吞退出码 | ✅ |
| staging_guard.py | L75 subprocess | 不检查 returncode | ✅ |
| **pre-commit-check.sh** | L480 `2>/dev/null \|\| true` | 吞退出码 → G12b **静默跳过**（degraded 信号丢失） | ✅ |
| **check-brief-parseable.sh** | L43 `\| head -1 \|\| true` | 同款吞码 | ✅ |

## 3. 实现方案

### 3.1 写集 (5 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [scripts/workflow/resolve-commit-brief.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\resolve-commit-brief.sh) | 修改 | ①PYBIN **可用性探测**：`command -v && "$_c" -c "import sys"`（broken shim → 回退 python/py；全不可用 → **exit 2 degraded 显式**，不再 exit 1 二义）；②退出码语义化：**0=有 brief / 1=无 brief（正常，G12 兜底）/ 2=degraded（python 不可用或解析失败）** |
| [scripts/commit-msg-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\commit-msg-check.sh) | 修改 | resolver 调用改为**先捕获退出码再取输出**（`set -o pipefail` 或分步）；exit 2 → **显式 degraded 提示**（不静默跳过，不误标"无 brief"） |
| [scripts/control-tower/staging_guard.py](D:\novis-backup-20260526\Novis\synova-agent\scripts\control-tower\staging_guard.py) | 修改 | resolver subprocess 检查 `returncode`：2 → degraded 显式记录（parallel-conflicts/degraded 日志），不静默 |
| [scripts/pre-commit-check.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\pre-commit-check.sh) | 修改 | L480 resolver 调用捕获退出码：exit 2 → **G12b degraded 警告**（不再 `\|\| true` 静默吞——G12b 跳过但提示，符合 fail-open 显式原则） |
| [scripts/workflow/check-brief-parseable.sh](D:\novis-backup-20260526\Novis\synova-agent\scripts\workflow\check-brief-parseable.sh) | 修改 | L43 同款：exit 2 → 显式 degraded 提示（不静默） |
| [tests/control-tower/resolver-hardening.test.sh](D:\novis-backup-20260526\Novis\synova-agent\tests\control-tower\resolver-hardening.test.sh) | 新建 | resolver 探测 + 退出码 + 调用方处理测试（≥8 用例，见 §4） |

> version.log 运行时（gitignore）：`control_tower_log.py version --version 4.7.4 --changes "D352 resolver 硬化"`；VERSION.md 追加 **V4.7.4**。

### 3.2 修复模式

**resolver PYBIN 可用性探测 + 退出码（替换 L46-49 + 各 exit 路径）**:

```bash
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
    PYBIN="$_c"; break
  fi
done
if [ -z "$PYBIN" ]; then
  echo "degraded: python 不可用或损坏" >&2
  exit 2    # 2 = degraded（显式，区别于 1 = 无 brief 正常）
fi
# ... 正常流程: 找到 brief → echo + exit 0; 无 brief → exit 1; 解析失败 → exit 2
```

**commit-msg-check.sh 调用（先捕获退出码）**:

```bash
CLAIM_OUT=$(bash "$MSG_DIR/workflow/resolve-commit-brief.sh" "$STAGED_LIST" 2>&1)
CLAIM_RC=$?
if [ "$CLAIM_RC" = "2" ]; then
  echo -e "${YELLOW}⚠ D328 一致性检查 degraded: resolver 解析失败 — 本次跳过（显式，不静默）${RESET}"
elif [ "$CLAIM_RC" = "0" ]; then
  CLAIM_BRIEF=$(echo "$CLAIM_OUT" | head -1)
  # ... 原有 GENUINE 检查
fi
```

**staging_guard.py 调用（检查 returncode）**:

```python
r = subprocess.run([...], capture_output=True, text=True, timeout=30)
if r.returncode == 2:
    log_degraded("staging-guard.resolver", f"resolver degraded: {r.stderr[:120]}")
    # 继续走 registry 写集判定（认领制判定降级但不静默）
```

### 3.3 不做的事

| 不做 | 原因 |
|------|------|
| 改 resolver 的认领/回退逻辑本体 | D317 已修，非本缺陷根因 |
| 全局 PYBIN 清扫（全 scripts 裸 python3） | CT-5 独立项（D331 已折入部分），本任务只覆盖 resolver + 两个调用方 |

## 4. 测试要求 (测试优先 — 铁律 0-2/48)

**第一步（red）**: 新建 `tests/control-tower/resolver-hardening.test.sh`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| broken python3 shim + 可用 python → resolver 回退 python 后**门禁仍拦截**（K3 D330/D331 残留） | 当前 command -v 命中 shim → 后续失败 → 门禁不拦截 | 回退 python → 拦截 exit 1 |
| 无 brief 正常提交 → resolver exit **1**（不误标 degraded） | 当前 exit 1 与解析失败混淆 | exit 1 明确 |
| python 全不可用 → resolver exit **2**（degraded 显式） | 当前 exit 1（二义） | exit 2 + stderr 提示 |
| 有 brief → exit 0 | 已过 | 不变 |
| commit-msg-check 对 exit 2 → 显式 degraded 提示（不静默） | 管道吞退出码 → 静默 | 提示 |
| staging_guard 对 returncode 2 → degraded 记录 | 不检查 → 静默 | 记录 |
| broken python3 + 可用 python：劫持场景 exit 1（K3 复现指纹） | 漏拦 exit 0 | exit 1 |
| pre-commit-check L480 对 exit 2 → G12b degraded 警告（不静默吞） | `\|\| true` 吞码 | 警告 |
| check-brief-parseable L43 对 exit 2 → 显式提示 | 吞码 | 提示 |
| 回归：D328 commit-msg 13/13、D331 tag-bypass-wiring 24/24 | 回归确认（非 red） | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | shell 单元（新建） | ≥8 | 上述 8 用例（正常/降级/边界/劫持/回归） |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| PYBIN 探测方式 | A 仅 command -v / B command -v + 可用性探测 | Anthropic（fail-closed：存在≠可用）+ DeepSeek（最少机制：一个探测） | **B**——与 D330 commit-msg-check 对齐 |
| 退出码语义 | A 保持 0/1 / B 0/1/2 三态 | Anthropic（机器可验契约："检查没跑 ≠ 检查通过"）+ 铁律 24/31 | **B**——degraded 必须显式可辨 |
| 调用方是否改 | A 只改 resolver / B 连带两个调用方 | Anthropic（契约变更必须传播）+ DeepSeek（不留半套） | **B**——commit-msg-check + staging_guard 必须处理 exit 2 |

> 收敛检查：两参考系指向同一答案（三态 + 探测 + 传播），无分歧。**参考：Anthropic + DeepSeek（第一性原理）**。

## 5. 接线要求

| 变更 | 验证 |
|------|------|
| resolver 退出码 | `bash resolve-commit-brief.sh ""` 在无 brief 时 exit 1；python 禁用时 exit 2（测试注入 PATH） |
| commit-msg-check 处理 exit 2 | broken shim 注入 → 显式 degraded 提示（grep 断言） |
| staging_guard 处理 returncode 2 | 模拟 resolver 失败 → degraded 记录（日志断言） |
| 生产调用点 | grep 确认 **4 个调用方**（commit-msg-check / staging_guard / pre-commit-check / check-brief-parseable）均处理 exit 2（≥4 调用点） |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/control-tower/resolver-hardening.test.sh` 全过（≥8 用例；red 已证）
2. DS2: resolver PYBIN 可用性探测——broken shim + 可用 python → 回退 python 仍判认领
3. DS3: 退出码 0/1/2 语义化（0=有 brief / 1=无 brief 正常 / 2=degraded），stderr 显式提示
4. DS4: commit-msg-check.sh 对 exit 2 → 显式 degraded 提示（不静默、不误标无 brief）
5. DS5: staging_guard.py 对 returncode 2 → degraded 记录（不静默）
6. DS6: broken-python3 + 可用 python 环境：劫持场景门禁 **exit 1 拦截**（K3 D330/D331 残留闭环）
7. DS7: **4 个调用方全部处理 exit 2**（pre-commit G12b degraded 警告 + check-brief-parseable 提示 + commit-msg 提示 + staging_guard 记录）——grep 断言
8. DS8: VERSION.md 含 **V4.7.4** + version.log 追加（同 commit）
9. DS9: 全量审计与当前 HEAD 基线一致（**439 FAIL**）+ as any=0
10. DS10: 真实提交环境 12 组 pre-commit 全过、无 --no-verify、`git diff --name-only` 与写集一致
11. DS11: **推送 + CI 验证**：`git log origin/feat/prompt-architecture..HEAD` 为空 + CI 任务相关 job 逐 job 全绿（预存 npm audit/Architecture 单独标注）
12. DS12: 完成报告须含**决策记录**（§4.5 三个决策点的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS12 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10，D331 审计教训）。

## 7. 自检清单

- [x] K3 D331 审计 P1-1 现场核实（resolver :48 裸 command -v、:187 exit 1、git diff 空）
- [x] 调用方退出码处理现状核实（commit-msg-check 管道吞码、staging_guard 不查 returncode）
- [x] **全仓调用方枚举**（4 个：+pre-commit-check L480 / check-brief-parseable L43）——初稿漏 2 个，本次补全（P1 修正）
- [x] 测试用例 8 标注回归确认（非 red）——P2 修正
- [x] 测试优先：8 用例 red 设计（§4 表，含 K3 复现指纹）
- [x] 决策参考已记录（§4.5，S-12）：三决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-11，S-10）；无 phantom 声称（S-11）
- [x] 不是凭记忆
- [x] 不用 --no-verify
