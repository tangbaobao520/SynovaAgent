# CLAUDE.md — ClawOrg-BOX 项目全貌

> ⚠️ 2026-05-21: docs/ 目录已重构。活跃文档移至 `docs/01~11-*/`，旧文档全部归档到 `docs/Archive-归档/`。见 `docs/INDEX.md` 获取完整索引。以下路径引用可能已过时——请用 find/search 确认实际位置。

<!-- TUI-INSTRUCTIONS:START (TUI 专属区块，不影响 Claude Code) -->
## 🤖 TUI 专属：每次任务前强制阅读

**执行任何工作前，先用 `read_file` 阅读以下文件：**

1. **`docs/07-Lessons-踩坑录/LESSONS-全量经验教训库-20260523.md`** — 25 条铁律 + 全部历史错误
2. **`.deepseek/MUST_READ.md`** — TUI 自身 4 条铁律速览

> 跳过阅读直接开干的后果已验证：write_file 截断 CJK 内容 6 次、批写并行覆盖、大文件全量写入损坏。
<!-- TUI-INSTRUCTIONS:END -->

---

## ⚠️ 每次工作前必读 — 38 条铁律（2026-06-01 更新，铁律 0-2：测试先行 — Anthropic 标准开发流程）

> 以下铁律来自 2026-05-07 至今的全部实际错误。**每次接受任务时必须逐条核对。**
> 铁律 0：协作对齐前置。铁律 1-20：禁止项（不要做什么）。铁律 21-31：流程关卡（做之前必须过什么关）。

### 零、协作对齐铁律（最高优先级——所有权重在此）

**铁律 0. 协作对齐前置——讨论方向/功能/需求时，先对齐再动手，禁止假设共识。**

创始人不是技术出身，对架构和代码没有基础。他对产品方向和用户价值有清晰判断，但可能无法判断技术可行性。你是技术执行者，但你可能错误理解他的意图、用术语跳过关键细节、或假设"聊得差不多了"就自己发挥。

这条铁律约束的是**每一次写代码之前**的对齐过程。对齐没做好，切片再垂直也是切错方向。

**强制步骤**（每次讨论新方向/新功能/新需求时，写代码之前必须过）：

```
[ ] 用户旅程翻译：把需求翻译成"谁→在什么场景下→做了什么→看到了什么结果"，用产品语言复述给创始人确认
[ ] 概念降维：涉及技术概念时，解释它是什么、为什么用它、对用户意味着什么。禁止用术语一笔带过
[ ] 显式对齐确认：用产品语言总结"所以我们要做的是 X，用户会看到 Y"，等待创始人确认后再动手
[ ] 技术/战略纠正：如果创始人方向有技术不可行性或战略风险，必须解释为什么不成立、用具体场景说明后果、给出替代方案。禁止在不解释原因的情况下直接否定
```

**禁止**：
- 禁止觉得"聊得差不多了"就自己开始写代码——必须等创始人确认
- 禁止用技术术语掩盖产品决策（"走 pipeline 就行"）
- 禁止假设创始人理解了你说的技术概念——假设他不懂，用产品语言重讲
- 禁止跳过用户旅程直接讨论技术方案——先确认"用户看到什么"，再聊"怎么实现"

**和已有铁律的关系**：这条铁律是铁律 1-4 的前置条件。铁律 1-4 约束"怎么交付"，铁律 0 约束"交付之前怎么对齐"。对齐没做好，切片再垂直也是切错方向。

**铁律 0-2. 测试先行 + 接线验收——每个模块的严格开发流程（对标 Anthropic 工程标准）。**

Claw-Code 每个模块 = spec → test → impl → wire → review → merge。不是"写完代码补测试"，是"测试本身就是规范文档"。**单元测试绿 ≠ 产品可用，组件没人调用就是死代码。**

**强制步骤**（每次新建模块或修改函数签名时）：

```
[ ] Step 1: Spec — 写接口签名 + 算法选择 + 性能目标 + 边界条件 (≤ 50 行)
              必须包含"接入点"字段: 本模块被谁调用？在哪个生产文件中 import？
[ ] Step 2: Test — 先写测试文件。每个 public 函数 ≥ 2 个用例 (happy + sad)。
              测试即规范——测试通过 = 功能完成。
[ ] Step 3: Impl — 实现代码。只对标 spec 和测试，不对标"感觉"。
[ ] Step 4: Verify — npx tsc --noEmit + npx vitest run → 全绿 + coverage 不降
[ ] Step 5: WIRE CHECK — 接线验证。grep 确认新函数/类名出现在生产入口文件中:
              grep -rn "新函数名" src/tui/ src/cli.ts src/index.ts src/server.ts
              如果零结果 → 未接线 → 不算完成 → 禁止进入 Step 6
[ ] Step 6: Integration — 至少 1 个集成测试覆盖调用路径 (生产入口→新组件→结果可见)
[ ] Step 7: Commit — 单模块独立提交，独立 review。不批量提交。
```

**接线审计命令（Step 5 强制执行）**：
```bash
# 每次声称"完成"前，执行此命令验证接线:
FUNC_NAME="<你的新函数或类名>"
echo "=== 接线审计: ${FUNC_NAME} ==="
grep -rn "${FUNC_NAME}" src/tui/ src/cli.ts src/index.ts src/server.ts src/routes/ src/agent/conversation-engine.ts 2>/dev/null
# 零结果 = 未接线 = 不准提交
```

**禁止**：
- 禁止"写完 3 个模块再补测试"——每个模块写完立刻写测试
- 禁止"先写代码再写 spec"——spec 不是注释，是独立的接口契约
- 禁止"测试通过了但我也不知道为什么"——每个测试用例必须有明确的 Given/When/Then
- 禁止跳过 Step 4 直接提交——tsc + test 全绿是硬门禁
- **禁止"单元测试绿了就是完成了"——Step 5 接线验证是硬门禁。未接线 = 未完成。**
- **禁止"组件建好了，接线留给后面"——接线和组件是同一个 Slice，不可分割。**
- **禁止因为"接线是苦活"而拖延——改现有代码、冒回归风险是工作的一部分，不是借口。**

**历史上的四次接线失败（2026-06-03）——每次都是创始人发现，不是编码智能体发现**：
1. ViewAdapter 写完 → ConversationEngine 没用 → 死代码
2. Phase0Engine + HookRunner 写完 → 未替换现有的 Phase 0 + tool loop
3. ModuleRunner + SubAgentCoordinator 写完 → 未接入 Phase 1/2 诊断流
4. GraphBridge + EvidencePool 全部 L4 组件写完 → 零生产入口调用

**根因**: 我把"组件通过了单元测试"当作"任务完成"，没有执行接线验证。  
**修正**: Step 5 (WIRE CHECK) 是硬门禁，不可跳过。

### 一、接线铁律（最高优先级——6 次同类事故）

**铁律 1. 垂直切片交付，禁止水平分层交付。**
不要按技术层拆任务（"Phase A"、"API 端点"、"数据库表"），按用户可见的行为拆。每个切片 = 触发点 → 数据流 → 结果呈现。切片内部包含所有技术层，交付标准是"用户看到这个行为发生"。

案例：总管家 — `buildCoordinatorSeeds` + `incubateCoordinator` + 2 个 API 端点全部存在，但 Agent 出生后无 Standing Orders、无 Cron、消息路由是假的。能力全写完，用户不可用。根因：按模块拆任务，没有人对"用户创建组织后总管家自动巡检"这个完整行为负责。

**铁律 2. 设计文档中每个能力必须带"触发定义"和"结果呈现"。
```markdown
## 触发方式
- 谁来触发：用户手动 / Cron 定时 / Hook 自动
- 触发频率：每次对话 / 每天一次 / 阈值触发
- 触发入口：按钮位置 / API 端点 / Agent 消息
## 结果呈现
- 用户在哪里看到结果：工作台卡片 / 对话回复 / 通知
```
缺这段 = 设计未完成，不能进入开发。

**铁律 3. 每批任务必须包含一条"用户旅程测试"步骤。**
不仅是单元测试。每完成一个能力，必须有一条脚本或手动步骤走通：触发点（按钮/API/定时器） → 数据流转 → 结果呈现。通不过 = 未交付。单元测试验证模块，用户旅程测试验证接线。

**铁律 4. 交付不完整——写了代码没接线。**
写完每个模块后，必须从用户视角走通完整链路：入口（按钮/菜单/触发点）→ 交互（页面/弹窗/对话）→ 结果（数据变化/页面更新/通知）。三个环节任一个缺失 = 未交付。
案例：KnowledgeInjector 三端全写完但入口按钮从未 import 到工作台。Snapshot 后端 6 个 API 端点就绪但零用户可浏览的时间线 UI。L0 孵化 `runPipeline()` 完整实现但 `confirm` 端点从未调用它。

**铁律 5. 后端能力 ≠ 用户可用的功能。**
API 端点存在、核心逻辑存在，但用户看不见入口 = 没做完。追踪调用链：谁 import 了它？谁调用了它？结果在哪里呈现？三个问题全答出来才算"已接线"。

**铁律 6. 任何功能需求，必须追问"用户入口是什么"。**
用户描述能力层（管道、算法、数据模型）时，必须主动问：谁在什么场景下触发？入口在哪里？结果在哪里呈现？

**铁律 7. 每次接受任务时，确认 Done 标准。**
默认标准：入口可触达 + 完整链路走通 + 结果在 UI 可见。

### 二、代码质量铁律

**铁律 8. Mock/TODO 不留到交付代码中。**
声称"已完成"的代码不得包含 `MOCK_*`、`// TODO: 后期替换`、硬编码假数据。案例：KnowledgeInjector 的 `MOCK_TEAMS` 数组。

**铁律 9. 关键变更必须 grep 全仓库传播。**
PRD、数据模型、术语定义的变更，改完核心文档后必须 `grep` 所有 .md/.ts 文件检查残留旧引用。案例：8→6 合并后 9 份文档仍用旧名。

**铁律 10. 设计文档与代码不一致时，必须标注分界线。**
在文档中明确标注"当前代码状态 vs 本设计目标"。不能文档说一套，代码是另一套。

**铁律 11. 静默降级禁止——降级必须打 log.warn + 前端显示 DegradedBanner。**
案例：L0 LLM 双通道全断后降级为纯正则提取，数周无人察觉。后端 catch 必须 `log.error` + 返回 `degraded: true`，禁止返回 mock 数据。前端 catch 必须显示错误 UI，禁止 `setState(mock)`。

**铁律 12. 集成测试 cover 真实路由，不 mock 管线。**
案例：L0 测试 hit :18790（引擎），但 L0 路由在 :3000（Express）——测了另一个系统。时间敏感逻辑必须有带真实 sleep 的测试。

### 三、文档与配置铁律

**铁律 13. 文档占位符必须创建时就填实。**
"上级文档"不得写"待创建"。案例：15 份文档引用 `PRD-Synova持续进化系统（待创建）` 但 PRD 早已存在。

**铁律 14. 创建/删除文件必须同步 INDEX.md。**
INDEX.md 是手工维护的。每次新增设计文档后立刻加条目。

**铁律 15. 新文档必须对照 DOC-STANDARD 创建。**

**铁律 16. 三层产品架构——每个功能必须明确落哪一层。**
- **ClawOrg = OpenClaw + X**：Agent 运行时是 OpenClaw 框架。任何集成到 ClawOrg 的功能必须适配 OpenClaw 约束。
- **Synova = 独立产品**：引擎全部能力封装，通过 MCP 或其他协议开放给所有 Agent 框架。
- **Synova 子功能 = 独立 Skill/MCP**：部分能力单独打包给第三方 Agent 框架使用。
- **判断标准**：需要"知道团队有哪些 Agent"的能力 → 不可能在 OpenClaw 单聊层实现 → 必须走 MCP Server 中枢。

### 四、部署与环境铁律

**铁律 17. 每次部署后，必须从外部 URL 验证核心端点。**
`curl https://<domain>/api/health` + `curl https://<domain>/api/l0/extract`，不能只 curl localhost。

**铁律 18. Nginx 变更后使用 `nginx -t && systemctl restart nginx`（非 reload），然后从外部验证。**

**铁律 19. 环境变量变更 = `pm2 delete` + `pm2 start`。永远不用 `pm2 restart`。**

**铁律 20. 桌面端问题 = 必须坐在 Windows 机器前。先查环境（进程/端口/窗口坐标/日志），再怀疑代码。**

### 五、流程关卡铁律（做 X 之前必须先执行 Y —— 2026-05-24 新增）

> 以下铁律与一~四不同：不是"禁止做什么"，而是"做之前必须过什么关卡"。
> 每条都附带**强制输出模板**——不输出 = 关卡未过 = 不能进入下一步。

**铁律 21. 构建后验证关卡——每次 `npm run build` 或 `node build-desktop.js` 后强制执行。**

前端构建后：
```bash
# 检查 server/public/assets/ 无旧版本残留
ls E:\ClawOrg-BOX\server\public\assets\ | sort | uniq -c | sort -rn
# 如果同一前缀出现多个 hash 版本 → 旧版本残留，必须清理
```
桌面端打包后：
```bash
# 检查关键 Chromium 资源文件存在
for f in chrome_100_percent.pak chrome_200_percent.pak resources.pak icudtl.dat; do
  [ -f "E:\ClawOrg-BOX\box\release\Novis-win32-x64/$f" ] && echo "✅ $f" || echo "❌ 缺失 $f"
done
[ -d "E:\ClawOrg-BOX\box\release\Novis-win32-x64\locales" ] && echo "✅ locales/" || echo "❌ 缺失 locales/"
```
输出验证结果后才能声称"构建完成"。案例：.pak 缺失 ×2 次致黑屏乱码 + assets 多版本堆积致浏览器加载旧 bundle。

**铁律 22. 测试前目标确认关卡——创建 `*.test.ts` 或新增 `test()/it()` 用例前，必须先输出以下 3 行并等待用户确认：**

```
被测系统: <路由在哪个端口？函数被谁 import？组件在哪个页面渲染？>
Mock 边界: <mock 了什么？没 mock 什么？>
时间处理: <真实 sleep / mock 时间 / 不涉及>
```

确认前不动工。案例：L0 路由在 Express :3000，14 个测试全部 hit 引擎 :18790——测试全绿但测了另一个系统。孵化管线 TTL 竞态——测试 mock 了所有异步，时间维度 bug 全部漏掉。

**铁律 23. 修改后传播检查关卡——修改函数签名/删除导出/重命名符号后，声称"完成"前必须执行：**

```bash
grep -rn "<old_name>" --include="*.ts" --include="*.tsx" E:\ClawOrg-BOX\server\src\ E:\ClawOrg-BOX\frontend\src\
```
逐处确认是否需要同步修改，输出"已检查 N 处引用，修改 M 处，确认无需改 K 处"。
案例：删了 `extractTask` 中的 `onDeepConsult`，漏了 `sendInputStream` 中完全相同的回调——grep 可一秒发现。8→6 缝隙合并后 9 份文档仍用旧名。

**铁律 24. 异常处理审计关卡——写 catch 块时，必须同时确认以下 3 项：**

```
[ ] catch 块内有 log.error() 或 log.warn()（不能只 return null / 空吞）
[ ] 降级路径返回 degraded: true（后端）或显示错误 UI（前端）——禁止 setState(mock)
[ ] 文件损坏 ≠ 文件不存在——catch 里区分 ENOENT（正常默认）和 JSON.parse 失败（打 log + degraded）
```

输出打勾清单后才能标记该 catch 块完成。案例：~20 处空 catch 块 + L0 LLM 双通道全断静默降级数周 + evolution-overrides.json 损坏静默返回默认值。

**铁律 25. 涉及 OpenClaw 底座能力的设计必须先验证边界——禁止假设底座能做什么。**

**触发条件**：设计方案中提到"Agent X 调用 Agent Y"、"Gateway 路由消息"、"Agent 之间通信"、"跨 Agent 状态共享"、"Agent 组/团队原生支持"——任何暗示 OpenClaw 有多 Agent 协作原生能力的设计。

**强制步骤**：
```
[ ] 确认目标能力在 OpenClaw 原生支持列表中（28 个 hook、subagent spawn、MCP tools、Cron）
[ ] 区分"我们自己在 OpenClaw 之上搭的骨架代码"和"OpenClaw 真实提供的能力"
[ ] 如果能力不在原生支持列表中 → 明确标注"需要自建"并评估工程量
[ ] 自建方案必须对照 OpenClaw 实际 API（hook 签名、subagent 约束、workspace 隔离规则）
```

**OpenClaw 原生能力速查**（2026-05-25 验证）：
| 能力 | 支持？ |
|------|--------|
| 单 Agent 生命周期管理（28 hook） | ✅ |
| Agent 上下文注入（agent_turn_prepare） | ✅ |
| Subagent 生成（sessions_spawn） | ✅ |
| 定时任务（Cron） | ✅ |
| MCP 工具注册 | ✅ |
| Agent 间消息路由 | ❌ |
| 团队/Agent 组概念 | ❌ |
| Agent A 读 Agent B 工作区 | ❌（默认隔离） |
| 分布式 Agent 执行 | ❌ |
| 跨 Agent 状态共享 | ❌ |

案例：多项目+总管家方案最初假设 Steward Agent 可以"发消息给各团队 Agent 派活"——OpenClaw 根本没有 Agent 间消息路由。我们的 `agent-message` 端点、`cross-team-router`、`channel-manager` 全是我们自己搭的骨架，不是 Gateway 能力。不验证边界就设计方案 = 浪费精力设计不可行的架构。

**铁律 26. UI 重构替换关卡——新设计替换旧页面/组件时，必须删除旧文件并验证零引用后才能声称"完成"。**

**触发条件**：任何 UI 重构任务涉及用新组件/页面**替换**旧组件/页面时（路由重定向 ≠ 替换完成）。

**强制步骤**：
```
[ ] 确定被替换的旧文件列表（组件、页面、样式、API 客户端、类型定义）
[ ] 删除旧文件（不是注释掉、不是重定向、是删除）
[ ] 运行 npx tsc --noEmit 验证零编译错误
[ ] 输出："已删除 N 个旧文件，tsc 验证通过"
```

**如果旧文件被其他模块引用**：
```bash
# 先 grep 确认所有引用位置
grep -rn "<旧组件名>" --include="*.tsx" --include="*.ts" frontend/src/
# 逐处迁移到新组件，确认零残留引用后，才能删除旧文件
```

案例：Workbench 经历 4 次重写（三栏工作台 → 指挥舱双视图 → P0-P7 改造 → WeChat 风格）。每次都是新建组件 + 改路由重定向，旧组件（`cockpit/`、`CockpitOpsPanel`、`TaskKanban`、`TopologyView` 等 15+ 个文件）从未删除，累计死代码数百行。根因：每次重构只做"加法"（新组件），不做"减法"（删旧文件），路由重定向掩盖了旧代码的存在。

**铁律 27. 桌面端与官网路由隔离——禁止将官网静态页打包进桌面端，禁止桌面端加载官网路由。**

**核心规则**：
- **官网（`public-landing/`）**：仅供公网访问（claworg.cn），Express `/` 路由 serve
- **桌面端前端（`frontend/dist` → `server/public/`）**：React SPA，Express `/app` 路由 serve
- **Electron 生产模式**必须加载 `http://localhost:${port}/app`（不是 `/`）

**每次涉及静态文件或打包变更时，强制核对此清单**：
```
[ ] build-desktop.js extraResources 不含 public-landing（官网不入桌面端）
[ ] build-desktop.js extraResources 包含 frontend/dist → server/public（前端入桌面端）
[ ] main.ts loadURL 生产模式走 /app（不是 /）
[ ] index.ts 桌面模式下 / 重定向到 /app（兜底保护）
[ ] bootstrap.cjs 不设 CLAWORG_LANDING_DIR（桌面端不需要官网）
[ ] server/public/ 只含 React 构建产物，不含官网文件
[ ] server/public-landing/ 只含官网文件，不含 React 构建产物
```

案例：3 次重复犯错——`public-landing` 被打包进桌面端 extraResources，Electron 生产模式 `loadURL('http://localhost:3000')` 加载了 `/` 路由看到官网而非应用。根因：两个目录职责不清，每次构建/路由变更时未核对上述清单。

**铁律 28. 版本管理规则——每次代码修改必须升级版本号，唯一版本源在 `box/package.json`。**

**版本号规则**：
| 类型 | 何时升 | 例子 |
|------|--------|------|
| PATCH `x.y.z → x.y.z+1` | Bug 修复、小改动、文案 | 黑屏修复、构建脚本 bug |
| MINOR `x.y → x.y+1.0` | 新功能、新切片 | 知识管道 3 切片 |
| MAJOR `x → x+1.0.0` | 架构重写、不兼容旧数据 | 砍驾驶舱、产品方向大转 |

**强制配套动作**（缺一不可）：
```
版本号升级 → CHANGELOG.md 写条目 → 构建 → 上传 → 用户收到推送
```

**禁止**：
- 禁止在 `server/package.json`、`version.ts`、`main.ts` 等任何其他文件硬编码版本号
- 禁止改代码不升版本号
- 禁止升版本号不写 CHANGELOG

**读取规则**：所有需要版本号的地方，统一从 `box/package.json` 的 `version` 字段读取。

案例：`box/package.json` 是 `2.1.0-beta`，`server/package.json` 是 `1.0.0`，`server/src/routes/version.ts` 硬编码 `1.0.0`——三方各说各话，更新检测永远不准。

📎 **版本管理文档索引**：
- 版本号源：`box/package.json`（`version` 字段）
- 变更记录：根目录 `CHANGELOG.md`
- 正确读取示例：`server/src/services/update-checker.ts` → `getLocalVersion()`
- 正确读取示例：`server/src/routes/version.ts` → `getVersion()`

**铁律 29. 调优前指标验证关卡——调参/调 prompt/调模型参数之前，必须先证明评价指标能感知到你关心的东西。**

**触发条件**：开始任何优化循环（改 prompt、调阈值、换模型参数、跑实验对比）之前。

**强制步骤**：
```
[ ] 构造一对自己确认"应该一致"的真实输入，跑指标——如果得分接近 0 → 指标失效，禁止调参
[ ] 构造一对自己确认"应该不一致"的真实输入，跑指标——如果得分接近满分 → 指标失效，禁止调参
[ ] 指标在这两个确认样本上都给出合理分数（一致样本高分、不一致样本低分）→ 允许调参
```

**中文 NLP 特别警告**：Jaccard、编辑距离、BLEU、ROUGE 等基于 token/词重叠的指标对中文语义一致性的判断接近随机（Cohen's κ 可跌到负值）。中文场景下优先使用 LLM-as-judge（独立 LLM 调用判别语义一致性），或至少用 sentence-transformers 的 cosine similarity。

**禁止**：指标是负值/接近随机、反馈周期极长、无实验记录（git commit）——三条同时成立时还在调参。这是随机游走，不是优化。

案例：个人蒸馏引擎 STED/表面一致率用 Jaccard 衡量中文推理一致性——Cohen's κ ≈ -0.31（比随机猜还差 31%）。Jaccard 把同义改写全判为不一致，指标波动来自措辞随机性而非参数改进。但调参者从昨晚跑到今天白天，修了 `deepExtractText`、`detectRefusal`、prompt 结构、JSON 格式，跑了几十轮 5-round 全量测试，指标纹丝不动。根因：评价指标本身是噪声，所有"调优"都是在拟合噪声。

**铁律 30. 跨仓库对比验证关卡——涉及跨仓库/跨代码库对比、判断"哪个是主哪个是从"时，禁止基于文件名/文件数量/行数的统计特征下结论。**

**触发条件**：任何涉及两个以上代码库的对比分析，尤其当结论是"A 是全集，B 是子集"或"B 可以替代 A"时。

**Why**：2026-05-26 引擎去重任务中，基于三个错误假设（命名假设 "Synova-Engine 名字像独立产品所以是完整版"、数量假设 "152 > 111 所以多的是全的"、漏读 CLAUDE.md 第 112-115 行的 "未覆盖，Synova 原版保留"）给出了完全相反的结论——把 Novis 完整版判定为可删除的子集，把 Synova 阉割版判定为全集。如果创始人没有记忆并纠正，将导致 Novis 切换到阉割版引擎、丢失核心功能。这是确认偏差的典型案例：先形成假设，再选择性找证据验证，而不是同时检验两种可能。

**强制步骤**：

```
[ ] 查显式声明：CLAUDE.md / README / 代码注释中搜索 "原版" "fork" "保留" "未覆盖" "精简" "完整" 等关键词，逐条列出，不能只读标题
[ ] 语义对比核心入口文件：对 main entry、orchestrator、public-api、routes 等核心文件做 import/export/函数签名的逐项对比（不是比行数）。列出 A 有 B 没有、B 有 A 没有的每一项
[ ] 双向验证再下结论：同时检验 "A 是全集" 和 "B 是全集" 两种假设。对每种假设，列出支持证据和反对证据。如果证据不足以排除其中一种，先不下结论，向创始人报告不确定性
```

**禁止**：
- 禁止用文件数量代替语义对比（文件多 ≠ 功能全——新模块多但核心模块可能是精简版）
- 禁止用仓库名称推断代码完整度（"Engine"不一定是全集，"消费端"不一定只有子集）
- 禁止只读文档标题/摘要就跳过细节（合并记录里的"未覆盖"列表是关键）
- 禁止在两种假设的证据不充分时强行下结论——承认不确定性并请求更多信息

案例：Novis engine-server/（111 文件，997 行 orchestrator）vs Synova-Engine server/src/（152 文件，503 行 orchestrator）。文件数量 Synova 更多（152 > 111），但核心 orchestrator 只有 Novis 的一半（503 vs 997）。根因：Synova 是 Novis 的 fork，合并时故意保留了 Synova 自己的精简版入口文件（CLAUDE.md 第 112-115 行明确记录）。只比数量会得出反向结论。

**铁律 31. 降级信号传播——每个可独立失败的模块必须返回 degraded 标记，调用方必须检查，前端必须展示 DegradedBanner。**

**触发条件**：任何模块/函数可以"独立失败但不阻断整体流程"时（即 try/catch 后返回 null/undefined/默认值）。

**强制步骤**：
```
[ ] 模块失败时 catch 块内打 log.warn/error + 将模块名 push 到 degradedModules[] 
[ ] 模块返回值包含 degraded: true 或通过顶层 degradedModules 传播
[ ] 调用方（assembler/路由）读取 degradedModules，前端展示 DegradedBanner
[ ] 禁止：catch 块空吞（无 log + 无 degraded 标记）→ 违反铁律 11 + 铁律 31 双重违规
```

**Why**：2026-05-30 审计发现 15 个空 catch 块导致诊断模块静默失败数周无人察觉。无降级信号 = 反馈真空 = bug 永不修复。铁律 11 约束"必须打 log"，铁律 31 约束"必须传播信号"——两者互补，缺一不可。

**与铁律 11 的关系**：铁律 11（静默降级禁止）要求 catch 必须打 log.warn。铁律 31 补充要求 degraded 标记必须传播到调用链顶端。log.warn 让运维可见，degradedModules 让用户可见。

### 六、自动化优先铁律（2026-05-31 新增——基于 Claw-Code/OpenClaw 工程分析）

> 以下铁律来自对 Anthropic 工程实践（Claw-Code 源码 + OpenClaw 开源项目）的深度分析。
> 核心原则：**能交给编译器的，绝不靠人。能写成代码规则的，绝不写成文档规定。**

**铁律 32. 错误分类强制——每个 catch 块必须将错误包装为带 `.code` 的类型化 Error 子类，禁止 bare `return null`。**

Claw-Code 的 `ApiError` 枚举有 11 个 variant，每个带 `is_retryable()` / `failure_class()` 方法。OpenClaw 有 80+ Error 子类，每个设 `this.name = "ClassName"` + `.code`。

**强制步骤**：
```
[ ] catch 块内创建具体 Error 子类（如 LLMCallError / ModuleExecError / SessionCompactionError），非裸 Error
[ ] Error 子类包含 .code（字符串常量）+ .phase（诊断阶段）+ .retryable（boolean）
[ ] 调用方根据 error.code 做差异化恢复——不是所有错误都走同一降级路径
[ ] 禁止：catch(err) { return null } 或 catch(err) { log.warn(err); return null } —— 必须包装再抛出或返回
```

**Why**：SynovaAgent 有 6 个阶段，LLM 超时 / DB 死锁 / JSON 解析失败 / 速率限制——全走同一 catch 路径，上层无法差异恢复。

**错误类型模板**：
```typescript
class DiagnosticAgentError extends Error {
  readonly code: string;
  readonly phase: number;
  readonly retryable: boolean;
  constructor(code: string, message: string, phase: number, retryable: boolean) {
    super(message);
    this.name = 'DiagnosticAgentError';
    this.code = code; this.phase = phase; this.retryable = retryable;
  }
}
```

**铁律 33. 测试命名约定——测试文件必须按类型命名，CI 按类型分池跑。**

```
*.test.ts            → 单元测试（纯函数，无 I/O）
*.integration.test.ts → 集成测试（API + DB，真实 SQLite 不 mock）
*.e2e.test.ts        → 端到端测试（完整用户旅程，需 Playwright 或等价）
*.live.test.ts       → 外部服务测试（需真实 API key，仅 scheduled 触发）
```

**强制步骤**：
```
[ ] 新建测试文件时选择正确的后缀
[ ] 已有测试文件逐步重命名（integration 测试先改）
[ ] CI 配置：unit 先跑（fast），integration 并行（medium），e2e/live 后跑（slow）
```

案例：当前所有测试混用 `.test.ts`，CI 无法区分"3 秒跑完的单元测试"和"30 秒跑完的集成测试"。

**铁律 34. Feature Branch 强制——任何代码变更必须在 feature branch 上进行，禁止直接在 main 上 commit。**

OpenClaw 使用 PR → CI → merge 流程。Claw-Code 使用 `gaebal/**` 命名空间分支。即使团队只有一个人，PR 是自己给自己做 code review 的仪式。

**强制步骤**：
```
[ ] 新功能：git checkout -b feat/<功能名>
[ ] Bug 修复：git checkout -b fix/<bug名>
[ ] 完成后通过 PR 合并（或至少 CI 全绿后 merge）
[ ] 禁止：git checkout main && git commit && git push（除非紧急热修复，需注释原因）
```

**铁律 35. 自动化优先——每条规则优先变成 linter / 编译器 / CI 规则。能在 push 前阻断的，不靠 code review 发现。**

Claw-Code `unsafe_code = "forbid"` 不是文档约定——编译器拒绝编译。OpenClaw 40 个 vitest lint 规则不是 checklist——CI 自动报错。

**强制步骤**（每新增一条规则时必须过）：
```
[ ] 这条规则能变成 tsc / oxlint / ESLint 规则吗？→ 能就配
[ ] 这条规则能写成 check-*.sh 脚本在 pre-commit 跑吗？→ 能就写
[ ] 这条规则能放进 CI job 阻断 merge 吗？→ 能就加
[ ] 以上三者都不能 → 才降级为 CLAUDE.md 文字铁律
```

**铁律 36. 测试基础设施自检——根级 `npx vitest`（或 `npm test`）必须全量通过，不得拾取 release / dist / archive 产物。**

当前根级 vitest 拾取 `box/release/` 1.8GB 二进制产物 → 194 文件失败、111 测试失败。

**强制步骤**：
```
[ ] vitest.config.ts 或 jest.config.js 的 exclude/include 必须显式排除 **/dist/**、**/release*/**、**/legacy*/**
[ ] 每次新增目录/移动文件后，跑一次根级 npm test 确认无新增噪点
[ ] CI 必须跑全量测试（非白名单子集），零失败才合并
```

**铁律 37. Dead code 入仓库即违规——已删除/替换的组件、未引用的导出、构建产物不得留在仓库。**

当前 `box/release/` 1.8GB（二进制构建产物）、多次 UI 重构遗留旧组件（铁律 26）、`legacy-archive/` 测试文件。

**强制步骤**：
```
[ ] 每次 UI 重构替换后，删除旧文件 + grep 确认零引用（铁律 26）
[ ] 每次 npm run build 后，检查 dist/ 无旧版本残留（铁律 21）
[ ] 每周跑一次 npx knip 检测无引用导出
[ ] .gitignore 显式排除 box/release*/、*.tgz、*.zip
```

---

**铁律 38. `as any` 零容忍——TypeScript 类型安全真空一律禁止。`as any` 不是"跳过"而是"埋雷"。**

**触发条件**：写任何代码时，绝不使用 `as any`。使用 `as any` 是违规，不是"先跳过后补"。

**Why**：2026-06-03 审计发现 47 处 `as any` 遍布全仓——provider 响应、SQLite 查询、LLM 消息、API 调用、TUI 组件。每处单独看是"一行代码"，47 处累积后类型保护完全失效。这是"微观决策理性、宏观结果灾难"的典型案例。和 4 次接线失败、15 个空 catch 块是同一个模式。

**为什么我在每次写代码时都会产生 `as any`**：
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 我的微观逻辑（每次）：                                                        │
│   1. 这行类型对不上 → 卡住了                                                 │
│   2. 想定义类型但"不确定完整结构" → 犹豫                                      │
│   3. 功能等着上线 → 时间压力                                                  │
│   4. as any 跳过 → "后面再补"                                                 │
│   5. 后面永远没补                                                             │
│                                                                               │
│ × 47 次重复 = 47 处类型安全真空                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**替代方案（每次想写 `as any` 时必须用其中一个）**：

| 场景 | ❌ 禁止 | ✅ 强制替代 |
|------|---------|-----------|
| API JSON 响应 | `res.json() as any` | `res.json() as { field?: string }` — 内联类型，哪怕不完整也比 `any` 安全 100 倍 |
| SQLite 查询 | `.all() as any[]` | `as Record<string, unknown>[]` 或定义 `DbRow` 类型 |
| LLM 工具消息 | `(msgs as any[]).push(...)` | 扩展 `LLMMessage` 类型加可选字段 |
| 框架内部属性 | `(obj as any)._internal` | `(obj as { _internal?: boolean })._internal` |
| 未知第三方类型 | `as any` | 用 `unknown` + 类型守卫 |
| 类型太复杂的对象 | `as any` | 分步定义接口，或最多用 `Record<string, unknown>` |

**自动化门禁（pre-commit 硬阻断）**：

```bash
# 每次 commit 前执行。超过 0 处 as any → 阻断提交。
# 加到 .husky/pre-commit 或 lint-staged：
AS_ANY_COUNT=$(grep -rn "as any" src/ --include="*.ts" | grep -v "node_modules" | grep -v "\.test\." | grep -v "P1-02\|铁律 38" | wc -l)
if [ "$AS_ANY_COUNT" -gt 0 ]; then
  echo "❌ 铁律 38 违规: 发现 ${AS_ANY_COUNT} 处 as any。逐处用具体类型/unknown/Record 替代后重试。"
  grep -rn "as any" src/ --include="*.ts" | grep -v "node_modules" | grep -v "\.test\."
  exit 1
fi
```

**TUI/框架应急例外**：blessed 等无类型定义的第三方库内部属性访问，需用精准类型断言 + 注释说明原因，每处单独审核。不允许泛化的 `as any`。

**禁止**：
- 禁止"这行过不去，加个 as any 先跑通"——过不去是类型系统在保护你，不要关掉它
- 禁止"后面统一补类型"——不会补的。47 次历史证明
- 禁止用 `as any` 关闭泛型推导——用 `unknown` + 类型收窄
- 禁止复制粘贴含 `as any` 的代码——第一个工具文件用了 `as any`，后面 6 个文件全部复制。看到就要改

**每周日审计命令**：
```bash
grep -rn "as any" src/ --include="*.ts" | grep -v "node_modules" | grep -v "\.test\."
# 目标: 零输出。非零 = 铁律违反 = 本周最高优先级修复项。
```

### 七、架构铁律（2026-06-03 新增——基于核心竞争力审计 19 项 Critical/High 问题）

> 五层架构是项目地基。违反边界 = 地基裂缝。每条边界违规都是技术债务复利。

**铁律 39. 五层架构边界——每层只与相邻层通信，禁止跨层调用。**

**五层定义**：

```
L1 交互 (TUI/CLI/Web) → 只调用 L2
L2 编排 (ConversationEngine/Orchestrator) → 只调用 L1(显示) + L3(诊断)  
L3 洞察 (ExpertAutonomy/Corroboration/SignalFusion) → 只调用 L2(被调) + L4(读图)
L4 本体 (GraphBridge/GraphStore/EntityResolver) → 只调用 L3(被调) + L5(存储)
L5 存储 (SQLite/文件系统) → 只被 L4 调用
```

**强制规则**：

| 规则 | 违规示例 | 检测方法 |
|------|---------|---------|
| L2 不得直接 import L4 类 | `import { GraphStore } from '../l4/graph-store'` 在 conversation-engine.ts 中 | `grep "from.*l4/" src/agent/ src/orchestrator/` |
| L3 不得绕过 L4 直接操作存储 | 在 expert 代码中直接 `db.prepare(...)` | `grep "db\.\|sqlite\|Database" src/l3/` |
| 每层只能通过上层暴露的接口访问下层 | 动态 `require()` 绕过 import 检查 | `grep "require(" src/` (已有铁律 9) |
| L4 GraphStore 接口不得重复声明 | `graph-bridge.ts:25` vs `graph-store.ts:27` 两套接口 | `check-architecture.sh` 类型兼容测试 |
| 多租户安全：queryNodes/queryEdges 的 graph 参数必须传递 | `queryNodes(type, {}, undefined)` 缺失 graph | code review + pre-commit 模式检查 |

**每次修改跨层代码时必须核对的清单**：
```
[ ] 我修改的文件属于哪一层？ (L1/L2/L3/L4/L5)
[ ] 我新增的 import 来自哪一层？ → 只能来自同层或相邻下层
[ ] 如果是 L4 代码：graph 参数是否所有调用方都传递了？（禁止 optional 跳过）
[ ] 如果是 L3 代码：是否通过 L4 接口访问图？还是直接操作了 GraphStore？
[ ] 引擎核心类型（GraphStore, NodeType 等）是否从 engine-core 导入？还是在本地重复声明？
```

**架构自动化门禁**（每次 commit 执行）：
```bash
# 1. 跨层 import 检测: L2 不得直接 import L4
L2_L4_LEAK=$(grep -rn "from.*l4/" src/agent/ src/orchestrator/ --include="*.ts" | grep -v "node_modules" | grep -v "\.test\." | wc -l)
if [ "$L2_L4_LEAK" -gt 0 ]; then
  echo "❌ 铁律 39 违规: L2→L4 跨层引用 ${L2_L4_LEAK} 处。L2 只能通过 L3 访问 L4。"
fi

# 2. GraphStore 接口一致性: synova-agent 的声明必须与 engine-core 兼容
#    运行: npx vitest run tests/architecture/graphstore-compatibility.test.ts

# 3. 多租户安全: L4 查询接口 graph 参数不得省略
#    人工审查，CI 中标记 PR 需要架构 review
```

**禁止**：
- 禁止为了"方便"在 L2 中直接 import L4 的类 → 走 L3 接口
- 禁止在 synova-agent 中重新声明 engine-core 已有的类型 → 从 engine-core 导入或建立类型桥接
- 禁止在查询/写入图数据时省略 `graph` 参数 → 多租户隔离的基石
- 禁止"先跨层调用，后面再重构" → 架构边界违约是复利债务，47 次 `as any` 就是教训

**历史架构违规（2026-06-03 审计发现）**：
1. GraphStore 接口在 `graph-bridge.ts:25` 和 `graph-store.ts:27` 重复声明 → 两份独立维护，必然分叉
2. queryNodes/queryEdges graph 参数可选 → 跨租户数据泄漏风险
3. FederalReporter/GlobalAggregator/RuleDeployer 完整存在但零接线 → 核心竞争力功能成死代码
4. deleteNode() 物理删除 graph_nodes 行 → 违反时序图"No Delete"原则
5. engine-core 772 文件单体包 → 跨包相对路径引用，独立发布不可行

## 项目身份

**产品**：ClawOrg — AI 团队操作系统。L0 多轮对话 → JTBD 理解 → 引擎蒸馏 → 团队蓝图 → 持续进化。

**市场**：5-300 人团队（可扩展至 5-500 人）。Novis 解决的是"我需要一个能持续运转的团队"，不是一次性问答。更大规模企业暂不是目标客户。

**UI**：对话面板 + 任务面板 + 模板市场。驾驶舱已砍。

---

## 团队

- **黄学松** = 创始人/产品方向裁定
- **Claude Code（你）** = 唯一程序员。全栈：前端 + 后端 + 引擎 + 打包
- **Hermes** = 集成/审查/部署/文档
- **沈括** = 引擎前沿研究

---

## 架构

```
前端 React+Vite  →  本地 Express :3000  →  云端引擎 :18790 (43.160.196.159)
Gateway :18789  — Agent WS + LLM 路由（本地，OpenClaw 底座）
```

**关键文件**：
```
server/src/index.ts              ← Express 路由注册
frontend/src/App.tsx             ← React 路由表
server/src/engine-server/pipeline/phase-a-derive-roles.ts   ← Phase A
server/src/engine-server/pipeline/phase-b-distill-genome.ts ← Phase B
server/src/engine-server/pipeline/framework-library.ts      ← 85 框架库
box/build-desktop.js             ← 打包脚本
```

**铁律**：Gateway 只读 `~/.openclaw/openclaw.json` | engine-server 只在云端 | 代码落 E 盘

---

## 常用命令

```powershell
cd E:\ClawOrg-BOX\frontend && npm run build    # 前端构建
cd E:\ClawOrg-BOX\box && node build-desktop.js # 桌面端打包
E:\ClawOrg-BOX\box\release\Novis-win32-x64\Novis.exe
```

---

## 打包

```powershell
cd E:\ClawOrg-BOX\frontend && npm run build
rmdir /s /q E:\ClawOrg-BOX\server\public\assets 2>nul
xcopy /e /y E:\ClawOrg-BOX\frontend\dist\* E:\ClawOrg-BOX\server\public\
cd E:\ClawOrg-BOX\box && npx tsc -p tsconfig.json
taskkill /f /im ClawOrg.exe 2>nul
node build-desktop.js
```
产物：`E:\ClawOrg-BOX\box\release\ClawOrg-win32-x64\ClawOrg.exe`

---

## 执行原则

- **按优先级顺序**：P0 → P1 → P2 → ... 不跳跃
- **先读再改**：不假设代码内容
- **每批验证**：`npm run build` 零错误
- **改完列出清单**：文件 + 行号 + 为什么改

<!-- superpowers-zh:begin (do not edit between these markers) -->
# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文 review 沟通参考——话术模板、分级标注（必须修复/建议修改/仅供参考）、国内团队常见反模式应对。仅在用户显式 /chinese-code-review 时调用，不要根据上下文自动触发。
- **chinese-commit-conventions**: 中文 commit 与 changelog 配置参考——Conventional Commits 中文适配、commitlint/husky/commitizen 中文模板、conventional-changelog 中文配置。仅在用户显式 /chinese-commit-conventions 时调用，不要根据上下文自动触发。
- **chinese-documentation**: 中文文档排版参考——中英文空格、全半角标点、术语保留、链接格式、中文文案排版指北约定。仅在用户显式 /chinese-documentation 时调用，不要根据上下文自动触发。
- **chinese-git-workflow**: 国内 Git 平台配置参考——Gitee、Coding.net、极狐 GitLab、CNB 的 SSH/HTTPS/凭据/CI 接入差异与镜像同步配置。仅在用户显式 /chinese-git-workflow 时调用，不要根据上下文自动触发。
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发或执行实现计划之前使用——创建具有智能目录选择和安全验证的隔离 git 工作树
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->
