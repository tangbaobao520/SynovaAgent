# D101 部署清单

> 2026-07-17 | Pre-Launch Verification
> 系统版本: feat/prompt-architecture

---

## 系统要求

| 项 | 最低要求 | 推荐 |
|---|---------|------|
| Node.js | 22.x | 22 LTS |
| npm | 10.x | 最新 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 10 GB | 50 GB (SSD) |
| 操作系统 | Linux (amd64/arm64) | Ubuntu 22.04+ |
| Docker | 24.0+ (可选) | 最新 |
| SQLite | 内置 (无需单独安装) | — |

---

## 环境变量

### 必需

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_API_KEY` | — | DeepSeek/OpenAI API Key |
| `ENGINE_TOKENS` | `change-me-in-production` | 引擎 Token（生产环境必须修改） |
| `CREDENTIAL_MASTER_KEY` | — | 凭据加密主密钥 |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | HTTP 服务端口 |
| `NODE_ENV` | `production` | 运行环境 |
| `DEV_MODE` | `false` | 开发模式（跳过 JWT 验证） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | LLM API 地址 |
| `LLM_MODEL` | `deepseek-v4-flash` | LLM 模型 |
| `SYNOVA_DB_PATH` | `./data/synova.db` | SQLite 数据库路径 |
| `FEISHU_APP_ID` | — | 飞书应用 ID (可选) |
| `FEISHU_APP_SECRET` | — | 飞书应用 Secret (可选) |

---

## 部署步骤

### 1. 克隆与安装

```bash
git clone https://github.com/tangbaobao520/SynovaAgent.git
cd SynovaAgent
npm ci
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY 等必需变量
```

### 3. 启动

```bash
# 开发模式
npm run dev

# 生产模式
NODE_ENV=production node --import tsx/esm src/index.ts

# Docker
docker compose up -d
```

### 4. 验证启动

```bash
# 健康检查
curl http://localhost:3000/health
# 期望: {"status":"ok","name":"Synova-Agent",...}

# 详细健康检查
curl http://localhost:3000/healthz
# 期望: {"status":"healthy",...}
```

### 5. 启动日志预期输出

```
[info] Phase 0: Config/DB/Audit initialized
[info] Phase 1: Schema migration complete
[info] Phase 2a: Core engine graph-store loaded
[info] Phase 2b: Sentinel registry loaded
[info] Phase 2c: Playbook registry loaded
[info] Phase 2d: Cycle registry loaded
[info] Phase 3: Compute + Sentinel + Extension loaded
[info] Phase 4: Vault + PII + Experts + Policy initialized
[info] Phase 5: Cron + MCP + Container started
[info] Server started on port 3000
```

整体启动应在 **30 秒内** 完成。

---

## 用户指南

### 首次登录

1. 打开浏览器访问 `http://your-server:3000/app/login.html`
2. 使用 Demo 账号登录:
   - 用户名: `admin`
   - 密码: `admin`
3. 成功登录后自动跳转到仪表盘

### 仪表盘功能

- **健康卡片**: 3 张 (系统/哨兵/数据新鲜度)
- **Goals 列表**: 当前活跃 Goal
- **告警列表**: 未处理的哨兵告警

### 生成诊断报告

1. 在仪表盘点击「Generate Diagnosis Report」
2. 等待诊断完成（约 1-3 分钟）
3. 查看 CEO 摘要
4. 支持导出 PDF

---

## 健康检查

### 端对端验证

```bash
bash scripts/deploy/verify-bootstrap.sh     # Bootstrap 5阶段验证
bash scripts/deploy/smoke-test.sh           # API 冒烟测试（45+端点）
```

### 关键端点

| 端点 | 期望状态 | 说明 |
|------|---------|------|
| `GET /health` | 200 | 基础健康检查 |
| `GET /healthz` | 200 | 详细健康检查 |
| `GET /api/workspace/:deptId` | 200 | 工作台数据 |
| `GET /api/sentinel/reports` | 200 | 哨兵报告 |
| `GET /api/overflow/dashboard/:id` | 200 | 溢出仪表盘 |

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| `EACCES: permission denied` | 端口被占用 | 修改 `PORT` 环境变量 |
| `LLM_API_KEY not set` | 缺少 API Key | 在 `.env` 中配置 |
| `Cannot find module` | `npm ci` 未执行 | 执行 `npm ci` |
| `SQLITE_CANTOPEN` | 数据目录权限 | `mkdir -p data && chmod 755 data` |
| `ERESOLVE` npm 错误 | 依赖冲突 | `npm install --legacy-peer-deps` |

---

## 备份与恢复

参见 D50 备份方案:

```bash
# 触发备份
node -e "require('./src/deploy/backup-scheduler').triggerBackup()"

# 验证备份
node -e "require('./src/deploy/backup-verify').verifyLatestBackup()"

# 恢复
node -e "require('./src/deploy/recovery-pack').restore('backup-file.zip')"
```

备份文件默认存储在 `./data/backups/`。

---

> 文档: docs/synova/deployment/D101-deployment-checklist.md
> 关联: D101 Deployment Drill + Production Hardening
