# 首次诊断引导

> 适用版本: V4.5.0 | 更新日期: 2026-07-26
> **预条件:** 已完成 [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) 第 1-5 步，系统正常运行

---

## 概览

首次诊断共 5 步，约 15-30 分钟:

```
注册企业 → 导入数据 → 等待哨兵巡检 → 触发诊断 → 查看报告
```

---

## Step 1: 管理员注册企业

1. 浏览器打开 `http://localhost:3000/app/login.html`
2. 点击 **Register** 标签
3. 填写企业邮箱和管理员密码（至少 6 位）
4. 点击 **Register** 提交

**成功:** 页面返回 JWT token，自动跳转仪表盘。

> **说明:** 注册后自动获得 `admin` 角色。后续可在企业路由中邀请其他成员。

---

## Step 2: 导入财务数据

SynovaAgent 通过哨兵巡检分析企业数据。首次使用需要导入基准数据:

### 方法 A: 通过上传页面

1. 浏览器打开 `http://localhost:3000/app/import.html`
2. 准备 CSV 文件，包含以下列:
   - `date` — 日期 (YYYY-MM-DD)
   - `amount` — 金额 (数字)
   - `category` — 分类 (如 revenue/expense/cogs)
3. 上传文件，等待导入完成

### 方法 B: 通过 API

```bash
# 使用 admin token 导入数据
curl -X POST http://localhost:3000/api/data/import \
  -H "Authorization: Bearer <你的 JWT token>" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {"date": "2026-01-15", "amount": 100000, "category": "revenue"},
      {"date": "2026-01-15", "amount": 65000, "category": "expense"}
    ]
  }'
```

> **说明:** 数据经过脱敏处理，仅分析趋势和比率，不存储原始值。

---

## Step 3: 等待哨兵巡检

系统自动运行内置哨兵:

| 哨兵 | 频率 | 功能 |
|------|:----:|------|
| 现金流哨兵 | 每 30 分钟 | 监测现金流健康度 |
| CPC 哨兵 | 每 6 小时 | 计算单位经济效益 |
| 目标对齐哨兵 | 每 24 小时 | 检查目标完成进度 |
| 集成健康哨兵 | 每 24 小时 | 检查系统集成状态 |

哨兵巡检结果自动写入 `.codex/signals/`，在仪表盘和控制塔可见。

> **说明:** 首次部署后，部分哨兵需要 1-2 次运行周期积累基线数据。
> 在此期间，控制塔仪表盘可能显示 "Unknown" 或 "Yellow" 状态，属于正常现象。

---

## Step 4: 手动触发诊断

等待首次哨兵巡检完成后（约 5-10 分钟），手动触发诊断:

### 通过仪表盘

1. 打开 `http://localhost:3000/app/dashboard.html`
2. 点击 **Generate Diagnosis Report**
3. 系统自动汇总哨兵发现 → 路由到 8 位诊断专家 → 交叉验证 → 生成报告

### 通过 API

```bash
curl -X POST http://localhost:3000/api/diagnosis/consult \
  -H "Authorization: Bearer <你的 JWT token>" \
  -H "Content-Type: application/json" \
  -d '{"enterpriseId": "default", "scope": "full"}'
```

---

## Step 5: 查看报告

### 诊断报告

打开 `http://localhost:3000/report/<jobId>` — SSE 实时渲染诊断结论，包含:

- 企业健康评分（0-100）
- 7 维度雷达图（战略/组织/财务/技术/市场/增长/商业模式）
- P0/P1 关键发现列表
- 专家交叉验证结论
- 可执行方案建议

### 创始人驾驶舱（控制塔）

打开 `http://localhost:3000/cockpit` — 创始人全局视图:

- 6 组件信号卡片（绿/黄/红状态）
- R/D/C 流水线（任务研究/设计/提交进度）
- 活跃阻断列表
- 17 产品门禁状态
- Agent 可靠性趋势

---

## 下一步

| 场景 | 参考 |
|------|------|
| 邀请团队成员 | `POST /api/auth/register` — 注册新成员并分配角色 |
| 配置 IMA 知识库 | `POST /api/enterprise/ima/bind` — 绑定企业知识库 |
| 查看定时诊断排期 | 系统自动每 24h 运行哨兵巡检, 每季度执行完整诊断 |
| 部署到生产环境 | 参考 `scripts/workflow/checkpoint-deploy.sh` |
| 监控控制塔 | 访问 `http://localhost:3000/cockpit` — 创始人驾驶舱 |

---

## 参考

- [部署检查清单](./DEPLOYMENT-CHECKLIST.md) — 环境准备和系统安装
- 环境验证器 — `python scripts/control-tower/env_validator.py --help`
- 创始人驾驶舱 — `http://localhost:3000/cockpit`
