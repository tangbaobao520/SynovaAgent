<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>SynovaAgent 诊断框架 — 零基设计</title>
<style>
  :root { --bg: #0d1117; --fg: #c9d1d9; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --yellow: #d2991d; --purple: #bc8cff; --border: #30363d; --section-bg: #161b22; --muted: #8b949e; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 15px; line-height: 1.7; max-width: 960px; margin: 0 auto; padding: 60px 24px 120px; }
  h1 { font-size: 2rem; color: #f0f6fc; border-bottom: 2px solid var(--accent); padding-bottom: 12px; margin-bottom: 24px; }
  h2 { font-size: 1.35rem; color: #e6edf3; margin: 40px 0 16px; padding-left: 8px; border-left: 4px solid var(--accent); }
  h3 { font-size: 1.1rem; color: #e6edf3; margin: 28px 0 12px; }
  h4 { font-size: 1rem; color: var(--accent); margin: 20px 0 8px; }
  p { margin: 0 0 14px; }
  ul, ol { margin: 0 0 14px 24px; }
  li { margin: 4px 0; }
  code { background: #161b22; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', monospace; font-size: 0.88em; }
  pre { background: #161b22; padding: 16px 20px; border-radius: 6px; border: 1px solid var(--border); overflow-x: auto; font-size: 0.85em; line-height: 1.6; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 20px; font-size: 0.92em; }
  th { background: var(--section-bg); text-align: left; padding: 10px 14px; border: 1px solid var(--border); font-weight: 600; }
  td { padding: 8px 14px; border: 1px solid var(--border); vertical-align: top; }
  tr:nth-child(even) td { background: rgba(255,255,255,0.015); }
  .card { background: var(--section-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin: 0 0 16px; }
  .card h3:first-child { margin-top: 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.78em; font-weight: 600; }
  .badge-strategy { background: rgba(188,140,255,0.18); color: #bc8cff; }
  .badge-org { background: rgba(88,166,255,0.18); color: #58a6ff; }
  .badge-finance { background: rgba(63,185,80,0.18); color: #3fb950; }
  .badge-tech { background: rgba(210,153,29,0.18); color: #d2991d; }
  .badge-marketing { background: rgba(248,81,73,0.18); color: #f85149; }
  .badge-action { background: rgba(139,148,158,0.18); color: #c9d1d9; }
  .badge-bmodel { background: rgba(188,140,255,0.18); color: #bc8cff; }
  .flow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 16px 0; font-size: 0.9em; }
  .flow-node { background: var(--section-bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 14px; }
  .flow-arrow { color: var(--accent); font-weight: bold; }
  .principle { border-left: 4px solid var(--yellow); padding: 10px 16px; margin: 0 0 12px; background: rgba(210,153,29,0.06); border-radius: 0 4px 4px 0; }
  hr.divider { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
</style>
</head>
<body>

<h1>SynovaAgent 诊断框架 — 零基设计</h1>
<p style="color:var(--muted);">基于 Anthropic 决策思维，从第一性原理出发。抛开所有历史代码（Novis engine-core、已存在的 compute 桥接、旧适配器），从产品定义和管理经济学理论重新设计。</p>

<hr class="divider">

<!-- ============================================================ -->
<h2>一、产品核心定义</h2>

<div class="principle">
<strong>原则 2：先设计验证标准，再设计实现。</strong><br>
SynovaAgent 的诊断能力是否正确的唯一验证标准：<br>
<strong>一个企业主收到诊断报告后，是否能回答"我的增长卡在哪里？现在该做什么？"</strong><br>
如果不能——诊断失败。如果能——诊断正确。所有哨兵、计算指标、专家推理——都是为回答这两个问题服务的。
</div>

<div class="principle">
<strong>原则 1：找到根因，用一个机制防一类错。</strong><br>
企业增长的根因只有几个类别。8 位专家各自覆盖一类。哨兵不是随机数量的监控指标——每个哨兵对应"一个增长瓶颈的早期信号"。
</div>

<h3>核心问题映射</h3>

<table>
<tr><th>增长问题</th><th>诊断专家</th><th>核心理论</th></tr>
<tr><td>方向对不对？</td><td><span class="badge badge-strategy">strategy</span></td><td>市场结构、博弈论、7 Powers</td></tr>
<tr><td>团队能不能执行？</td><td><span class="badge badge-org">org</span></td><td>委托-代理、激励理论、交易成本</td></tr>
<tr><td>钱够不够？</td><td><span class="badge badge-finance">finance</span></td><td>资本预算、成本分析、Token 经济</td></tr>
<tr><td>技术撑不撑得住？</td><td><span class="badge badge-tech">tech</span></td><td>信息不对称、柠檬市场</td></tr>
<tr><td>市场买不买账？</td><td><span class="badge badge-marketing">marketing</span></td><td>需求弹性、行为经济学</td></tr>
<tr><td>机器结构稳不稳？</td><td><span class="badge badge-bmodel">business_model</span></td><td>交易成本、价值链、治理矩阵</td></tr>
<tr><td>接下来做什么？</td><td><span class="badge badge-action">action</span></td><td>差距动力学、优先级排序</td></tr>
<tr><td>我们不知道什么？</td><td><span class="badge badge-org" style="background:rgba(139,148,158,0.18);color:#8b949e;">knowledge</span></td><td>跨域知识索引</td></tr>
</table>

<hr class="divider">

<!-- ============================================================ -->
<h2>二、三层粒度设计（专家 → 哨兵 → 计算）</h2>

<p>每一层回答不同粒度的问题。数据从底层向上流动，信号从顶层向下传导。</p>

<div class="flow">
  <div class="flow-node" style="border-left:3px solid var(--purple);"><strong>专家</strong><br>增长卡在哪？</div>
  <div class="flow-arrow">← 综合 N 哨兵的 Finding →</div>
  <div class="flow-node" style="border-left:3px solid var(--green);"><strong>哨兵</strong><br>这个子领域出问题没有？</div>
  <div class="flow-arrow">← 综合 M 个指标 →</div>
  <div class="flow-node" style="border-left:3px solid var(--border);"><strong>计算</strong><br>这个数是多少？</div>
  <div class="flow-arrow">← L4 GraphStore 原始数据</div>
</div>

<h3>数据流</h3>
<pre>L4 GraphStore（节点+边）
    ↓
计算（纯数学：均值、增速、占比、集中度）
    ↓
哨兵（业务判断：正常/警告/严重）
    ↓
专家（多哨兵综合 + 管理经济学理论 → Finding 交叉验证）
    ↓
行动建议（优先级排序 + 推荐路径）</pre>

<hr class="divider">

<!-- ============================================================ -->
<h2>三、8 专家 × N 哨兵（完整映射）</h2>

<!-- ────────── 1. STRATEGY ────────── -->
<div class="card">
<h3><span class="badge badge-strategy">strategy</span> 战略专家 — 增长方向对不对？</h3>
<p><strong>核心理论</strong>：市场结构四象限、博弈论、7 Powers、路径依赖</p>
<p><strong>回答的问题</strong>：这家企业在一个好行业吗？有护城河吗？竞争格局会怎么变？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>market-position</strong></td>
  <td>行业结构是否支持增长</td>
  <td>HHI 指数、CR5 集中度、市场增长率</td>
  <td>Financial(收入) → 集中度<br>Client(客户列表) → 客户数</td>
  <td>HHI>2500=高度集中(警告)<br>市场增速<GDP=成熟(警告)</td>
</tr>
<tr>
  <td><strong>competitive-moat</strong></td>
  <td>护城河是否在变宽</td>
  <td>毛利率变化率、客户留存率、技术投入比</td>
  <td>Financial(毛利)<br>Client(留存)<br>Financial(研发投入)</td>
  <td>毛利率↓连续2季=warning<br>留存率<80%=critical</td>
</tr>
<tr>
  <td><strong>path-dependency</strong></td>
  <td>组织是否被过去锁定</td>
  <td>六维度变化频率、僵化维度占比</td>
  <td>Event(gap_* 事件)</td>
  <td>僵化维度>60%=critical<br>35-60%=warning</td>
</tr>
</table>
</div>

<!-- ────────── 2. ORG ────────── -->
<div class="card">
<h3><span class="badge badge-org">org</span> 组织专家 — 团队能不能执行战略？</h3>
<p><strong>核心理论</strong>：委托-代理、激励理论、人机混合信任、异质网络</p>
<p><strong>回答的问题</strong>：人与人的协作健康吗？激励对齐了吗？关键知识有没有丢失风险？Agent 和人有没有信任问题？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>collaboration-health</strong></td>
  <td>协作协议是否完备</td>
  <td>分工明确度、信息流通度、权威治理度</td>
  <td>Person(角色) → 分工<br>Edge(INTERACTS_WITH) → 信息流<br>Process(决策流程)</td>
  <td>六维度均值<0.4=critical<br><0.6=warning</td>
</tr>
<tr>
  <td><strong>incentive-alignment</strong></td>
  <td>激励是否对齐增长目标</td>
  <td>短期指标占比、KPI 一致性得分</td>
  <td>Goal(OKR 目标)<br>Edge(ALIGNS_WITH)</td>
  <td>短期KPI占比>60%=warning<br>KPI与战略目标不一致>3项=critical</td>
</tr>
<tr>
  <td><strong>key-person-risk</strong></td>
  <td>关键人依赖风险</td>
  <td>Bus Factor、知识集中度、备份覆盖率</td>
  <td>Person(knowledge/domains/skills)</td>
  <td>Bus Factor≤2=warning<br>Bus Factor=1=critical</td>
</tr>
<tr>
  <td><strong>trust-health</strong></td>
  <td>人+Agent 混合信任</td>
  <td>HITL 修正频率、自动接受率、信任衰减事件</td>
  <td>Event(collaboration_* 事件)<br>Agent(status)</td>
  <td>自动接受率<50%=warning<br>信任衰减事件>5=critical</td>
</tr>
</table>
</div>

<!-- ────────── 3. FINANCE ────────── -->
<div class="card">
<h3><span class="badge badge-finance">finance</span> 财务专家 — 钱够不够？</h3>
<p><strong>核心理论</strong>：资本预算(NPV/IRR)、成本分析、Token 经济学</p>
<p><strong>回答的问题</strong>：现金流健康吗？成本结构合理吗？AI 投入回报可以吗？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>revenue-health</strong></td>
  <td>收入质量</td>
  <td>收入增长率、客户集中度(CR5)、客单价趋势</td>
  <td>Financial(revenue)<br>Client(客户收入)</td>
  <td>CR5>50%=集中度过高=warning<br>增长率连续↓=warning</td>
</tr>
<tr>
  <td><strong>cost-efficiency</strong></td>
  <td>成本结构</td>
  <td>毛利率、固定/变动比、人均成本趋势</td>
  <td>Financial(cost, revenue)</td>
  <td>毛利率<10%=critical<br><20%=warning</td>
</tr>
<tr>
  <td><strong>cash-runway</strong></td>
  <td>现金可持续性</td>
  <td>现金跑道(月)、应收逾期率、现金流 vs 净利润</td>
  <td>Financial(cashBalance, operatingCashFlow)</td>
  <td>跑道<6月=critical<br><12月=warning</td>
</tr>
<tr>
  <td><strong>ai-investment-return</strong></td>
  <td>AI/LLM 投入回报</td>
  <td>Token 成本趋势、AI 效率提升比、人均 Token 成本</td>
  <td>Financial(token_account)<br>Token 用量数据</td>
  <td>月 Token 成本>5000=warning<br>>10000=critical</td>
</tr>
</table>
</div>

<!-- ────────── 4. TECH ────────── -->
<div class="card">
<h3><span class="badge badge-tech">tech</span> 技术专家 — 技术撑不撑得住？</h3>
<p><strong>核心理论</strong>：信息不对称、柠檬市场、信号发送</p>
<p><strong>回答的问题</strong>：技术债在拖后腿吗？外部服务靠谱吗？架构能支持下一阶段增长吗？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>tech-debt</strong></td>
  <td>技术债规模</td>
  <td>非活跃 Tool 节点占比、版本滞后程度</td>
  <td>Tool(status=inactive)</td>
  <td>非活跃工具>30%=warning<br>关键工具版本落后>2代=critical</td>
</tr>
<tr>
  <td><strong>vendor-risk</strong></td>
  <td>外部技术依赖风险</td>
  <td>单供应商依赖度、外部 Agent 占比</td>
  <td>Edge(DEPENDS_ON→外部系统)<br>Agent(agentType=external)</td>
  <td>单供应商>60%=critical<br>外部Agent>50%=warning</td>
</tr>
<tr>
  <td><strong>architecture-readiness</strong></td>
  <td>架构是否 Agent 就绪</td>
  <td>自动化率、API 覆盖率、Agent 集成度</td>
  <td>Agent/L4 集成指标</td>
  <td>自动化率<20%=warning<br>无API的Tool>40%=warning</td>
</tr>
</table>
</div>

<!-- ────────── 5. MARKETING ────────── -->
<div class="card">
<h3><span class="badge badge-marketing">marketing</span> 营销专家 — 市场买不买账？</h3>
<p><strong>核心理论</strong>：需求弹性、行为经济学（前景理论、锚定、现状偏误）</p>
<p><strong>回答的问题</strong>：定价合理吗？品牌有溢价吗？客户为什么选/不选我们？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>pricing-power</strong></td>
  <td>定价能力变化</td>
  <td>客单价变化率、折扣率趋势、客户价格敏感度</td>
  <td>Financial(revenue/客户)<br>Client(客单价历史)</td>
  <td>折扣率持续>
0%=warning<br>客单价↓连续2季=critical</td>
</tr>
<tr>
  <td><strong>customer-health</strong></td>
  <td>客户健康度</td>
  <td>流失率、NPS 趋势、复购率</td>
  <td>Client(status=churned/active)<br>NPS 数据</td>
  <td>月流失率>5%=warning<br>>10%=critical</td>
</tr>
</table>
</div>

<!-- ────────── 6. BUSINESS MODEL ────────── -->
<div class="card">
<h3><span class="badge badge-bmodel">business_model</span> 商业模式专家 — 赚钱机器结构稳不稳？</h3>
<p><strong>核心理论</strong>：交易成本分析、价值链、治理矩阵、科斯定理混合修正</p>
<p><strong>回答的问题</strong>：钱怎么进来？怎么分配？每个齿轮转了有没有传到下一个？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>value-chain</strong></td>
  <td>价值链利润迁移</td>
  <td>各环节利润占比变化、集中度</td>
  <td>Financial(分段利润)<br>Process(流程成本)</td>
  <td>单环节利润占比>60%=集中度风险=warning</td>
</tr>
<tr>
  <td><strong>revenue-model</strong></td>
  <td>收入结构健康度</td>
  <td>收入来源分布、ARPU 趋势、续费率</td>
  <td>Financial(按类型)<br>Edge(REVENUE_FROM)</td>
  <td>单一收入来源>70%=critical<br>续费率<80%=warning</td>
</tr>
</table>
</div>

<!-- ────────── 7. ACTION ────────── -->
<div class="card">
<h3><span class="badge badge-action">action</span> 行动专家 — 接下来做什么？</h3>
<p><strong>核心理论</strong>：差距动力学、优先级排序</p>
<p><strong>回答的问题</strong>：哪个问题最紧急？哪个最影响增长？第一步做什么？</p>
<table>
<tr><th>哨兵</th><th>判断什么</th><th>计算指标</th><th>数据源(L4)</th><th>阈值</th></tr>
<tr>
  <td><strong>execution-gap</strong></td>
  <td>战略执行差距</td>
  <td>六维度变化趋势、僵化维度识别、执行偏差</td>
  <td>Event(gap_* 事件)</td>
  <td>综合 gap 得分<0.4=warning</td>
</tr>
<tr>
  <td><strong>priority-sorter</strong></td>
  <td>行动优先级排序</td>
  <td>影响-紧急矩阵、依赖链分析</td>
  <td>跨哨兵 Finding 聚合</td>
  <td>无—此哨兵输出的是排序，不是告警</td>
</tr>
</table>
</div>

<!-- ────────── 8. KNOWLEDGE ────────── -->
<div class="card">
<h3 style="color:var(--muted);"><span class="badge badge-bmodel" style="background:rgba(139,148,158,0.18);color:#8b949e;">knowledge</span> 知识专家 — 我们不知道什么？</h3>
<p>没有独立哨兵。提供跨域知识索引和 FOFA（First-Order Facts Assembly）</p>
</div>

<hr class="divider">

<!-- ============================================================ -->
<h2>四、与 L4 数据层的关联</h2>

<h3>本体节点 → 哨兵数据源映射</h3>

<table>
<tr><th>L4 节点/边</th><th>供应什么哨兵</th><th>关键属性</th></tr>
<tr><td>Person</td><td>collaboration-health, key-person-risk, incentive-alignment</td><td>role, teamId, knowledge/domains/skills</td></tr>
<tr><td>Team</td><td>collaboration-health</td><td>name, teamType, memberCount</td></tr>
<tr><td>Financial</td><td>revenue-health, cost-efficiency, cash-runway, pricing-power, market-position, ai-investment-return, value-chain</td><td>financialType, amount, period</td></tr>
<tr><td>Client</td><td>market-position, customer-health, revenue-model</td><td>name, status, revenue</td></tr>
<tr><td>Goal</td><td>incentive-alignment, path-dependency</td><td>goalType, progress, selfScore</td></tr>
<tr><td>Process</td><td>collaboration-health, value-chain</td><td>processType, status</td></tr>
<tr><td>Tool</td><td>tech-debt, architecture-readiness</td><td>category, status, version</td></tr>
<tr><td>Agent</td><td>trust-health, vendor-risk, architecture-readiness</td><td>agentType, status, platform</td></tr>
<tr><td>Event</td><td>path-dependency, execution-gap, trust-health</td><td>eventType, timestamp, dimension</td></tr>
<tr><td>Edge(INTERACTS_WITH)</td><td>collaboration-health</td><td>weight, channel</td></tr>
<tr><td>Edge(DEPENDS_ON)</td><td>vendor-risk</td><td>criticality</td></tr>
<tr><td>Edge(REVENUE_FROM)</td><td>revenue-model</td><td>share, revenueType</td></tr>
<tr><td>Edge(ALIGNS_WITH)</td><td>incentive-alignment</td><td>alignmentStrength, alignmentType</td></tr>
</table>

<hr class="divider">

<h2>五、和三层的对齐方式</h2>

<pre>
Expert（领域+THEORY）
  │
  ├── Sentinel（子领域）
  │     └── 数据源：L4 GraphStore
  │     └── 阈值：manifest.json
  │     └── 合成：aggregate.ts（N个计算→1条Finding）
  │
  ├── Compute（指标）
  │     └── 纯数学函数
  │     └── 输入：GraphStoreReader
  │     └── 输出：{value, threshold, metadata}
  │
  └── 知识支撑
        └── THEORY.md（核心框架，每次推理加载）
        └── TOOLS.md（分析工具，信号触发）
        └── RULES.md（约束边界）

Finding 格式（哨兵输出）：
  { id, severity, title, description, evidence[], suggestion, detectedAt }
</pre>

<hr class="divider">

<h2>六、与当前状态的关系</h2>

<p>这套设计与现有代码的关系：</p>

<ul>
  <li><strong>已有的可以使用</strong>：L4 GraphStore（queryByTags）、ontology JSON Schema（17节点+14边）、tags.json、sentinel-loader.ts、manifest.json 格式</li>
  <li><strong>需要重写的</strong>：所有 12 个 T1 compute 函数（因为它们基于 Novis 算法，不是 SynovaAgent 的）。这个文档定义的计算指标才是正确的</li>
  <li><strong>需要新增的</strong>：ai-investment-return、pricing-power、customer-health、vendor-risk、architecture-readiness 等新哨兵</li>
  <li><strong>需要删除的</strong>：htm、hacd、hona、self-awareness 等基于 Novis 人+Agent 假设的哨兵（SynovaAgent 的诊断对象是组织，不是通用 Agent 系统）</li>
  <li><strong>保持不变的</strong>：专家文件结构（THEORY/TOOLS/RULES）、管理经济学知识注入、免疫系统、V4.2.3 门禁</li>
</ul>

<hr class="divider">

<h2>七、建议的执行顺序</h2>

<ol>
  <li><strong>清理 Novis 残留</strong>：删除 htm、hacd、hona、self-awareness、eob 等基于 Novis 假设的哨兵</li>
  <li><strong>按文档重建计算</strong>：这个文档定义的 16 个哨兵、35 个计算指标，每个 compute 是在 L4 GraphStore 上纯函数</li>
  <li><strong>阈值校准</strong>：每个哨兵的阈值不是从 Novis 搬来的——是从管理经济学理论推导的。比如"毛利率<10%=critical"来自成本分析理论</li>
  <li><strong>pizza-chain 验证</strong>：新增行业后，对应的哨兵阈值自动调整</li>
</ol>

<hr class="divider">

<p style="color:var(--muted);text-align:center;">SynovaAgent 诊断框架零基设计 · 2026-06-24 · v1.0</p>

<p>完整对比：<a href="synova-diagnosis-framework-附录对比.md">当前哨兵 vs 零基设计对比（附录）</a></p>
</body>
</html>
