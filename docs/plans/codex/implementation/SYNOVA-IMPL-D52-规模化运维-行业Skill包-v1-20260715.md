# SynovaAgent — D52 规模化运维+行业Skill包 实施方案 v1.0

> 2026-07-15 | 第9份权威文档（部署运维）第六章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-15 审计确认）

- D47-D51: 部署全链完成 ✅
- Dockerfile: **已存在**（node:22-alpine single-arch）— 需升级为multi-arch(amd64+arm64)
- docker-compose.yml: **已存在** — 需升级
- 行业目录: `extensions/industries/` 已有5个(financial-services/general-enterprise/manufacturing/saas-tech/test-write)
- retail-ecommerce行业: **不存在** — 需新建
- 批量升级工具: **零存在**
- 系统自运维: **零存在**
- 权威文档§6.1: 1→100差异矩阵 — 运维能力必须领先客户增长

---

## 做了什么

### 1. Dockerfile + docker-compose.yml — 多架构升级（修改）

Dockerfile升级:
- `FROM --platform=$BUILDPLATFORM node:22-alpine` — 支持linux/amd64+linux/arm64
- docker-compose.yml增加: healthcheck + watchdog sidecar

### 2. scripts/deploy/batch-upgrade.sh — 批量升级工具（新建）

三级升级策略:
- `--canary`: 10%金丝雀→24h观察→自动回滚
- `--staged`: 50%分阶段→24h→单客户回滚
- `--full`: 100%全量→持续监控

### 3. extensions/industries/retail-ecommerce/ — 行业Skill包（新建）

含package.json + thresholds.json + skill-manifest.json。
现有saas-tech行业包已存在，只新建retail-ecommerce。

### 4. src/deploy/system-self-ops.ts — 系统自运维模块（新建）

复用D49 healthz + D05主动触达引擎推送管道:
- 安全操作(重启哨兵/清理缓存/触发备份)→直接执行+记录日志
- 危险操作(版本回滚/DB修复/Schema迁移)→GA审批卡片
- 监控对象: 哨兵心跳/数据新鲜度/看门狗/备份/LLM延迟/SQLite/磁盘

---

## 不做什么

- 不实现GA仪表盘UI
- 不实现50+完全自动化（当前1-2客户阶段）
- 不重复创建saas-tech行业包（已存在）

---

## 架构层

L4（部署基础设施: Dockerfile + 批量工具 + 自运维）+ 扩展（行业Skill包）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | Dockerfile multi-arch升级 | 1h | Dockerfile + docker-compose.yml |
| 2 | batch-upgrade.sh | 1.5h | scripts/deploy/batch-upgrade.sh |
| 3 | retail-ecommerce行业包 | 0.5h | extensions/industries/retail-ecommerce/ |
| 4 | system-self-ops.ts | 2h | src/deploy/system-self-ops.ts |
| 5 | 测试 | 1.5h | tests/deploy/ |

**总工时: 6.5h（约1天）**

---

## 完成标准

```
[ ] Dockerfile: FROM --platform=$BUILDPLATFORM + multi-arch(amd64+arm64)
[ ] docker-compose.yml: healthcheck + watchdog sidecar
[ ] batch-upgrade.sh: --canary/--staged/--full三级策略+观察期+自动回滚
[ ] retail-ecommerce行业包: package.json+thresholds.json+skill-manifest.json
[ ] system-self-ops.ts: 安全直接/危险审批
[ ] system-self-ops.ts: 复用D05主动触达引擎推送管道(不重复造轮子)
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=8测试: self-ops 5 + batch 3
```

---

## 权威文档引用

- 第9份权威文档: 部署运维权威规范 第六章（多客户规模化运维）
  - §6.1: 1→100差异矩阵 — 运维能力必须领先客户增长
  - §6.2: 系统自运维模块 — 复用主动触达引擎管道
  - §6.3: 批量升级策略 — Canary/Staged/Full
  - §6.4: 行业Skill包分发 — 独立版本号+Feature Flag控制