# K3 产品线验证体系任务书

> **执行者**: K3（独立会话，零上下文，只读）
> **派发**: 创始人 | 2026-08-17 | 缘起：创始人两问——① 26 条线是否合理；② 能否建非 LLM 测试套件替代大部分 K3 逐点审计（成本高昂）
> **对齐**: K3-AUDIT-STANDARD-v1-20260815.md（维度 16-20 + 抽样规则 ≤¥20/批）、AUDIT-PROTOCOL.md、MULTI-AGENT-COLLAB.md 红线 1/2/3
> **状态**: 待 K3 执行（v2：附录 A 数据已经 DSH 逐项物理复核修正，每条附复现命令）
> **起草**: DeepSeek Harness（Mac，工作区内角色）。按红线：**本任务书附录 A/B 均为"材料与问题清单"，不是结论、不是标准**——审什么、怎么算过、规则改不改，全部由 K3 独立裁决，创始人批准后生效。

---

## 一、背景：为什么有这个任务

产品完成度仪表盘（26 线 × 163 验收点）当前总进度 **4%**（`product-progress.json`，2026-08-17 12:09 生成）。

DSH 现状核查（数据见附录 A，全部附复现命令、已自行复核一遍）认为 4% 由**两道瓶颈叠加**造成：

1. **机器证据层为零**：`docs/synova/product-lines/evidence/` 仅 3 个 JSON，且 `record_type` 全部为 `k3`（来自既有 K3 报告），**没有任何 scenario/test/ci 类机器证据**。具体断点有三：
   - GSS 基建四工具（`scripts/golden-scenarios/common/`：fresh-db/inject/assert/bootstrap，D361，有测试且全绿）已建成，但 **GS-01~GS-08 八个场景目录均未实现**；
   - 18 个 `test:` 绑定验收点的 A2 入库流程**已接线**（`.github/workflows/product-progress.yml` L44-57：vitest 全绿 → `list-test-points.py` → `evidence-writer.py`），但至今**零 test/ci 证据入库**——原因待查（候选：vitest 未全绿 / bot PR 未合并 / 工作流未触发）；
   - 2 个 `contract-check:` 绑定点无对账器实现。
2. **计分规则的 K3 垄断**：`calc-progress.py` 六态状态机——机器验证（scenario/test/ci）绿 → `pending_k3`（**不计分**，L147-164）；只有 `k3:pass` 或 `founder_demo:pass` → `verified`（计分，L138-145）。即：**即使瓶颈一解决、163 点全部机器跑绿，进度仍为 4%**，全部卡在"待裁判"。

创始人的成本关切：若 153 个未验证点全部走 K3 逐点复核，按 K3 标准自身成本口径（场景独立重跑 ≈ ¥2-5/点），单轮全量 ≈ ¥300-800（估算，待 K3 核），且每次代码变更触发证据失效（A1：14 天 TTL + git 变更检测，`calc-progress.py` L100-121/L151-163）后需重复支出。

**DSH 角色边界**：DSH 在工作区内、是被审计对象之一，不适合执行本评审。故将两问整体移交 K3，本文件为交接。

## 二、K3 的输入（读这些——输入隔离）

1. **本任务书**
2. `docs/synova/product-lines/product-lines.yaml`（26 线 163 验收点单一事实源）
3. `docs/synova/product-lines/product-progress.json`（当前进度事实）
4. `docs/synova/product-lines/PHASE0-LINE-REVIEW-v1-20260816.md`（线集推导 + 创始人 13 问 + 否决式确认记录）
5. `docs/plans/codex/strategy/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md`（§3.4 六态状态机 + §五 信息层级 + §七 维度 20 提案 + §5.3 自动化 A1-A8）
6. `docs/plans/codex/strategy/SYNOVA-DESIGN-黄金场景与创始人驾驶舱-v1-20260816.md`（GS-01~08 定义 + 转绿顺序 + §8 任务分解 D361-D369）
7. `docs/synova/coordination/K3-AUDIT-STANDARD-v1-20260815.md`（已生效标准：维度 16-20 判定规则 + 抽样规则 ≤¥20/批 + 反向契约 R1-R7）
8. 物理事实（grep/复跑可复核）：`scripts/product-lines/`（9 脚本）、`scripts/golden-scenarios/`、`docs/synova/product-lines/evidence/`、`.github/workflows/product-progress.yml`
9. **附录 A（DSH 现状核查数据 + 复现命令）与附录 B（DSH 提案要点）——材料非结论，K3 可采纳/修改/否决任一条**

**不必读**：CLAUDE.md / AGENTS.md / 任何 agent 会话上下文 / 设计文档其余章节。

## 三、任务（4 项必做）

### 任务 1：26 线线集合理性独立评审

对"产品 = 26 条能力线"这一定义给出独立判定：覆盖面（对照数据流 数据接入→本体→哨兵→专家→报告→行动→进化 + 交互面 + 底座）、粒度、权重（当前全等权 1.0）、验收点可验证性（措辞是否物理可判定）。

DSH 附录 B 声称发现 3 个结构问题（跨线重复验收点 5 对 / K3 垄断计分 / 等权存疑），请逐条裁决**成立/不成立**，K3 新发现的问题一并列出。

> 边界：线集增删拆并 = 创始人权力（product-lines.yaml 头部锁定条款）。K3 产出"评审意见 + 建议"，不直接改线集。

### 任务 2：验收点三分法定稿

将 163 个验收点逐点分类，并给出**每类的判定规则**（无上下文执行者可物理执行）：

| 类 | 含义 | 候选判定方式（供参考） |
|---|---|---|
| M 机器可验证 | 场景/单测/契约检查可客观判定 | 场景 exit 码 / vitest 绿 / 对账脚本 exit 码 |
| F 创始人演示 | 必须人测（安装实测、手机看报告、复述报告） | 演示记录 + 核验 checklist |
| K 必须 K3 | 语义判断/质量裁决（如"命中老板盲区"、报告质量、线级终审） | K3 复核报告 |

DSH 初步统计（附录 A 表 3，不相交分解）：**M 120 点（74%）/ 仅 F 10 点 / 仅 K 33 点**（另有 3 点同时绑定机器+founder-demo，计入 M）。仅 K 33 点 = 26 个线级终审判 + 7 个实质点；**其中 7 个实质点（7-1 哨兵调度 / 7-2 全量注册 / 9-2 哨兵计算 / 11-1 / 11-2 哨兵计算 / 18-1 记忆存储 / 22-5 自诊报告）本质疑似机器可验**（cron 注册、manifest 挂载、注入数据产出断言均可脚本化），目前却只绑定 `k3:`——请重点复核这 7 点是否应改绑 M 类。

### 任务 3：非 LLM 验证套件方案评审与补强

评审 DSH 附录 B 的三层套件方案（GSS 8 场景 / 单测映射 + CI 证据排查与补强 / 契约对账器），重点裁决：

1. **覆盖矩阵**：8 个场景 + 单测 + 契约检查是否真能覆盖其声称的 120 点？有无"名义绑定实际验不到"的点？
2. **防伪充分性**：机器证据如何防"写测试的人自欺"（设计文档 §五引用历史 8+ 次声称 vs 现实）？DSH 提出的四道防伪（fault-injection 红绿演练 / 证据仅 CI 产出入库 / A1 失效检测 / K3 抽样重跑）是否足够？K3 可加码。
3. **A2 零入库排查**：CI 已接线却无一条 test/ci 证据，断在哪一环（workflow 日志 / vitest 状态 / bot PR 积压）？
4. **缺口清单**：哪些点机器方案覆盖不了、必须留在 K（回任务 2 定稿）。

### 任务 4：计分规则修订提案的审计意见

DSH 附录 B 提案：机器绿 → verified 计分；K3 从"逐点裁判"转为"线首次 100% 终审（20c）+ 日常抽样（20a，≤¥20/批）+ K 类点"。

请裁决：**可采纳 / 条件采纳（列条件）/ 否决**。若采纳或条件采纳，给出对 `calc-progress.py` 状态机与 product-lines.yaml 证据契约的**修改要求清单**（K3 提要求，实现方执行，红线不变）。若否决，请给出控制 K3 成本的替代路径。

## 四、红线（双方共同边界）

- **DSH 永不编写/修改审计标准**——附录 A/B 是材料，K3 可全盘否决；本任务书不构成对 K3-AUDIT-STANDARD 的任何修订
- **K3 不改任何代码**（只读 + 报告）；不读 §二 未列出的材料
- **线集与计分规则的任何变更 = 创始人批准才生效**（product-lines.yaml 锁定条款）
- **审计报告 git 跟踪**（`docs/synova/audit-reports/`，模式 C 模板），可追溯

## 五、输出与验收

| # | 产出 | 验收 |
|---|------|------|
| 1 | 26 线合理性评审意见（含对 DSH 3 个结构问题的逐条裁决） | 每条裁决附物理依据（grep/复跑/文件+行号） |
| 2 | 163 点三分法定稿清单（M/F/K 逐点标注 + 每类判定规则；含 7 个疑似可改绑 M 的仅 K 点结论） | 机器可执行形式（yaml/json 或表格），可直接回写 product-lines.yaml 证据绑定 |
| 3 | 套件方案评审 + 防伪充分性裁决 + A2 零入库断点定位 + 缺口清单 | 覆盖矩阵逐点可核 |
| 4 | 计分规则修订的审计意见（采纳/条件/否决 + 修改要求清单） | 创始人可据此直接批准/驳回 |

**报告路径建议**：`docs/synova/audit-reports/2026-08-XX-product-lines-verification.md`（模式 C）。
**时间约束**：无硬死线；但 P0 实施（计分规则修订 + 证据管线修复）等待本评审结论，建议优先产出任务 2/4。

---

## 附录 A：DSH 现状核查数据（材料，v2 已复核，全部可复现）

> 核查时间 2026-08-17，Mac 工作区 main 分支。每条附复现命令，**K3 应先复现再采信**（claim-verifier 原则）。

### 表 1：163 验收点当前状态分布（精确到点号）

| 状态 | 数量 | 点号 | 证据来源 |
|---|---|---|---|
| verified | 7 | 7-1 / 7-3 / 9-2 / 11-1 / 11-2 / 15-4 / 18-1 | 7-1/9-2/11-1/11-2/18-1 ← k3-full-chain-20260813；7-3 ← task-D394；15-4 ← task-D396 |
| rejected | 4 | 7-2 / 8-1 / 17-1 / 19-1 | k3-full-chain-20260813 判 fail（证据驱动，优先级高于 yaml 种子） |
| failed | 3 | 8-3 / 17-2 / 24-3 | yaml 种子 failed 且无证据记录 |
| uncommitted | 149 | 其余全部 | 无任何证据记录 |

> 注：7-3 的 yaml 种子本是 failed（"findings 重启即丢"），D394 K3 pass 证据使其转 verified——证明"证据 → 状态机"管线本身工作。瓶颈不在管线，在机器证据种类为零。

复现：
```bash
python3 -c "
import json
d = json.load(open('docs/synova/product-lines/product-progress.json'))
print(d['product_progress_pct'], d['generated_at'])
buckets = {}
for l in d['lines']:
    for p in l['points']:
        buckets.setdefault(p['status'], []).append(p['id'])
for s, ids in buckets.items(): print(s, len(ids), sorted(ids))
"
```

### 表 2：证据记录与验证基建现状

| 事实 | 复现 |
|---|---|
| evidence/ 仅 3 个 JSON，record_type 全为 k3（k3-full-chain-20260813: 9 verdicts / task-D394: 1 / task-D396: 1） | `ls docs/synova/product-lines/evidence/` + `python3 -c "import json; [print(f, json.load(open('docs/synova/product-lines/evidence/'+f))['record_type']) for f in ['k3-full-chain-20260813.json','task-D394.json','task-D396.json']]"` |
| GSS 四工具存在（assert/bootstrap/fresh-db/inject + expect-schema.json） | `ls scripts/golden-scenarios/common/` |
| GS-01~GS-08 场景目录零实现（仅 common/evidence/README） | `ls scripts/golden-scenarios/` |
| 机器绿不计分：k3/founder_demo pass → verified（L138-145）；机器绿 → pending_k3（L147-164） | `sed -n '137,164p' scripts/product-lines/calc-progress.py` |
| 线 100% 封顶 99 门槛（缺 k3 线级 pass 时） | `grep -n "min(progress, 99)" scripts/product-lines/calc-progress.py`（L244） |
| A2 机器证据入库已接线（vitest 全绿 → evidence-writer --type ci），但零 test/ci 证据入库 | `sed -n '44,57p' .github/workflows/product-progress.yml` + evidence/ 目录无 test/ci 记录 |

### 表 3：163 点证据绑定分类（不相交分解）

绑定标签统计（一点可多标签）：scenario 103 / test 18 / contract-check 2 / founder-demo 13 / k3 38。

**不相交三分（合计 163）**：

| 类 | 点数 | 说明 |
|---|---|---|
| M 有机器可验证绑定 | **120（74%）** | 含 3 点同时绑 founder-demo（1-2/1-3 等） |
| 仅 F（founder-demo） | 10 | 必须人测 |
| 仅 K（k3） | 33 | = 26 线级终审点 + 7 实质点（见下） |

仅 K 33 点细分：
- **线级终审 26 点**：25 点措辞为"审计员复核 XX"，线 10 的终审点措辞不同（10-8"审计员全链路复核通过（K3 维度 20c 线 100% 门槛）"）——26 条线每线恰有 1 个终审点。
- **实质点 7 点**：7-1 / 7-2 / 9-2 / 11-1 / 11-2 / 18-1 / 22-5——内容疑似机器可验（调度注册/manifest 挂载/注入计算/存储结构），当前仅绑 `k3:`，是改绑 M 类的首选候选（见任务 2）。

逐线（机器可验证/总点数）：

| 线 | 机器/总 | 线 | 机器/总 | 线 | 机器/总 |
|---|---|---|---|---|---|
| 01 桌面端 | 6/8 | 10 资本循环 | 7/8 | 19 方向监测 | 4/5 |
| 02 对话交互 | 6/7 | 11 人才循环 | 4/7 | 20 运行底座 | 4/6 |
| 03 报告体系 | 5/8 | 12 技术维度 | 4/5 | 21 模型底座 | 2/5 |
| 04 数据接入 | 7/8 | 13 财务结构 | 4/5 | 22 自诊断稳定 | 4/6 |
| 05 本体收敛 | 4/6 | 14 竞争战略 | 4/5 | 23 权限治理 | 4/6 |
| 06 首次诊断 | 5/7 | 15 专家体系 | 6/7 | 24 安全信任 | 5/6 |
| 07 持续监测 | 5/8 | 16 目标导航 | 4/5 | 25 插件化 | 5/7 |
| 08 告警推送 | 4/5 | 17 进化闭环 | 4/5 | 26 MCP | 5/6 |
| 09 客户循环 | 4/6 | 18 记忆体系 | 4/6 | | |

复现：
```bash
python3 -c "
import sys; sys.path.insert(0,'scripts/product-lines')
import productline_yaml
spec = productline_yaml.load_file('docs/synova/product-lines/product-lines.yaml')
from collections import Counter
ev=Counter(); pts=[]
for line in spec['lines']:
    for p in line['acceptance_points']:
        kinds={str(e).split(':')[0] for e in (p.get('evidence') or [])}
        for k in kinds: ev[k]+=1
        pts.append((line['id'],p['id'],kinds,p.get('desc','')))
print(len(pts), dict(ev))
M={'scenario','test','contract-check','ci'}
print('M:', sum(1 for _,_,k,_ in pts if k&M))
print('F-only:', sum(1 for _,_,k,_ in pts if k<={'founder-demo'}))
print('K-only:', sum(1 for _,_,k,_ in pts if k<={'k3'}))
print('K-only非终审:', [(p[1]) for p in pts if p[2]<={'k3'} and '复核' not in p[3]])
"
```

### 表 4：DSH 声称的跨线重复验收点 5 对（待 K3 逐条核）

| 对 | 重复事实 |
|---|---|
| 4-4 ≈ 9-1 | "CRM 连接器（crm-standard 契约）" ≈ "CRM 数据进 Client 节点（L5 连接器 → L4 图）" |
| 4-5 ≈ 10-1 | "ERP 连接器（erp-standard 契约）" ≈ "ERP 财务数据上传 → Financial 节点" |
| 4-6 ≈ 11-3 | "HR 连接器（hr-standard 契约）" ≈ "HR 数据进 Person 节点（L5 连接器 → L4 图）" |
| 5-2 ≈ 10-2 | 两处 desc 逐字相同："属性契约对齐（cashBalance↔cash 等 snake/camel）" |
| 2-2 ≈ 20-4 | "回答是流式的（逐字出来）" ≈ "流式输出稳定（不闪烁不卡死）"（判定侧重点不同，K3 裁） |

复现：`grep -n -A1 '"4-4"\|"4-5"\|"4-6"\|"5-2"\|"9-1"\|"10-1"\|"10-2"\|"11-3"\|"2-2"\|"20-4"' docs/synova/product-lines/product-lines.yaml`

---

## 附录 B：DSH 提案要点（材料非结论，K3 可全盘否决）

### B.1 对创始人两问的初步判断

1. **线集本身合理**（覆盖面与北星对齐、诚实基线可信、每线 1 个终审点 + 封顶 99 的防烂尾设计正确），不建议动 26 条线；问题在验收点层（重复、绑定方式）与计分规则。
2. **4% 是双瓶颈**：机器证据为零（主因，今天改任何计分规则都还是 4%）+ 机器绿不计分（次因，机器证据起来后成为主矛盾）。规则修订不是让进度凭空涨，是拆"机器绿了排队等 K3"的瓶颈。

### B.2 非 LLM 三层套件方案（供任务 3 评审）

- **L1 场景套件**：实现 GS-01~08（基建已就绪），覆盖 103 点；顺序按 GSS 设计 §2.4：GS-03 → GS-02/04 → GS-05 → GS-01 → GS-06 → GS-07/08；每场景必须带 fault-injection 红绿演练（D396 范式）。
- **L2 单测映射 + A2 修复**：建 `suite-registry.yaml`（`test:<套件>` 名 → vitest 路径映射；当前为非正式中文名如"会话线程"，多数套件已存在，缺 5-6 个补写）；排查并修复 A2 零入库（任务 3-3）；覆盖 18+2 点。15-4/21-2（golden-case 命中率）可用既有 `scripts/ci/golden-case-checker.ts` 机器化，建议从 K 类挪入 M 类（15-4 当前已由 D396 K3 pass 验证，后续续绿应走机器）。
- **L3 契约对账器**：纯 Python 对账 field-mappings（snake/camel），覆盖 5-2/10-2。

### B.3 计分规则修订提案（供任务 4 裁决）

| 现状 | 提案 |
|---|---|
| 机器绿 → pending_k3 不计分 | 机器绿 → verified（机器验证）计分 |
| K3 逐点裁判（估算 ¥300-800/轮全量，待 K3 核） | K3 = 线首次 100% 终审（20c）+ 日常抽样（20a，≤¥20/批，已生效标准）+ K 类点 |
| 防伪 = K3 全量 | 防伪 = fault-injection + 证据仅 CI 入库 + A1 失效检测（已实现）+ K3 抽样重跑 |

预期（估算，待 K3 核）：机器层全绿时各线至 ~75%（剩线级终审 + F 类点），总进度 4% → 70%+，K3 单批成本降约一个数量级。

### B.4 机器做不了、建议留在 K/F 的（初步清单，供任务 2 复核）

- **26 个线级终审判**（线 100% 门槛设计，K 类；其中 25 点措辞"审计员复核"，线 10 为 10-8"审计员全链路复核"）
- **10 个仅 founder-demo 点**（安装实测/手机端/30 分钟首诊计时/复述报告等，F 类，零 LLM 成本）
- **语义质量点**：6-3 命中盲区、3-x 报告"麦肯锡级"质量、对抗性测试 24-5 的语义部分（注入语料可机器化、绕过手法演进需 K3）

### B.5 实施路线（待 K3 结论后启动）

P0：计分规则修订（创始人批）+ suite-registry + A2 零入库修复 + 契约对账器（2-3 天）
P1：GS-03 + GS-02/04（各 1-2 天）　P2：GS-05 → GS-01 → GS-06（各 2-3 天）　P3：GS-07/08 + 缺测补写 + CI-only 证据门禁（3-4 天）
与 GSS 设计 §8 已排任务 D362-D369 兼容，本方案 = 既有排期 + 计分规则修订一环。

---

*任务书完。K3 按 §二 输入清单独立评审；结论与规则变更由创始人批准入库。附录 A 数据请先复现再采信——DSH 已自查一遍并修正 5 处（verified/failed/rejected 点号、A2 接线状态、终审点计数、三分法互斥性、行号），但不豁免 K3 独立复核。*
