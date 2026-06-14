# Anthropic 工程工作流 — 完整设计

> 2026-06-05 | 基于 Anthropic 工程实践 + SynovaAgent 39 条铁律
>
> **原则**: 质量前置，不是事后检查。Anthropic 不靠 code review 发现低级错误——靠自动化门禁在错误发生之前阻断。

---

## 〇、背景

### 我们已有的 (7/7 节点 — 2026-06-14 全量物理强制)

```
任务开始 ──→ 设计 ──→ 实现 ──→ 提交 ──→ 推送 ──→ 部署 ──→ 线上
    │          │         │         │         │         │         │
  ✅ pre-   ✅ pre-   ✅ pre-   ✅ git   ✅ git   ✅ 人工  ✅ cron
   commit    commit    commit    hook     hook
  Gate 0    Gate 1    Gate 2    33项     6道门
  task      SPEC+     接线      硬阻断    禁
  brief     设计文档   审计
```

### 强制方式

| 节点 | 强制方式 | 阻断条件 |
|------|---------|---------|
| ① | pre-commit Gate 0 | task brief 不存在或未填写 → 拒绝提交 |
| ② | pre-commit Gate 1 + Gate 2b | SPEC.md 缺失 / 设计文档无触发定义+结果呈现 → 拒绝提交 |
| ③ | pre-commit Gate 2 + 2a | 接线审计失败 / tsc 非零 / 新文件无 test → 拒绝提交 |
| ④ | pre-commit 33 hard gates | 无超时逃生舱，无分支跳过 |
| ⑤ | pre-push 6 gates | 决策树 + tsc + vitest + iron laws + wire + arch |
| ⑥ | 人工 + post-commit 提醒 | 不可物理强制（需外部 curl） |
| ⑦ | Cron | checkpoint-runtime.sh 每 30 分钟 |

### Anthropic 的标准 (7 节点全覆盖)

```
开始前    设计后    实现后    提交前    推送前    部署后    线上持续
 ①         ②        ③        ④        ⑤        ⑥        ⑦
问自己    对齐      自检      门禁      全量      外部      运行
做什么    架构      做完没    干净吗    能合吗    验证      监控
```

**核心区别**: Anthropic 把 70% 的检查放在写代码之前 (①②)，我们 100% 放在写完之后 (④⑤)。

### 我们的 39 条铁律对应到哪个节点

```
① 开始前:  铁律 0 (协作对齐), 铁律 7 (Done标准), 铁律 34 (分支)
② 设计后:  铁律 1 (垂直切片), 铁律 2 (触发+呈现), 铁律 3 (用户旅程), 
           铁律 25 (OpenClaw边界), 铁律 39 (分层)
③ 实现后:  铁律 0-2 (接线), 铁律 4 (链路完整), 铁律 5 (后端≠功能),
           铁律 8 (Mock清理), 铁律 9 (grep传播), 铁律 11 (degraded),
           铁律 12 (真实路由), 铁律 24 (异常审计), 铁律 31 (降级传播), 
           铁律 32 (错误分类), 铁律 22 (测试目标确认), 铁律 26 (旧文件删除),
           铁律 37 (dead code)
④ 提交前:  铁律 38 (as any), 铁律 35 (自动化), 铁律 36 (全量测试)
⑤ 推送前:  铁律 33 (测试命名), tsc + vitest
⑥ 部署后:  铁律 17 (外部验证), 铁律 18 (nginx), 铁律 19 (pm2),
           铁律 21 (构建后), 铁律 27 (路由隔离)
⑦ 线上:   铁律 29 (调优前指标), 铁律 30 (跨仓库对比)
```

---

## 一、7 节点详解

### 节点 ①: 任务启动 (Task Start)

**`scripts/workflow/task-start.sh`** — 每次接受新任务时自动运行

Anthropic 问的 6 个问题:

```
═══════════════════════════════════════════════════════
  Anthropic Task Start — 写任何代码之前
═══════════════════════════════════════════════════════

📋 Q1: 用户旅程
  这个任务完成后，用户看到什么？请用一句话描述：
  → [输入]

📋 Q2: 影响范围
  涉及哪些模块？
  → grep 相关关键词 → 列出源文件 + 测试文件

📋 Q3: Done 标准 (铁律 7)
  如何验证完成？
  [ ] 入口可触达 (按钮/API/命令)
  [ ] 完整链路走通 (入口→处理→结果)
  [ ] 结果在 UI/日志可见

📋 Q4: 测试计划 (铁律 0-2)
  [ ] 需要新建测试文件吗？ (*.test.ts / *.integration.test.ts / *.e2e.test.ts)
  [ ] 已有测试覆盖这个路径吗？
  [ ] Happy path + sad path 各 ≥ 1 个用例

📋 Q5: 文档计划 (铁律 13/14)
  [ ] 需要新建设计文档吗？ (docs/ 下)
  [ ] 需要更新 INDEX.md 吗？
  [ ] CLAUDE.md 需要追加铁律吗？

📋 Q6: 代码库健康
  tsc: X errors | vitest: X pass / X fail | iron-laws: X/6 通过
  → 如果 vitest 不绿或铁律不通过 → STOP，先修基础

──────────────────────────────────────────────────
  输出: Task Brief (≤ 20 行，记录到 .claude/task-briefs/)
  格式: YYYY-MM-DD-<slug>.md
```

**集成方式**: 
- Claude Code: 在 `CLAUDE.md` 中写"每次接受新任务时先运行 `bash scripts/workflow/task-start.sh`"
- 手动: `bash scripts/workflow/task-start.sh "任务描述"`

---

### 节点 ②: 设计对齐 (Post-Design)

**`scripts/workflow/checkpoint-design.sh`** — Spec/设计文档写完后，写代码之前

Anthropic 问的 5 个问题:

```
═══════════════════════════════════════════════════════
  Anthropic Design Check — 写代码之前最后确认
═══════════════════════════════════════════════════════

🔍 Q1: 设计文档完整性 (铁律 2)
  [ ] 有"触发定义"吗？ (谁来触发/何时触发/触发入口)
  [ ] 有"结果呈现"吗？ (用户在哪看到/什么形式)
  → 缺以上任一项 = 设计未完成，禁止编码

🔍 Q2: 垂直切片检查 (铁律 1)
  [ ] 这个切片包含完整链路吗？ (触发→数据流→结果)
  [ ] 还是只做了某一层？ (API写了但UI没入口?)
  → 水平切片 = 用户不可用 = 不算完成

🔍 Q3: 架构分层检查 (铁律 39)
  [ ] 新模块落在哪一层 (L1-L5)?
  [ ] 有没有跨层引用？ (L2→L4? L3→L5?)
  → 跨层 = 违反架构，重新设计

🔍 Q4: 复用检查
  [ ] 已有模块能直接用吗？ (grep 相似功能)
  [ ] 需要新建还是扩展现有接口？
  → 不要重复造轮子

🔍 Q5: OpenClaw 边界 (铁律 25, 仅涉及Agent间通信时)
  [ ] 这个能力 OpenClaw 原生支持吗？
  [ ] 还是需要我们在底座之上自建？
  → 不要假设底座能做它实际不支持的事

──────────────────────────────────────────────────
  输出: Go / No-Go 信号
  No-Go → 回退修改设计，不写代码
```

---

### 节点 ③: 实现完成 (Post-Implementation)

**`scripts/workflow/checkpoint-impl.sh <新函数名或类名>`** — 声称"完成"之前运行

这是**我们犯错最多的节点**。4 次接线失败、空 catch、degraded 缺失全在这里。

Anthropic 问的 7 个问题:

```
═══════════════════════════════════════════════════════
  Anthropic Implementation Check — 声称完成之前
═══════════════════════════════════════════════════════

🔌 Q1: 接线验证 (铁律 0-2 Step 5 — HARD GATE)
  新函数/类名: ${1}
  → grep -rn "${1}" src/server.ts src/routes/ src/agent/ src/cli.ts
  → 零结果 = 未接线 = 禁止进入下一步
  
  📖 历史: 4 次接线失败 (ViewAdapter, Phase0Engine, ModuleRunner, GraphBridge)

🧪 Q2: 测试状态 (铁律 0-2 Step 4)
  → npx vitest run (全量)
  → 必须全绿，0 失败
  → 新增测试文件数: X
  → Happy + sad 各 ≥ 1: ✅/❌

📝 Q3: 类型检查
  → npx tsc --noEmit (只查 src/)
  → 0 new errors (基线对比)

🛡️ Q4: 铁律门禁
  → as any: X 处 (必须 0)
  → Mock/TODO: X 处 (必须 0)
  → 空 catch: X 处 (必须 ≤ 基线)
  → .only()/.skip(): X 处 (必须 0)

🗑️ Q5: 垃圾回收 (铁律 26 + 37)
  → 旧文件已删除? (如果这是替换重构)
  → grep 确认旧函数名零引用
  → 没有 dist/release 残留

📉 Q6: 降级信号 (铁律 11 + 24 + 31)
  → 每个 catch 块有 log.warn/error? ✅/❌
  → 每个可失败模块返回 degraded: true? ✅/❌
  → 前端/调用方检查 degraded 并展示? ✅/❌

📋 Q7: 文档同步 (铁律 13 + 14)
  → docs/INDEX.md 更新了?
  → 新建文档引用正确?

──────────────────────────────────────────────────
  输出: PASS / FAIL
  FAIL → 修复后重新运行，不得跳过
```

**集成方式**:
- 手动: `bash scripts/workflow/checkpoint-impl.sh "新函数名"`
- Git hook: pre-commit 内调用 (部分检查)
- Claude Code hook: PostToolUse 触发 (未来)

---

### 节点 ④: 提交前 (Pre-Commit) — 已有 ✅

运行: `git commit` 时自动触发 `scripts/pre-commit-check.sh`

6 硬阻断:
- `as any` 零容忍
- Mock/TODO 残留
- CJS require() 残留
- vitest .only()/.skip()
- .env 不含真实 API Key
- console.log (非 CLI/TUI 环境)

+ Secrets 扫描 + 安全检查 + 架构边界

---

### 节点 ⑤: 推送前 (Pre-Push) — 已有 ✅

运行: `git push` 时自动触发 `scripts/pre-push-check.sh`

- tsc --noEmit (只查 src/)
- vitest run (全量)
- iron-laws check (调用 ④)
- npm audit
- Anthropic 决策树 (anthropic-decide.sh)

---

### 节点 ⑥: 部署后 (Post-Deploy)

**`scripts/workflow/checkpoint-deploy.sh`** — 部署到服务器后运行

```
═══════════════════════════════════════════════════════
  Anthropic Deploy Check — 外部验证
═══════════════════════════════════════════════════════

🌐 Q1: 外部可达性 (铁律 17)
  → curl https://<domain>/api/health
  → 预期: 200 + { status: "ok" }

🔗 Q2: 核心端点 (铁律 17)
  → curl https://<domain>/api/ontology/graph/default
  → curl -X POST https://<domain>/api/agent-observer/report -d '{...}'
  → 预期: 200 + 功能正常

📦 Q3: 构建产物 (铁律 21)
  → 检查 dist/ 无旧版本 hash 残留
  → 检查 .pak / .dat / locales/ 完整

🚦 Q4: 路由隔离 (铁律 27, 桌面端)
  → 桌面端 loadURL 走 /app (不是 /)
  → public-landing 不在桌面端 extraResources

🔄 Q5: 进程重启 (铁律 19)
  → pm2 delete + pm2 start (不是 reload)
  → nginx -t && systemctl restart (不是 reload)

──────────────────────────────────────────────────
  输出: PASS / FAIL
  全部 PASS → 部署成功
```

---

### 节点 ⑦: 线上持续 (Runtime Monitoring)

**`scripts/workflow/checkpoint-runtime.sh`** — 周期性运行 (cron)

```
═══════════════════════════════════════════════════════
  Anthropic Runtime Check — 每 30 分钟
═══════════════════════════════════════════════════════

📊 Q1: 错误率
  → grep 最近日志中的 ERROR/WARN 频率
  → 异常飙升 → 告警

🔍 Q2: 降级状态
  → 检查 /api/health 中的 degraded 字段
  → 任何模块 degraded → 通知

🧠 Q3: 内存/磁盘
  → 进程内存 < 阈值
  → SQLite 文件大小 < 阈值
  → 日志文件未超过上限

📋 Q4: 调度任务
  → cron 任务最近一次执行状态
  → 连接器同步 / 每日简报 / 数据库备份
```

---

## 二、我们反复犯的错 → 自动化门禁

| 错误 | 历史次数 | 门禁位置 | 自动化方式 |
|------|---------|----------|-----------|
| **接线遗漏** | 4 次 | ③ 节点 | `wire-check.sh` grep 硬阻断 |
| **as any** | 47 次 | ④ 节点 | pre-commit grep 硬阻断 |
| **空 catch** | 61→0 处 | ③④ 节点 | pre-commit 警告 + ③ checklist |
| **测试 hit 错端口** | 1 次 | ③ 节点 | ③ Q2 确认测试目标 |
| **构建产物残留** | 2 次 | ⑥ 节点 | ⑥ Q3 检查 dist/ |
| **路由混用 (桌面/Web)** | 3 次 | ⑥ 节点 | ⑥ Q4 路由隔离检查 |
| **Jaccard 衡量中文** | 1 次 | ⑦ 节点 | ⑦ Q5 调优前指标验证 |
| **跨仓库误判** | 1 次 | ① 节点 | ① Q2 双向验证 |
| **eval() 误报** | 3 次 | ④ 节点 | check-security.sh 过滤引号字面量 |
| **旧代码残留** | 15+ 文件 | ③ 节点 | ③ Q5 旧文件删除检查 |
| **文档不同步** | 9 份 | ①② 节点 | ① Q5 + ③ Q7 INDEX.md |

---

## 三、文件规划

```
scripts/
├── pre-commit-check.sh          ← 已有 (节点 ④)
├── pre-push-check.sh             ← 已有 (节点 ⑤)
├── anthropic-decide.sh           ← 已有 (决策树)
├── check-security.sh             ← 已有
├── check-architecture.sh         ← 已有
├── check-secrets.sh              ← 已有
│
└── workflow/                     ← 新增
    ├── task-start.sh             ← 节点 ① 任务启动
    ├── checkpoint-design.sh      ← 节点 ② 设计对齐
    ├── checkpoint-impl.sh        ← 节点 ③ 实现完成
    ├── checkpoint-deploy.sh      ← 节点 ⑥ 部署后
    ├── checkpoint-runtime.sh     ← 节点 ⑦ 线上监控
    └── wire-check.sh             ← 接线审计 (节点 ③ 内部调用)

.claude/
└── task-briefs/                  ← 节点 ① 产出的 Task Brief 存储

docs/workflow/
└── ANTHROPIC-WORKFLOW.md        ← 本文档
```

---

## 四、对比总结

| | 旧状态 (2026-06-13) | 新状态 (2026-06-14) |
|---|------|--------|
| 节点数 | 2/7 (④⑤) | **7/7 全覆盖** |
| 接线检查 | 人工记忆 | pre-commit grep 硬阻断 |
| 测试时机 | commit 时 | pre-commit 强制 test-first |
| 部署验证 | 手动 curl | ⑥ 节点自动脚本 |
| 任务开始 | 直接写代码 | pre-commit Gate 0: task brief 强制 |
| 设计评审 | 无 | pre-commit Gate 1+2b: SPEC+设计文档强制 |
| 降级追踪 | 漏掉 | pre-commit 空 catch 硬阻断 |
| 旧代码清理 | 忘记 | pre-commit 自动提醒 |
| 逃生舱 | timeout 放行 / 分支跳过 | **零逃生舱** |
| AI 自律 | ①②③ 全部自律 | **零 AI 自律** |

---

## 五、实施状态

| Phase | 内容 | 状态 |
|-------|------|------|
| **Phase 1** | ③ checkpoint-impl.sh + wire-check.sh | ✅ 已并入 pre-commit |
| **Phase 2** | ① task-start.sh + Task Brief 模板 | ✅ 已并入 pre-commit Gate 0 |
| **Phase 3** | ② checkpoint-design.sh | ✅ 已并入 pre-commit Gate 1+2b |
| **Phase 4** | ⑥ checkpoint-deploy.sh | ✅ 脚本就绪 (人工触发) |
| **Phase 5** | ⑦ checkpoint-runtime.sh | ✅ 脚本就绪 (Cron) |
| **Phase 6** | CLAUDE.md + Claude Code hooks | ✅ 2026-06-14 完成 |
| **Phase 4** | ⑥ checkpoint-deploy.sh | 0.3h | 🟡 中: 部署验证 |
| **Phase 5** | ⑦ checkpoint-runtime.sh | 0.3h | 🟢 低: 运行时监控 |
| **Phase 6** | CLAUDE.md 更新 + Claude Code 集成 | 0.2h | 自动化触发 |
