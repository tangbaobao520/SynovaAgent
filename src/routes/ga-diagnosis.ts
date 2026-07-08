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
.ann-card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:.8rem;margin:.5rem 0;font-size:13px}
.ann-card .finding-title{font-weight:600;margin-bottom:.3rem}
.ann-card .finding-meta{font-size:.75rem;color:var(--dim);margin-bottom:.5rem}
.ann-btn{padding:4px 12px;border-radius:4px;border:1px solid var(--border);cursor:pointer;font-size:12px;margin-right:6px;background:transparent;color:var(--text)}
.ann-btn:hover{opacity:.8}
.ann-btn.active-confirmed{background:var(--green);color:#fff;border-color:var(--green)}
.ann-btn.active-false-alarm{background:var(--red);color:#fff;border-color:var(--red)}
.ann-btn.active-uncertain{background:var(--orange);color:#fff;border-color:var(--orange)}
.ann-btn:disabled{opacity:.5;cursor:default}
.ann-note{width:100%;background:#12121a;border:1px solid var(--border);border-radius:4px;padding:6px 10px;color:var(--text);font-size:12px;margin-top:.4rem;font-family:inherit;outline:none;display:none}
.ann-status{font-size:.75rem;color:var(--dim);margin-top:.3rem}
.ann-error{font-size:.75rem;color:var(--red);margin-top:.3rem}
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

<!-- ═══ T3: GA 标注工具 ═══ -->
<div id="annotations-section" style="display:none;margin-top:2rem">
<div class="step">
<h3>📌 Findings 标注 · 帮助提升哨兵精度</h3>
<div id="annotation-loading" style="display:none;color:var(--dim);padding:.5rem">加载 Findings 列表...</div>
<div id="annotation-error" style="display:none;color:var(--red);padding:.5rem"></div>
<div id="findings-list"></div>
<div id="batch-actions" style="display:none;margin-top:1rem">
  <button class="btn" id="batchConfirmBtn" onclick="batchConfirmAll()" style="background:var(--green)">✅ 全部确认（N条）</button>
</div>
<div id="annotation-status" style="margin-top:.5rem;font-size:.8rem;color:var(--dim)"></div>
</div>
</div>

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
    // 加载标注面板
    setTimeout(loadAnnotationPanel, 500);
  }catch(e){
    document.getElementById('phaseLabel').textContent='报告生成中...';
    setTimeout(()=>pollResults(jobId),5000);
  }
}

// ═══ T3: GA 标注工具 ═══

let _currentFindings = [];

async function loadAnnotationPanel() {
  const section = document.getElementById('annotations-section');
  section.style.display = 'block';
  document.getElementById('annotation-loading').style.display = 'block';
  document.getElementById('annotation-error').style.display = 'none';
  try {
    // 获取最近的 findings
    const r = await fetch('/api/sentinel/findings?limit=50');
    if (!r.ok) throw new Error('获取 findings 失败');
    const data = await r.json();
    const findings = data.findings || [];
    _currentFindings = findings;

    // 获取已有标注
    let existingMap = {};
    try {
      const ar = await fetch('/api/ga/annotations?limit=200');
      if (ar.ok) {
        const ad = await ar.json();
        // 保留每个 finding 的最新标注
        for (const ann of (ad.annotations || [])) {
          existingMap[ann.findingId] = ann;
        }
      }
    } catch(e) { /* 标注加载失败不影响展示 */ }

    document.getElementById('annotation-loading').style.display = 'none';
    const list = document.getElementById('findings-list');
    list.innerHTML = '';

    if (findings.length === 0) {
      list.innerHTML = '<div style="color:var(--dim);padding:.5rem">暂无 Finding 数据</div>';
      return;
    }

    for (const f of findings) {
      const card = createFindingCard(f, existingMap[f.id]);
      list.appendChild(card);
    }

    // 更新批量按钮
    const batchBtn = document.getElementById('batchConfirmBtn');
    batchBtn.textContent = '✅ 全部确认（' + findings.length + '条）';
    document.getElementById('batch-actions').style.display = 'block';
    updateAnnotationStatus();
  } catch(e) {
    document.getElementById('annotation-loading').style.display = 'none';
    document.getElementById('annotation-error').style.display = 'block';
    document.getElementById('annotation-error').textContent = '获取 Findings 失败: ' + e.message;
  }
}

function createFindingCard(finding, existingAnn) {
  const card = document.createElement('div');
  card.className = 'ann-card';
  card.dataset.findingId = finding.id;

  const sentinelId = finding.sentinelId || 'unknown';
  const severity = finding.severity || 'info';
  const title = finding.title || '未命名 Finding';

  const ann = existingAnn ? existingAnn.annotation : null;
  const annActive = function(typ) { return ann === typ ? 'active-' + typ : ''; };

  card.innerHTML =
    '<div class="finding-title">' + title + '</div>' +
    '<div class="finding-meta">' + finding.id + ' · ' + severity + ' · ' + sentinelId + '</div>' +
    '<div class="ann-buttons">' +
      '<button class="ann-btn ' + annActive('confirmed') + '" data-ann="confirmed" onclick="selectAnnotation(\'' + finding.id + '\',\'' + sentinelId + '\',\'' + severity.replace(/'/g,"\\'") + '\',\'' + title.replace(/'/g,"\\'") + '\',\'confirmed\',this)">✅ 确认</button>' +
      '<button class="ann-btn ' + annActive('false_alarm') + '" data-ann="false_alarm" onclick="selectAnnotation(\'' + finding.id + '\',\'' + sentinelId + '\',\'' + severity.replace(/'/g,"\\'") + '\',\'' + title.replace(/'/g,"\\'") + '\',\'false_alarm\',this)">❌ 误报</button>' +
      '<button class="ann-btn ' + annActive('uncertain') + '" data-ann="uncertain" onclick="selectAnnotation(\'' + finding.id + '\',\'' + sentinelId + '\',\'' + severity.replace(/'/g,"\\'") + '\',\'' + title.replace(/'/g,"\\'") + '\',\'uncertain\',this)">❓ 不确定</button>' +
    '</div>' +
    '<textarea class="ann-note" id="note-' + finding.id + '" placeholder="纠错说明（可选）" ' + (existingAnn && (existingAnn.annotation === 'false_alarm' || existingAnn.annotation === 'uncertain') ? 'style=display:block' : '') + '>' + (existingAnn && existingAnn.correctionNote ? existingAnn.correctionNote : '') + '</textarea>' +
    '<div class="ann-status" id="status-' + finding.id + '">' + (existingAnn ? '已标注: ' + existingAnn.annotation + ' @ ' + (existingAnn.annotatedAt || '').slice(0,10) : '尚未标注') + '</div>' +
    '<div class="ann-error" id="error-' + finding.id + '"></div>';

  return card;
}

async function selectAnnotation(findingId, sentinelId, severity, title, annotation, btn) {
  const card = btn.closest('.ann-card');
  const statusEl = document.getElementById('status-' + findingId);
  const errorEl = document.getElementById('error-' + findingId);
  const noteEl = document.getElementById('note-' + findingId);
  const buttons = card.querySelectorAll('.ann-btn');

  // 禁用所有按钮（提交去重保护）
  buttons.forEach(b => b.disabled = true);

  // 高亮选中按钮
  buttons.forEach(b => {
    b.classList.remove('active-confirmed', 'active-false-alarm', 'active-uncertain');
  });
  btn.classList.add('active-' + annotation);

  // 展开/折叠纠错说明
  if (noteEl) {
    noteEl.style.display = (annotation === 'false_alarm' || annotation === 'uncertain') ? 'block' : 'none';
  }
  statusEl.textContent = '提交中...';
  statusEl.style.color = 'var(--accent)';
  errorEl.textContent = '';

  try {
    const body = {
      findingId: findingId,
      sentinelId: sentinelId,
      severity: severity,
      title: title,
      annotation: annotation,
    };
    if (noteEl && noteEl.value.trim()) {
      body.correctionNote = noteEl.value.trim();
    }

    const r = await fetch('/api/ga/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || '提交失败');

    statusEl.textContent = '已标注: ' + annotation + ' @ ' + new Date().toISOString().slice(0,10);
    statusEl.style.color = 'var(--dim)';
    updateAnnotationStatus();
  } catch(e) {
    statusEl.textContent = '尚未标注';
    statusEl.style.color = 'var(--dim)';
    errorEl.textContent = '⚠ 标注提交失败: ' + e.message + '，请重试';
    // 恢复按钮选中状态
    buttons.forEach(b => b.disabled = false);
    btn.classList.remove('active-' + annotation);
  }
  buttons.forEach(b => b.disabled = false);
}

async function batchConfirmAll() {
  const count = _currentFindings.length;
  if (count === 0) return;
  if (!confirm('确认本报告中全部 ' + count + ' 条 Finding？')) return;

  const batchBtn = document.getElementById('batchConfirmBtn');
  batchBtn.disabled = true;
  batchBtn.textContent = '提交中...';
  document.getElementById('annotation-error').style.display = 'none';

  let success = 0, fail = 0, errors = [];
  for (const f of _currentFindings) {
    try {
      const r = await fetch('/api/ga/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingId: f.id,
          sentinelId: f.sentinelId || 'unknown',
          severity: f.severity || 'info',
          title: f.title || '',
          annotation: 'confirmed',
        }),
      });
      if (r.ok) { success++; }
      else {
        const d = await r.json();
        fail++; errors.push(f.id + ': ' + (d.message || ''));
      }
    } catch(e) {
      fail++; errors.push(f.id + ': ' + e.message);
    }
  }

  // 刷新标注面板
  await loadAnnotationPanel();

  batchBtn.disabled = false;
  batchBtn.textContent = '✅ 全部确认（' + count + '条）';

  if (fail > 0) {
    document.getElementById('annotation-error').style.display = 'block';
    document.getElementById('annotation-error').textContent = success + '条成功，' + fail + '条失败：' + errors.slice(0,3).join('; ');
  }
}

function updateAnnotationStatus() {
  const count = document.querySelectorAll('.ann-card .ann-status').length;
  const annotated = document.querySelectorAll('.ann-card .ann-status:not(:empty)').length;
  const el = document.getElementById('annotation-status');
  if (el) el.textContent = '已标注 ' + annotated + ' / ' + count + ' 条 Finding';
}
</script>
</body>
</html>`);
});

export default router;
