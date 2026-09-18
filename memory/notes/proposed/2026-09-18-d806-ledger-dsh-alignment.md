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
- **⑤ 治理补齐（D806 执行中暴露，CTO 当场批准）**：`ownership.yaml` 新增 3 条 mac 条目 —— `scripts/project/**` / `tests/project/**` / `docs/synova/project/**`。D793/D795 新建这三条路径时漏补本表 → 落 `**` 兜底被判 **win**，与 `DIVISION-CHARTER-v4 §四`「26 线产品完成度 → Mac DSH」矛盾，且兄弟路径 `scripts/product-lines/**`、`docs/synova/product-lines/**` 早列 mac。后果实证：D806 同一单内 ①（product-lines.yaml=mac）与 ④（project 三路径=win）被 D734 判**跨域硬阻断**。补齐后全单同域 mac（7 域文件 + 5 中性），未改任何既有归属。连带 `--emit-codeowners` 重生成 `.github/CODEOWNERS`（+3 行 glob；三个域都映射同一 GitHub handle `@tangbaobao520`，**今日实际 review 路由不变**），`tests/control-tower/check-ownership.test.sh` 51 项全绿。

## 参考

- 依据: `docs/synova/coordination/DSH锚点重锚审计-20260917.md`（D797，现行 0.1.6-alpha.1，锚点三原则：只锚包+文件+符号，必附现验命令）
- 口径: `docs/synova/project/26线-V1验收标准-v0.2-20260917.md`（M1–M5 元断言 + 13 改写 + 3 新增）
- 标准: 《DSH借鉴指引-v2》§10/§11/§12 + 附录 C（D808）
- 决策参考系（D333）: 第一性原理（能机械判定的不写成散文）+ Anthropic 工程基线（派生只读 + 机器可验契约）→ **收敛**：修数据源三处，派生器与判分脚本零语义改动。
- **实质修正（CTO 2026-09-18 指令 ③）**: 落库表 14 行的**证据列**按 CTO 映射重排 —— `test` = 20-2/20-3/20-5/18-2/21-1/21-3/22-1/25-6；`scenario` = 2-3/7-3/8-6/23-1/26-7；`k3` = 20-6。影响：20-2（scenario→test）、20-3 与 21-3（founder-demo→test）、26-7（test→scenario）。这直接解掉 **21-3（B-03）/ 20-3（B-04、B-05）** 两处 founder-demo 死点 —— 借位卡计分绑定从 2 个升到 6 个，`v1_passed` 21→25。开卡前定证据列 = 让回写有处可落。
- **条文逐字是机器校验的，不是自述**: 从 `origin/docs/v1-v0.2-freeze-20260917` 提取 §一 13 条（条文 + fail_when）与 §二 26-7 条文，断言其在落库表中逐字命中。首轮校验暴露 9 处不一致（我把冻结件的 `**加粗**` 标记丢了、3 条「加 X」型被改写成融合句式）→ 全部按原文重排。教训：**「逐字引用」必须写校验脚本，否则手抄漂移不可见**。
- 遗留（转下一单）: ① V1 表仍有 **5 条** `founder-demo` 断言无证据通道（本单已把 20-3/21-3 改为 test，缓解 2 条；根因 `evidence-writer.py` 写 `founder_demo` 下划线 vs 表内 `founder-demo` 连字符 + 无演示记录入口）；② GS 场景证据用自己的 ID 空间（`S0-1`/`L1-1`），与 V1 ID 无映射 → 所有 `scenario` 类断言结构性不可计数（本单 scenario 类 72 条全部受影响；B-10→23-1 因此未计分）；③ `docs/synova/project/26线-V1验收标准-v0.2-20260917.md`（冻结件）与落库版表文件并存，glob 取 `sorted()[-1]`，命名排序敏感（本单以 `草案v0.2-20260918` 保证取中，属脆弱点）；④ §11.3 的建议点会过期 —— B-07 按 §11.3 该挂 20-1（scenario，死点），但 v0.2 §一 第 8 行 18-2 条文**明文点名**「B-07 投影注册表」且 18-2 是 test → **冻结件明文优先于旧建议表**。
