---
状态: proposed
日期: 2026-09-14
决策: 把「`$VAR` 紧跟非 ASCII 且未加花括号」从人工纪律升级为常驻静态检查（scripts/control-tower/check-locale-var.sh），接入 pre-commit 条件跳过。
理由: 同类错误已第二次（批 A 修 4 处 → D735 又 1 处），按本仓闭环规则「同类错误第二次 = 防线系统性失效」，人工防线判定失效，必须机器化（铁律 35）。该缺陷只在失败路径触发，review 天然看不见。
---

# `$VAR` 全角边界常驻扫描（D738）

## 触发场景

`LC_ALL=C.UTF-8`（本仓所有脚本头部都导出）下，bash 会把**紧跟 `$VAR` 的全角标点并入变量名**：

```
$ bash -c 'export LC_ALL=C.UTF-8; set -uo pipefail; SENT_LINE=""; echo "行=$SENT_LINE（X）"'
bash: SENT_LINE�: unbound variable
```

注意两点（实测确认）：
1. **变量即使已赋值也照样 unbound** —— 因为解析出的是 `SENT_LINE（` 这个**另一个名字**，它从未被赋值；
2. **只在未加花括号时发生**：`${SENT_LINE}（` 正常。

历史同型：批 A 修 4 处（`check-pr-budget.sh`×3 + `check-ownership.test.sh`×1），D735 开测**又踩 1 处**。
最阴险之处：**只在失败路径触发** —— 正常路径全绿，一到要报错就崩，门禁最需要在报告失败时哑掉。

## 决策内容

1. **扫描器** `scripts/control-tower/check-locale-var.sh`：三态（0 无命中 / 1 有命中 / 2 检查执行失败），
   无参=全仓扫 `scripts/` + `tests/` 的 bash 文件（239 个），有参=只扫传入文件。
2. **只跳全行注释**（首个非空白字符为 `#`）—— 与 pre-commit「as any 跳过注释行」同惯例。
   **行内注释不做识别**（bash 无法可靠切分引号内的 `#`），该边界写进契约并由测试显式断言，
   避免「以为跳了其实没跳」的隐形预期。
3. **接线 = pre-commit 条件跳过**：只在暂存区含 `.sh` 时跑，逐文件调用，保持 <1s；判定用 `soft_check`
   （对齐 V5.0.0「本地软提示 + CI 权威」）。**
4. **不接 pre-push**：同一缺陷不必在两处重复拦截，避免双跑成本。

## 实测残留（本决策的量化依据）

全仓 `bash scripts/control-tower/check-locale-var.sh` → **57 处 / 239 个 bash 文件**（非注释行）。
分布：`scripts/ci/`、`scripts/desktop/`、`scripts/golden-scenarios/`、`scripts/workflow/`、
`scripts/control-tower/`、`tests/control-tower/` 等。**存量不阻断**（soft_check + 本任务不动存量文件），
新增/修改的 `.sh` 会立刻被拦 —— 与「as any 零容忍但存量分批清」同策略。

## 实测踩到的两个坑（都被验收跑抓出）

1. **`ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../.." && pwd)"` 是错的** ——
   `A || B && C` 左结合为 `(A||B) && C`：git 成功时**仍会执行后面的 `pwd`**，把两行塞进 `ROOT`，
   于是**所有相对路径解析全失效**（全仓模式报「扫描 0 个文件」）。
   征兆很隐蔽：测试用的是绝对路径（`$TMPDIR/xxx.sh`），**全部通过**；只有验收跑（相对路径/无参）才暴露。
   修法：`ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"; [ -n "$ROOT" ] || ROOT="$(cd ...)"`。
2. **反向验证要挑「main 上本来就干净的文件」** —— 首次我挑了 `alloc-task-id.sh`（它在 main 上**本来就有 1 处**残留），
   于是「还原后应变绿」永远不成立，看起来像还原失败。换干净样本 `bypass-ledger.sh` 后：
   注入 → 红（点名 `:57  $src`）→ 还原 → 绿 + sha256 一致。

## 建议（未做，交 CTO 排期）

存量 57 处按目录分批清理（每批一个 PR，避免大 PR）；`scripts/ci/verify-d703.sh` 一处最集中（5 处）。

## 相关 D#

D738（本 Note）· D370（本坑原始记载）· D520（同型复发：`$VAR` 紧贴中文盖掉真实原因）· D735（第二次踩到，触发本任务）
