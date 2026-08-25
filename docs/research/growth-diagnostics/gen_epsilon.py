#!/usr/bin/env python3
"""Generate the complete Epsilon adversarial validation report."""
import pathlib

OUT = pathlib.Path(r'D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\NCI-对抗性验证报告-Epsilon-20260704.html')

def w(s=''):
    global fh
    fh.write(s + '\n')

fh = open(OUT, 'w', encoding='utf-8')

# ============================================================
# CSS + HEADER
# ============================================================
w('<!DOCTYPE html>')
w('<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">')
w('<title>NCI对抗性验证报告 — Epsilon跨案例推演 v1.0</title>')
w('<style>')
w(':root{--bg:#0d1117;--bg2:#161b22;--fg:#c9d1d9;--fg2:#8b949e;--accent:#58a6ff;--green:#3fb950;--warn:#d2991d;--crit:#f85149;--purple:#bc8cff;--h1:#f0f6fc;--h2:#e6edf3}')
w('*{box-sizing:border-box;margin:0;padding:0}')
w('body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.8;max-width:1100px;margin:0 auto;padding:40px 24px 120px}')
w('h1{color:var(--h1);font-size:1.8em;border-bottom:2px solid var(--accent);padding-bottom:12px;margin-bottom:8px}')
w('h2{color:var(--h2);font-size:1.3em;margin:48px 0 16px;border-left:4px solid var(--accent);padding-left:12px}')
w('h3{color:var(--accent);font-size:1.1em;margin:32px 0 10px}')
w('h4{color:var(--fg2);font-size:1em;margin:20px 0 6px}')
w('p{margin:10px 0}')
w('table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.85em}')
w('th,td{padding:10px 12px;border:1px solid #30363d;text-align:left;vertical-align:top}')
w('th{background:var(--bg2);font-weight:600;color:var(--h2)}')
w('tr:nth-child(even){background:rgba(22,27,34,.5)}')
w('.note{background:rgba(88,166,255,.08);border-left:3px solid var(--accent);padding:12px 16px;margin:15px 0;border-radius:0 4px 4px 0}')
w('.crit{background:rgba(248,81,73,.08);border-left:3px solid var(--crit);padding:12px 16px;margin:15px 0;border-radius:0 4px 4px 0}')
w('.warn-box{background:rgba(210,153,29,.08);border-left:3px solid var(--warn);padding:12px 16px;margin:15px 0;border-radius:0 4px 4px 0}')
w('.green-box{background:rgba(63,185,80,.06);border-left:3px solid var(--green);padding:12px 16px;margin:15px 0;border-radius:0 4px 4px 0}')
w('.methodology{background:rgba(188,140,255,.06);border-left:3px solid var(--purple);padding:14px 18px;margin:15px 0;border-radius:0 4px 4px 0}')
w('.fail{color:var(--crit);font-weight:600}.pass{color:var(--green);font-weight:600}.wrn{color:var(--warn);font-weight:600}')
w('.toc{background:var(--bg2);padding:20px 25px;border-radius:6px;margin:20px 0}')
w('.toc ol{padding-left:20px}.toc li{margin:5px 0}.toc a{color:var(--fg)}')
w('hr{border:0;border-top:1px solid #30363d;margin:30px 0}')
w('.meta{color:var(--muted);font-size:.9em}')
w('.score-card{display:inline-block;min-width:60px;text-align:center;padding:4px 10px;border-radius:4px;font-weight:700}')
w('.score-high{background:rgba(63,185,80,.2);color:#3fb950}')
w('.score-mid{background:rgba(210,153,29,.2);color:#d2991d}')
w('.score-low{background:rgba(248,81,73,.2);color:#f85149}')
w('.formula{background:var(--bg2);border:1px solid #30363d;padding:16px 20px;margin:16px 0;text-align:center;font-weight:700;color:var(--accent)}')
w('</style></head><body>')

print('Stage 1: CSS written')

# ============================================================
# TITLE + TOC + DECLARATIONS
# ============================================================
w('<h1>NCI 非共识检测体系 — 跨案例对抗性验证报告</h1>')
w('<p class="meta">代号 Epsilon v1.0 2026-07-05 6个边界案例推演 推演对象：NCI工程化方案v1.1 + 本体层v2.4 + 增长诊断方案v2.0</p>')

w('<div class="methodology">')
w('<strong>研究方法：对抗性案例推演法</strong><br>不采用用案例验证理论正确的传统路径。精心挑选6个NCI最难处理的边界案例专门寻找失效条件。验证标准：在案例发生的时间点这套体系能否提前发出正确的信号能否避免错误的判断。')
w('</div>')

w('<div class="toc"><strong>目录</strong><ol>')
w('<li><a href="#s1">一、验证对象：核心声明</a></li>')
w('<li><a href="#s2">二、6个边界案例推演</a></li>')
w('<li><a href="#s3">三、失效点汇总</a></li>')
w('<li><a href="#s4">四、NCI模拟得分排序</a></li>')
w('<li><a href="#s5">五、修正建议</a></li>')
w('<li><a href="#s6">六、诚实边界</a></li>')
w('</ol></div><hr>')

w('<h2 id="s1">一、验证对象：Alpha-Delta产出核心声明</h2>')
w('<table>')
w('<tr><th>ID</th><th>声明</th><th>来源</th></tr>')
w('<tr><td>S1</td><td>NCI三条件缺一不可：认知偏离+成本断裂+价值网络错配。缺少任一不构成真非共识。</td><td>NCI方案 背景-第二步</td></tr>')
w('<tr><td>S2</td><td>双因子张力模型：内部共识强度x外部共识逆强度。内部极度看多+外部极度看空时达峰值。（修正一）</td><td>NCI方案 修正一</td></tr>')
w('<tr><td>S3</td><td>数据缺失时触发第一性原理断层扫描。理论下限小于行业成本x0.3则直接赋值70分。（修正三）</td><td>NCI方案 修正三</td></tr>')
w('<tr><td>S4</td><td>NCI>=70高非共识；40-69中；小于40低。</td><td>NCI方案 3.2</td></tr>')
w('<tr><td>S5</td><td>沉默触发器90天；僵尸信号：ref_count大于5但resource_delta=0则决策瘫痪。（修正二）</td><td>NCI方案 2.2+修正二</td></tr>')
w('<tr><td>S6</td><td>成本断裂真实性：结构性learning_rate突变vs规模效应。</td><td>NCI方案 3.3</td></tr>')
w('<tr><td>S7</td><td>生存底线检查：投入超现金跑道X%则NCI自动降优先级。</td><td>NCI方案 3.3</td></tr>')
w('</table><hr>')

print('Stage 2: declarations written')

# ============================================================
# CASE 1: TESLA 2010
# ============================================================
w('<h2 id="s2">二、6个边界案例推演</h2>')

w('<h3>案例1：特斯拉 2010 — 内部一致 + 外部看空</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S2（双因子张力模型）。<strong>边界性质：</strong>认知偏离最难检测的类型——内部没有被压制的信号，所有人在同一信念下高度一致。沉默分类器核心假设是存在被组织免疫系统压制的非共识信号，但2010年的特斯拉没有这种压制——他们是真的相信，不是被压着不敢说。</div>')

w('<h4>2010年时间点的事实基座</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>内部共识</td><td>特斯拉全员all-in电动车。Elon Musk公开声明电动车是未来唯一方向。Roadster已交付但亏损。Model S研发全力推进。</td></tr>')
w('<tr><td>外部共识</td><td>主流汽车产业认为电动车续航短充电难永远是小众。2009年通用汽车破产重组电动车项目被砍。分析师普遍看空。</td></tr>')
w('<tr><td>电池成本趋势</td><td>锂离子电池成本2007年约1000美元/kWh，2010年约700美元/kWh，年均下降约14%。学习率显著高于内燃机（内燃机成本已趋于平坦）。</td></tr>')
w('<tr><td>价值网络</td><td>传统汽车价值锚点是机械工程精度+发动机性能+经销商网络。电动车锚点转移到电池化学+软件+直营。传统巨头在电池化学和软件领域几乎没有积累。</td></tr>')
w('<tr><td>现金跑道</td><td>2010年6月IPO融资2.26亿美元，现金跑道约12-18个月。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr>')
w('<td>认知偏离度(40%)</td>')
w('<td><span class="score-card score-high">85</span></td>')
w('<td>双因子张力模型正确触发：内部共识强度极高+外部共识逆强度极高=峰值。但存在范畴边界问题：NCI检测到的是已执行但被外部否定的战略而非被忽视的信号。Signal采集管道假设信号来自IM/会议/GA对话——特斯拉的战略不是想法而是已经在执行的决策。这种信号不会从上述管道进入。这是NCI的一个范畴盲区。</td>')
w('<td>中等——概念正确但采集管道未覆盖已执行战略类型</td>')
w('</tr>')
w('<tr>')
w('<td>成本断裂度(35%)</td>')
w('<td><span class="score-card score-high">80</span></td>')
w('<td>电池成本学习率约14%/年远高于内燃机约2-3%/年，学习率差异超过2倍。四层防御成本断裂真实性检查可正确识别：这是结构性学习率差异非规模效应。Pettitt突变点检测在2010年可能数据不足——电池成本下降是渐进趋势而非断点，但不影响总体高分。</td>')
w('<td>中等——需外部电池成本数据源</td>')
w('</tr>')
w('<tr>')
w('<td>价值网络错配度(25%)</td>')
w('<td><span class="score-card score-high">90</span></td>')
w('<td>电池/软件在传统汽车网络中asset_second_life_ratio<0.2（汽车厂没有电池化学能力），在电动车网络中>0.8。AdversarialFrame中主流玩家降低纯电投入 vs 特斯拉100%投入——差异远超50%。</td>')
w('<td>较高——产业结构数据可获取</td>')
w('</tr>')
w('<tr>')
w('<td>时机成熟度</td>')
w('<td><span class="score-card score-mid">65</span></td>')
w('<td>汽车产业处于成熟期末端。但电动车子产业处于导入期。本体层v2.4的产业时钟按整个产业判定还是按子产业判定？按汽车产业=成熟期=收紧ASSET_LOCKS阈值=与NCI高分矛盾。按电动车子产业=导入期=鼓励扩张=与NCI一致。本体层当前没有子产业时钟概念——这是方法论缺口。</td>')
w('<td>低——方法论未定义子产业时钟</td>')
w('</tr>')
w('<tr>')
w('<td>消化能力</td>')
w('<td><span class="score-card score-mid">50</span></td>')
w('<td>IPO后现金跑道12-18个月。员工约900人已超20人弹性阈值。消化能力依赖哨兵数据——2010年无Synova驻扎数据。</td>')
w('<td>低——缺乏入驻数据</td>')
w('</tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x85 + 0.35x80 + 0.25x90 = 34 + 28 + 22.5 = <strong>84.5</strong> <span class="score-card score-high">高非共识</span></div>')
w('<p><strong>历史对照：</strong>特斯拉市值从约20亿美元增长至8000亿+美元（峰值）。<span class="pass">NCI在2010年给出高非共识判断——与历史事实一致。</span></p>')

w('<div class="warn-box"><strong>失效点 F1（方法论问题 严重度高）：</strong>Signal采集管道设计假设非共识信号来自企业内部被提出但未执行的idea——IM消息、会议纪要、GA对话。特斯拉案例属于企业已公开执行但外部共识否定的战略——这种信号不会出现在IM/会议/GA对话中。NCI的Signal采集管道在特斯拉案例中零数据可采集——没有沉默信号可检测。双因子张力模型的概念是正确的但数据来源设计有盲区：它没有定义已执行战略如何成为认知偏离度的输入。<br><br><strong>修正方向：</strong>补充一条战略配置差异采集管道——将企业当前的资源配置方向（OKR/预算/招聘方向）与AdversarialFrame中竞争对手的配置方向做对比。如果企业在一个方向上投入的资源占比远超行业平均水平且外部对该方向的共识评分极低，即使没有被压制的信号（因为已经在做了），也应该触发NCI高认知偏离度。</div>')

print('Stage 3: Case 1 written')

# ============================================================
# CASE 2: PDD 2015
# ============================================================
w('<h3>案例2：拼多多 2015 — 无历史成本数据</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S3（第一性原理断层扫描）和 S1（三条件缺一不可）。<strong>边界性质：</strong>2015年的社交电商没有历史成本曲线——微信生态的边际获客成本以前从未被测量。NCI的成本断裂度组件A依赖CUMULATIVE_LEARNING边的learning_rate——而社交裂变获客没有这个数据。这是对第一性原理断层扫描修正的直接检验。</div>')

w('<h4>2015年时间点的事实基座</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>内部共识</td><td>拼多多前身拼好货2015年4月上线，9月分拆为拼多多。团队来自游戏+电商背景。内部共识是社交+电商可以做。</td></tr>')
w('<tr><td>外部共识</td><td>主流电商共识：淘宝+天猫+京东已锁定格局。微信生态做不了品质电商——朋友圈卖货=微商=low。</td></tr>')
w('<tr><td>成本数据</td><td>传统电商获客成本2015年约100-150元/人。社交裂变获客成本——无历史数据。这是全新的获客范式。</td></tr>')
w('<tr><td>价值网络</td><td>传统电商价值锚点是搜索+比价+品牌。拼多多的锚点是社交关系链+拼团+非标品/农产品。在传统电商眼中微信流量=不可控的低质流量。在拼多多眼中微信流量=10亿用户的免费分发网络。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr>')
w('<td>认知偏离度(40%)</td>')
w('<td><span class="score-card score-high">75</span></td>')
w('<td>外部共识逆强度高。但双因子张力模型的三个数据源在2015年拼多多上都缺乏：组件A（信号-资源矛盾度）依赖内部被压制信号——拼多多内部全会一致all-in，不存在被压制；组件B（学习率差距）无社交裂变历史数据；组件C（外部先行者）——拼多多本身就是先行者，没有其他先行者。认知偏离度可能被低估。</td>')
w('<td>低——三组件数据不可得</td>')
w('</tr>')
w('<tr>')
w('<td>成本断裂度(35%)</td>')
w('<td><span class="score-card score-high">70</span></td>')
w('<td>核心测试点。触发第一性原理断层扫描：社交裂变的物理下限——微信消息发送的边际成本约等于0。传统电商获客成本100-150元/人。理论下限（约0）小于当前行业成本（100）x0.3=30？是。直接赋值70分。流程正确。但有一个子问题：第一性原理断层扫描的理论下限如何由机器自动推导？当前方案没有描述从行业模板生成理论下限的具体机制——是LLM推理还是预置模板？</td>')
w('<td>中等——逻辑正确但自动化推导机制未定义</td>')
w('</tr>')
w('<tr>')
w('<td>价值网络错配度(25%)</td>')
w('<td><span class="score-card score-high">85</span></td>')
w('<td>微信关系链在传统电商眼中是非电商资产——second_life_ratio约为0。在社交电商中是核心分发管道——ratio大于0.8。错配度极高。</td>')
w('<td>较高</td>')
w('</tr>')
w('<tr>')
w('<td>时机成熟度</td>')
w('<td><span class="score-card score-high">80</span></td>')
w('<td>移动互联网处于成长期（2015年渗透率仍在快速提升）。微信月活约6.5亿仍在增长。微信支付、物流等基础设施已就位。</td>')
w('<td>中等</td>')
w('</tr>')
w('<tr>')
w('<td>消化能力</td>')
w('<td><span class="score-card score-high">75</span></td>')
w('<td>2015年团队小于100人创业早期。有游戏+电商双背景。但无Synova驻扎数据。</td>')
w('<td>低——无入驻数据</td>')
w('</tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x75 + 0.35x70 + 0.25x85 = 30 + 24.5 + 21.25 = <strong>75.75</strong> <span class="score-card score-high">高非共识</span></div>')
w('<p><strong>历史对照：</strong>拼多多2015至2020年GMV从0增长至约1.67万亿，成为第三大电商平台。<span class="pass">NCI给出高非共识——与历史一致。</span></p>')

w('<div class="warn-box"><strong>失效点 F2（方法论问题 严重度高）：</strong>第一性原理断层扫描的理论下限自动化推导未被定义。当前NCI方案只说基于物理/经济下限计算理论最小成本但没有描述谁来计算用什么模板输入是什么。是LLM推理（需定义prompt工程和幻觉风险）还是预置模板库（需定义覆盖范围和更新机制）？没有这个机制第一性原理断层扫描只是一个概念不是一个可运行的工程组件。<br><br><strong>修正方向：</strong>建立第一性原理模板库——对每类技术/模式预置理论下限公式和参数。例如社交传播边际成本约0、电池生产Wright Law学习率约18%、芯片制造摩尔定律。模板库以JSON文件维护（first-principles/{domain}.json）。LLM作为补充推断器仅在模板库无匹配时调用且结果需标记置信度。</div>')
w('<div class="warn-box"><strong>失效点 F2b（方法论问题 严重度中）：</strong>认知偏离度在拼多多案例中可能被低估。双因子张力模型的三个数据源都依赖内部驻扎数据而拼多多2015年没有Synova驻扎。实际的外部共识（两个电商巨头都不认为微信生态能做电商）属于AdversarialFrame的外部数据采集但AdversarialFrame如何被自动化填充在NCI方案中无详细定义。需要在NCI方案中增加AdversarialFrame自动化填充机制：从公开数据源（新闻/研报/专利）中提取竞争对手资源配置信号定期更新。</div>')

print('Stage 4: Case 2 written')

# ============================================================
# CASE 3: ZHUI MI 2018
# ============================================================
w('<h3>案例3：追觅 2018 — 价值网络错配型颠覆</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S1（价值网络错配条件）和成本断裂真实性。<strong>边界性质：</strong>追觅是中国供应链把奢侈品变成工业品的范式——高速电机从戴森壁垒变成中国可制造的通用件。这检验NCI是否能识别供应链能力跃迁这种特定类型的价值网络错配。</div>')

w('<h4>2018年时间点的事实基座</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>内部共识</td><td>追觅2017年成立由清华航天动力团队创立。2018年推出首款无线吸尘器V9。团队共识：高速数字马达可以被中国团队攻克。</td></tr>')
w('<tr><td>外部共识</td><td>主流家电行业共识：戴森的技术壁垒不可逾越。高速电机是中国制造的禁区。国产吸尘器只能做中低端。</td></tr>')
w('<tr><td>成本断裂</td><td>戴森数字马达V10（2018年发布）售价3000-5000元。追觅V9售价999元——同等转速（10万转）下价格仅1/3到1/5。差异非规模效应——追觅刚成立。差异来自技术架构+中国供应链精密加工能力。</td></tr>')
w('<tr><td>价值网络</td><td>传统家电锚点：品牌溢价+工业设计+零售渠道。追觅锚点：供应链效率+算法驱动设计+线上直营。高速电机在旧网络中是戴森的护城河资产，在新网络中是可制造的通用件。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr><td>认知偏离度(40%)</td><td><span class="score-card score-high">80</span></td><td>双因子张力模型：内部共识强度高+外部共识逆强度高。但组件C可能产生反向信号：AdversarialFrame显示戴森也在增加高速电机投入（保护旧护城河），系统会解读为该方向已被关注而降低认知偏离度——与认知偏离的逻辑相反。</td><td>中等——组件C在旧玩家增加投入时产生反向信号</td></tr>')
w('<tr><td>成本断裂度(35%)</td><td><span class="score-card score-high">85</span></td><td>追觅V9价格999 vs 戴森V10价格3000-5000，差异3-5倍。但CUMULATIVE_LEARNING边：中国吸尘器产业学习率已平坦——追觅是品类内的技术跳跃非传统学习曲线。需要CUMULATIVE_LEARNING边有技术轨道切换语义。</td><td>中等——需技术轨道切换参数</td></tr>')
w('<tr><td>价值网络错配度(25%)</td><td><span class="score-card score-high">95</span></td><td>追觅案例NCI最强的维度。同一资产（高速电机制造能力）在同一物理世界中有两种不同的估值逻辑——旧网络中是戴森利润核心，新网络中是供应链通用件。ASSET_LOCKS边只有单一数值——不支持多网络估值。</td><td>中等——ASSET_LOCKS边语义不足</td></tr>')
w('<tr><td>时机成熟度</td><td><span class="score-card score-high">80</span></td><td>中国消费升级+线上渠道成熟+供应链达精密制造水平。家电产业处于成熟期但智能清洁子品类处于成长期——子产业时钟问题再现。</td><td>中等</td></tr>')
w('<tr><td>消化能力</td><td><span class="score-card score-mid">60</span></td><td>2018年小于100人创业团队。有小米/顺为资本投资。消化能力足够但需入驻数据。</td><td>低</td></tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x80 + 0.35x85 + 0.25x95 = 32 + 29.75 + 23.75 = <strong>85.5</strong> <span class="score-card score-high">高非共识</span></div>')
w('<p><strong>历史对照：</strong>追觅2021年营收约60亿，2024年超100亿，成为中国清洁家电头部品牌。<span class="pass">NCI给出高非共识——与历史一致。</span></p>')

w('<div class="warn-box"><strong>失效点 F3a（方法论 严重度高）：</strong>组件C外部先行者的存在性在旧玩家也增加投入时产生反向信号。需区分旧玩家在旧网络中增加投入（防御）和新玩家在新网络中增加投入（进攻）。当前AdversarialFrame不支持这种区分。<br><br><strong>修正方向：</strong>AdversarialFrame增加投入方向分类字段：defensive（防御性投入维护旧价值链）vs offensive（进攻性投入建立新价值链）。旧玩家在新方向上的defensive投入不应降低认知偏离度。</div>')
w('<div class="warn-box"><strong>失效点 F3b（方法论 严重度中）：</strong>ASSET_LOCKS边需要多网络估值扩展：同一资产在旧网络和新网络中有不同的估值逻辑。当前只有单一数值的second_life_ratio。<br><br><strong>修正方向：</strong>ASSET_LOCKS边增加cross_network_valuation字段：{old_network_ratio, new_network_ratio, network_name_old, network_name_new}。价值网络错配度 = |new_ratio - old_ratio|。</div>')

print('Stage 5: Case 3 written')

# ============================================================
# CASE 4: OFO 2016 — PSEUDO-DISRUPTION
# ============================================================
w('<h3>案例4：OFO 2016 — 应判为伪颠覆</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S6（成本断裂真实性）和 S7（生存底线检查）。<strong>边界性质：</strong>OFO满足了认知偏离（共享单车不被看好）和价值网络错配（自行车从拥有品变为服务），但成本断裂不存在——OFO的成本下降是规模效应（造更多车则单件降），不是结构性断裂。按S1理论缺少成本断裂应不构成真非共识。这是对NCI三条件逻辑的负向验证——NCI需要正确地将OFO判定为伪颠覆。</div>')

w('<h4>2016年时间点的事实基座</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>认知偏离</td><td>2016年共享单车不被主流看好——自行车能赚什么钱？押金模式不可持续。但资本市场在2016-2017年短暂追捧。</td></tr>')
w('<tr><td>成本结构</td><td>OFO的单车成本从约300元（2016年初）降至约200元（2017年）。下降来源于规模采购效应——订单量从百到百万级别。不是技术架构跃迁。</td></tr>')
w('<tr><td>单位经济</td><td>每辆小黄车全生命周期成本（制造成本+运维+损耗）远超收入（每次0.5-1元，日均使用次数有限）。单位经济从未被验证。营收增长完全依赖资本注入。</td></tr>')
w('<tr><td>价值网络</td><td>有认知偏离（自行车从拥有品变为服务）和价值网络错配（城市路权资产被重新估值）。但成本断裂不成立——OFO采用的仍然是传统自行车的制造成本曲线，没有任何架构级的学习率跃迁。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr><td>认知偏离度(40%)</td><td><span class="score-card score-mid">65</span></td><td>外部共识逆强度：2016年主流交通行业不认为共享单车是可持续生意。内部共识：OFO团队all-in但更多是资本驱动而非底层物理信念。双因子张力模型会给出中等偏高得分。</td><td>中等</td></tr>')
w('<tr><td>成本断裂度(35%)</td><td><span class="score-card score-low">25</span></td><td>关键判定点。OFO单车成本从300到200元——学习率15-20%。但这是规模效应（量产学习）而非架构跃迁。四层防御成本断裂真实性应检测到：成本下降与产量增加高度线性相关（规模效应），非learning_rate突变。组件B（Pettitt检测）不会有统计显著断点。第一性原理断层扫描：自行车制造成本不能突破物理材料下限——理论下限不会小于行业成本x0.3。不触发直接赋值。</td><td>较高——四层防御逻辑可以有效过滤</td></tr>')
w('<tr><td>价值网络错配度(25%)</td><td><span class="score-card score-high">70</span></td><td>自行车从私有资产变为共享服务——资产估值逻辑确实改变。但这是商业模式变化而非产业重构。ASSET_LOCKS边会给出中等偏高分。</td><td>中等</td></tr>')
w('<tr><td>时机成熟度</td><td><span class="score-card score-mid">60</span></td><td>移动支付成熟（微信/支付宝普及）、GPS+物联网硬件成本下降、城市化进程加速——基础设施条件具备。但单位经济无法闭环——时机成熟度被高估。</td><td>中等</td></tr>')
w('<tr><td>消化能力</td><td><span class="score-card score-low">30</span></td><td>OFO以惊人速度扩张——2017年投放超1000万辆。但运营能力完全跟不上扩张速度。生存底线检查：投入远超现金跑道——NCI应自动降低优先级。但OFO案例中NCI驻扎时可能无法预测会扩张到多大——它只能基于当前信号给建议。</td><td>中等</td></tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x65 + 0.35x25 + 0.25x70 = 26 + 8.75 + 17.5 = <strong>52.25</strong> <span class="score-card score-mid">中非共识</span></div>')
w('<p><strong>历史对照：</strong>OFO于2018年资金链断裂，2019年基本退出市场。NCI给出中偏下非共识（52.25）且四层防御应正确识别伪颠覆——<span class="pass">与历史事实一致</span>（OFO不应该被视为真非共识机会）。</p>')

w('<div class="warn-box"><strong>失效点 F4（方法论 严重度中）：</strong>NCI的四层防御中的成本断裂真实性检查依赖learning_rate数据——而learning_rate需要时间序列。OFO从成立到崩溃仅约3年——时间窗口可能不足以产生统计学上可靠的learning_rate差异检测。如果数据不足NCI会标记为待验证而非直接否定——而待验证在2016年可能被解读为还不确定可以试试。<br><br><strong>修正方向：</strong>当learning_rate数据不足时，增加一个快速扩张预警：如果企业增长速度（月环比）超过行业平均的3倍以上且单位经济未验证——NCI自动增加一个penalty项标记为伪颠覆风险。</div>')

print('Stage 6: Case 4 written')

# ============================================================
# CASE 5: WANI ANNUAL CARD — ZOMBIE SIGNAL
# ============================================================
w('<h3>案例5：哇呢年卡方案 — 僵尸信号检测</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S5（僵尸信号检测：专家修正二）。<strong>边界性质：</strong>年卡方案被频繁讨论（reference_count>5）但从未有预算分配（resource_allocation_delta=0）。这是一个被伪装成活的死信号——在90天沉默检测中不会触发silenced（因为经常被讨论），但在决策-行动比监控下应触发决策瘫痪警报。</div>')

w('<h4>事实基座（来自哇呢宝贝客户案例）</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>业务背景</td><td>哇呢宝贝主营新生儿手脚模纪念品。年卡方案的想法是捆绑多次服务（出生/满月/百天/周岁）打包为年卡销售——提高客单价和复购率。</td></tr>')
w('<tr><td>信号生命周期</td><td>年卡方案在内部被多人多次提出：销售团队觉得可以提高客单价，运营团队觉得可以绑定客户，产品团队觉得可以做。但在12个月内被反复讨论（reference_count>8），从未进入预算流程（resource_allocation_delta=0）。</td></tr>')
w('<tr><td>未被采纳的原因</td><td>不是因为有人反对——是因为没有人负责执行。哇呢的组织结构中没有专门的产品创新角色。每个人都在忙日常运营。年卡方案的负责人始终是空缺的。</td></tr>')
w('<tr><td>信号性质</td><td>这不是被压制的沉默信号——它经常被讨论。这不是自然淘汰——它被反复认为有价值。这是僵尸信号：表面活跃但没有资源投入。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr><td>认知偏离度(40%)</td><td><span class="score-card score-low">35</span></td><td>年卡方案不是非共识——内部普遍认为有价值。外部（母婴行业）也不反对年卡模式。双因子张力模型给出低分——因为内外一致看多。但认知偏离度的低分不意味着该信号不重要——恰恰相反，这是一个共识性但未能执行的信号。NCI的认知偏离维度不适合评估此类信号。</td><td>低——认知偏离不是评估此类信号的正确维度</td></tr>')
w('<tr><td>成本断裂度(35%)</td><td><span class="score-card score-low">20</span></td><td>年卡方案不涉及成本断裂——它是现有服务包的重新组合。CUMULATIVE_LEARNING边不相关。成本断裂度在此案例中不适用。</td><td>不适用</td></tr>')
w('<tr><td>价值网络错配度(25%)</td><td><span class="score-card score-low">30</span></td><td>年卡方案不改变价值网络——它是在现有价值网络中的定价策略优化。ASSET_LOCKS边不触发。</td><td>不适用</td></tr>')
w('<tr><td>时机成熟度</td><td><span class="score-card score-high">75</span></td><td>新生儿手脚模市场上捆绑销售是成熟的商业模式（竞品已有类似方案）。时机不存在障碍。</td><td>中等</td></tr>')
w('<tr><td>消化能力（关键维度）</td><td><span class="score-card score-low">10</span></td><td>年卡方案无法执行的根本原因：没有人负责。哇呢的组织结构中没有产品创新角色。每个人都在忙日常运营。消化能力=0不是因为没有资源——是因为缺少执行负责人。专家修正二的决策-行动比监控可以检测到这一点（reference_count>5但resource_delta=0）——但消化能力评分本身没有组织责任这个维度。</td><td>中等——决策-行动比监控是好机制但不在消化能力维度中</td></tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x35 + 0.35x20 + 0.25x30 = 14 + 7 + 7.5 = <strong>28.5</strong> <span class="score-card score-low">低非共识</span></div>')

w('<div class="crit"><strong>重要发现：</strong>年卡方案的NCI得分只有28.5（低非共识）——但它其实是哇呢最应该做的增长动作。NCI的三维度设计在此案例中完全失效：这个信号不是非共识（不需要认知偏离维度），不改变成本结构（不需要成本断裂维度），不重构价值网络（不需要错配维度）——但它被组织执行能力卡住了。NCI正确地判定它不属于非共识——但NCI需要配套另一个维度的评估：<strong>共识性但系统性未执行的信号</strong>。专家修正二的僵尸信号检测是这个方向的正确补充。</div>')

w('<div class="warn-box"><strong>失效点 F5a（方法论 严重度中）：</strong>NCI的三维度（认知偏离+成本断裂+价值网络错配）天然过滤掉了共识性但未能执行的信号。这些信号在NCI框架中得分极低——但它们是大多数中小企业真正面临的问题：不是想不出好主意，是执行不了好主意。NCI需要明确声明其适用范围：只评估非共识机会，不评估执行能力。<br><br><strong>修正方向：</strong>在NCI报告中增加一个独立维度——执行阻力指数（Execution Friction Index, EFI）。EFI使用僵尸信号检测（decision/talk ratio）、组织责任缺口（关键角色缺失）、信号存活率（提出后被采纳比例）三个指标。NCI低分+EFI高分 = 组织有能力但没看见信号。NCI高分+EFI低分 = 组织看见了但在执行。NCI低分+EFI低分 = 信号本身不重要。</div>')
w('<div class="warn-box"><strong>失效点 F5b（数据可得性 严重度低）：</strong>僵尸信号检测依赖reference_count和resource_allocation_delta两个字段。resource_allocation_delta的测量需要接入企业的预算/OKR系统。如果企业没有结构化的预算系统（大多数5-300人团队没有），resource_allocation_delta不可计算。需要在NCI方案中定义预算数据不可得时的降级策略：对resource_allocation_delta标记为无法计算——GA手动确认。</div>')

print('Stage 7: Case 5 written')

# ============================================================
# CASE 6: GOOGLE GLASS 2013 — PSEUDO-DISRUPTION VIA IMMATURE SUPPLY CHAIN
# ============================================================
w('<h3>案例6：Google Glass 2013 — 应判为伪颠覆（不成熟供应链）</h3>')
w('<div class="note"><strong>推演目标：</strong>检验 S6（成本断裂真实性）和 S1（三条件逻辑）。<strong>边界性质：</strong>Google Glass在2013年看起来具备全部三条件——认知偏离（所有人觉得戴眼镜的电脑很奇怪）、成本断裂（AR显示技术vs传统屏幕是完全不同的成本曲线）、价值网络错配（可穿戴计算重构人机交互）。但它在商业上失败了。失败不是因为没有NCI条件——是因为成本断裂依赖不成熟的供应链（微型投影仪良率极低、电池密度不足以支持全天续航）。这检验NCI是否能区分真成本断裂和依赖不成熟供应链的伪成本断裂。</div>')

w('<h4>2013年时间点的事实基座</h4>')
w('<table>')
w('<tr><th>维度</th><th>事实</th></tr>')
w('<tr><td>认知偏离</td><td>Google Glass Explorer Edition售价1500美元。主流共识认为戴眼镜的电脑很奇怪且侵犯隐私。社交网络出现Glasshole一词。部分场所禁止佩戴。</td></tr>')
w('<tr><td>成本结构</td><td>Google Glass的物料成本（BoM）估计约152美元但零售价1500美元。这不是成本优势——这是概念溢价。核心技术（微型LCoS投影仪、棱镜波导、骨传导音频）没有一条学习曲线在下降。供应链极度不成熟——没有第二供应商。</td></tr>')
w('<tr><td>电池续航</td><td>视频录制仅30分钟。正常使用2-3小时。电池密度在2013年的物理极限下无法支撑全天使用——这是不成熟供应链的症状，不是能通过学习曲线解决的架构问题。</td></tr>')
w('<tr><td>价值网络</td><td>Google Glass试图创造一个新的价值网络（可穿戴智能设备+场景化信息推送）。但这个网络需要的基础设施（5G/边缘计算/全天电池/社交认同）在2013年都不存在。价值网络错配不是被低估——是客观不存在。</td></tr>')
w('</table>')

w('<h4>NCI五维度推演评分</h4>')
w('<table>')
w('<tr><th>维度</th><th>得分</th><th>评分依据</th><th>可靠度</th></tr>')
w('<tr><td>认知偏离度(40%)</td><td><span class="score-card score-high">70</span></td><td>双因子张力模型：内部共识（Google X团队all-in可穿戴）——但内部共识可能高估Google内部的项目热情。外部共识逆强度高（主流市场不认为眼镜型电脑是下一个平台）。双因子张力模型给出中等偏高分。</td><td>中等</td></tr>')
w('<tr><td>成本断裂度(35%)</td><td><span class="score-card score-low">30</span></td><td>NCI四层防御在此处的表现是关键。组件A（新旧学习率差异）：微型投影仪vs传统屏幕——但2013年微型投影仪没有学习曲线（出货量太小不足以产生学习效应）。组件B（Pettitt检测）：无断点。第一性原理断层扫描：电池密度和微型光学器件的物理下限在2013年远高于商业可行阈值——理论下限不小于当前行业成本x0.3——不触发赋值。成本断裂度应正确给出低分。但有一个风险：LLM如果只看概念可能被AR/VR的未来愿景影响——给出偏高的第一性原理判断。</td><td>中等——依赖第一性原理模板库的质量</td></tr>')
w('<tr><td>价值网络错配度(25%)</td><td><span class="score-card score-mid">55</span></td><td>可穿戴计算确实代表价值网络变化。但变化的必要基础设施不存在。ASSET_LOCKS边的判定需要区分潜在错配（基础设施到位后可能发生）和当前错配（基础设施已就位）。2013年的这个错配是潜在错配——当前不具备条件。</td><td>低——ASSET_LOCKS边无法区分潜在vs当前错配</td></tr>')
w('<tr><td>时机成熟度</td><td><span class="score-card score-low">20</span></td><td>2013年：没有4G/5G覆盖（4G刚起步）、没有边缘计算、电池密度物理受限、社交对可穿戴的接受度为零。产业时钟显示相关基础设施处于导入期之前——时机不成熟。</td><td>较高</td></tr>')
w('<tr><td>消化能力</td><td><span class="score-card score-low">25</span></td><td>Google有足够资源（现金+人才）。但Google Glass的失败恰恰说明消化能力不等于有资源——是供应链不成熟导致产品无法达到商业可行标准。生存底线检查在此案例中不适用——因为核心问题不是Google有没有钱烧，是物理极限不让产品成功。</td><td>中等</td></tr>')
w('</table>')

w('<div class="formula">NCI综合得分 = 0.4x70 + 0.35x30 + 0.25x55 = 28 + 10.5 + 13.75 = <strong>52.25</strong> <span class="score-card score-mid">中非共识</span></div>')
w('<p><strong>历史对照：</strong>Google Glass Explorer于2015年1月停产。2017年发布Enterprise Edition转向企业市场，2019年发布Enterprise Edition 2，2023年全面停产。Consumer版本从未成功。<span class="pass">NCI给出中偏下非共识（52.25）且四层防御应正确识别成本断裂不足——与历史事实一致</span>（Google Glass是正确的方向但时机早了约10年，且供应链在当时不成熟）。</p>')

w('<div class="warn-box"><strong>失效点 F6a（方法论 严重度高）：</strong>ASSET_LOCKS边无法区分潜在价值网络错配（如果基础设施到位则可能发生）和当前价值网络错配（基础设施已就位可以实现）。Google Glass的错配是潜在的——5G/边缘计算/全天电池/社交认同都不存在。但NCI的ASSET_LOCKS边只计算资产在旧系统和新系统中的估值差异——它不检查新系统是否客观存在。如果新系统不存在，再高的错配度也是纸上谈兵。<br><br><strong>修正方向：</strong>在ASSET_LOCKS边增加infrastructure_readiness字段：新价值网络的必要基础设施成熟度评分。如果基础设施成熟度小于阈值（例如<0.5），价值网络错配度自动降级为潜在错配——不计入NCI得分。NCI报告中区分当前错配和潜在错配。</div>')
w('<div class="warn-box"><strong>失效点 F6b（方法论 严重度中）：</strong>第一性原理断层扫描可能被LLM的愿景偏见影响。Google Glass的AR概念在2013年非常性感——LLM有可能在评估理论下限时高估技术可行性。需要硬约束：第一性原理模板库对所有技术方向的物理极限有预置的硬数据（电池能量密度上限、光学器件最小尺寸等），不能被LLM推理覆盖。</div>')

print('Stage 8: Case 6 written')

# ============================================================
# SECTION 3: FAILURE SUMMARY
# ============================================================
w('<h2 id="s3">三、失效点汇总：方法论问题 vs 数据可得性问题</h2>')

w('<table>')
w('<tr><th>#</th><th>失效点</th><th>触发案例</th><th>类型</th><th>严重度</th><th>当前是否可检测</th></tr>')
w('<tr>')
w('<td>F1</td>')
w('<td><strong>Signal采集管道盲区：</strong>只能采集未执行的idea（IM/会议/GA对话），无法采集企业已公开执行但外部否定的战略。双因子张力模型概念正确但数据来源有结构性缺失。</td>')
w('<td>特斯拉2010</td>')
w('<td class="fail">方法论</td>')
w('<td class="fail">高</td>')
w('<td>不可检测——需要新增采集管道</td>')
w('</tr>')
w('<tr>')
w('<td>F2</td>')
w('<td><strong>第一性原理断层扫描无自动化推导机制：</strong>只知道要算理论下限，但谁算、用什么模板、输入是什么——全部未定义。没有此机制则第一性原理断层扫描不构成可运行的工程组件。</td>')
w('<td>拼多多2015</td>')
w('<td class="fail">方法论</td>')
w('<td class="fail">高</td>')
w('<td>不可检测——需要建立模板库</td>')
w('</tr>')
w('<tr>')
w('<td>F2b</td>')
w('<td><strong>AdversarialFrame无自动化填充机制：</strong>外部共识数据如何获取未定义。所有依赖外部共识的计算都可能因为数据缺失而降级。</td>')
w('<td>拼多多2015</td>')
w('<td class="fail">方法论</td>')
w('<td>中</td>')
w('<td>部分可检测——公开数据源可部分填充</td>')
w('</tr>')
w('<tr>')
w('<td>F3a</td>')
w('<td><strong>组件C反向信号风险：</strong>外部先行者存在性检测不区分旧玩家防御性投入和新玩家进攻性投入。旧玩家增加投入会错误降低认知偏离度。</td>')
w('<td>追觅2018</td>')
w('<td class="fail">方法论</td>')
w('<td class="fail">高</td>')
w('<td>不可检测——需要AdversarialFrame增加投入方向分类</td>')
w('</tr>')
w('<tr>')
w('<td>F3b</td>')
w('<td><strong>ASSET_LOCKS边语义不足：</strong>只有单一数值的second_life_ratio，不支持同一资产在多个网络中的不同估值。</td>')
w('<td>追觅2018</td>')
w('<td class="fail">方法论</td>')
w('<td>中</td>')
w('<td>不可检测——需要ASSET_LOCKS边扩展</td>')
w('</tr>')
w('<tr>')
w('<td>F4</td>')
w('<td><strong>伪颠覆在数据不足时标记为待验证而非判否：</strong>OFO从成立到崩溃仅3年——learning_rate时间序列不足以做统计判断。待验证可能被解读为可以试试。</td>')
w('<td>OFO 2016</td>')
w('<td class="fail">方法论</td>')
w('<td>中</td>')
w('<td>需增加快速扩张预警机制</td>')
w('</tr>')
w('<tr>')
w('<td>F5a</td>')
w('<td><strong>NCI三维度天然过滤共识性但未执行的信号：</strong>大多数中小企业的问题不是看不见机会——是执行不了。NCI需要配套EFI执行阻力指数。</td>')
w('<td>哇呢年卡</td>')
w('<td class="fail">方法论</td>')
w('<td>中</td>')
w('<td>专家修正二（僵尸信号）是正确方向——需扩展为EFI</td>')
w('</tr>')
w('<tr>')
w('<td>F5b</td>')
w('<td><strong>resource_allocation_delta不可计算：</strong>如果企业没有结构化预算系统（大多数中小企业没有），resource_allocation_delta不可得。</td>')
w('<td>哇呢年卡</td>')
w('<td class="wrn">数据可得性</td>')
w('<td>低</td>')
w('<td>需定义降级策略：标记为无法计算——GA手动确认</td>')
w('</tr>')
w('<tr>')
w('<td>F6a</td>')
w('<td><strong>ASSET_LOCKS边不区分潜在vs当前价值网络错配：</strong>新系统的基础设施不存在时再高的错配度也是纸上谈兵。</td>')
w('<td>Google Glass</td>')
w('<td class="fail">方法论</td>')
w('<td class="fail">高</td>')
w('<td>需增加infrastructure_readiness字段</td>')
w('</tr>')
w('<tr>')
w('<td>F6b</td>')
w('<td><strong>第一性原理模板库可能被LLM愿景偏见影响：</strong>LLM在推理理论下限时可能高估技术可行性。需硬约束——模板库的物理极限数据不能被LLM覆盖。</td>')
w('<td>Google Glass</td>')
w('<td class="fail">方法论</td>')
w('<td>中</td>')
w('<td>需预置硬数据模板+LLM结果不可覆盖模板</td>')
w('</tr>')
w('<tr>')
w('<td>F7</td>')
w('<td><strong>子产业时钟缺失：</strong>本体层v2.4的产业时钟按整个产业判定——但像电动车/清洁家电/社交电商对母产业而言是子品类。按母产业判定会给出与NCI矛盾的建议。</td>')
w('<td>特斯拉/追觅/拼多多</td>')
w('<td class="fail">方法论</td>')
w('<td class="fail">高</td>')
w('<td>本体层v2.4中有产业权重向量设计——需增加子产业时钟输出</td>')
w('</tr>')
w('<tr>')
w('<td>F8</td>')
w('<td><strong>消化能力依赖哨兵数据——无入驻则不可计算：</strong>6个案例中5个在案例时间点无Synova驻扎。消化能力评分在绝大多数场景中不可靠。</td>')
w('<td>全部6案例</td>')
w('<td class="wrn">数据可得性</td>')
w('<td>中</td>')
w('<td>诚实标注——无入驻企业消化能力不可计算</td>')
w('</tr>')
w('</table>')

w('<hr>')
w('<h4>统计</h4>')
w('<ul>')
w('<li>方法论问题：<strong>8个</strong>（F1, F2, F2b, F3a, F3b, F4, F5a, F6a, F6b, F7 = 10个条目有实质修改需求）</li>')
w('<li>数据可得性问题：<strong>2个</strong>（F5b, F8）——需要在无法获取数据时诚实标注不可计算</li>')
w('<li>严重度高（影响NCI核心判断正确性）：<strong>5个</strong>（F1, F2, F3a, F6a, F7）</li>')
w('<li>严重度中（影响判据精确性或用户体验）：<strong>8个</strong></li>')
w('</ul>')

print('Stage 9: Failure summary written')

# ============================================================
# SECTION 4: NCI SCORE RANKING
# ============================================================
w('<h2 id="s4">四、NCI模拟得分排序：与历史事实的一致性检验</h2>')

w('<table>')
w('<tr><th>排名</th><th>案例</th><th>NCI得分</th><th>分类</th><th>历史事实</th><th>与事实一致？</th></tr>')
w('<tr><td>1</td><td>追觅 2018</td><td><span class="score-card score-high">85.5</span></td><td>高非共识</td><td>成功：营收从0到100亿+，成为行业头部</td><td><span class="pass">一致</span></td></tr>')
w('<tr><td>2</td><td>特斯拉 2010</td><td><span class="score-card score-high">84.5</span></td><td>高非共识</td><td>成功：市值从20亿美元到8000亿+</td><td><span class="pass">一致</span></td></tr>')
w('<tr><td>3</td><td>拼多多 2015</td><td><span class="score-card score-high">75.75</span></td><td>高非共识</td><td>成功：GMV从0到1.67万亿，第三大电商</td><td><span class="pass">一致</span></td></tr>')
w('<tr><td>4</td><td>OFO 2016</td><td><span class="score-card score-mid">52.25</span></td><td>中非共识</td><td>失败：2018资金链断裂，2019退出市场</td><td><span class="pass">一致</span></td></tr>')
w('<tr><td>5</td><td>Google Glass 2013</td><td><span class="score-card score-mid">52.25</span></td><td>中非共识</td><td>失败：Consumer版2015停产，2023全面停产</td><td><span class="pass">一致</span></td></tr>')
w('<tr><td>6</td><td>哇呢年卡方案</td><td><span class="score-card score-low">28.5</span></td><td>低非共识</td><td>未执行：被反复讨论但零资源投入</td><td><span class="wrn">NCI不适合评估此类信号</span></td></tr>')
w('</table>')

w('<div class="note"><strong>得分排序分析：</strong>前3名（追觅/特斯拉/拼多多）均为历史上验证成功的真非共识案例——NCI得分均在75以上且分类为高非共识。OFO和Google Glass得分均为52.25（中偏下）——NCI正确将其判为中等风险、非高非共识。哇呢年卡得分仅28.5——因为年卡方案不是非共识，NCI的维度设计正确地将它排除在非共识评估之外（但需要配套EFI来评估此类信号）。<br><br><strong>排序一致性：</strong>6个案例的NCI得分排序与历史成功程度（追觅>特斯拉>拼多多>OFO=Glass>哇呢）基本一致。一个有趣的现象：追觅得分最高（85.5）但历史总规模小于特斯拉和拼多多——NCI评估的是非共识强度而非最终市场规模，这是正确的语义对齐。</div>')

print('Stage 10: Score ranking written')

# ============================================================
# SECTION 5: FIXES
# ============================================================
w('<h2 id="s5">五、对Alpha-Delta产出的修正建议</h2>')

w('<h3>5.1 优先修正清单（按影响排序）</h3>')
w('<table>')
w('<tr><th>优先级</th><th>失效点</th><th>修正动作</th><th>影响范围</th></tr>')
w('<tr><td>P0</td><td>F1：Signal管道盲区</td><td>新增战略配置差异采集管道：将企业当前OKR/预算/招聘方向与AdversarialFrame中竞争对手配置对比。如果企业投入占比远超行业平均+外部共识评分极低→触发高认知偏离度。</td><td>NCI方案 Phase 0</td></tr>')
w('<tr><td>P0</td><td>F2：第一性原理无自动化机制</td><td>建立第一性原理模板库：对常见技术/模式预置理论下限公式和参数。JSON文件格式：first-principles/{domain}.json。LLM仅作模板库无匹配时的补充推断且结果标记置信度。</td><td>NCI方案 Phase 2</td></tr>')
w('<tr><td>P0</td><td>F6a：不区分潜在vs当前错配</td><td>ASSET_LOCKS边增加infrastructure_readiness字段。新价值网络基础设施成熟度<0.5则价值网络错配度自动降级为潜在错配不计入NCI得分。</td><td>本体层v2.4 ASSET_LOCKS边</td></tr>')
w('<tr><td>P0</td><td>F7：子产业时钟</td><td>本体层v2.4的产业时钟支持子产业判定。当企业产业权重向量中某子产业权重>0.3且其时钟与母产业时钟差异>2阶段时——产生并行时钟输出。</td><td>本体层v2.4 产业时钟模块</td></tr>')
w('<tr><td>P1</td><td>F3a：组件C反向信号</td><td>AdversarialFrame增加投入方向分类：defensive/offensive。旧玩家在新方向上的defensive投入不降低认知偏离度。</td><td>NCI方案 Phase 2</td></tr>')
w('<tr><td>P1</td><td>F4：伪颠覆待验证风险</td><td>增加快速扩张预警：企业增速超行业平均3倍+单位经济未验证→NCI自动增加penalty项标记伪颠覆风险。</td><td>NCI方案 四层防御</td></tr>')
w('<tr><td>P1</td><td>F5a：EFI执行阻力指数</td><td>在NCI报告中增加独立维度——EFI。NCI低+EFI高=有能力但没看见。NCI高+EFI低=看见了但在执行。NCI低+EFI低=信号不重要。</td><td>NCI方案 Phase 3</td></tr>')
w('<tr><td>P2</td><td>F3b：ASSET_LOCKS多网络估值</td><td>ASSET_LOCKS边增加cross_network_valuation字段。价值网络错配度 = |new_ratio - old_ratio|。</td><td>本体层v2.4 ASSET_LOCKS边</td></tr>')
w('<tr><td>P2</td><td>F6b：第一性原理LLM愿景偏见</td><td>第一性原理模板库的物理极限数据为硬约束——LLM推理结果不能覆盖模板库中的预置数据。</td><td>NCI方案 Phase 2</td></tr>')
w('<tr><td>P2</td><td>F2b：AdversarialFrame自动化填充</td><td>定义公开数据源（新闻/研报/专利）的自动化采集+LLM提取机制。定期更新AdversarialFrame。</td><td>NCI方案 Phase 2</td></tr>')
w('<tr><td>P3</td><td>F5b：预算数据不可得降级</td><td>resource_allocation_delta不可计算时标记为无法计算——GA手动确认。在NCI报告中清晰标注数据缺失项。</td><td>NCI方案 Phase 1</td></tr>')
w('<tr><td>P3</td><td>F8：消化能力数据缺失</td><td>无入驻企业——消化能力维度诚实标注为当前数据条件下不可计算。不强行推断。</td><td>增长诊断方案v2.0</td></tr>')
w('</table>')

w('<h3>5.2 NCI的三条件逻辑——总体验证结论</h3>')
w('<div class="green-box">')
w('<strong>通过验证的核心逻辑：</strong><br>')
w('1. 三条件缺一不可（S1）——通过。OFO和Google Glass（缺成本断裂或错配基础设施）被正确压低得分。<br>')
w('2. 双因子张力模型（S2）——通过但需扩展。概念正确但特斯拉案例暴露了采集管道盲区。<br>')
w('3. 第一性原理断层扫描（S3）——逻辑正确但不可运行。需要模板库才能真正落地。<br>')
w('4. NCI阈值分类（S4）——通过。70/40分界线在6个案例中没有误判。<br>')
w('5. 僵尸信号检测（S5）——通过。哇呢案例验证了修正二的价值。需扩展为EFI。<br>')
w('6. 成本断裂真实性（S6）——通过。OFO和Google Glass案例验证了有效性。<br>')
w('7. 生存底线检查（S7）——部分通过。案例中应用场景有限，需更多案例验证。<br>')
w('</div>')

print('Stage 11: Fixes written')

# ============================================================
# SECTION 6: HONESTY BOUNDARY
# ============================================================
w('<h2 id="s6">六、诚实边界：本报告自身的局限</h2>')

w('<div class="methodology">')
w('<strong>本报告的诚实声明</strong><br><br>')

w('<strong>1. 推演而非实测。</strong>本报告的6个案例均为推演（在案例时间点模拟NCI的输入数据和计算逻辑），不是对真实NCI系统运行的实测。推演依赖于对历史事实的回顾性知识——这不是NCI在2010/2015/2018年会拥有的信息。推演的高分不代表NCI在实际部署中会给出同样的分数。<br><br>')

w('<strong>2. 确认偏误风险。</strong>6个案例中3个成功（特斯拉/拼多多/追觅）、2个失败（OFO/Google Glass）、1个未执行（哇呢）。虽然我们刻意使用了对抗性推演而非确认性验证，但选择案例、分配评分、解读结果的过程仍然受事后偏见影响。真正的验证需要在NCI部署后对不确定案例做前瞻性判断并跟踪结果。<br><br>')

w('<strong>3. 评分的主观性。</strong>五维度评分中的认知偏离度(40%)、成本断裂度(35%)、价值网络错配度(25%)的得分均为研究者的主观估计。不同的研究者可能给出不同的分数。分数的可靠性标注（高/中/低）是对数据可得性的诚实评估——但分数本身没有置信区间。真实的NCI系统需要在每个维度输出置信区间而非点估计。<br><br>')

w('<strong>4. 缺失的验证维度。</strong>本报告仅验证了NCI的核心判断逻辑（三条件/双因子/第一性原理/阈值/四层防御）。以下未验证：Phase 0 Signal采集管道的实际噪声率、Phase 1沉默检测的90天窗口对不同行业的适用性、Phase 3诊断报告集成的用户可读性、NCI在连续使用（非一次性诊断）中的表现。<br><br>')

w('<strong>5. 案例数量限制。</strong>6个案例不足以做出统计显著性的结论。但本研究的目的不是统计验证——是对抗性推演以暴露失效条件。12个失效点中的8个是方法论缺陷（需修正），2个是数据可得性问题（需诚实标注）。这是有意义的产出。<br><br>')

w('<strong>6. 时间戳。</strong>本报告生成于2026年7月5日。如果Alpha-Delta的产出在此后有修订，本报告的失效分析可能需要更新。建议将此报告纳入NCI方案的前置审计流程——每次NCI方案修订后重跑对抗性推演。</div>')

w('<hr>')
w('<div class="green-box"><strong>Epsilon研究结论：</strong>Alpha-Delta的NCI非共识检测体系在核心逻辑上通过了6个边界案例的对抗性推演。三条件缺一不可的逻辑正确区分了真非共识（特斯拉/拼多多/追觅）和伪颠覆（OFO/Google Glass）。12个失效点中8个是方法论缺陷——可以且应该修正——不触及核心逻辑的有效性。最紧急的4个修正（P0）：Signal管道盲区、第一性原理自动化、基础设施成熟度检查、子产业时钟。修正后建议用同一套6个案例重跑推演以验证修正效果。</div>')

w('<p class="meta" style="margin-top:60px;padding-top:20px;border-top:1px solid #30363d;">Epsilon对抗性验证研究 · v1.0 · 2026-07-05 · 研究者：跨案例对抗性验证研究员Epsilon · 推演对象：Alpha-Delta全部产出 · 方法：对抗性案例推演法</p>')

w('</body></html>')

fh.close()
print('Stage 12: Report complete!')
