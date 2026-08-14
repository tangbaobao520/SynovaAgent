<!-- SYNOVA-IMPL-D252 v2.0 | 2026-07-28 | #05 M2 SSE流式消费 -->
# SynovaAgent -- D252 SSE 流式消费 + 金字塔渲染 v2.0
> v1.0 错误: 引用补充文档的 idealized SSE 格式 (governing_thought/expert_update), 但实际 diagnosis.ts 使用完全不同的 event type 体系
> v2.0 修正: 对标 diagnosis.ts 实际 SSE 事件: event.type(动态), community_reports, entity_resolution, complete, error

## 代码验证
- diagnosis.ts L44-46: `sseWrite()` → `res.write(data: {JSON}\n\n)` ✅
- diagnosis.ts L169-172: 核心事件 `type: event.type, phase, label, message` ✅
- diagnosis.ts L195: `formatForSSE(card)` → 判断卡片 JSON ✅
- diagnosis.ts L214-217: `type: 'community_reports'` ✅
- diagnosis.ts L226-229: `type: 'entity_resolution'` ✅
- diagnosis.ts L49-52: `type: 'complete'` ✅
- diagnosis.ts L60: `type: 'error'` ✅
- diagnosis.ts L68: `res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })` ✅
- app/ 下无 chat 前端页面 ❌

## Q0-Q4
Q0: diagnosis.ts 后端 SSE 完整, 事件体系: 动态 phase(N), community_reports, entity_resolution, complete, error。前端零消费。
Q2: 做——新建 app/chat.html + app/js/chat-sse.js, fetch + ReadableStream 解析 SSE (POST endpoint, EventSource 不支持), 金字塔三层映射: phase_start→GT, event.type(interim_finding)→KJ, complete→操作按钮。不做——子Agent面板(归 D251), 线程切换(D251已做)。
Q3: 访问 /app/chat.html → POST /api/diagnosis/consult → SSE data: lines → JSON.parse → type 路由 → 金字塔渲染
Q4: L1手动×4。纯前端。

## SSE事件→金字塔映射
| diagnosis.ts SSE type | 金字塔层 | 渲染 |
|----------------------|---------|------|
| event.type='phase_start' | Governing Thought | 大标题 + 阶段标签 |
| event.type='interim_finding' | Key Judgments | 卡片 (findings[].label + message) |
| formatForSSE(card) | Key Judgments | 判断卡片 (card.title + card.findings) |
| community_reports | Key Judgments | 协作圈发现 |
| entity_resolution | Evidence Chain | 实体解析结果(折叠) |
| complete | 底部操作 | "生成Goal"+"导出PDF"按钮 |

## 改动 (~180行, 纯前端)

### 1. app/chat.html — 新建 (~40行)
```html
<div id="chat-form"><input id="team-id" placeholder="Team ID"> <button id="btn-start">Start Diagnosis</button></div>
<div id="pyramid-output"><!-- 金字塔三层渲染 --></div>
```

### 2. app/js/chat-sse.js — 新建 (~110行)
fetch + ReadableStream 手动解析 SSE (diagnosis.ts 是 POST, EventSource 只支持 GET):
```javascript
fetch('/api/diagnosis/consult', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({teamId, initiator:{role:'admin'}}) })
  .then(r => { var reader = r.body.getReader(); var decoder = new TextDecoder(); var buffer = '';
    function pump() { reader.read().then(({done, value}) => { /* parse SSE data: lines */ }); }
  })
```

金字塔渲染:
- `type === 'phase_start'` → `<h2 class='gt'>${label}</h2>`
- `type === 'interim_finding'` → `<div class='kj'><h3>${finding.label}</h3><p>${message}</p></div>`
- `type === 'complete'` → 显示 "Generate Goal" + "Export PDF"

### 3. app/css/app.css — 金字塔样式 (~30行)
.gt / .kj / .evidence (折叠) / .phase-progress (进度条)

## 测试 (L1 手动×4)
| # | 测试 |
|---|------|
| 1 | SSE 连接成功→phase_start 渲染 GT |
| 2 | interim_finding→KJ卡片渲染 |
| 3 | community_reports→协作圈渲染 |
| 4 | complete→操作按钮出现 |

## 完成标准
金字塔三层映射正确 + fetch+ReadableStream SSE 消费。纯前端。
