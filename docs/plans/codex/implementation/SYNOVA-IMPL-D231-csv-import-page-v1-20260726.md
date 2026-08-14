# SynovaAgent -- D231 客户数据导入页 实施方案 v1.0

> 2026-07-26 | D221 CSV 连接器已建——缺前端上传入口
> **10/31 客户截止线——客户能自助导入财务数据。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/connectors/csv-import.ts` 存在（D221，CsvImportConnector 类），`app/` 目录存在（7 HTML 页面），`app/js/shell.js` 存在（D96 共享导航）
- [x] Get-Content 读取：csv-import.ts L39-48 — `CsvImportConnector` 接受 `GraphBridgeLike` + `import(filePath)` 方法。L67 `importData(csvContent)` 直接解析内容（测试/API 用）
- [x] Select-String 验证：D221 已实现中英文列名映射（date/日期、amount/金额、category/分类、description/描述）——客户 CSV 格式灵活
- [x] 引用 — D103 enterprise.ts 含企业管理端点。D108 admin.html 已有管理员面板——导入页复用同模式

---

## 问题根因

D221 CsvImportConnector 是一个纯 TypeScript 类——没有 UI 入口。客户无法自行上传 CSV 文件导入财务数据。管理员需要一个简单的文件上传页面——拖拽 CSV→预览→确认导入→显示结果。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 客户交付——数据导入页。`app/import.html`——一个简单的文件上传页面。拖拽 CSV 文件→前端解析预览→调用 CsvImportConnector→GraphStore 写入→显示导入结果。

### Q1：调研
- CsvImportConnector API：`importData(csvContent: string): ImportResult`——在浏览器端解析 CSV 内容，然后通过 API 传给后端
- 后端 API 需求：需要一个端点接收 CSV 内容并调用 CsvImportConnector。或前端直接解析 CSV → 逐行调用 GraphStore API
- 现有模式：D108 admin.html 复用 D96 shell——导入页复用同模式

### Q2：范围
- 最小：(A) `app/import.html`——文件拖拽区 + 预览表格 + 导入按钮 (B) `app/js/import.js`——CSV 解析 + 预览 + 导入逻辑 (C) `src/routes/import.ts`——POST `/api/import/csv` 端点
- 不做：不实现 Excel 导入、不实现历史导入记录

### Q3：验收
- 管理员打开 `/app/import.html`→拖拽 CSV 文件→预览表格显示前 10 行→点击"导入"→显示"成功导入 N 条记录"
- 文件格式错误→toast "格式错误" + 不导入
- 空文件→toast "空文件" 

### Q4：契约与测试
- @input：CSV 文件（拖拽或选择）
- @output：导入结果（imported 行数 + 错误行数）
- @degraded：文件格式错误→toast 提示；服务器不可用→Retry
- 测试：正常导入(1) + 格式错误(1) + 空文件(1) = 3 tests

---

## 构建内容

### 1. app/import.html（新建，约 40 行）

```html
<div class="page-content">
  <div class="import-header"><h1>Data Import</h1></div>
  <div id="drop-zone" class="drop-zone">
    <p>Drag CSV file here, or click to select</p>
    <input type="file" id="file-input" accept=".csv" hidden>
  </div>
  <div id="preview-table" style="display:none">
    <h2>Preview (first 10 rows)</h2>
    <table id="preview"></table>
  </div>
  <button id="btn-import" class="btn-primary" style="display:none">Import</button>
  <div id="import-result"></div>
</div>
```

### 2. app/js/import.js（新建，约 80 行）

```javascript
// CSV 解析 + 预览渲染 + 导入 API 调用
function parseCSV(text) { /* 解析为行数组 */ }
function renderPreview(rows) { /* 渲染前 10 行到 table */ }
async function doImport(text) {
  const r = await api.post('/api/import/csv', { content: text });
  // 显示导入结果
}
```

### 3. src/routes/import.ts（新建，约 30 行）

```typescript
// POST /api/import/csv — 接收 CSV 内容→CsvImportConnector→GraphStore
router.post('/api/import/csv', jwtAuthMiddleware, async (req, res) => {
  const { content } = req.body;
  const connector = new CsvImportConnector(graphBridge);
  const result = connector.importData(content);
  res.json({ ok: true, imported: result.imported, warnings: result.warnings });
});
```

---

## 不做什么

- 不实现 Excel 导入
- 不实现历史导入记录
- 不实现进度条（MVP：一次性导入）

---

## 测试要求

### L1：单元契约测试
- 拖拽 CSV 文件→预览表格渲染
- 格式错误→toast
- 空文件→toast
- 3 个测试

---

## 完成标准

```
[ ] app/import.html: 拖拽区 + 预览表格 + 导入按钮
[ ] app/js/import.js: CSV 解析 + 预览 + 导入
[ ] src/routes/import.ts: POST /api/import/csv 端点
[ ] 降级: 文件格式错误→toast；服务不可用→Retry
[ ] ≥3 个测试
```
