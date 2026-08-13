"""Build the Epsilon adversarial validation report HTML."""
import pathlib

OUT = pathlib.Path(r'D:\novis-backup-20260526\Novis\synova-agent\docs\research\growth-diagnostics\NCI-对抗性验证报告-Epsilon-20260704.html')

def w(s):
    with open(OUT, 'a', encoding='utf-8') as f:
        f.write(s + '\n')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('')

w('<!DOCTYPE html>')
w('<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">')
w('<title>NCI对抗性验证报告 — Epsilon v1.0</title>')
w('<style>')
w(':root{--bg:#0d1117;--bg2:#161b22;--fg:#c9d1d9;--fg2:#8b949e;--accent:#58a6ff;--green:#3fb950;--warn:#d2991d;--crit:#f85149;--purple:#bc8cff;--h1:#f0f6fc;--h2:#e6edf3}')
w('*{box-sizing:border-box;margin:0;padding:0}')
w('body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;max-width:1100px;margin:0 auto;padding:40px 24px 120px}')
w('h1{color:var(--h1);font-size:1.8em;border-bottom:2px solid var(--accent);padding-bottom:12px;margin-bottom:8px}')
w('h2{color:var(--h2);font-size:1.3em;margin:48px 0 16px;border-left:4px solid var(--accent);padding-left:12px}')
w('h3{color:var(--accent);font-size:1.1em;margin:28px 0 10px}')
w('h4{color:var(--fg2);font-size:1em;margin:18px 0 6px}')
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
w('.fail{color:var(--crit);font-weight:600}.pass{color:var(--green);font-weight:600}')
w('.toc{background:var(--bg2);padding:20px 25px;border-radius:6px;margin:20px 0}')
w('.score-card{display:inline-block;min-width:60px;text-align:center;padding:4px 10px;border-radius:4px;font-weight:700}')
w('.score-high{background:rgba(63,185,80,.2);color:#3fb950}')
w('.score-mid{background:rgba(210,153,29,.2);color:#d2991d}')
w('.score-low{background:rgba(248,81,73,.2);color:#f85149}')
w('.formula{background:var(--bg2);border:1px solid #30363d;padding:16px 20px;margin:16px 0;text-align:center;font-weight:700;color:var(--accent)}')
w('hr{border:0;border-top:1px solid #30363d;margin:30px 0}')
w('.meta{color:var(--muted);font-size:.9em}')
w('</style></head><body>')

w('<h1>NCI 非共识检测体系 — 跨案例对抗性验证报告</h1>')
w('<p class="meta">代号 Epsilon · v1.0 · 2026-07-04 · 6个边界案例推演</p>')

w('<div class="methodology">')
w('<strong>研究方法：对抗性案例推演法（Adversarial Case Simulation）</strong><br>')
w('本研究不采用「用案例验证理论正确」的传统路径——该方法有天然的确认偏误风险。相反，我们精心挑选6个NCI最难处理的边界条件案例，用每个案例去冲击Alpha-Delta的全部产出，专门寻找<strong>失效条件</strong>。')
w('每个案例被选中是因为它代表了NCI体系的一个特定脆弱面。验证标准不是「理论是否解释了案例」——而是「在案例发生的时间点，这套体系能否提前发出正确的信号，能否避免错误的判断」。')
w('</div>')

print('Header + methodology written')

w('<div class="toc"><strong>目录</strong><ol>')
w('<li><a href="#s1">一、验证对象：核心声明</a></li>')
w('<li><a href="#s2">二、6个边界案例详细推演</a></li>')
w('<li><a href="#s3">三、失效点汇总</a></li>')
w('<li><a href="#s4">四、NCI模拟得分表</a></li>')
w('<li><a href="#s5">五、修正建议</a></li>')
w('<li><a href="#s6">六、诚实清单</a></li>')
w('</ol></div><hr>')

w('<h2 id="s1">一、验证对象：Alpha-Delta产出的核心声明</h2>')
w('<p>以下声明提取自NCI工程化方案v1.1、本体层最终规范v2.4和增长诊断完整方案v2.0。</p>')
w('<table>')
w('<tr><th>#</th><th>声明</th><th>来源</th></tr>')
w('<tr><td><strong>S1</strong></td><td>NCI的三个必要条件——认知偏离、成本断裂、价值网络错配——三者缺一不可。缺少任何一个，均不构成真非共识。</td><td>NCI方案 背景-第二步</td></tr>')
w('<tr><td><strong>S2</strong></td><td>认知偏离度使用双因子张力模型：内部共识强度 x 外部共识逆强度。当内部极度看多、外部极度看空时，NCI认知偏离度达到峰值。（专家修正一）</td><td>NCI方案 专家修正一</td></tr>')
w('<tr><td><strong>S3</strong></td><td>成本断裂度：当数据缺失无法计算时，触发第一性原理断层扫描。理论下限 &lt; 当前行业成本 x 0.3，直接赋值70分。（专家修正三）</td><td>NCI方案 专家修正三</td></tr>')
w('<tr><td><strong>S4</strong></td><td>NCI &ge; 70是高非共识；40-69中非共识；&lt;40低非共识。</td><td>NCI方案 3.2</td></tr>')
w('<tr><td><strong>S5</strong></td><td>沉默触发器：90天未被引用→silenced。僵尸信号：reference_count &gt; 5但resource_allocation_delta = 0 → 决策瘫痪。（专家修正二）</td><td>NCI方案 2.2+修正二</td></tr>')
w('<tr><td><strong>S6</strong></td><td>四层防御成本断裂真实性：单位成本下降结构性（learning_rate突变）vs 规模效应。</td><td>NCI方案 3.3</td></tr>')
w('<tr><td><strong>S7</strong></td><td>生存底线检查：投入超现金跑道X% → NCI自动降优先级。</td><td>NCI方案 3.3</td></tr>')
w('</table><hr>')

print('S1 declarations written')
