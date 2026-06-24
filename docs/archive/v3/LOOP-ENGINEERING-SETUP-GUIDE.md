# Loop Engineering v2.5 — 部署与执行指南

> 写给另一个 Claude Code 实例。本指南让你获得与本会话同等的自动化执法能力。
> 版本: v1.0 — 2026-06-15
> 前置条件: 已 clone Synova-Agent 仓库, 已 `npm install`

---

## 一、这是什么

Loop Engineering 是一套**物理执法体系**。不是文档、不是约定、不是"AI 记得要做的事"。

**核心原理**: 每条规则配一个 shell 脚本, 挂在对应的 Git hook 上, 脚本返回非零 = 物理阻断。

```
你 Write 代码
  → PostToolUse hook 自动触发 → verify-incremental.sh (分层验证)
  → 失败 → 错误输出 → 你修正 → 再次 Write → 再次验证
  → 最多 5 轮

你 git commit
  → pre-commit hook 自动触发 → 38 项硬阻断
  → 任一失败 → 提交拒绝 → 必须修
```

---

## 二、执法脚本清单（12 个脚本）

### PreToolUse（写代码前, 自动触发）

| 脚本 | 功能 |
|------|------|
| `scripts/workflow/hook-check-brief.sh` | 检查今日 task brief 是否存在 |
| `scripts/hooks/hook-check-memory.sh` | 扫描 memory/ 匹配当前任务关键词, 注入相关教训 |

### PostToolUse（写代码后, 自动触发）

| 脚本 | 功能 | 阻断 |
|------|------|------|
| `scripts/workflow/verify-incremental.sh` | L1 oxlint → L2 tsc-incremental → L3 vitest → L4 综合门禁 | 分层阻断 + 自动修正(5轮) |

### pre-commit（提交前, 38 项硬阻断）

| 脚本 | 功能 | 阻断 |
|------|------|------|
| `scripts/pre-commit-check.sh` | 33 项铁律 (as any/Mock/CJS/.only/secrets/空catch/tsc/...) | 硬阻断 |
| `scripts/checks/check-empty-modules.sh` | 检测 compute() 返回 null 的空壳模块 | 增量阻断 |
| `scripts/checks/check-manual-drift.sh` | 手册数字断言 vs 代码实际对比 | 阻断 |
| `scripts/checks/check-test-quality.sh` | 新 export 在测试中缺 expect() 断言 | 增量阻断 |
| `scripts/checks/check-wire-full.sh` | 新 export 接线 + bridge 激活检查 | 增量阻断 |
| `scripts/checks/check-vertical-slice.sh` | 入口→交互→结果 三环节完整性 | 增量阻断 |

### pre-push（推送前）

| 脚本 | 功能 |
|------|------|
| `scripts/pre-push-check.sh` | tsc 全量 + vitest 全量 + 铁律门禁 + 架构边界 |

---

## 三、npm 命令速查

```bash
# 安装 Git hooks（首次必做）
npm run hooks:install

# 创建今日 task brief（每次任务开始前必做）
npm run workflow:start "你的任务描述"

# 单项检查
npm run check:iron-laws        # 铁律门禁
npm run check:architecture     # 架构边界
npm run check:empty-modules    # 空壳检测
npm run check:manual-drift     # 手册漂移
npm run check:test-quality     # 测试质量
npm run check:wire-full        # 全量接线
npm run check:vertical-slice   # 垂直切片
npm run check:all              # pre-push 全部门禁

# 工作流检查点
npm run workflow:start         # 任务启动 (G0→G1)
npm run workflow:impl          # 实现完成 (G5→G6)
npm run workflow:design        # 设计对齐 (G2→G3)
npm run workflow:deploy        # 部署后验证

# 验证
npm run lint                   # tsc --noEmit
npm run test                   # vitest run (全量)
```

---

## 四、G0→G7 开发循环（每次任务的标准流程）

### G0: 方向对齐
```
任务请求 → 决策树: 这个任务服务于"增长诊断"吗？
→ 不违宪章 → G1
```
强制方式: SessionStart hook

### G1: 上下文加载
```
读 CLAUDE.md + memory/MEMORY.md + 今日 task brief
→ 理解项目身份、架构层级、当前状态
```
强制方式: `hook-check-brief.sh` (检查 task brief 存在性)

### G2: 错误预防
```
hook-check-memory.sh 自动扫描 memory/ 中与当前任务关键词匹配的教训
→ 注入到上下文 → AI 在写代码前已知"不要犯 X 错误"
```
强制方式: `hook-check-memory.sh` (自动注入上下文)

### G3: 任务分解
```
创建 TaskCreate 子任务 + 明确 Done 标准
Done 标准格式: "入口可触达 + 完整链路走通 + 结果可见"
```
强制方式: task brief Done 标准字段

### G4: 编码
```
单模块修改。as any = 0。空 catch = 0。
每个 catch 必须有 log.warn/log.error + degraded 标记。
```
强制方式: PreToolUse hook (检查 task brief 质量)

### G5: 自测验证
```
verify-incremental.sh 分层验证:
  L1: oxlint 语法 (< 1s)
  L2: tsc --noEmit --incremental (5-15s)
  L3: vitest run (5-30s)
  L4: 接线审计 + 架构边界 + 暗默失败
→ 失败 → 错误输出 → AI 修正 → 再次 Write → 循环 (最多5轮)
```
强制方式: PostToolUse hook

### G6: 接线审计
```
check-vertical-slice.sh: 入口→交互→结果 三环节完整
check-wire-full.sh: 新 export 在 routes/server.ts 中有引用
check-test-quality.sh: 新 export 在测试中有 expect() 断言
```
强制方式: pre-commit (37 项硬阻断)

### G7: 提交 + 回顾
```
git commit → pre-commit 38 项
  通过 → Conventional Commits 格式
  失败 → 拒绝提交 → 修复后重试
push 成功后 → 提醒运行 checkpoint-deploy.sh
新教训写入 memory/
```
强制方式: pre-commit + commit-msg + post-commit hooks

---

## 五、关键规则速记

### 必须遵守的（pre-commit 硬阻断）

```
❌ as any                    → 零容忍, pre-commit 阻断
❌ Mock/TODO 残留            → 零容忍
❌ CJS require()             → 统一 ESM import
❌ vitest .only()/.skip()    → 不得进入 CI
❌ 空 catch 无 log            → 阻断
❌ 空壳模块 (compute→null)    → 增量阻断
❌ 手册漂移                   → 阻断
❌ 新 export 无 expect()      → 增量阻断
❌ 新 export 零引用           → 增量阻断
❌ 入口→交互→结果 不完整       → 增量阻断
❌ 新文件无对应测试            → 阻断
❌ 单次 >1 新 impl 文件       → 阻断
```

### Windows 注意事项

```
- pre-commit 在 Windows 上 tsc 耗时 30-40s
  解决: 手动验证 tsc 通过后, 用 git commit --no-verify
  但不能连续使用 --no-verify (pre-commit 会检测并阻断)
- 严禁 taskkill //IM node.exe (会杀死所有 Node 进程)
- vitest --related 已替换为 vitest run --changed (vitest 4.1+)
```

---

## 六、Task Brief 模板

每次任务开始前, 运行 `npm run workflow:start "任务描述"` 生成。

task brief 必须填写 6 个字段（不填 = pre-commit 阻断）:

```markdown
## 项目身份
Synova-Agent — 组织数字孪生诊断系统

## 架构层级
L[x] — [交互/编排/洞察/本体/存储] 层

## 文档引用
- CLAUDE.md: [相关章节]
- memory/: [相关教训]

## 接口审计
- 依赖接口: [列出调用的接口, 验证真实存在]
- 新增接口: [列出新 export, grep 确认名称不冲突]

## 数据流
[数据从哪来 → 经过什么 → 到哪去]

## 用户旅程 + Done 标准
- 入口: [FDE/API/CLI] → [操作] 
- 交互: [数据如何流转]
- 结果: [用户看到什么]
- Done: [ ] 入口可触达 [ ] 完整链路走通 [ ] 结果可见
```

---

## 七、常用操作手册

### 遇到 pre-commit 阻断

```bash
# 1. 看阻断信息 (会列出文件+行号+规则)
# 2. 修复问题
# 3. 重新验证
npx tsc --noEmit    # 类型检查
npm run test         # 测试
# 4. 重新提交
git add ... && git commit -m "..."
```

### Windows 上 tsc 超时

```bash
# 1. 手动验证
npx tsc --noEmit
npm run test
# 2. 确认通过后
git commit --no-verify -m "..."
# ⚠️ 24h 内最多用 2 次 --no-verify (pre-commit 会阻断第 3 次)
```

### 写新模块的正确姿势

```bash
# 1. 创建 task brief
npm run workflow:start "新增 XXX 模块"

# 2. 创建分支 (如在主分支)
git checkout -b feat/xxx

# 3. 写代码 — 每次 Write 后 PostToolUse 自动验证
#    - 语法错 → L1 oxlint 秒级发现
#    - 类型错 → L2 tsc 15s 内发现
#    - 测试失败 → L3 vitest 发现

# 4. 确认接线
grep -rn "新函数名" src/    # 必须在 routes/server.ts/agent/ 中有结果

# 5. 提交 (pre-commit 38 项检查自动运行)
git add ... && git commit -m "feat: ..."
```

### 写测试的正确姿势

```typescript
// ❌ 错误 — 只有引用, 没有断言
it('works', () => {
  const result = myFunction();
});

// ✅ 正确 — 有 expect()
it('works', () => {
  const result = myFunction();
  expect(result).toBeDefined();
  expect(result.ok).toBe(true);
});

// ✅ 正确 — 边界情况
it('handles empty input', () => {
  expect(() => myFunction('')).toThrow();
});
```

---

## 八、目录结构（你关心的部分）

```
Novis/synova-agent/
├── scripts/
│   ├── pre-commit-check.sh          ← 38 项主门禁
│   ├── pre-push-check.sh            ← push 前全量门禁
│   ├── check-architecture.sh        ← 架构边界
│   ├── check-secrets.sh             ← 凭证扫描
│   ├── hooks/
│   │   └── hook-check-memory.sh     ← G2 自动教训注入
│   ├── checks/
│   │   ├── check-empty-modules.sh   ← 空壳检测
│   │   ├── check-manual-drift.sh    ← 手册漂移
│   │   ├── check-test-quality.sh    ← 测试质量
│   │   ├── check-wire-full.sh       ← 全量接线
│   │   └── check-vertical-slice.sh  ← 垂直切片
│   └── workflow/
│       ├── verify-incremental.sh    ← PostToolUse 分层验证
│       ├── hook-check-brief.sh      ← task brief 检查
│       ├── task-start.sh            ← 创建 task brief
│       └── ...
├── CLAUDE.md                        ← 项目总纲
├── .claude/
│   ├── task-briefs/                 ← 任务简报
│   └── loop-state.json              ← 自动修正循环计数
└── memory/
    ├── MEMORY.md                    ← 教训索引
    └── *.md                         ← 具体教训
```

---

## 九、开始第一个任务

```bash
# Step 1: 安装 hooks (仅首次)
npm run hooks:install

# Step 2: 创建 task brief
npm run workflow:start "你的第一个任务描述"

# Step 3: 按 G0→G7 执行
#   G0: 确认方向
#   G1: 读 CLAUDE.md + task brief
#   G2: hook-check-memory 自动注入教训
#   G3: 分解子任务 + 写 Done 标准
#   G4: 编码 (Write → PostToolUse 自动验证 → 修正 → 循环)
#   G5: 自测通过
#   G6: 接线确认
#   G7: git commit → pre-commit 38 项 → 通过 → 提交成功
```

---

## 附录：铁律原文引用

> 铁律 35: 自动化优先。能变 tsc/oxlint/ESLint 规则的不靠文档, 能写 check-*.sh 的不靠 review。
> 铁律 38: `as any` 零容忍。pre-commit 硬阻断。
> 铁律 4: 交付不完整——写了代码没接线。入口 → 交互 → 结果, 三环节缺一不可交付。
> 铁律 5: 后端能力 ≠ 用户可用的功能。追踪调用链: 谁 import？谁调用？结果在哪呈现？
> 铁律 7: 每次接受任务确认 Done 标准。默认: 入口可触达 + 完整链路走通 + 结果可见。
