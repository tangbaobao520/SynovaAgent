<!--
  SynovaAgent 文献侦察报告 — 组织诊断三大理论支柱
  生成日期: 2026-06-24
  目的: 为25测量器+7维度诊断框架提供学术基础和可计算指标
  三大支柱: 信息论(组织) / 交易成本经济学 / 行为经济学(商业决策)
-->

# 组织诊断理论基础 — 文献侦察与可测量指标映射

> 核心问题: 这家企业的增长卡在哪里？现在该做什么？
> 本文档为 SynovaAgent 的自动诊断引擎提供学术锚点，每篇文献提取可计算的指标。

---

## 支柱一: 信息论应用于组织 (Information Theory → Organization)

### 1. Shannon (1948) — A Mathematical Theory of Communication

- **完整引用**: Shannon, C.E. (1948). "A Mathematical Theory of Communication." _Bell System Technical Journal_, 27(3): 379–423; 27(4): 623–656.
- **核心论点**: 通信的基本问题是"在一点精确地或近似地复现在另一点所选择的消息"。定义了信息熵 H = −Σ p(x) log₂ p(x) 作为不确定性的度量，信道容量 C 作为可靠传输的上限，以及信源编码定理和信道编码定理。
- **为什么对组织诊断重要**: 组织本质上是信息处理系统。信息丢失、失真、延迟都可用 Shannon 框架量化。

**可测量指标 (可直接仪器化)**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 1.1 | **信息熵 (H_decision)** | H = −Σ p(i) log₂ p(i)，其中 p(i) 是决策选项 i 被提及的频率 | 会议纪要、邮件、Slack 消息中的选项计数 | `collaboration` |
| 1.2 | **信道容量利用率** | ρ = R_actual / C_channel，R_actual = 实际信息速率 (bit/s)，C_channel = 报告结构决定的信道容量上限 | 报告链深度、消息频率 | `strategy` |
| 1.3 | **信息冗余度** | R_redundancy = 1 − H_actual / H_max，测量重复沟通占比 | 消息主题聚类、跨频道重复检测 | `data-quality` |
| 1.4 | **噪声比 (SNR_org)** | SNR = I(T;R) / H(T)，其中 T=发送意图，R=接收理解，通过事后对齐调查测量 | 项目回顾中的"我以为..."陈述频率 | `collaboration` |
| 1.5 | **编码效率** | η = H(source) / L_avg，L_avg = 平均消息长度 (token 数) | 内部文档 token 数与决策数之比 | `capability` |

**诊断公式**:
```
信息瓶颈指数 = (H_total − I_through) / H_total
其中 H_total = −Σ p(task_i) log₂ p(task_i) (任务分布熵)
I_through = Σ I(role_j; task_i) (角色-任务互信息)
当 信息瓶颈指数 > 0.6 → 组织存在严重信息不对称 → 触发 "info-bottleneck" 警报
```

---

### 2. Arrow (1974) — The Limits of Organization

- **完整引用**: Arrow, K.J. (1974). _The Limits of Organization_. New York: W.W. Norton & Company.
- **核心论点**: 组织存在的根本原因是市场无法处理不确定性。但组织本身也有信息处理能力的上限。Arrow 识别了两个核心限制: (1) **信息通道的不可靠性** — 信息在层级间传递时必然衰减；(2) **权威与信息的张力** — 有信息的人没有决策权，有决策权的人缺少信息。组织的最优规模取决于信息成本与协调成本的权衡。
- **关键概念**: "信息传递的序列不可靠性" (serial unreliability of information transmission)。如果每层传递保真度为 p，则 n 层后的保真度为 p^n。

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 2.1 | **层级衰减系数** | α_layer = p^n，其中 p = 每层信息保真度 (通过指令追溯准确率估算)，n = 层级深度 | 组织架构图中的汇报链深度 | `strategy` |
| 2.2 | **决策权-信息距离** | D_di = |rank(决策权角色) − rank(信息持有角色)| / max_depth | 决策日志 + 信息源追踪 | `strategy` |
| 2.3 | **Arrow 信息成本比** | C_info / C_coordination，C_info = 内部沟通时间成本，C_coordination = 对齐成本 | 日历分析 (会议时长 vs 独立工作时长) | `strategy` |
| 2.4 | **序列不可靠性指数** | S_unreliable = 1 − Π(i=1→n) accuracy_i，accuracy_i = 层 i 的指令传达准确率 | 项目需求 → 最终交付的偏差测量 | `risk` |

**诊断公式**:
```
Arrow 组织上限指数 = min(1, C_info / B_org)
其中 C_info = 层级数 × 平均信息处理时长
B_org = 组织总信息处理预算 (人×小时)
当 Arrow 指数 > 0.7 → 组织接近信息处理上限 → 建议扁平化或分权
```

---

### 3. Galbraith (1974) — Organization Design: An Information Processing View

- **完整引用**: Galbraith, J.R. (1974). "Organization Design: An Information Processing View." _Interfaces_, 4(3): 28–36. 以及 Galbraith, J.R. (1977). _Organization Design_. Reading, MA: Addison-Wesley.
- **核心论点**: 组织设计的核心任务是**使信息处理需求与信息处理能力匹配**。不确定性越高，信息处理需求越大。Galbraith 提出了从简单到复杂的七种组织设计策略来处理信息过载:
  1. 规则与程序 (Rules & Programs)
  2. 层级上报 (Hierarchical Referral)
  3. 目标设定 (Goal Setting)
  4. 纵向信息系统 (Vertical Information Systems)
  5. 横向关系 (Lateral Relations)
  6. 松弛资源 (Slack Resources)
  7. 自足任务 (Self-contained Tasks)

**可测量指标 (Galbraith 7层成熟度模型)**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 3.1 | **信息处理需求 (IPR)** | IPR = Σ(例外事件数 i × 处理复杂度 i) / 时间周期 | 工单系统中的非标准请求、例外审批 | `strategy` |
| 3.2 | **信息处理能力 (IPC)** | IPC = Σ(角色 j 可处理例外事件带宽) / 时间周期 | 角色定义中的决策权限 + 实际处理记录 | `capability` |
| 3.3 | **Galbraith IPR/IPC 匹配度** | G_match = IPC / IPR，>1.0 = 能力过剩，<0.5 = 过载 | (同上) | `strategy` |
| 3.4 | **松弛资源比例** | Slack% = 缓冲预算 / 总运营预算 | 财务缓冲、人力冗余、库存安全量 | `risk` |
| 3.5 | **横向协调密度** | Lateral_density = 跨部门项目数 / 总项目数 | 项目人员矩阵 | `collaboration` |
| 3.6 | **例外率** | Exception% = 非标准处理请求 / 总处理请求 | 工单/审批系统中的例外标签 | `evolution` |

**诊断公式**:
```
Galbraith 过载警报 = (IPR − IPC) / IPC
正常: < 0.2 (能力略超需求)
警戒: 0.2-0.5 (持续过载 — 建议增加横向协调或信息系统投资)
危险: > 0.5 (严重过载 — 建议自足任务重组或增加松弛资源)
```

---

## 支柱二: 交易成本经济学 (Transaction Cost Economics)

### 4. Coase (1937) — The Nature of the Firm

- **完整引用**: Coase, R.H. (1937). "The Nature of the Firm." _Economica_, 4(16): 386–405.
- **核心论点**: 企业存在的根本原因是**使用价格机制 (市场) 有成本**。这些成本包括: 发现相关价格的成本、谈判和签约的成本。企业通过内部化交易来节约这些成本。企业的边界由**边际交易成本 = 边际组织成本**的点决定。企业内部的组织成本 (管理收益递减) 随规模增长而上升。
- **这是整个交易成本经济学的源点。1991年诺贝尔奖。**

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 4.1 | **内部化 vs 市场化比率** | R_im = C_internal / C_market，其中 C_internal = 内部生产成本 + 管理成本，C_market = 外部采购价格 + 搜索成本 + 签约成本 | 采购/外包决策记录 | `strategy` |
| 4.2 | **搜索成本指数** | S_cost = 平均供应商筛选时间 × 人工时成本 × 筛选次数 / 合同价值 | 采购流程数据 | `risk` |
| 4.3 | **Coase 边界信号** | 当 R_im > 1.0 持续 2 个季度 → 信号: "企业规模超过最优边界" | 自制/外购分析 | `evolution` |
| 4.4 | **管理收益递减率** | dMR/dN = Δ管理效率 / Δ团队规模，当 dMR/dN < 0 时发出警报 | 人均产出 vs 团队规模曲线 | `capability` |

**诊断公式**:
```
Coase 企业边界健康度 = 1 − |C_internal/unit − C_market/unit| / max(C_internal/unit, C_market/unit)
范围为 [0,1]，接近 0 表示自制与外购成本严重偏离 → 建议边界调整
```

---

### 5. Williamson (1975, 1985) — Markets and Hierarchies / Economic Institutions of Capitalism

- **完整引用**:
  - Williamson, O.E. (1975). _Markets and Hierarchies: Analysis and Antitrust Implications_. New York: Free Press.
  - Williamson, O.E. (1985). _The Economic Institutions of Capitalism: Firms, Markets, Relational Contracting_. New York: Free Press.
- **核心论点**: Williamson 在 Coase 基础上，用三个维度解释为什么某些交易在企业内部完成而另一些通过市场完成:
  1. **资产专用性 (Asset Specificity)** — 为特定交易做的投资在交易外价值很低。专用性越高 → 越倾向内部化。
  2. **不确定性 (Uncertainty)** — 环境越不确定 → 合同越不完整 → 越倾向内部化 (层级)。
  3. **交易频率 (Frequency)** — 频繁交易摊薄治理成本 → 越倾向内部化。
  Williamson 的**歧视性匹配假说**: 交易应根据其属性匹配到最优治理结构 (市场 / 混合 / 层级)。

**可测量指标 (Williamson 三维度)**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 5.1 | **资产专用性指数 (ASI)** | ASI = Σ(专用投资价值 i − 次优用途价值 i) / Σ专用投资价值 i，范围 [0,1] | 固定资产登记 + 用途分析 | `risk` |
| 5.2 | **环境不确定性指数 (EUI)** | EUI = σ_demand / μ_demand (需求变异系数) + σ_supply / μ_supply (供应变异系数) | 销售/采购波动数据 | `risk` |
| 5.3 | **交易频率指数 (TFI)** | TFI = 同类交易次数 / 时间周期 | 合同/订单记录 | `strategy` |
| 5.4 | **治理结构匹配度 (Williamson)** | W_match = 实际治理结构 vs 预测最优治理结构的匹配率 | 对关键交易的治理结构审计 | `compliance` |
| 5.5 | **合同不完整性指数** | CI = 合同未覆盖的争议场景数 / 实际发生的争议场景总数 | 合同回顾 + 法律纠纷记录 | `risk` |

**诊断公式**:
```
Williamson 治理匹配度 = Σ(isOptimal(tx_i)) / N_transactions
其中 isOptimal(tx) = 
  ASI > 0.6 AND EUI > 0.5 → 预测: 层级 → 检查是否内部化
  ASI < 0.3 AND EUI < 0.3 → 预测: 市场 → 检查是否外包
  其他 → 预测: 混合 (合资/长期合同)
当治理匹配度 < 0.6 → 触发 "治理结构错配" 警报
```

---

### 6. Grossman & Hart (1986) — The Costs and Benefits of Ownership

- **完整引用**: Grossman, S.J. & Hart, O.D. (1986). "The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration." _Journal of Political Economy_, 94(4): 691–719.
- **核心论点**: 企业边界由**剩余控制权 (residual control rights)** 的分配决定。所有权 = 对合同中未写明事项的决策权。当一方的事前投资对双方总收益更重要时，该方应拥有资产 (即整合应由投资更重要的一方进行)。GHM 模型的核心洞见: **所有权配置影响投资激励** — 拥有资产的一方有更强的激励进行专用性投资，但另一方的激励会被削弱。
- **关键公式**: 设 B_owner 和 B_nonowner 分别为所有者和非所有者的收益，当 B_owner(integrated) + B_nonowner(integrated) > B_owner(non-integrated) + B_nonowner(non-integrated) 时，整合是最优的。

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 6.1 | **剩余控制权集中度** | RCC = 关键决策权集中在 top 3 角色的比例 | 授权矩阵 (RACI)、审批流程日志 | `strategy` |
| 6.2 | **投资激励不对称指数** | IIA = |I_owner − I_nonowner| / (I_owner + I_nonowner)，其中 I = 各方在合作关系中的投入增长率 | 部门预算分配、人力投入变化 | `risk` |
| 6.3 | **所有权-投资匹配度** | GHM_match = 相关性(所有权份额, 专用性投资比率)，高相关性 = 匹配良好 | 持股结构 + 部门资本支出 | `strategy` |
| 6.4 | **不完全合同暴露度** | 合同未覆盖的关键业务场景数 / 总关键业务场景数 | 法务审查 + 业务连续性计划 | `compliance` |

**诊断公式**:
```
GHM 激励对齐度 = Σ w_i × (ownership_i · specificity_i) / Σ w_i
其中 ownership_i = 部门 i 的决策自主权评分，specificity_i = 部门 i 的资产专用性
当对齐度 < 0.5 → 信号: "剩余控制权分配扭曲 — 高专用性投资方缺乏决策权"
```

---

## 支柱三: 行为经济学在商业决策中的应用

### 7. Kahneman & Tversky (1979) — Prospect Theory: An Analysis of Decision under Risk

- **完整引用**: Kahneman, D. & Tversky, A. (1979). "Prospect Theory: An Analysis of Decision under Risk." _Econometrica_, 47(2): 263–291.
- **核心论点**: 人们在面对风险时的决策系统性地偏离期望效用理论。三大核心洞见:
  1. **参考点依赖 (Reference Dependence)** — 结果被编码为相对于参考点的收益或损失，而非绝对财富水平。
  2. **损失厌恶 (Loss Aversion)** — 损失带来的痛苦 ≈ 2.25× 等量收益带来的快乐 (λ ≈ 2.25)。
  3. **概率加权 (Probability Weighting)** — 小概率被高估，中高概率被低估。
  - **价值函数**: v(x) = x^α (for x ≥ 0), v(x) = −λ(−x)^β (for x < 0)，其中 α ≈ β ≈ 0.88, λ ≈ 2.25。
  - **这是行为经济学的奠基之作。2002年诺贝尔奖。**

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 7.1 | **损失厌恶系数 (λ_org)** | λ_org = 组织对负面事件的反应强度 / 对正面同等事件的反应强度。通过分析组织决策日志中"止损"vs"止盈"的速度比测量 | 决策日志、项目终止/延续记录 | `strategy` |
| 7.2 | **沉没成本陷阱指数** | 继续投入失败项目的资金/时间 vs 新启动项目的资金/时间比 | 项目预算分配 + 项目成功率 | `risk` |
| 7.3 | **参考点偏移检测** | 比较组织在"高于去年"和"低于去年"情境下的风险偏好差异 | 预算调整模式、投资决策记录 | `strategy` |
| 7.4 | **概率权重偏差** | w(p)_observed − p (组织实际行为隐含的概率权重 vs 客观概率) | 风险评估文档 vs 实际结果统计 | `risk` |
| 7.5 | **现状偏差指数** | 维持现状的决策数 / (维持现状 + 改变) 决策总数，与基线对比 | 战略决策会议记录 | `evolution` |

**诊断公式**:
```
前景理论组织偏差指数 = 0.4 × (λ_org − 2.25)/2.25 + 0.3 × 沉没成本偏差 + 0.3 × 现状偏差
正常: < 0.3 (人类正常偏差范围)
警戒: 0.3-0.6 (组织性决策偏差)
危险: > 0.6 (系统性非理性 — 需要决策流程干预)
```

---

### 8. Thaler (1980) — Toward a Positive Theory of Consumer Choice

- **完整引用**: Thaler, R. (1980). "Toward a Positive Theory of Consumer Choice." _Journal of Economic Behavior & Organization_, 1(1): 39–60.
- **核心论点**: 提出**心理账户 (Mental Accounting)** 理论的前身。人们不是像传统经济学假设的那样进行全局优化，而是使用一系列心理账户来组织、评估和跟踪财务活动。关键概念:
  1. **交易效用 (Transaction Utility)** — 除了获得效用 (acquisition utility)，人们还从"交易本身是否划算"中获得效用。
  2. **沉没成本效应 (Sunk Cost Effect)** — 已支付的成本影响后续消费决策（标准经济学认为不应影响）。
  3. **机会成本低估** — 人们系统性地忽视机会成本，更关注显性支出 (out-of-pocket costs)。
  - **2017年诺贝尔奖。**

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 8.1 | **心理账户分割度** | MA_frag = 独立核算的预算池数量 / 应有的全局优化池数量 (偏高 = 过度分割) | 预算结构分析 | `strategy` |
| 8.2 | **沉没成本持续比例** | SC_ratio = 已投入 > 预期回报但仍然继续的项目 / 总活跃项目 | 项目 ROI 分析 + 项目状态日志 | `risk` |
| 8.3 | **显性支出偏见** | 机会成本被考虑进决策的频率 / 显见支出被考虑的频次 (通常 << 1) | 采购决策文档中的成本类型提及频率 | `strategy` |
| 8.4 | **交易效用驱动比例** | 因"划算/促销"发起的非计划采购 / 总采购 | 采购记录 + 预算偏离分析 | `risk` |
| 8.5 | **禀赋效应系数** | WTA (愿意接受的最低卖出价) / WTP (愿意支付的最高买入价)，通常 > 2.0 | 资产处置 vs 资产获取的价格锚定 | `strategy` |

**诊断公式**:
```
Thaler 心理偏差指数 = 0.35 × SC_ratio + 0.25 × MA_frag + 0.25 × 交易效用驱动 + 0.15 × 禀赋效应
警戒: > 0.5 (组织中行为偏差显著影响资源配置)
```

---

### 9. Uotila et al. (2009) — Exploration, Exploitation, and Financial Performance

- **完整引用**: Uotila, J., Maula, M., Keil, T., & Zahra, S.A. (2009). "Exploration, Exploitation, and Financial Performance: Analysis of S&P 500 Corporations." _Strategic Management Journal_, 30(2): 221–231.
- **核心论点**: March (1991) 提出的探索-利用 (Exploration-Exploitation) 张力是组织理论的核心——但 Uotila et al. 首次给出了**可操作的量化方法**。他们对 S&P 500 公司 20 年的年报进行计算机辅助文本分析 (CATA)，使用关键词计数来测量探索与利用的相对平衡度。关键发现: 探索与利用的相对平衡度 (而非绝对水平) 与财务绩效呈**倒 U 形关系**。最优平衡点随行业环境变化。

**可测量指标 (直接可仪器化)**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 9.1 | **探索/利用相对平衡度 (Uotila E/E Balance)** | Balance = |探索关键词频率 − 利用关键词频率| / (探索 + 利用)，范围 [0,1]，0 = 完全平衡 | 内部沟通文本 (邮件/Slack/文档) 的关键词计数 | `evolution` |
| 9.2 | **探索关键词频率** | exploration% = (探索词: discover, experiment, research, innovate, new, novel, risk, variation, flexibility, play, search) 出现次数 / 总词数 | NLP 文本分析 | `evolution` |
| 9.3 | **利用关键词频率** | exploitation% = (利用词: refine, efficient, implement, execute, standardize, optimize, control, discipline, routine, improve, production) 出现次数 / 总词数 | NLP 文本分析 | `evolution` |
| 9.4 | **E/E 平衡-绩效相关性** | 计算 (E/E Balance) 与 (营收增长率/利润率) 的历史相关性 | 财务数据 + 文本分析 (季度/年度) | `evolution` |
| 9.5 | **行业最优平衡对比** | 当前 Balance vs 行业领先企业的 Balance 偏离度 | 行业基准数据 | `strategy` |

**诊断公式**:
```
Uotila E/E 平衡指数 = 1 − |探索% − 利用%| / (探索% + 利用%)
最优: 0.45-0.65 (适度偏向利用 — 多数行业)
探索不足: < 0.3 (过度利用 — 短期优化但创新枯竭)
利用不足: > 0.8 (过度探索 — 创新丰富但执行无力)
```

---

### 10. Kahneman, Lovallo & Sibony (2011) — Before You Make That Big Decision...

- **完整引用**: Kahneman, D., Lovallo, D., & Sibony, O. (2011). "Before You Make That Big Decision..." _Harvard Business Review_, 89(6): 50–60.
- **核心论点**: 识别了商业决策中的**系统性认知偏差**，并提出了具体的去偏方法。六大核心偏差:
  1. **内部观点 (Inside View)** — 基于项目自身特征预测，忽视类似项目的历史结果 (基准率)
  2. **规划谬误 (Planning Fallacy)** — 系统性地低估时间和成本，高估收益
  3. **过度乐观 (Overoptimism)** — 即使看到历史数据，仍相信自己会做得更好
  4. **确认偏误 (Confirmation Bias)** — 寻找支持已有结论的证据
  5. **锚定效应 (Anchoring)** — 过度依赖最初获得的信息
  6. **群体思维 (Groupthink)** — 为保持和谐压制异议

  **解药: 外部观点 (Outside View / Reference Class Forecasting)** — 先看类似项目的实际结果分布，再定位当前项目的预期位置。

**可测量指标**:

| # | 指标名 | 公式/算法 | 数据源 | Sentinel 类别 |
|---|--------|----------|--------|---------------|
| 10.1 | **规划偏差指数** | PBI = (Σ 实际工期_i − Σ 预估工期_i) / Σ 预估工期_i，正 = 系统性低估 | 项目管理工具 (Jira/Asana) | `risk` |
| 10.2 | **收益高估指数** | ROI_overestimate = (预估ROI − 实际ROI) / 预估ROI，按项目类别聚合 | 项目复盘数据 | `risk` |
| 10.3 | **外部观点采用率** | outside_view% = 决策文档中包含基准率/参考类数据的决策数 / 总决策数 | 提案/商业计划文档审计 | `strategy` |
| 10.4 | **确认偏误信号强度** | CB_strength = 支持预设结论的证据引用数 / (支持 + 反对) 总证据引用数，偏高 (> 0.7) 表示确认偏误 | 决策备忘录中的正反证据计数 | `strategy` |
| 10.5 | **群体思维指数** | GT_index = 会议中异议表达次数 / 总发言次数，异常低 (< 0.05) 表示压制 | 会议记录/语音转文字中的异议检测 | `collaboration` |
| 10.6 | **锚定偏差检测** | 首轮预估与最终结果的偏差是否显著大于后续调整 | 多轮预算/排期迭代记录 | `risk` |

**诊断公式**:
```
KLS 决策质量指数 = 1 − (0.3 × PBI_normalized + 0.25 × ROI_overestimate_normalized + 0.2 × CB_strength + 0.15 × (1 − outside_view%) + 0.1 × GT_index_risk)
优秀: > 0.8 (偏差受控)
一般: 0.5-0.8 (存在可识别的偏差)
差: < 0.5 (系统性问题 — 建议引入外部审查/红队机制)
```

---

## 综合诊断框架: 三大支柱 → 7维度的映射

### 信息论支柱 → 诊断维度

| 理论 | 映射维度 | 关键指标 |
|------|---------|---------|
| Shannon 信息论 | D3 信息流通、D5 沟通效率 | H_decision, SNR_org, 信息瓶颈指数 |
| Arrow 组织上限 | D1 战略架构、D4 人员结构 | 层级衰减系数, 决策权-信息距离 |
| Galbraith 信息处理 | D2 组织能力、D6 流程成熟度 | IPR/IPC 匹配度, 横向协调密度 |

### 交易成本经济支柱 → 诊断维度

| 理论 | 映射维度 | 关键指标 |
|------|---------|---------|
| Coase 企业边界 | D1 战略架构、D7 财务健康 | R_im 内部化比率, 管理收益递减率 |
| Williamson 治理结构 | D1 战略架构、D6 流程成熟度 | 资产专用性指数, 治理结构匹配度 |
| Grossman-Hart 产权 | D1 战略架构、D4 人员结构 | 剩余控制权集中度, 投资激励不对称 |

### 行为经济学支柱 → 诊断维度

| 理论 | 映射维度 | 关键指标 |
|------|---------|---------|
| 前景理论 | D1 战略架构、D7 财务健康 | λ_org, 沉没成本陷阱, 概率权重偏差 |
| Thaler 心理账户 | D7 财务健康、D1 战略架构 | SC_ratio, 心理账户分割度, 禀赋效应 |
| Uotila E/E 平衡 | D2 组织能力、D6 流程成熟度 | E/E 平衡度, 探索/利用关键词频率 |
| KLS 决策偏差 | D1 战略架构、D3 信息流通 | 规划偏差, 确认偏误, 外部观点采用率 |

---

## 实施建议: 新 Sentinel 适配器优先级

基于现有 SynovaAgent 测量器覆盖面和学术文献的可仪器化程度，建议按以下优先级开发新的 Sentinel 适配器:

**P0 — 立即可做 (数据现成、算法明确)**:
1. `sentinel-info-entropy` — Shannon 信息熵 + SNR_org
2. `sentinel-ee-balance` — Uotila E/E 平衡度 (NLP 关键词计数)
3. `sentinel-planning-bias` — KLS 规划偏差指数 (Jira/项目管理数据)

**P1 — 需部分数据补充**:
4. `sentinel-layer-decay` — Arrow 层级衰减系数
5. `sentinel-governance-match` — Williamson 治理结构匹配度
6. `sentinel-decision-quality` — KLS 决策质量指数 (确认偏误+外部观点)

**P2 — 需较完整数据或 LLM 辅助**:
7. `sentinel-asset-specificity` — 资产专用性指数
8. `sentinel-loss-aversion` — 前景理论组织偏差
9. `sentinel-mental-accounting` — Thaler 心理账户偏差
10. `sentinel-residual-control` — GHM 剩余控制权匹配

---

## 参考文献 (完整列表)

1. Shannon, C.E. (1948). "A Mathematical Theory of Communication." _Bell System Technical Journal_, 27(3): 379–423; 27(4): 623–656.
2. Arrow, K.J. (1974). _The Limits of Organization_. New York: W.W. Norton & Company.
3. Galbraith, J.R. (1974). "Organization Design: An Information Processing View." _Interfaces_, 4(3): 28–36.
4. Coase, R.H. (1937). "The Nature of the Firm." _Economica_, 4(16): 386–405.
5. Williamson, O.E. (1975). _Markets and Hierarchies: Analysis and Antitrust Implications_. New York: Free Press.
6. Williamson, O.E. (1985). _The Economic Institutions of Capitalism: Firms, Markets, Relational Contracting_. New York: Free Press.
7. Grossman, S.J. & Hart, O.D. (1986). "The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration." _Journal of Political Economy_, 94(4): 691–719.
8. Kahneman, D. & Tversky, A. (1979). "Prospect Theory: An Analysis of Decision under Risk." _Econometrica_, 47(2): 263–291.
9. Thaler, R. (1980). "Toward a Positive Theory of Consumer Choice." _Journal of Economic Behavior & Organization_, 1(1): 39–60.
10. Uotila, J., Maula, M., Keil, T., & Zahra, S.A. (2009). "Exploration, Exploitation, and Financial Performance: Analysis of S&P 500 Corporations." _Strategic Management Journal_, 30(2): 221–231.
11. Kahneman, D., Lovallo, D., & Sibony, O. (2011). "Before You Make That Big Decision..." _Harvard Business Review_, 89(6): 50–60.

### 补充阅读 (上下游文献)

- March, J.G. (1991). "Exploration and Exploitation in Organizational Learning." _Organization Science_, 2(1): 71–87. — Uotila 的前置理论。
- Hart, O. & Moore, J. (1990). "Property Rights and the Nature of the Firm." _Journal of Political Economy_, 98(6): 1119–1158. — GHM 模型的扩展。
- Tversky, A. & Kahneman, D. (1974). "Judgment under Uncertainty: Heuristics and Biases." _Science_, 185(4157): 1124–1131. — 前景理论的认知基础。
- Kahneman, D. & Tversky, A. (1984). "Choices, Values, and Frames." _American Psychologist_, 39(4): 341–350. — 框架效应。
- Simon, H.A. (1947). _Administrative Behavior_. New York: Macmillan. — 有限理性 (Bounded Rationality)，整个行为经济学和信息处理理论的前提。
- Daft, R.L. & Lengel, R.H. (1986). "Organizational Information Requirements, Media Richness and Structural Design." _Management Science_, 32(5): 554–571. — 信息丰富度理论，Galbraith 的自然延伸。

---

*文献侦察完成。下一步: 选择 P0 优先级的 3 个 Sentinel 适配器进行实现。*
