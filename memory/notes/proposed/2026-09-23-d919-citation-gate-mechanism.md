# 决策 Note — D919 引用可核验门禁（fail-closed + 可归因）

- 状态: proposed（待 K3 审计 + 创始人确认后 git mv 到 implemented/）
- 日期: 2026-09-23
- 责任方: synova-cto（dsh-cto）
- 触发: 2026-09-22 创始人质问「我写了一份不存在的权威引用——你怎么敢做这种事情」；原 CTO 会话给出结论（借 Anthropic 机器可验契约 + DSH 可归因 InvariantError），**未落成机制**；本次接手补这一环。

## 决策

把「引用必须可核验」从结论落成 **fail-closed 门禁**：`scripts/control-tower/check-citations.py`，
并接入 `pre-dispatch-check.sh` 第⑥步（派单前必跑）+ CI 密封清单。

## 依据（参考系，K3 可核）

- **Anthropic 工程基线**（`docs/synova/coordination/DECISION-REFERENCE.md`:19 适用域「门禁/fail-closed、脚本化验证、机器可验契约」）→ 回答「该做什么」。
- **DSH 源码范式**（节选自原会话结论，本次未改口径）：`InvariantError` 带 code + packageName → 违规机器可读且可归因（「违规从不匿名」）；`compilePatterns` 在注册时就校验声明本身 → 声明不被信任、注册即校验 → 回答「怎么做」。
- **第一性原理**：引用是**声称**，声称必须可被第三方在无上下文条件下复现。不可复现的引用 = 不可核验 = 与不存在等价。

## 修复的既有缺口（D919 实测，逐条）

`pre-dispatch-check.sh` 第⑥步原实现 `grep -oE '...' | sort -u | head -25`：

1. **`head -25` 截断** → 第 26 条引用起永不校验（M1 形态：检查未执行 == 检查通过）。
2. **扩展名白名单 `ts|cjs|mjs|sh|py|json|yml` 不含 `.md/.html/.txt`** → 「`docs/**.md:行号`」这类**权威引用整体漏检**——上一任翻车正是该形态；本仓库权威文档（DECISION-REFERENCE.md 等）全在豁免区。
3. **无仓外根** → DSH 源码引用（如 `dsh-subprocess-local/lib/index.js:757`）无处解析 → 外部权威引用静默漏检。
4. **无错误码 / 无责任方字段** → 违规不可归因（DSH「违规从不匿名」的反面）。

## 机制契约（摘要，全文见脚本头）

- 错误码: `CITE_FILE_NOT_FOUND` / `CITE_LINE_OUT_OF_RANGE` / `CITE_BAD_RANGE` / `CITE_FILE_UNREADABLE` / `CITE_QUOTE_MISMATCH`
- 三态退出: 0 全通过 / 1 存在不可核验引用（业务阻断）/ 2 检查本身失败（fail-closed，不当作通过）
- 每条违规带 `code + artifact + line + citation + owner + roots_tried` → 可归因
- 中文名文档同被核验（ASCII-only 字符集曾让 `中文名.md:3` 静默漏检——自测抓到并修）
- 豁免: artifact 内 `## 引用豁免` 段落 `- <引用> — <理由>`，无理由不生效（与写集豁免同形）
- 仓外根补全 DSH 布局 `<root>/node_modules/@deepseek-ai/<pkg>`

## 验收证据

- `bash tests/control-tower/check-citations.test.sh` → **13 通过 0 失败**（正常 / 4 类违规 / 降级 / 4 边界 / 2 接线）
- 回归防线: **40 条违规全量报出**（原 `head -25` 截断）；伪造外部权威 `dsh-不存在包/lib/index.js:12` → 必红
- 真实文档体检: `docs/synova/coordination/整体推进计划-主线-20260913.md` → 2 条引用 / 0 违规（噪声率 0）
- 既有回归: `bash tests/control-tower/pre-dispatch-check.test.sh` → 8 通过 0 失败

## 影响面

- 派单/交回件交付前多一道 fail-closed（CTO 侧）；引用写错 = 派单发不出去，而非事后被创始人抓到。
- CI: `check-citations.test.sh` 入密封清单 → 机制被改坏会红。
- 不碰 `scripts/audit/**`（审计红线）；本机制自身受 K3 独立审计（无豁免）。
