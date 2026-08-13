/**
 * routes/home.ts — Synova 首页 (双入口 + 主题切换)
 * Day 2: FDE 诊断入口页面
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
const log = createLogger('src.routes.home');

const router = Router();

const THEME_CSS = `
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--accent2:#79c0ff;--green:#3fb950;--orange:#d2991d;--red:#f85149;--purple:#a371f7;--pink:#f778ba;--input-bg:#0d1117}
.light{--bg:#ffffff;--card:#f6f8fa;--border:#d0d7de;--text:#1f2328;--muted:#656d76;--accent:#0969da;--accent2:#0550ae;--green:#1a7f37;--orange:#9a6700;--red:#cf222e;--purple:#8250df;--pink:#bf3989;--input-bg:#f6f8fa}
`;

router.get('/', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova · AI 诊断 Agent</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🔍</text></svg>">
<style>
${THEME_CSS}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;transition:background .3s,color .3s}

/* ── Nav ── */
nav{display:flex;align-items:center;justify-content:space-between;padding:.8rem 2rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:10}
nav .logo{font-weight:800;font-size:1.1rem;color:var(--accent)}
nav .logo span{color:var(--muted);font-weight:400;font-size:.85rem;margin-left:.5rem}
nav a{color:var(--muted);text-decoration:none;font-size:.85rem;margin-left:1.2rem}
nav a:hover{color:var(--text)}
.theme-btn{background:var(--card);border:1px solid var(--border);color:var(--text);padding:.3rem .8rem;border-radius:6px;cursor:pointer;font-size:.8rem}

/* ── Hero ── */
.hero{text-align:center;padding:4rem 2rem 3rem;max-width:800px;margin:0 auto}
.hero h1{font-size:2.2rem;font-weight:800;line-height:1.3;margin-bottom:.8rem}
.hero h1 span{color:var(--accent)}
.hero .sub{color:var(--muted);font-size:1.05rem;max-width:620px;margin:0 auto 1.8rem;line-height:1.7}

/* ── Trust anchors ── */
.trust{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;max-width:700px;margin:0 auto 2rem;text-align:left}
.trust-item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1.2rem}
.trust-item .icon{font-size:1.5rem;margin-bottom:.3rem}
.trust-item h3{font-size:.9rem;margin-bottom:.3rem}
.trust-item p{color:var(--muted);font-size:.8rem;line-height:1.5}

/* ── Entry ── */
.entries{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;max-width:700px;margin:0 auto}
@media(max-width:600px){.entries,.trust{grid-template-columns:1fr}}
.entry{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:2rem 1.5rem;text-align:center;cursor:pointer;transition:border-color .2s;text-decoration:none;color:inherit;display:block}
.entry:hover{border-color:var(--accent)}
.entry .icon{font-size:2.5rem;margin-bottom:.8rem}
.entry h2{font-size:1.15rem;margin-bottom:.4rem}
.entry p{color:var(--muted);font-size:.85rem;line-height:1.5}
.entry .tag{display:inline-block;padding:.15em .6em;border-radius:4px;font-size:.7rem;font-weight:600;margin-top:.8rem}
.tag-purple{background:var(--purple);color:#fff;opacity:.85}
.tag-green{background:var(--green);color:#fff;opacity:.85}

/* ── Footer ── */
footer{text-align:center;padding:3rem 2rem 1.5rem;color:var(--muted);font-size:.8rem}
footer a{color:var(--accent);text-decoration:none}

/* ── Responsive ── */
@media(max-width:600px){.hero h1{font-size:1.6rem}.hero{padding:2.5rem 1rem 2rem}}
</style>
</head>
<body>
<nav>
  <div class="logo">Synova<span>AI 诊断 Agent</span></div>
  <div>
    <a href="/chat">对话诊断</a>
    <a href="/api/diagnosis/upload">文档诊断</a>
    <button class="theme-btn" onclick="toggleTheme()" id="theme-btn">🌙 深色</button>
  </div>
</nav>

<div class="hero">
  <div id="llm-badge" style="display:inline-flex;align-items:center;gap:6px;padding:.3rem 1rem;border-radius:20px;font-size:.8rem;margin-bottom:1rem;font-weight:600;background:var(--card);border:1px solid var(--border);">
    <span style="width:7px;height:7px;border-radius:50%;background:var(--muted);"></span>
    <span id="llm-status-text">检测中...</span>
  </div>
  <h1>您的企业，<span>7×24 小时</span>都有专家在看护</h1>
  <p class="sub">
    Synova 不是 ChatBot，是一个<strong>驻扎在企业内部的 AI 诊断 Agent</strong>。<br>
    背后是 8 位领域专家——战略、组织、财务、营销、技术、行动、商业模式、知识管理——<br>
    每一位都 7×24 小时在线，主动发现隐患，主动汇报信号，给出可落地的行动建议。
  </p>

  <div class="trust">
    <div class="trust-item">
      <div class="icon">🤖</div>
      <h3>Agent 不是 ChatBot</h3>
      <p>主动追问、主动发现、主动汇报。像一位驻场顾问，不是客服。</p>
    </div>
    <div class="trust-item">
      <div class="icon">🧠</div>
      <h3>8 位专家 × 可扩展</h3>
      <p>同时从 8 个视角诊断，交叉验证。需要新领域？加一个专家文件即可。</p>
    </div>
    <div class="trust-item">
      <div class="icon">⏰</div>
      <h3>7×24 常驻企业</h3>
      <p>哨兵不睡觉。现金流异常？关键人离职风险？系统比你更早发现。</p>
    </div>
  </div>

  <div class="entries">
    <a href="/chat" class="entry">
      <div class="icon">💬</div>
      <h2>对话诊断</h2>
      <p>Agent 主动引导八维访谈<br>每次只问一个问题 · 实时分析</p>
      <div class="tag tag-purple">演示首选</div>
    </a>
    <a href="/api/diagnosis/upload" class="entry">
      <div class="icon">📄</div>
      <h2>文档诊断</h2>
      <p>上传已完成的企业访谈记录<br>8 位专家并行推理 · 深度报告</p>
      <div class="tag tag-green">真实客户</div>
    </a>
  </div>
</div>

<footer>
  <p>Synova · AI 诊断 Agent &copy; 2026</p>
  <p style="margin-top:.3rem">8 位专家：战略 · 组织 · 财务 · 营销 · 技术 · 行动 · 商业模式 · 知识管理</p>
</footer>

<script>
function toggleTheme(){
  const html=document.documentElement;
  const btn=document.getElementById('theme-btn');
  if(html.classList.contains('light')){
    html.classList.remove('light');html.classList.add('dark');
    btn.textContent='🌙 深色';
  }else{
    html.classList.remove('dark');html.classList.add('light');
    btn.textContent='☀️ 浅色';
  }
}
// Day6: LLM状态检测
(async function(){
  const badge=document.getElementById('llm-badge');
  const dot=badge?.querySelector('span');
  const text=document.getElementById('llm-status-text');
  try{
    const r=await fetch('/api/status');
    const s=await r.json();
    if(s.llmConfigured){
      if(dot)dot.style.background='var(--green)';
      if(text)text.textContent='LLM 就绪 · 实时诊断可用';
    }else{
      if(dot)dot.style.background='var(--orange)';
      if(text)text.textContent='演示模式 · LLM未配置';
      if(badge)badge.style.borderColor='var(--orange)';
    }
  }catch(e){
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "网络请求失败");
    if(dot)dot.style.background='var(--red)';
    if(text)text.textContent='离线模式 · 服务未启动';
    if(badge)badge.style.borderColor='var(--red)';
  }
})();
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
