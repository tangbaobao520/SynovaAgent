/**
 * ga-diagnosis.ts — GA 诊断入口 (PRD v1.6 Slice 4, 6/25演示)
 * GET /ga → 八维诊断表单 + SSE 流式结果
 */
import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/ga', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova GA · 新客户诊断</title>
<style>
:root{--bg:#0f0f14;--panel:#1a1a24;--border:#2a2a3a;--text:#e0e0e0;--dim:#888;--accent:#6c5ce7;--accent2:#a29bfe;--green:#2ecc71;--red:#e74c3c;--orange:#f39c12}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:var(--bg);color:var(--text);max-width:900px;margin:0 auto;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.5rem}h2{font-size:1.1rem;margin:1.5rem 0 .8rem;color:var(--accent2)}
.step{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:1.2rem 1.5rem;margin-bottom:1rem}
.step h3{font-size:.9rem;color:var(--dim);margin-bottom:.8rem;text-transform:uppercase;letter-spacing:.05em}
label{display:block;font-size:.8rem;color:var(--dim);margin-bottom:.2rem}
input,textarea{width:100%;background:#12121a;border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;margin-bottom:.6rem;font-family:inherit;outline:none}
textarea{resize:vertical;min-height:80px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;background:rgba(108,92,231,.2);color:var(--accent2);cursor:pointer}
.tag:hover{background:rgba(108,92,231,.4)}
.btn{width:100%;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin-top:1rem}
.btn:disabled{opacity:.5;cursor:default}
.result-card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:1rem;margin:.5rem 0;font-size:13px}
.result-card .expert{font-weight:600;color:var(--accent2);margin-bottom:.3rem}
.conf-bar{height:3px;border-radius:2px;margin:.3rem 0}
.conf-high{background:var(--green)}.conf-med{background:var(--orange)}.conf-low{background:var(--red)}
#progress{display:none;text-align:center;padding:1rem;color:var(--accent2)}
#results{display:none}
.hint{font-size:.75rem;color:var(--dim);margin-top:.3rem}
</style>
</head>
<body>
<h1>Synova GA · 新客户诊断</h1>
<p style="color:var(--dim);font-size:14px">第一步：填写企业基本信息 → 第二步：补充材料 → 第三步：你的判断 → 诊断</p>

<div class="step"><h3>第一步 · 企业基本信息</h3>
<div class="row">
<div><label>企业名称</label><input id="orgName" placeholder="如：XX母婴用品有限公司"></div>
<div><label>行业</label><input id="industry" placeholder="如：母婴/月子中心供应链"></div>
</div>
<div class="row">
<div><label>团队规模</label><input id="teamSize" placeholder="如：80-90人"></div>
<div><label>年营收（万元）</label><input id="revenue" placeholder="如：3000"></div>
</div>
</div>

<div class="step"><h3>第二步 · 八维诊断框架</h3>
<label>请描述企业情况（越详细诊断越准）</label>
<textarea id="content" placeholder="## 企业访谈

### 任务目标
（长期愿景和近期战略目标是什么？）

### 业务价值
（主营业务、价值主张、盈利模式？毛利率？）

### 现状起点
（现有团队规模、组织架构、核心资产？）

### 资源约束
（预算、人员、技术限制？）

### 风险瓶颈
（最担心什么？核心人依赖？客户集中？现金流？）

### 成功标准
（北极星指标？3年后理想状态？）

### 市场定位
（客户怎么评价？和竞品差异是什么？）

### 数字底座
（日常用什么系统和工具？ERP/CRM/Excel？）"></textarea>
<div class="hint">提示：点击下方标签快速填入</div>
<div id="quick-tags">
<span class="tag" onclick="fillTag('母婴行业,新生儿手足模型,400+月子中心合作')">母婴·月子中心</span>
<span class="tag" onclick="fillTag('制造业,精密模具,CNC设备,代工转品牌')">制造·精密模具</span>
<span class="tag" onclick="fillTag('SaaS,订阅制,月营收80万,付费客户420家')">SaaS·订阅制</span>
</div>
</div>

<div class="step"><h3>第三步 · GA 个人判断（可选）</h3>
<textarea id="gaJudgment" placeholder="你作为GA对这个客户的初步判断是什么？有哪些特别关注的信号？（这些会帮助Agent更精准地诊断）"></textarea>
</div>

<button class="btn" id="startBtn" onclick="startDiagnosis()">🔍 开始诊断</button>
<div id="progress">⏳ 诊断进行中... <span id="phaseLabel"></span></div>
<div id="results"></div>

<script>
function fillTag(text){document.getElementById('content').value=text}
async function startDiagnosis(){
  const orgName=document.getElementById('orgName').value.trim()||'未命名企业';
  const content=document.getElementById('content').value.trim();
  const gaJ=document.getElementById('gaJudgment').value.trim();
  if(!content||content.length<50){alert('请至少填写50字的企业描述');return}
  document.getElementById('startBtn').disabled=true;
  document.getElementById('progress').style.display='block';
  document.getElementById('phaseLabel').textContent='正在提取维度...';
  try{
    const r=await fetch('/api/diagnosis/upload',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:gaJ?content+'\\n\\n## GA判断\\n'+gaJ:content,orgName,teamId:'ga_'+Date.now().toString(36)})});
    const j=await r.json();
    document.getElementById('phaseLabel').textContent='诊断已提交 · jobId: '+j.jobId;
    if(j.jobId) setTimeout(()=>pollResults(j.jobId),3000);
  }catch(e){
    document.getElementById('progress').innerHTML='<span style=color:var(--red)>诊断启动失败: '+e.message+'</span>';
    document.getElementById('startBtn').disabled=false;
  }
}
async function pollResults(jobId){
  document.getElementById('phaseLabel').textContent='等待专家分析...';
  try{
    const r=await fetch('/api/diagnosis/report/'+jobId);if(!r.ok)throw new Error('报告未就绪');
    const html=await r.text();
    document.getElementById('progress').style.display='none';
    document.getElementById('results').style.display='block';
    document.getElementById('results').innerHTML='<h2>诊断报告</h2><div style=background:var(--panel);border-radius:10px;padding:1rem>'+html.slice(0,8000)+'</div>';
  }catch(e){
    document.getElementById('phaseLabel').textContent='报告生成中...';
    setTimeout(()=>pollResults(jobId),5000);
  }
}
</script>
</body>
</html>`);
});

export default router;
