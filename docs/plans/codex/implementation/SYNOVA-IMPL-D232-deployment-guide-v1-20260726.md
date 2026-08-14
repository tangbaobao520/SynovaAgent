# SynovaAgent -- D232 客户部署检查清单 + 首次诊断引导 实施方案 v1.0

> 2026-07-26 | 10/31 客户交付截止线
> **非代码任务——部署文档 + 首次诊断流程。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/agent-start.bat` 存在（D229），`app/login.html` 存在（D96），`app/dashboard.html` 存在（D97），`app/control-tower.html` 存在（D213）
- [x] Get-Content 读取：agent-start.bat — 4 步启动流程（信号初始化→环境验证→契约门禁→写入锁→服务启动）。login.html — JWT 登录（auth.js + api-client.js）
- [x] Select-String 验证：控制塔信号初始化已在 agent-start.bat Step 0 中（D230）
- [x] 引用 — 客户验收标准 1："老板或指定负责人能正常登录并使用 Synova 系统界面"

---

## 问题根因

17/17 门禁全部 PASS——系统功能完整。但没有"客户拿到系统后怎么用"的文档。10/31 客户需要：(1) 部署清单——服务器要求、安装步骤、启动命令 (2) 首次诊断引导——注册企业→导入数据→触发诊断→查看报告。

---

## 构建内容

### 1. docs/synova/deployment/DEPLOYMENT-CHECKLIST.md（新建，约 80 行）

| 步骤 | 内容 | 验证 |
|------|------|------|
| 1 | 环境要求：Node.js 22+ / Python 3.11+ / Git | `node --version` / `python --version` |
| 2 | 安装依赖 | `npm install` |
| 3 | 环境验证 | 自动在 `npm run dev` 时执行 |
| 4 | 启动系统 | `npm run dev` → 浏览器打开 `http://localhost:18790/app/login.html` |
| 5 | 注册企业 | 登录页点击 Register → 填写企业信息 → 获取 admin token |
| 6 | 访问仪表盘 | 登录后自动跳转 dashboard |
| 7 | 控制塔监控 | `http://localhost:18790/cockpit` |

### 2. docs/synova/deployment/FIRST-DIAGNOSIS-GUIDE.md（新建，约 60 行）

**首次诊断 5 步流程：**
1. 管理员注册企业 → 获得 admin token
2. 导入财务数据 → `/app/import.html` → 上传 CSV（含 date/amount/category 列）
3. 等待哨兵巡检 → 系统自动每 24h 运行哨兵检查
4. 手动触发诊断 → 仪表盘点击 "Generate Diagnosis Report"
5. 查看报告 → `/app/report.html` → SSE 实时渲染诊断结论

### 3. 更新 docs/synova/deployment/ 目录结构

```
docs/synova/deployment/
├── DEPLOYMENT-CHECKLIST.md    # D232 新建
├── FIRST-DIAGNOSIS-GUIDE.md   # D232 新建
└── D101-deployment-checklist.md  # 已有（D101 部署演练）
```

---

## 不做什么

- 不实现自动化安装脚本（已有 agent-start.bat/agent-start.sh）
- 不修改现有代码

---

## 完成标准

```
[ ] DEPLOYMENT-CHECKLIST.md: 7 步部署流程
[ ] FIRST-DIAGNOSIS-GUIDE.md: 5 步首次诊断流程
[ ] 两份文档均为 Markdown 格式——客户可双击打开
[ ] 环境要求准确（Node 22+ / Python 3.11+）
```
