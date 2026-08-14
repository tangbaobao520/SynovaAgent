<!-- SYNOVA-IMPL-D246 v1.0 | 2026-07-27 | 新客户引导向导 -->
# SynovaAgent -- D246 新客户引导向导 v1.0
> admin.html 新增 onboarding wizard。权威文档 #16 Ch1 §2.1-2.2 定义首次使用流程

## 权威文档验证
来源: docs/synova/research/企业多用户部署与ima知识对接-20260721/SYNOVA-RESEARCH-第一章-企业多用户架构-v1-0-20260721.md
> §2.1: admin首次启动→检测本地无serverUrl/token→显示首次使用向导→选择创建新企业
> §2.2: 完整数据流 注册→校验→SQLite写入→JWT签发→跳转管理员工作台

代码验证: admin.html 现有 7 面板（Enterprise Status/Members/IMA/GA/Role Templates/Knowledge/Federated），无引导向导 ❌

## Q0-Q4
Q0: 新客户首次打开 admin.html 面对 7 个面板不知道从哪开始。需要引导式 wizard。
Q1: 行业对标——Stripe Dashboard onboarding checklist, Vercel getting started wizard
Q2: 做——admin.html 顶部新增 5 步引导向导（注册→邀请成员→导入数据→首次诊断→查看报告），每步指示操作+API调用+状态跟踪。不做——Electron 客户端首次启动检测（那是 Electron 主进程逻辑，归 D233）
Q3: 新 admin 打开 admin.html → 顶部显示 Step 1 注册表单 → 注册成功 → Step 2 成员邀请 → 跳过或完成 → Step 3 CSV导入 → Step 4 触发首次诊断 → Step 5 查看报告链接
Q4: L1 手动验证×5（每步操作+状态转换）

## 改动 (仅 admin.html + admin.js + admin.css)

### 1. admin.html — 新增 onboarding 面板
在 Panel 1 之前插入向导容器:
```html
<div id="onboarding-wizard" class="card" style="margin-bottom:24px">
  <h2>Getting Started</h2>
  <div id="onboarding-steps"><!-- JS 渲染 5 步进度条 --></div>
</div>
```

### 2. admin.js — 新增 onboarding 逻辑 (~100行)
步骤定义:
1. Register Enterprise — 表单(企业名/邮箱/密码) + POST /api/enterprise/register
2. Invite Members — 邀请表单(可选跳过) + POST /api/enterprise/invite
3. Import Data — 链接到 import.html 或内嵌 CSV 上传(调用 D231 API)
4. First Diagnosis — 按钮触发 POST /api/loops/1/execute (loop-1 企业诊断)
5. View Report — 链接到 /cockpit

状态跟踪: localStorage 存完成状态, 刷新后保留。已完成步骤绿色, 当前步骤高亮。

### 3. admin.css — 向导样式 (~30行)
步骤进度条: flex 横排, 已完成=绿色, 当前=蓝色边框, 未开始=灰色

## 测试 (L1 手动×5)
| # | 测试 |
|---|------|
| 1 | Step 1 注册表单提交→成功→跳到 Step 2 |
| 2 | Step 2 邀请成员→成功/跳过→跳到 Step 3 |
| 3 | Step 3 CSV 导入→成功→跳到 Step 4 |
| 4 | Step 4 触发诊断→等待完成→跳到 Step 5 |
| 5 | 刷新页面后进度保留 (localStorage) |

## 完成标准
5 步向导可见可操作 + localStorage 持久化 + 纯前端 tsc 不涉及。
