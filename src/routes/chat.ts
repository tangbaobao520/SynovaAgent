/**
 * chat.ts — 内置对话窗口 + API Key 引导
 *
 * GET / → Web 对话界面
 * GET /api/status → API Key 配置状态
 */
import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../config';

const router = Router();

// ═══ API Key 状态检查 ═══

router.get('/api/status', (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json({
    ok: true,
    llmConfigured: !!(config.llmApiKey || config.gatewayHost),
    gatewayHost: config.gatewayHost || null,
    hasApiKey: !!config.llmApiKey,
    devMode: config.devMode,
  });
});

// ═══ Web 对话界面 ═══

router.get('/', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SynovaAgent · 组织数字孪生</title>
<style>
:root{--bg:#0f0f14;--panel:#1a1a24;--border:#2a2a3a;--text:#e0e0e0;--dim:#888;--accent:#6c5ce7;--accent2:#a29bfe;--red:#e74c3c;--green:#2ecc71;--input:#12121a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:var(--panel);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
header h1{font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
header .dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
header .dot.off{background:var(--red)}
header .status{font-size:12px;color:var(--dim)}
#messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:85%;padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.6;animation:fadeIn .3s}
.msg.user{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:4px}
.msg.agent{align-self:flex-start;background:var(--panel);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg.system{align-self:center;background:transparent;color:var(--dim);font-size:12px;text-align:center;max-width:100%}
.msg.phase{background:#1a1a2e;border-left:3px solid var(--accent2);padding:8px 12px;font-size:13px;color:var(--accent2)}
.msg pre{background:var(--input);padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin-top:6px}
#input-area{background:var(--panel);border-top:1px solid var(--border);padding:12px 20px;display:flex;gap:10px;flex-shrink:0}
#input-area input{flex:1;background:var(--input);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:14px;outline:none}
#input-area input:focus{border-color:var(--accent)}
#input-area button{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;font-weight:600}
#input-area button:hover{background:var(--accent2)}
#input-area button:disabled{opacity:.5;cursor:default}
.banner{background:#2d1f1f;border:1px solid #5c2a2a;padding:16px;border-radius:8px;margin-bottom:16px;font-size:13px;line-height:1.8}
.banner code{background:#1a0f0f;padding:2px 6px;border-radius:3px;color:#e74c3c}
.banner .cmd{display:block;background:#0a0a0f;padding:8px 12px;border-radius:4px;margin:8px 0;font-family:monospace;font-size:12px;color:var(--accent2)}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.tabs{display:flex;gap:4px;margin-bottom:0}
.tab{padding:6px 14px;border-radius:6px 6px 0 0;font-size:13px;cursor:pointer;background:transparent;color:var(--dim);border:1px solid transparent}
.tab.active{background:var(--panel);color:var(--text);border-color:var(--border);border-bottom-color:var(--panel)}
</style>
</head>
<body>
<header>
  <h1><span class="dot" id="status-dot"></span> SynovaAgent</h1>
  <span class="status" id="status-text">连接中...</span>
</header>
<div id="messages"></div>
<div id="input-area">
  <input id="user-input" type="text" placeholder="输入组织名称或问题，开始诊断..." />
  <button id="send-btn" onclick="send()">发送</button>
</div>

<script>
const API = '';
const messages = document.getElementById('messages');
const input = document.getElementById('user-input');
const btn = document.getElementById('send-btn');
const dot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
let loading = false;

input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

async function init() {
  try {
    const r = await fetch(API + '/api/status');
    const s = await r.json();
    if (s.llmConfigured) {
      dot.className = 'dot';
      statusText.textContent = s.gatewayHost ? 'Gateway 已连接' : 'API Key 已配置';
    } else {
      dot.className = 'dot off';
      statusText.textContent = '未配置 LLM';
      addSystem('banner',
        '<b>⚠️ LLM 未配置</b><br>诊断需要大模型。请设置以下环境变量后重启：' +
        '<span class="cmd">$env:LLM_API_KEY="sk-your-deepseek-key"</span>' +
        '或使用 Gateway：' +
        '<span class="cmd">$env:OPENCLAW_GATEWAY_HOST="http://127.0.0.1:18789"</span>' +
        '当前 DEV_MODE 模式，本体功能（数据摄取/图查询）仍可用。'
      );
    }
    addSystem('msg', '👋 我是 SynovaAgent，你的组织数字孪生诊断专家。<br>告诉我你的组织名称，我会开始诊断分析。');
  } catch(e) {
    dot.className = 'dot off';
    statusText.textContent = '服务异常';
  }
}

function addSystem(cls, html) {
  const d = document.createElement('div');
  d.className = 'msg system ' + (cls || '');
  d.innerHTML = html;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function addPhase(text) {
  const d = document.createElement('div');
  d.className = 'msg phase';
  d.textContent = '🔍 ' + text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function addJSON(text) {
  try {
    const obj = JSON.parse(text);
    const d = document.createElement('div');
    d.className = 'msg agent';
    d.innerHTML = '<pre>' + JSON.stringify(obj, null, 2).slice(0, 2000) + '</pre>';
    messages.appendChild(d);
  } catch {
    // JSON 解析失败 → 作为纯文本展示（非错误，前端渲染健壮性）
    addMsg('agent', text.slice(0, 500));
  }
  messages.scrollTop = messages.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text || loading) return;
  loading = true; btn.disabled = true;
  addMsg('user', text);
  input.value = '';

  try {
    const res = await fetch(API + '/api/diagnosis/consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: text.replace(/\\s+/g, '-').toLowerCase(),
        initiator: { role: '管理者', name: '用户', organizationName: text },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      addSystem('msg', '❌ 诊断启动失败：' + (err.error || err.message || '未知错误'));
      loading = false; btn.disabled = false;
      return;
    }

    addPhase('诊断已启动，等待结果...');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            switch (evt.type) {
              case 'phase_started':
                addPhase('Phase ' + evt.phase + ' — ' + (evt.label || '进行中...'));
                break;
              case 'phase_completed':
                addMsg('agent', '✅ Phase ' + evt.phase + ' 完成');
                break;
              case 'hypothesis_generated':
                addJSON(JSON.stringify(evt.hypothesis || evt));
                break;
              case 'complete':
                addMsg('agent', '📋 诊断完成！\\n\\n' + JSON.stringify(evt.result || evt, null, 2).slice(0, 3000));
                break;
              case 'error':
                addSystem('msg', '❌ ' + (evt.message || '诊断出错'));
                break;
              case 'interrupted':
                addSystem('msg', '⏸ 诊断已中断');
                break;
              case 'degraded':
                addSystem('msg', '⚠️ 部分模块降级: ' + (evt.message || ''));
                break;
              default:
                break;
            }
          } catch { /* SSE event JSON parse — benign */ }
        }
      }
    }
  } catch(e) {
    if (e.name !== 'AbortError') {
      addSystem('msg', '❌ 连接失败：' + e.message);
    }
  }
  loading = false; btn.disabled = false;
}

init();
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
