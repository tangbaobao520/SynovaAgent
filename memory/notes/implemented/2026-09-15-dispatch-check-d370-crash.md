# 派单前复核脚本 D370 类崩溃（$VAR 全角边界）——门禁崩在最后一项 = 假绿（D771）

> 状态: implemented | 日期: 2026-09-15 | 决策: `pre-dispatch-check.sh` 第②项用 `${pr}`/`${st}` 花括号显式边界；不顺带批量改存量 38 处 | 理由: 该脚本在含 PR 号的派单文档上会崩在最后一项，复核结论失真

## 一、触发（D770 派单期间实测）

跑 `bash scripts/control-tower/pre-dispatch-check.sh docs/synova/coordination/派单-D760-D769-DSH借鉴卡-20260915.md`：

```
── ② 前置 PR 合并状态（需 GITHUB_TOKEN；无则跳过，不静默）──
scripts/control-tower/pre-dispatch-check.sh: line 92: st�: unbound variable
```

第 92 行原文：

```bash
echo "  PR #$pr → $st（派单若声称"已合"须与此一致）"
```

`$st（` → bash（UTF-8 locale）把全角左括号当变量名字符 → 变量名变成 `st（` → `set -u` 下 unbound variable。**崩溃点在最后一项之后**，脚本以非零码退出但前 9 项已通过 → 使用者若只看前文会以为「复核过了」。这是比普通 bug 更贵的一类：**门禁自己崩 ⇒ 结论失真（假绿）**。

同一行的内层双引号（`"已合"`）在双引号字符串里虽然能拼接，但语义脆弱 → 一并改为「」。

## 二、为什么没被更早发现

- D738（`$VAR` 全角边界常驻扫描 check，红线条目：同类第二次）**仍在 PR #544 未合** → 这类模式没有常驻门禁。
- 同类扫描（本次实测）：`grep -rnE '\$[A-Za-z_][A-Za-z0-9_]*[（）：、，。「」【】]' scripts/` 命中 **38 处**（含注释、不含 `set -u` 的脚本等存量）。本次只修触发点，存量交给 D738 的门禁覆盖（避免一单里混入 38 处无验证的批量改动）。

## 三、边界（本次不做什么）

- 不批量重写 38 处存量（未逐条验证的批量改动 = 新的风险面）
- 不改 `scripts/pre-commit-check.sh`（主门禁不在本单）
- 不改 `scripts/audit/**`（K3 红线）

## 四、验证

| 步骤 | 命令 | 结果 |
|---|---|---|
| 反向（修前形态） | 回放 `$st（` 形态 | `unbound variable` 崩溃（非零退出） |
| 正向（修后） | `bash scripts/control-tower/pre-dispatch-check.sh <派单文档>` | 末行 `✅ 机械项全通过`（exit 0） |

## 五、给 D738 的输入

D738 的扫描门禁应当覆盖：**任何 `set -u` 脚本中，未加花括号的 `$VAR` 紧跟全角标点**——本次实证它会造成门禁自身崩溃，而不是提示性错误。
