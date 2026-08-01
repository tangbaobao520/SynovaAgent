/**
 * workspace.ts — 三栏布局工作区 (PRD v1.6 Slice 1)
 * GET /workspace → 三栏 HTML 页面
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
const log = createLogger('src.routes.workspace');

const router = Router();

router.get('/workspace', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova · 工作区</title>
<style>
:root{--bg:#0f0f14;--panel:#1a1a24;--border:#2a2a3a;--text:#e0e0e0;--dim:#888;--accent:#6c5ce7;--accent2:#a29bfe;--red:#e74c3c;--green:#2ecc71;--orange:#f39c12}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;overflow:hidden}
.sidebar{width:240px;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
.sidebar-header{padding:16px;border-bottom:1px solid var(--border)}
.sidebar-header button{width:100%;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;cursor:pointer}
.workspace-list{flex:1;overflow-y:auto;padding:8px}
.ws-item{padding:12px;border-radius:8px;cursor:pointer;margin-bottom:4px;display:flex;align-items:center;gap:8px;font-size:13px}
.ws-item:hover{background:rgba(255,255,255,.04)}
.ws-item.active{background:rgba(108,92,231,.15);border:1px solid var(--accent)}
.ws-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ws-dot.critical{background:var(--red)}.ws-dot.warning{background:var(--orange)}.ws-dot.ok{background:var(--green)}
.search-bar{display:flex;padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--border);gap:8px;align-items:center}
.search-bar input{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;outline:none}
.search-bar input:focus{border-color:var(--accent)}
.search-bar button{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.main-header{padding:12px 20px;border-bottom:1px solid var(--border);font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
.main-header .expert-tag{font-size:11px;background:rgba(108,92,231,.2);color:var(--accent2);padding:2px 8px;border-radius:4px}
.chat-area{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:85%;padding:10px 14px;border-radius:10px;font-size:13px;line-height:1.6}
.msg.user{align-self:flex-end;background:var(--accent);color:#fff}
.msg.agent{align-self:flex-start;background:var(--panel);border:1px solid var(--border)}
.msg.system{align-self:center;color:var(--dim);font-size:11px}
.input-area{padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:10px}
.input-area textarea{flex:1;background:#12121a;border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px;resize:none;font-family:inherit;outline:none}
.input-area button{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:13px;font-weight:600}
.right-panel{width:280px;background:var(--panel);border-left:1px solid var(--border);padding:16px;overflow-y:auto;flex-shrink:0}
.right-panel h3{font-size:13px;color:var(--dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
.goal-card{background:#0d0d18;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px}
.goal-card .g-title{font-weight:600;margin-bottom:4px}
.goal-card .g-status{font-size:11px;color:var(--orange)}
.empty-state{text-align:center;padding:40px 20px;color:var(--dim);font-size:14px}
.empty-state p{margin-bottom:16px}
</style>
</head>
<body>
<div class="search-bar"><input type="text" id="global-search" placeholder="向 Synova 提问...  示例: 上个月客户流失率 / 张三部门人员变动" onkeydown="if(event.key==='Enter'){searchAsk()}"><button onclick="searchAsk()">搜索</button></div>
<div class="sidebar">
  <div class="sidebar-header"><button onclick="newWorkspace()">+ 新建工作区</button></div>
  <div class="workspace-list" id="ws-list">
    <div class="empty-state"><p>暂无工作区</p><p style="font-size:12px">诊断完成后自动创建</p></div>
  </div>
</div>
<div class="main">
  <div class="main-header" id="main-title">Synova · 选择或创建工作区</div>
  <div class="chat-area" id="messages"></div>
  <div class="input-area">
    <textarea id="user-input" placeholder="输入消息..." rows="2" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg()}"></textarea>
    <button onclick="sendMsg()">发送</button>
  </div>
</div>
<div class="right-panel" id="right-panel">
  <h3>目标跟踪</h3>
  <div class="empty-state" style="padding:20px"><p>选择工作区后显示</p></div>
</div>
<script>
const API='';
let currentWs=null;
async function loadWorkspaces(){
  try {
    const r=await fetch(API+'/api/workspaces');const data=await r.json();renderWsList(data.workspaces||[]);
  } catch(e){
    console.warn('工作区列表加载失败 — degraded', { err: e instanceof Error ? e.message : String(e) });
  }
}
function renderWsList(wss){
  const el=document.getElementById('ws-list');
  if(!wss.length){el.innerHTML='<div class=empty-state><p>暂无工作区</p></div>';return}
  el.innerHTML=wss.map(w=>\`<div class="ws-item\${currentWs===w.id?' active':''}" onclick="selectWs('\${w.id}')">
    <div class="ws-dot \${w.status==='pending'?'warning':w.status==='critical'?'critical':'ok'}"></div>
    <div><div>\${w.title||'未命名'}</div><div style="font-size:10px;color:var(--dim)">\${w.type||''} · \${w.status||'pending'}</div></div>
  </div>\`).join('');
}
async function newWorkspace(){
  const title=prompt('工作区名称')||'新工作区';
  try {
    const r=await fetch(API+'/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});await r.json();loadWorkspaces();
  } catch(e){
    console.warn('创建工作区失败 — degraded', { err: e instanceof Error ? e.message : String(e) });
  }
}
async function selectWs(id){
  currentWs=id;loadWorkspaces();
  try{const r=await fetch(API+'/api/workspaces/'+id);const d=await r.json();
    document.getElementById('main-title').innerHTML=\`\${d.title} <span class=expert-tag>\${d.expert||'综合'}</span>\`;
    document.getElementById('right-panel').innerHTML='<h3>目标跟踪</h3><div class=goal-card><div class=g-title>'+d.title+'</div><div class=g-status>状态: '+d.status+'</div></div>';
  }catch(e){
    console.warn("工作区 DOM 渲染", { err: e instanceof Error ? e.message : String(e) });
  }
}
async function sendMsg(){
  const input=document.getElementById('user-input');const text=input.value.trim();if(!text||!currentWs)return;
  const msgs=document.getElementById('messages');
  msgs.innerHTML+='<div class="msg user">'+text+'</div>';
  input.value='';
  try{const r=await fetch(API+'/api/workspaces/'+currentWs+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
    const d=await r.json();msgs.innerHTML+='<div class="msg agent">'+d.reply+'</div>';
  }catch(e){
    console.warn("工作区响应解析", { err: e instanceof Error ? e.message : String(e) });
    msgs.innerHTML+='<div class="msg system">发送失败</div>'
  }
  msgs.scrollTop=msgs.scrollHeight;
}
loadWorkspaces();
function searchAsk() {
  const q = document.getElementById('global-search').value.trim();
  if (!q) return;
  fetch('/api/knowledge/ask', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({question: q}) })
    .then(r => r.json()).then(data => {
      const mid = document.getElementById('messages');
      if (!mid) return;
      const d = document.createElement('div');
      d.className = 'msg agent';
      d.innerHTML = '<b>🔍 ' + esc(q) + '</b><br><br>' + (data.answer || '暂无结果');
      mid.appendChild(d);
      mid.scrollTop = mid.scrollHeight;
    }).catch((err) => {
      console.warn('知识问答请求失败 — degraded', { err });
    });
}
</script>
</body>
</html>`);
});

export default router;
