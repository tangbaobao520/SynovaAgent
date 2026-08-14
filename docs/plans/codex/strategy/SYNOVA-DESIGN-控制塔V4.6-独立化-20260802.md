<!--
  SYNOVA-DESIGN: 控制塔 V4.6.0 独立化 — 全面审计 + 迭代方案
  版本: v1.4 | 2026-08-02 | 状态: 设计稿 (待创始人确认后转 D311-D314 dev doc) — 技术栈定为 Python + hook 轻量触发
  依据: D292/D300 耗时复盘 + 08-02 stash 事故 + 预存 CI 失败 + D286/D292 并行冲突
-->

# 控制塔 V4.6.0 独立化 — 全面审计与迭代方案

> 目标: 控制塔从"session 触发的脚本集合"升级为**独立常驻系统**——不绑定任何 session、每新开 session 自动运行、有日志与版本日志、能从每次错误中学习并生成防复发规则。

---

## 零、产品定位（控制塔 = Synova 产品组件，不只是开发门禁）

> **权威文档17-v2 原文**（2026-07-29 L41-45）："自诊断系统**不是'研发工具'——是 Synova 产品的内置能力**。它在两种模式下运行：研发模式（代码完成度）与产品模式（客户环境运行健康度，使用者=企业管理员+GA）。"
>
> 控制塔 = 权威文档17「自诊断系统」的**双模式实现**（A线 G6 已验证"自诊断失真"风险）。V4.6.0 独立化的架构，同时服务两个目标：

> **DeepSeek 哲学参照**（[《梁文锋融资问答》](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\DeepSeek哲学-控制塔借鉴-20260802.md) #87-88）："首先要对我们自己有用……首先得保证我们自己好用。" 控制塔的第一价值 = 让 Claude Code + Codex 开发 Synova 的过程更快（当前 70% 效率损失 → 目标 <10%）；第二价值 = Synova 产品自身的自诊断（双模式）。详见参照 note 的 12 条哲学映射。

| 视角 | 现在 | 未来 |
|------|------|------|
| 研发模式 | Claude Code / Codex 交付质量门禁（12 组 pre-commit + 信号 + 完成度） | 多 agent 协作的质量协调层 |
| 产品模式 | 控制塔自身可观测性（自诊断不失真） | **客户环境运行健康度检测**（product-health.py 五维 → 诊断报告可信度标记，权威文档17 v2 已设计：误报率>30%降权重、连续3次无用→告警、客户设备离线补偿） |

**价值度量（DeepSeek"成本/时间第一"哲学）**：

| 指标 | 当前 | 目标 |
|------|------|------|
| 开发效率损失率 | ~70%（D292 复盘：事故+等待+格式摩擦） | **<10%** |
| 单任务平均耗时 | D292 3.2h / D300 12h | 趋近纯代码时间×1.5 |
| 同类事故复发数 | stash/brief/CI 预存多起 | **0**（学习闭环生效） |
| 门禁开销 | pre-commit <10s / pre-push <3s | 不增 |

**架构约束（V4.6.0 起强制）**：
1. **技术栈务实原则（修正）**：控制塔组件用 **Python**（微服务性质，现状 8 组件全 Python，复用成本最低；L5 数据层已有 Python 先例）；产品侧深度集成时用 TS 写 src/ 集成层读 JSON——**产品化靠接口契约，不靠技术栈统一**
2. **接口可产品化**：控制塔状态/日志/信号可导出给 cockpit（`generate-dashboard.py`）渲染；未来暴露为 MCP 工具
3. **状态目录独立**：`.codex/control-tower/` 不依赖 `.claude/`（session 解耦）
4. **自身也过门禁**：控制塔脚本/代码同样受 12 组 pre-commit + as any=0 + 铁律 24/31 约束
5. **版本与日志是产品契约**：VERSION.md + 日志五件套是控制塔的"对外接口"，升级必须记录（§2.7/§2.8）
6. **双模式同引擎**：研发模式（17 门禁/六条件完成度）与产品模式（五维运行健康度）共享同一 daemon/日志/信号/学习闭环引擎——未来客户部署只换检测器，不换底座（权威文档17 §3.2 双模式设计落地）

---

## 一、全面审计（基于 D292/D300 耗时复盘 + 实测证据）

### 1.0 Claude Code 反馈逐项覆盖矩阵

| 反馈项 | 来源 | 耗时 | 方案 | 覆盖 |
|--------|------|------|------|:---:|
| G12/G6 brief 格式卡点（模板-解析器漂移） | D292 | 30min | M3 check-brief-parseable + 模板同源 | ✅ |
| git stash 事故（hook 与 git 操作冲突） | D292/D300 | 45min | M2 禁 stash + baseline-check + hook 策略细化 | ✅ |
| 外部进程竞争阻塞 push（中间态污染） | D292 | 60min | M1 pre-push 改基 + 中间态保护 | ✅ |
| **vitest 全量×5 浪费** | D300 | 85min | **M4b 验证策略（新增）** | ⚠️ 本次补 |
| 跨 session 污染（brief 覆盖/暂存被卷走） | D300 | 60min | M1b 暂存区隔离 + M1c 等待管理 | ✅ |
| **CI 往返修复 Check4（本地假绿）** | D300 | 60min | M5b 静默吞错检测 | ✅ |
| pre-commit 格式拦截×2 | D300 | 15min | M3 | ✅ |
| 并行空等（58% 时间） | D300 | 7h | M1c 等待显式化 + 错峰 | ✅ |
| 拆分提交善后 | D300 | 30min | M1b 快提交 + 显式路径 commit | ✅ |
| **dev doc 写集/接口误判 3 处** | D286 | — | **M3b dev doc 写集验证（新增）** | ⚠️ 本次补 |
| synova-commit 120s 超时误写 bypass.log | D286 | — | 已修复（05ab9d1，TIMEOUT 300） | ✅ 已解决 |
| 读文档/接口审计、task-start、实现、push、CI 查询 | D292/D300 | 正常 | 保持（已是最优） | ✅ |

### 1.1 时间损失汇总

| 任务 | 总耗时 | 效率损失 | 占比 | 代码占比 |
|------|--------|---------|:---:|:---:|
| D292 (L2→L4) | ~3.2h | 事故 45min + 外部竞争 60min + 格式卡点 30min ≈ **135min** | **70%+** | 10% |
| D300 (黄金门禁) | ~12h (含 7h 并行等待) | vitest 全量×5 ≈ 85min + CI 往返 60min + 格式×2 15min ≈ **160min 可控浪费** | 22% | 12% |

### 1.2 四大根因（已实测核实）

| # | 根因 | 实测证据 | 影响 |
|---|------|---------|------|
| R1 | **多会话共享工作区无协调** | D286 实际改 15 个 src/ 文件（mcp×2/routes×4/adapters×2/conversation-engine 等），而 D292 §6.5 仍写"只动 packages/, 零共享"——**文档过时**（D286 v2.0 重写时未同步 D292）；pre-push `vitest --changed` 基于工作区 → 并行中间态退化成全量 | D292 70% 损失直接来源 |
| R2 | **hook 与 git 操作冲突** | PreToolUse hook 每条命令前写 memory/checkpoint；git stash/pop 间隙被 hook 改文件 → pop 反复冲突 | 08-02 stash 事故（39 tracked + 615 untracked 卷入） |
| R3 | **brief 模板与解析器漂移** | generate-task-brief.py 自由格式 vs G12 awk 解析器要求路径开头；"## 本任务在哪一层"无冒号不匹配；Windows 输出 GBK 乱码无法读详情 | 每次任务 15-30min 摩擦 |
| R4 | **存量错误无基线豁免** | tsc 29 个存量错误（_extinct 25 + src 4）；CI 2 个预存失败（admin-knowledge L1→L4 + npm audit）连续 4 任务报告 | 信号死亡 + 每单解释 |

### 1.3 控制塔结构性缺陷

| 缺陷 | 现状 | 后果 |
|------|------|------|
| 无独立进程 | 控制塔 = 脚本集合，由 session 触发 | 无常驻监控、无全局状态 |
| 状态耦合 session | current-brief/plan.json/task-briefs 在 `.claude/` | session 互踩（D292 覆盖 D300 brief） |
| 无版本日志 | AGENTS.md 版本滞后（V4.4.5 vs 实际 V4.5.1）被研究 session 抓包 | 文档-代码漂移成常态 |
| 无错误学习闭环 | memory/ 有教训但无"教训→门禁"自动转化 | stash/brief/vitest 同类错误重复发生 |
| 无基线豁免 | tsc/CI 存量噪音无记录 | 无法区分"存量 vs 新增" |

---

## 二、V4.6.0 架构：独立控制塔

### 2.0 源头设计原则（来自 2026-07-22 创始人控制塔系统研究，V4.6.0 必须继承）

> 系统性通读源头研究后确认：控制塔每个组件（Gatekeeper/审计器/写入锁/契约存档器/注射器）都有一等公民的**自身错误处理与降级**设计。V4.6.0 升级绝不能丢掉这条哲学。

| 源头原则 | 出处 | V4.6.0 落实 |
|---------|------|------------|
| **绝不静默阻断（fail-open）**：网守自身崩溃 → 允许提交 + 红色信号 + degraded-events.log，绝不用"崩溃=拒绝" | Gatekeeper Ch2 §4.1 | daemon/门禁自身异常 → fail-open + 自身信号 + 事件日志（§2.1.5） |
| **收窄通道而非剥夺权限**：Agent 只能走 synova-commit 这扇门，门内集成检查 | Gatekeeper Ch2 §2.1 | 保留；V4.6.0 新增门禁同样收进 synova-commit |
| **组件自身错误处理章节**：每个组件必须有"我崩了怎么办" | 审计器 §5 / 写入锁 §5 / 契约器 §7 | V4.6.0 每个新机制（M1-M5）自带降级行为（§2.1.5 表） |
| **写入锁**：多 Agent 文件锁（acquire/wait/release/超时/孤儿清理/单 Agent 跳过） | 写入锁 Ch4 | M1b/M1c 基于写入锁扩展，不另起炉灶 |
| **版本一致性验证**：注入片段与权威文档版本比对 | 注射器 Ch1 §5 | 控制塔自身脚本版本 vs VERSION.md 自检（§2.1.5） |
| **GREEN/YELLOW/RED 自身信号** + 加权得分（Gate 16: 网守 25%+审计器 25%+…≥60% pass） | 附录A Gate 16 | daemon 输出控制塔健康得分 + 三态信号 |
| **CP1-CP4 交接点检查**：Research→Dev Doc→Claude Code→审计 四交接点 | 控制塔 v3-FINAL §1 | M1c 阶段管理与交接点框架对齐 |
| **#CRITERIA 条件归属**：task brief 必填 A/B/C/D 条件 | v3-FINAL §1.4 | M3 brief 契约增加 #CRITERIA 字段 |

### 2.1.5 控制塔自身弹性（fail-open 哲学，V4.6.0 一等公民）

**自身健康五维检测**（复用权威文档17 产品模式框架）：

| 维度 | 检测 | 降级 |
|------|------|------|
| 门禁组件健康 | check-gates-v2.py/verify-parallel.sh 等可运行 | 组件异常 → 该门禁 fail-open + YELLOW |
| 信号新鲜度 | signals/*.json mtime < 24h | 信号过期 → RED + 原因 |
| 基线完整性 | baseline/*.json 存在且 schema 合法 | 基线缺失 → 跳过基线豁免，按全量判定 |
| 日志可写 | logs/ 可写、轮转正常 | 不可写 → 告警（不阻断业务） |
| 版本一致性 | 各脚本头部版本号 vs VERSION.md | 不一致 → RED + 列出差异文件 |

**自身信号**（写入 `.codex/control-tower/health.json`）：

```json
{
  "version": "4.6.0",
  "health": "green|yellow|red",
  "score": 0-100,
  "checks": { "gates": "ok", "signals": "stale", "baseline": "ok", "logs": "ok", "version": "ok" },
  "degradedSince": "",
  "lastHealthyAt": ""
}
```

**fail-open 规则**：任何控制塔组件自身异常 → 该组件 fail-open（不阻断业务）+ 记入 `degraded-events.log` + 仪表盘 YELLOW/RED；**绝不静默**。

**版本一致性自检**：`control-tower self-check` 比对所有 `scripts/control-tower/*` + `scripts/audit/*` 头部版本号 vs VERSION.md——不一致 → RED。

### 2.1 目标架构

```
控制塔 (独立于任何 session)
├── 触发: git hook 轻量触发（V4.6.0 阶段，非真常驻）——SessionStart 自动 attach + 门禁全量触发；常驻 daemon 延后到产品化阶段（Python）
├── 状态目录: .codex/control-tower/  (不再依赖 .claude/)
│   ├── session-registry.json   活跃 session 登记 (pid/start/brief/写集)
│   ├── worktree-state.json     工作区心跳 (git status 摘要 + 锁)
│   ├── baseline/               tsc-errors.json / ci-failures.json / test-baseline.json
│   ├── logs/                   runtime.log / gate.log / incident.log / degraded-events.log / version.log
│   └── VERSION.md              控制塔自身版本 + 变更历史
├── session 自动 attach: SessionStart hook → 注册 + 基线对比 + 工作区健康检查
└── 持续学习闭环 (DeepSeek 阶梯 #17-21): incident → 根因归类 → 规则生成 → 新门禁/工具/基线 → 验证 → **控制塔自我改进** (接近"自我迭代")
```

### 2.2 五层迭代机制（优先级 1>2>3>4>5）

#### M1 多会话协调（直接消除 70% 损失）

| 子项 | 方案 | 验收 |
|------|------|------|
| 并行声明物理验证 | `scripts/control-tower/verify-parallel.sh`：读 dev doc 写集表（文件清单），两个"可并行"任务自动比对零交集；有交集 → 阻断并指出重叠文件 | D286/D292 这类"可并行"声明会被自动拦下 |
| pre-push 改基 | `vitest --changed` 改用 `git diff origin/feat/prompt-architecture..HEAD`（只测本次推送提交），不测工作区杂散变更 | 并行中间态不再污染 push |
| 工作区中间态保护 | push 前检查未提交 src/ 改动归属（session-registry），他人改动 → 警告/阻断 | 无人能 push 被污染的中间态 |
| **暂存区隔离（M1b）** | ① 复用写入锁（Ch4 源头设计）：文件写集登记在 session-registry，`git add` 后须立即 `git commit`；② 提交前校验暂存区：若含**他人**认领的文件 → 阻断并提示（防 D286 卷走 D300 暂存类事故）；③ `git commit` 只提交本次 brief 写集内文件（`git commit -- <files>` 显式路径，不用 `git commit -a`） | D286 卷走 D300 暂存类事故被拦截 |
| **并行等待管理（M1c）** | ① session-registry 记录阶段（对齐 CP1-CP4 交接点框架：研究→开发→验证→提交）；② 验证阶段错开——检测他 session 在跑全量验证时提示错峰；③ 任务依赖图：共享文件或同目录中间态 → 提示"先提交再验证"；④ 等待显式化：hook 输出"等待原因 + 建议动作" | D300 的 7 小时空等减少/可解释 |

#### M2 hook×git 兼容 + 官方基线工具

| 子项 | 方案 | 验收 |
|------|------|------|
| hook 识别 git 操作 | PreToolUse 检测命令含 stash/checkout/reset → 跳过 memory/checkpoint 写入或延迟到命令后 | stash/pop 不再因 hook 写文件而冲突 |
| hook 写文件策略细化 | 明确规则：含 `git stash|checkout|reset|revert|merge` 的命令 → **完全跳过** hook 写文件；其余命令 → 写文件**延迟到命令退出后**（PostToolUse 统一写），避免命令间隙被并行 hook 改文件 | 消除"pop 冲突在不同文件"类随机失败 |
| baseline-check.sh | 官方工具对比 HEAD vs 工作区：tsc 错误/测试失败/审计发现三基线，输出"存量 N 条 + 新增 M 条" | agent 不再需要自行 stash 判断基线 |
| 禁止 stash 铁律 | AGENTS.md + hook 检测 `git stash` → 提示用 baseline-check.sh/worktree | 08-02 事故不复发 |

#### M3 brief 契约

| 子项 | 方案 | 验收 |
|------|------|------|
| 模板-解析器同源 | generate-task-brief.py 输出即符合 G12 awk 解析（路径优先 + 标题带冒号）；模板与解析器共用同一 schema 常量；**模板含 #CRITERIA 必填字段（A/B/C/D 条件归属，v3-FINAL 设计）** | 新 brief 首次填写即通过 |
| check-brief-parseable.sh | 填完 brief 立即用 G12 同一解析器验证（SessionStart/PreToolUse 触发） | 格式问题提交前 5 秒暴露 |
| **dev doc 写集验证（M3b）** | `check-dev-doc-write-set.sh`：解析 dev doc 写集表 → grep 代码 → 输出"声明 vs 实际"差异（防 D286 16→17 引用、方法数误判类问题）；dev doc 交付即验证 | dev doc 写集与代码零漂移 |

#### M4 基线豁免（+ 清理存量）

| 子项 | 方案 | 验收 |
|------|------|------|
| tsc 基线清单 | baseline/tsc-errors.json 记录已知 文件:行号；verify-incremental L2 只阻断"新增错误" | 29 个存量错误不再触发 L2 失败 |
| CI 基线 | 已知失败 job 清单；CI 判定"不引入新失败即过"（已有雏形 L44-61，扩展到 Architecture/audit） | CI 从"全绿才算过"→"无新增即过" |
| 清理存量 | D309（admin-knowledge L1→L4）+ D310（_extinct 25 错误）+ npm audit 决策 | Architecture/TypeScript job 转绿 |
| **验证策略（M4b）** | 全量 vitest 每任务**最多 1 次**（记录在 worktree-state.json 的 verification 时间戳）；之后只跑定向 `tests/<任务域>/`；"存量 vs 新增"判定依赖 CI 基线（M4）而非重复全量 | vitest 全量×5 类浪费归零 |

#### M5 编码

| 子项 | 方案 |
|------|------|
| UTF-8 强制 | 所有 hook/脚本：`chcp 65001`、`PYTHONIOENCODING=utf-8`、bash `LC_ALL=C.UTF-8`、G12 输出 `iconv` 兜底 |
| 静默吞错检测（M5b） | 脚本级铁律 24 执行：新增 `check-silent-swallow.sh` 扫描 scripts/ 中 `2>/dev/null` 吞错点（D300 Check4 假绿根因）——CI 执行脚本必须无静默降级或显式注释+degraded 输出 | Check4 类"本地假绿"不复发 |

### 2.3 日志与版本体系

| 日志 | 内容 | 写入时机 |
|------|------|---------|
| runtime.log | 每次门禁/工具运行：谁/何时/命令/结果/耗时 | hook + 门禁执行时 |
| gate.log | 每个 session 的 hook 调用轨迹（写文件/stash/提交序列） | PreToolUse/PostToolUse |
| incident.log | 每次事故/错误：时间/现象/根因/涉及 session/修复 | 人工或自动记录 |
| version.log + VERSION.md | 控制塔自身每次迭代：版本号/变更/日期/关联 incident | 每次迭代发布 |

### 2.4 错误学习闭环（防复发）

```
incident → incident.log 记录
    ↓
根因归类 (R1-R4 + 新类别)
    ↓
规则生成: 每类根因 → 门禁(拦截) / 工具(辅助) / 基线(豁免) / 文档(约束)
    ↓
验证: 下一个同类 incident 被拦截 = 闭环成功 (VERSION.md bump)
```

**首批待转化 incident**：

| incident | 转化产物 | 对应机制 |
|----------|---------|---------|
| 08-02 stash 事故 | 禁 stash 铁律 + baseline-check.sh | M2 |
| D292/D286 并行冲突 | verify-parallel.sh 写集比对 | M1 |
| brief 格式失败×N | check-brief-parseable.sh + 模板同源 | M3 |
| vitest 全量×5 浪费 | 验证策略文档（全量 1 次 + 定向）+ CI 判定依赖 | M4/流程 |
| CI 预存失败×4 任务 | baseline/ci-failures.json + D309/D310 | M4 |
| D286 卷走 D300 暂存 | 暂存区隔离（M1b） | M1 |
| D300 并行空等 7h | 并行等待管理（M1c） | M1 |
| Check4 本地假绿 | 静默吞错检测（M5b） | M5 |

### 2.5 测试先行要求（铁律 0-2/47/48 强制）

> 所有 V4.6.0 任务遵守 `spec → test → impl → wire`。每个机制**先写测试（red）→ 实现（green）**，测试非空壳（≥3 断言，覆盖正常/降级/边界）：

| D# | 必须先行编写的测试（red→green） |
|:---:|------|
| D311 | `verify-parallel.test.sh`：构造 2 个"可并行"任务共享 1 文件 → 被拦；零交集 → 放行。`staging-guard.test`：暂存区含他人文件 → 阻断。`wait-management.test`：注册表阶段判定 |
| D312 | `baseline-check.test.sh`：构造"存量 3 + 新增 2"→ 输出正确区分。`hook-git-detect.test`：stash 命令 → hook 跳过写文件。`ban-stash.test`：stash 被提示 |
| D313 | `brief-parseable.test`：模板输出直接通过 G12 解析器。`write-set-check.test`：dev doc 声明 vs 代码 grep 一致/不一致两态。`utf8.test`：GBK 输入 → UTF-8 输出 |
| D314 | `baseline-exemption.test`：存量 tsc 错误不阻断、新增才阻断。`daemon-smoke.test`：daemon 启动/注册/日志写入。`incident-loop.test`：记录 incident → 规则生成 → 模拟同类 → 被拦 |

> 控制塔自身代码同样遵守：as any=0、铁律 24/31（日志+degraded）、铁律 38、pre-commit 2b（新文件配对测试）。

### 2.6 版本管理规则（控制塔产品契约）

```
版本号: MAJOR.MINOR.PATCH
- PATCH (第三位): 小升级 — bug 修复/门禁微调 → 4.6.0 → 4.6.1
- MINOR (第二位): 中升级 — 新机制/新组件/新门禁组 → 4.6.0 → 4.7.0
- MAJOR (第一位): 大改版 — 架构重构/产品化里程碑 → 4.6.0 → 5.0.0
```

**VERSION.md 每次迭代必填**：

```markdown
## V4.6.1 (2026-08-02)
- 变更: ...
- 关联 incident: INC-XXX
- 新增/修改机制: ...
- 验证: 测试 X/Y 通过 | pre-commit 12 组通过
- 作者: session/人
```

**规则**：版本只增不减；version.log 只追加不覆盖；任何门禁/工具/脚本行为变化 = 必须 bump（PATCH 起步）；bump 必须与代码同 commit（防止文档滞后——V4.4.5 事故的直接对策）。

### 2.7 日志管理规范（五件套 + 运维策略）

| 日志 | 格式 | 写入时机 | 轮转/保留 |
|------|------|---------|----------|
| runtime.log | JSON Lines（时间/会话/命令/结果/耗时） | 每次门禁+工具运行 | 10MB×5，保留 90 天 |
| gate.log | 每 hook 调用一行（session/命令/跳过/结果） | PreToolUse/PostToolUse | 同上 |
| incident.log | schema：`{id,time,symptom,rootCause,sessions,fix,version}` | 事故/错误发生时 | 只追加，永久 |
| degraded-events.log | 控制塔**自身**降级事件（组件/原因/降级级别/fail-open 决定） | 自身健康检查异常时 | 只追加，永久（源头 Gatekeeper 设计延续） |
| version.log | 与 VERSION.md 同步的追加流 | 每次 bump | 只追加，永久 |

**规范**：全部 UTF-8、时间 UTC+8 ISO8601；`archive/` 子目录按周归档；日志目录 `.codex/control-tower/logs/` 与 `.claude/` 解耦；控制塔日志可被 cockpit 读取（产品化接口）。

---

### 2.8 未决问题清单（此前审计发现，全部登记归属）

| # | 问题 | 归属 | 状态 |
|---|------|------|------|
| U1 | wiring 检查 715 假阳性（type/interface export 计入） | D293/D294 前置收紧 audit-check [4] | 队列待办 |
| U2 | import 断链 20 处 | NEW 任务 | 队列待办 |
| U3 | 快照 degraded=False 但 degradedReason 非空 | D295 收尾 | 队列待办 |
| U4 | pre-commit-check.sh echo 分母不一致（组 1/8~12/12） | 并入 D312（M2 脚本清理） | 本次补入 |
| U5 | pre-push-check.sh 注释 "8 组"→12 组 | D300 提交后立即改 | 挂起待 D300 |
| U6 | B-G5 哨兵口径（50 vs 45+4）、N14 去重窗口（30min vs 5min） | 文档口径同步（我维护） | 待办 |
| U7 | 空壳 .json（152B, component=""） | 清理（恢复 v4.9 时） | 待办 |
| U8 | gate-status 接近 24h 新鲜度 | 演示前重跑（操作项） | 待办 |
| U9 | npm audit electron CVE | 创始人决策（升级 vs 豁免） | ⏸ 待决策 |
| U10 | 60 架构违规（D292 4 + D306 56） | D292 已完成；D306 待排期 | 队列 |

---

## 三、实施路径（转 D 任务，版本 V4.6.0）

| D# | 任务 | 内容 | 测试先行 | 估时 |
|:---:|------|------|:---:|:---:|
| D311 | M1 多会话协调 | verify-parallel.sh + pre-push 改基 + 中间态保护 + M1b 暂存区隔离 + M1c 等待管理 | §2.5 三项 | 1.5d |
| D312 | M2 基线工具 | baseline-check.sh + hook git 识别/跳过 + 禁 stash 铁律 + U4 脚本分母清理 | §2.5 三项 | 1d |
| D313 | M3+M5 | brief 模板-解析器同源 + check-brief-parseable + M3b 写集验证 + UTF-8 强制 + M5b 静默吞错 | §2.5 三项 | 1d |
| D314 | M4 + 独立化底座 | tsc/CI 基线豁免 + M4b 验证策略 + **轻量 hook 触发(SessionStart attach + 门禁触发, Python)** + **自身健康五维检测/fail-open/health.json/版本一致性自检** + 日志五件套(含 degraded-events) + VERSION.md + 学习闭环 | §2.5 三项 | 2d |
| 收尾 | V4.6.0 发布 | D309/D310/npm audit 决策 + 控制塔版本 bump + VERSION.md 首发 + 迁移文档 | — | 0.5d |

总估时 ~6d。优先级：D311 > D312 > D313 > D314。全部完成后控制塔 = **V4.6.0** 首发。

---

## 四、验收标准（V4.6.0 发布门禁）

**测试先行**：
1. §2.5 全部测试已先写并 red→green（每个 D 任务提交时可查 red 记录）
2. 控制塔自身测试：as any=0、新文件配对测试、铁律 24/31 达标

**机制生效**：
3. 新开 session 控制塔自动运行（SessionStart attach，gate.log 可查）
4. 控制塔状态/日志在 `.codex/control-tower/`，与 `.claude/` 零依赖
5. "可并行"声明被物理验证（构造共享文件场景 → verify-parallel.sh exit 1）
6. stash 被 hook 拦截并提示 baseline-check.sh
7. pre-push vitest 基于 `origin..HEAD`，并行中间态不污染 push
8. 暂存区含他人文件 → 提交被阻断（M1b）
9. tsc/CI 存量错误基线豁免（存量不阻断、新增才阻断）；D309/D310 清理后 Architecture/TypeScript job 转绿
10. vitest 全量每任务 ≤1 次（M4b 时间戳可查）

**版本与日志**：
11. VERSION.md 首发 V4.6.0，含版本规则说明（§2.6）
12. 日志五件套（runtime/gate/incident/degraded-events/version）存在且格式符合 §2.7；incident→规则闭环有 ≥1 个可追溯案例

**产品化约束**：
13. 控制塔由 hook 自动触发（SessionStart attach + 门禁触发），组件 Python 实现，状态/日志 JSON 可被 generate-dashboard.py 读取；常驻 daemon 延后到产品化阶段（记录于 VERSION.md 路线）
14. 全部 12 组 pre-commit 仍通过；无 --no-verify
15. **fail-open 实测**：模拟 verify-parallel.sh 崩溃 → 门禁不阻断业务 + health.json=red + degraded-events.log 有记录（源头哲学验收）
16. **版本一致性实测**：改 1 个脚本头部版本号（不同步 VERSION.md）→ 自身自检 RED 并列出文件
17. **写入锁兼容**：M1b/M1c 复用现有 lock-manager.sh，不引入第二套锁
