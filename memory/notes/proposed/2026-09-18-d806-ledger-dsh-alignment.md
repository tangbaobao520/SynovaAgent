---
状态: proposed
日期: 2026-09-18
决策: 26 线台账（`product-lines.yaml` + V1 断言表 + 证据）的「看板可见性」按**机器可判定的三处物理条件**收敛——① `modules` 必须是真实存在且 git pathspec 可命中的路径；② 每个落点按 R1/R5 归属到恰好一条线；③ 每张借鉴卡必须回写 V1 点并落**kind 对齐**的绑定证据。V1 分母按 v0.2 §三 由 125 变更为 **128**（+2 backlog 提入 +1 新增）。
理由: 台账改了、口径改了，看板仍可能读 0 —— 因为 `gen-project-board.py:472-483` 的判定是「证据 `record_type` 必须**等于** V1 断言表『证据』列的 kind **且** `verdict=="pass"`」。三处物理条件缺一，改动就不会反映到读数上：幻影 `modules` 让 A1 失效检测**静默空转**（`calc-progress.py:106` 把 modules 当 git pathspec，不存在的路径永远零命中）；未归属落点让借位卡**无从回写**（D808 §12 R4/R6）；kind 不对齐让证据**恒不计数**（实测：全仓 `founder-demo` 记录 = 0，而 V1 表有 7 条断言声明 `founder-demo` → 这 7 点结构性不可计数）。
---

## 落地

- **① 幻影 modules 修正**（11 条）：线2 `tui/`→`src/tui-v2/`；线3 `src/reports/`→`src/agent/report-assembler.ts`；线12/13/14 `expert/tech|finance|strategy/`→`expert/technology-foundation|fundamental-efficiency|competitive-strategy/`；线15 `expert-platform/`→`src/expert-platform/`；线17 `src/evolution/`→`extensions/evolution/`；线20/21 `providers/`→`src/providers/`；线23/24 `security/`→`src/security/`。改后 26 线 102 条 modules **零幻影**。控制变量实证：同一天下 HEAD 版与本单 yaml 的线级判分**零差异** → 修的是「未来的失效检测」，不是今天的分数。
- **② 落点归属**（D808 §12.2 + R1/R5）：`src/llm/`→线21；`src/store/`→线20；`src/services/llm-cost.ts`→线21（文件粒度，不整目录挂靠）；`src/config/config-layers.ts`→线23、`src/config/customer-config-package.ts`→线25（CTO 裁定文件级）。
- **③ 借鉴卡回写**：B-06→20-5、B-09→25-6（计分）；B-02/B-06→22-1（M2 绑定，该点已计分不虚增）；B-03/B-04/B-05/B-07/B-10 如实标**未计分**（理由见上）。
- **④ 分母变更单**：`FROZEN_V1_TOTAL` 125→128 + 测试读数 128/36 + 落库版 128 条表 + `product-lines.yaml` 元断言 M1–M5 注释（v0.2 §四 落点2）。`calc-progress.py` 零改动。

## 参考

- 依据: `docs/synova/coordination/DSH锚点重锚审计-20260917.md`（D797，现行 0.1.6-alpha.1，锚点三原则：只锚包+文件+符号，必附现验命令）
- 口径: `docs/synova/project/26线-V1验收标准-v0.2-20260917.md`（M1–M5 元断言 + 13 改写 + 3 新增）
- 标准: 《DSH借鉴指引-v2》§10/§11/§12 + 附录 C（D808）
- 决策参考系（D333）: 第一性原理（能机械判定的不写成散文）+ Anthropic 工程基线（派生只读 + 机器可验契约）→ **收敛**：修数据源三处，派生器与判分脚本零语义改动。
- 遗留（转下一单）: ① V1 表 7 条 `founder-demo` 断言无证据通道（`evidence-writer.py` 写 `founder_demo` 下划线 vs 表内 `founder-demo` 连字符，且无演示记录入口）；② GS 场景证据用自己的 ID 空间（`S0-1`/`L1-1`），与 V1 ID 无映射 → 所有 `scenario` 类断言结构性不可计数；③ `docs/synova/project/26线-V1验收标准-v0.2-20260917.md`（冻结件）与落库版表文件并存，glob 取 `sorted()[-1]`，命名排序敏感（本单以 `草案v0.2-20260918` 保证取中，属脆弱点）。
