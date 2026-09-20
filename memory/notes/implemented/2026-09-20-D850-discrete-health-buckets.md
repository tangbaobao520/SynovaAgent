---
状态: implemented
日期: 2026-09-20
决策: 度量口径从「总完成度百分比」改为「离散三档 + 每档一条可复现命令」；无判定源的档显式 null，禁猜 0
理由: 百分比把「有证据」「能跑未验证」「写了没接」压成一个数，掩盖了 9 次假绿的真实位置；且总纲 §1.2 已明令「离散计数，不是百分比」。可复现性是可证伪的前提（事实驱动 §四），所以每个数字必须带一条能自己跑一遍的命令。
---

# D850 · 度量口径：取消总完成度百分比 → 离散三档 + evidenceCmd

> 任务: D850（小队 D850「编码 A」，工作树 `.synova-wt-d850`，分支 `team/d850-discrete-health`）
> 状态说明：决策已落地（D850 = impl_done，口径变更已进代码），故本 Note 在 `implemented/`；
> K3 独立审计为后续步骤（本卡自验结论标「可提请独立审计」），若审计推翻则按四态规则迁移到 `rejected/`。
> 权威（引用全名 + 版本）：
> - `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2（v1，2026-09-18）—— 五态定义 +
>   「共同报告方式：`N 个健康 / M 个写了没接 / K 个缺` —— **离散计数，不是百分比**」
> - `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二（v1.1，2026-09-19）—— 五态的**判定手段**
> - `/Users/wane/山河研究院/99-综合/方案-项目度量-从声明驱动到事实驱动.md` §四（「每个数字必须带一条可复现的命令。不能复现的数字，不上看板」）+ §六（L3 静态检测实测 3/5 = 60%，只能粗筛不能当判定源）
> - 创始人签字：`docs/synova/coordination/创始人裁定表-§6五项-20260920.md`（D850 = 离散健康计数）

## 一、被删除的字段全名（可从本 Note 追溯）

本次口径变更**删除了顶层百分数字段**，其原名（已从三个脚本与三份派生件中移除，故不写在那些文件里）：

| 原名 | 位置 | 处置 |
|---|---|---|
| `product_progress_pct` | `scripts/product-lines/calc-progress.py` 顶层输出 | **删除**（破坏性变更；win 域消费方见下方遗留） |
| `delivery_pct` | `scripts/project/gen-project-board.py` `totals` | **删除** |
| `verify_pct` | `scripts/project/gen-project-board.py` `totals` | **删除** |

> 说明：创始人签字的形式判据（在 6 份脚本/派生件上 grep 上述三个字段名 + 「产品总进度」+「总完成度」
> 必须**零命中**）要求这些字符串不得留在那些文件里，因此它们的全名只记在本 Note（本 Note 不在该 grep 范围）。
> 这是**追溯信息的移位**，不是信息丢失。

## 二、决策参考系（D333 四步）

1. **第一性原理** —— 一个数字可信 ⟺ 由真实证据源判定 + 带一条可复现命令。→ 有源的档出数，无源的档出 `null`，**不用 0 冒充**。
2. **Anthropic 工程基线** —— fail-closed + 机器可验契约 + 不静默降级。→ 无法判定必须 `count: null` + `reason`（先例：`ledger.pr_queue=null + skipped_sources`、`timeline.actual.merged=null`）。
3. **本仓实证（开源实证的等价物）** —— 事实驱动 §六：作者手握全部 8 个断线实例、连改三版判据，静态检测准确率仍只有 **3/5 = 60%**。→ 本卡**不引入任何 grep 型判定源**。
4. **收敛检查** —— ①②③ 同向：三档只用**已有机器可读信号**，无信号即 null。收敛 → 采纳。

## 三、三档 = 五态的报告折叠（互斥且完备）

| 档 | 对应五态 | 本次的判定源 | 结果 |
|---|---|---|---|
| `healthy` | 健康（live && testedThroughEntry） | 断言已点亮 **且** 另有 `record_type=k3` 的独立 PASS 裁决（gen-project-board）/ 六态 `verified`（calc-progress） | **出数** |
| `written_not_wired` | 写了没接（implemented && !wired） | V1 断言表「证据」列 = `pending_wiring`（D809 撤回标记；**显式声明**，非 grep） | **出数** |
| `missing` | 缺（!implemented） | 判定手段 = 代码检索 → 本口径禁用 grep 型静态判据，且「无匹配证据」≠「无实现」 | **null + 原因** |
| `other_states.wired_broken` | 接了跑不通 | 判定手段 = 冒烟启动 | **null + 原因**（ledger 口径）/ failed+rejected（六态口径） |
| `other_states.live_unverified` | 能跑未验证 | 机器绿但无独立核验 | **出数，且绝不并进 healthy**（创始人红线） |
| `other_states.state_unknown` | （残余） | 未点亮且非撤回 | **显式列出** → 恒等式闭合，不丢点 |

**恒等式**：`healthy + written_not_wired + missing + wired_broken + live_unverified (+ stale) + state_unknown = 分母`，
null 档不参与求和但**显式登记在 `identity.null_terms`** —— 所以「不丢点」是物理可检的（组⑩ 断言）。

**两个分母，不得混读**：`ledger.json` = V1 断言表条数（128）；`product-progress.json` = product-lines.yaml 验收点数（174）。
两处同名档各自带 `denominator` + `denominator_note`，面板也明示。

## 四、证据可复现性（evidence_cmd 的形态）

- **源侧复算**（ledger 的 healthy / written_not_wired / live_unverified / state_unknown）：`python3 - <field> <<'PY' …`
  直接读 V1 断言表 + 两处证据目录重算，**不读 ledger.json**（读回自己的输出不构成证据）。
  与派生器逐档对账一致（组⑩ 断言，实测 16 / 3 / 11 / 98 vs 派生值 16 / 3 / 11 / 98）。
- **重跑抽取**（product-progress 的多数档）：`calc-progress.py --out /tmp/…` 后抽该档 —— 即「从权威输入重新派生」。
- **判定源存在性探针**（null 档）：`python3 - implemented <<'PY' …` 输出 `SOURCE_ABSENT` —— 这是 null 的**可复现依据**，
  而不是把 null 静默成 0。

## 五、同时修正/发现

1. **面板线数 28 → 29 追平**：`total_lines` 原为 `len(lines)`（28），未计 `v2_lines: ["federated-evolution"]`（定义在 yaml 顶层、不在 `lines` 列表内）。
   现为 `len(lines) + len(v2_lines)` = 29，并输出 `lines_v1` / `lines_v2` 使 29 可拆解核验。
2. **CT-67 修复**（`tests/project/gen-project-board.test.sh` 组⑥）：原写死 live 数值（`backlog_points=36`/`v1_passed=22`/`lines=26`）→ 改为**只断言不变量与跨源自洽**
   （撤回行数↔`pending_k3`、撤回点↔账本 status、`backlog_points`↔独立解析的 yaml 点数、断言数↔`v1_total`、三档恒等式、无百分比字段）。具体数值留在密封夹具组。
3. **组⑤ 一条反条件断言修正**：原 `[ A = B ] || ok "generated_at 可随运行变化"` —— 相同才计数、
   与文案相反，且同秒运行会让总数在 116/117 之间漂移。改为无条件计数 + 事实陈述（现稳定 117）。
4. **「写了没接」接到看板上**：D809 撤回标记此前只在 `ledger.json` 可见，**创始人面板看不见**。
   calc-progress 新增单点读取（只取「证据」列的 `pending_wiring`，不复制任何交付度判定逻辑），
   撤回点优先于六态（撤回是显式声明，比「无证据」更具体），并从 `state_unknown` 中扣除以避免双计。

## 六、派生物与门禁的冲突（登记，不绕过）

`product-progress.json` / `product-progress.html` 是 **G12d（D458）单点生成物**：session 提交即硬阻断
（`.github/workflows/product-progress.yml` 在 push 到 main 后调 `refresh-all.sh` 重生成并推 `auto/product-progress`）。
故本卡**本地由脚本重生成并验证，但不把它们纳入提交**（提交会硬阻断，且 `--no-verify` 是本项目红线）。
→ 合并后由 CI 重生成；CTO 需用 PAT 从 `auto/product-progress` 开 PR 合并（D786 通道设计 b）。

## 七、退回与返工（V-1 / V-2，同批 2026-09-20）

首轮交付被队长退回，两点都成立，记录在此以防复发：

- **V-1（阻塞）**：面板侧 evidence_cmd **144/203 条 rc≠0**。根因两处，都在
  `scripts/product-lines/calc-progress.py`：① 生成命令时把**点分路径当单键**
  （`d['buckets']['other_states.live_unverified']` → KeyError，正确是逐段
  `d['buckets']['other_states']['live_unverified']['count']`）；② 线级键用 `lines[].buckets.x` 占位（非合法取值）。
  自验还查出**队长未点名的第三子缺陷**：**57/203 条值不匹配**——探针型档输出 `implemented=SOURCE_ABSENT`
  而档值是 `null`；线级 `written_not_wired` 输出的是**全局** 3 而不是本线的值。
- **V-2（阻塞）**：面板新契约（buckets / evidence_cmd）**零测试覆盖** → 117/0 全绿仍漏 V-1。
  补 `tests/project/calc-progress-panel.test.sh`（密封 + 可进 CI）：全部 203 条 evidence_cmd 逐条实跑断言
  rc=0 且值 == JSON count；源侧判据；null+reason；恒等式；**反漂移**（已提交派生件 == 现场重跑）；面板零渲染型百分比。

**设计变更（重要）**：首版 evidence_cmd 是「重跑本器 + 抽值」。实测单次派生 **~1.4 s**，
203 档 × 1.4 s ≈ **5 分钟** —— 看板命令与测试都不可用（可复现 ≠ 可等待）。
改为三件套，语义分开、不许混用：
- `evidence_cmd`：从**派生物**复现该档取值（逐段下钻 + 线 id 定位；必 rc=0；毫秒级），
- `regenerate_cmd`：整件**源侧重生成**（一次派生全件，供读者从权威输入重算），
- `independent_check_cmd`（仅顶层 `written_not_wired`，不读派生物独立复现同一数字）/
  `source_probe_cmd`（仅 `missing`，复现「为什么没有数字」= `SOURCE_ABSENT`）。

**口径边界（队长裁定，已写入两件 `identity.note`）**：恒等式**只保证完备性**（丢点会显形为
`state_unknown`），**不保证各档归类正确** —— 它是自洽性检查，不是正确性证据。

**跨切片一致性**：D852（PR #681）合并后 `product-lines.yaml` 验收点 174 → 180，
`ledger.json` 的 `backlog_points` **46 → 52**（`v1_total` 仍 128）；面板 `denominator` 174 → 180，
`total_lines` 仍 29。派生件已按新 main 重生成后提交。

## 八、第二轮退回（ⓐ 语义不达标，2026-09-20 同日晚）

V-1/V-2 **功能面已确认闭环**（独立自验员复测 203 条 rc≠0=0 / 值不匹配=0，旧版 144+57 对照同值）。
但本轮被判「语义不达标」并成立，记录如下：

- **错误**：为绕开「每档重跑本器 ≈ 分钟级」的性能问题，我把 `evidence_cmd` 从**源侧重算**
  改成了**读回派生物**（`d['buckets'][...]['count']` 读 `product-progress.json` 自己）。
  这是**契约反转**（我上一版 `@contract` 自己写过「不读回派生物（读回自己的输出不构成证据）」），
  且客观后果是**自证**：读回派生物时「源侧错它也错」，第三方跑**不可能得出与看板不同的结论**。
  依据 `方案-项目度量-从声明驱动到事实驱动.md` §四结句「**你能自己跑一遍验证——这就是可证伪，
  也就是信任的来源**」——挂 203 条不可证伪的命令比没有命令更坏（假证据）。

- **正确解法（本轮落地）**：**词义不可互顶** + 成本摊薄
  1. `evidence_cmd` = **源侧重算 + 与提交件逐档比对**（compare 形态：
     `python3 -c "…assert fresh[<path>] == committed[<path>], '<path> mismatch'"`），
     **缺中间件 → fail-closed 报错**，绝不静默回退读提交件；
  2. 毫秒级「读回」改名 `artifact_selfcheck_cmd`，明文声明**不承担可证伪职责**，
     **不得占用**「每个数字那条命令」的位置；
  3. `regenerate_cmd` = 件级一次源侧重算 → `/tmp/ro-pp.json`（`--today` 固定为产出该件那天，
     便与提交件可比对）→ 203 次比对从「分钟级」摊薄为「一次重算」；
  4. `source_probe_cmd` 只服务 null 档（复现「为什么没有数字」）；
  5. 件内 **schema 级** `cmd_semantics` 披露（不只写在 docstring）——只写「分母不同」却不写
     「复现强度不同」＝ 沉默偏离。
- **补线级独立判据**（原线级 196 条零独立判据，而线级恰是创始人第一眼看的粒度）：
  `written_not_wired` = **两源对账**（V1 表撤回行 vs 提交件；**不一致即报警**，非「必须相等」）；
  `healthy` = **必要条件上界**（看板 healthy 不得超过该线点集证据面 k3 PASS 覆盖点数）。
- **测试可移植性**：`tests/project/calc-progress-panel.test.sh` 加 git 闸 —— 无 `.git` / shallow
  → **显式 SKIP + 打印原因 + exit 0**（原版会报「派生件陈旧」，误导）。实测根因：无 git 时
  freshness gate 判不了，`live_unverified 32→54 / stale 36→14`（真因是环境差异，不是陈旧）。
- **V-12 更正我自己的数字**：我上轮写「单次派生 ~1.42s → 203 档 ≈5 分钟」，本机复测
  **12.68 / 7.29 / 1.68 / 2.09 / 1.47 s**（load average 18.85 / 8 CPU）——量级偏乐观，
  真实区间 **1.5–12.7 s**（独立自验员实测 2.60/3.41/4.15 s）。教训：**引用耗时必须给多次原始读数**，
  不能取单次最优值当代表值。

- **教训（写给未来的自己）**：性能压力下最容易发生的就是**把「证据」降级成「自查」**，
  而两者在输出上长得几乎一样。判定标准只有一条：**第三方跑它，有没有可能得出与看板不同的结论？**
  不能 → 那不是证据，只能叫自查，且必须改名 + 明说不承担可证伪职责。
