<!--
  Agent 基础设施物理扫描任务
  执行者：Claude Code（Bash 工具）
  目标：验证 Synova 作为通用 Agent 的 8 项基础能力是否存在且非空壳
  输出：填写结果模板，产出 AGENT-INFRASTRUCTURE-SCAN-20260814.md
  预计时间：30 分钟
-->

# Agent 基础设施物理扫描任务

> 执行者：Claude Code  
> 日期：2026-08-14  
> 前置：无（不依赖其他任务）  
> 输出：`docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md`

## 任务目标

诊断链路审计（AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md）已验证哨兵体系与数据流贯通性。但缺失**通用 Agent 基础能力**的验证：

- Synova 是否具备合格 Agent 的**身份隔离**？
- 多轮对话的**上下文管理**是否真实？
- **记忆**是否跨会话持久化？
- LLM 调用失败时能否**降级切换**？
- 工具调用是否**标准化**（MCP）？
- Skill 能否**动态加载**而非静态硬编码？
- GA（增长顾问）诊断流程是否走完 6 阶段？
- 建议发出后是否有**执行跟踪闭环**？

本扫描只回答一个问题：**这些能力是真实代码，还是文档虚构？**

---

## 执行方法：逐项 grep + 文件内容抽查

对每项能力，执行给定的 Bash 命令，记录输出。**不做代码修改，只读不写。**

---

## 能力 1：存在与身份（多企业隔离）

**问题**：多企业部署时，Agent 是否知道"我现在服务的是哪家企业"？数据是否隔离？

**命令**：
```bash
echo "=== 1. 企业/租户标识 ==="
grep -rn "tenantId\|enterpriseId\|orgId\|workspaceId" src/agent/ src/routes/ src/store/ --include="*.ts" | wc -l
grep -rn "multi-tenant\|workspace\|tenant" src/ --include="*.ts" | wc -l
echo "---"
echo "=== 1.1 路由/中间件中的身份提取 ==="
grep -rn "req\.headers\|req\.body\|req\.query" src/routes/ --include="*.ts" | grep -i "tenant\|enterprise\|org\|workspace" | head -10
echo "---"
echo "=== 1.2 数据库表中的租户字段 ==="
sqlite3 data/synova.db ".schema" 2>/dev/null | grep -i "tenant\|enterprise\|org\|workspace" | head -10
echo "（如果 sqlite3 命令失败，记录失败原因）"
```

**判定**：
- ≥10 处引用 tenant/enterprise/workspace → 有隔离机制
- 数据库 schema 有租户字段 → 数据层隔离
- 否则 → 疑似空壳或单租户

---

## 能力 2：上下文管理（对话状态机）

**问题**：ConversationEngine 是否真实管理多轮对话状态？还是每次请求都从头开始？

**命令**：
```bash
echo "=== 2. ConversationEngine 存在性与内容 ==="
find src/ -name "*conversation*engine*" -o -name "*chat*engine*" -o -name "*dialog*manager*" 2>/dev/null
ls src/agent/ 2>/dev/null | grep -i "conversation\|chat\|dialog"
echo "---"
echo "=== 2.1 状态机或 turn 管理 ==="
grep -rn "turn\|round\|sessionState\|dialogState" src/agent/ --include="*.ts" | wc -l
grep -rn "class.*Engine\|export.*engine" src/agent/ --include="*.ts" | head -10
echo "---"
echo "=== 2.2 上下文注入/提取 ==="
grep -rn "context.*inject\|history\|memory.*inject" src/agent/ src/orchestrator/ --include="*.ts" | wc -l
grep -rn "TODO\|FIXME\|not implemented" src/agent/ --include="*.ts" | wc -l
```

**判定**：
- 有 ConversationEngine 类且实现 turn 管理 → 真实
- 只有接口/空类，或 TODO 密集 → 空壳

---

## 能力 3：状态持久化（跨会话记忆）

**问题**：服务重启后，历史诊断记录、对话上下文是否还在？还是全丢了？

**命令**：
```bash
echo "=== 3. SessionStore / MemoryStore ==="
find src/store/ -name "*session*" -o -name "*memory*" -o -name "*history*" 2>/dev/null
ls src/store/ 2>/dev/null
find packages/ -name "*session*" -o -name "*memory*" 2>/dev/null
echo "---"
echo "=== 3.1 持久化实现（SQLite/文件/Redis） ==="
grep -rn "SQLite\|sqlite\|INSERT\|UPDATE\|persistent\|save.*session" src/store/ --include="*.ts" | wc -l
grep -rn "in-memory\|memory.*store\|Map.*session" src/store/ --include="*.ts" | wc -l
echo "---"
echo "=== 3.2 数据库表结构 ==="
sqlite3 data/synova.db ".tables" 2>/dev/null | grep -i "session\|memory\|history\|conversation"
sqlite3 data/synova.db ".schema sessions" 2>/dev/null
sqlite3 data/synova.db ".schema session" 2>/dev/null
echo "（如果 sqlite3 命令失败，记录失败原因）"
echo "---"
echo "=== 3.3 迁移文件 ==="
ls src/store/migrations/ 2>/dev/null | wc -l
find src/store/migrations/ -type f 2>/dev/null | head -5
```

**判定**：
- 有 SQLite INSERT/UPDATE + sessions 表 + 迁移文件 → 真实持久化
- 只有 in-memory Map，无表结构 → 重启即丢

---

## 能力 4：LLM 网关（Provider 切换 + 降级）

**问题**：DeepSeek 挂了能自动切 OpenAI 吗？有 fallback 机制吗？

**命令**：
```bash
echo "=== 4. LLM Gateway ==="
find src/providers/ -type f --include="*.ts" 2>/dev/null
ls src/providers/ 2>/dev/null
echo "---"
echo "=== 4.1 Provider 切换逻辑 ==="
grep -rn "Gateway\|provider.*switch\|fallback\|backup\|deepseek\|openai\|claude" src/providers/ --include="*.ts" | head -20
grep -rn "class.*Gateway\|export.*gateway" src/providers/ --include="*.ts"
echo "---"
echo "=== 4.2 降级策略 ==="
grep -rn "retry\|timeout\|circuit.*breaker\|degraded\|fallback" src/providers/ --include="*.ts" | wc -l
grep -rn "catch.*error\|catch.*fail" src/providers/ --include="*.ts" -A 3 | head -20
```

**判定**：
- 有 Gateway 类 + provider switch 逻辑 + retry/fallback → 真实
- 只有单个 provider 的裸 API 调用 → 无降级能力

---

## 能力 5：MCP 协议（工具调用标准化）

**问题**：工具调用是标准化 MCP，还是各自为战的静态函数？

**命令**：
```bash
echo "=== 5. MCP 协议 ==="
ls src/mcp/ 2>/dev/null | wc -l
ls src/mcp/ 2>/dev/null
find src/ -name "*mcp*" --include="*.ts" 2>/dev/null
echo "---"
echo "=== 5.1 MCP 相关代码 ==="
grep -rn "mcp\|ModelContextProtocol\|tool.*schema\|tool.*discover" src/ --include="*.ts" | wc -l
grep -rn "mcp" src/ --include="*.ts" | head -10
echo "---"
echo "=== 5.2 工具注册方式 ==="
grep -rn "ToolRegistry\|registerTool\|static.*tools" src/ --include="*.ts" | wc -l
grep -rn "import.*tool\|require.*tool" src/ --include="*.ts" | wc -l
```

**判定**：
- 有 src/mcp/ 目录 + ModelContextProtocol 引用 → 标准化
- 只有静态 import 的函数，无 MCP → 非标准化

---

## 能力 6：Skill 动态加载

**问题**：Skill 是运行时动态加载的，还是编译时静态 require 的？

**命令**：
```bash
echo "=== 6. Skill 动态加载 ==="
grep -rn "SkillRegistry\|dynamic.*import.*skill\|skill.*load\|loadSkill" src/ --include="*.ts" | wc -l
grep -rn "static.*SKILL\|const.*SKILLS\|require.*skill" src/ --include="*.ts" | wc -l
echo "---"
echo "=== 6.1 Skill 目录结构 ==="
ls extensions/skills/ 2>/dev/null | wc -l
ls extensions/skills/builtin/ 2>/dev/null | wc -l
find extensions/skills/ -name "manifest.json" 2>/dev/null | wc -l
echo "---"
echo "=== 6.2 Skill 加载代码 ==="
grep -rn "manifest.json\|skill.*manifest" src/ --include="*.ts" | head -10
grep -rn "fs.*read.*skill\|import\(" src/ --include="*.ts" | grep -i "skill" | head -10
```

**判定**：
- 有动态 import + SkillRegistry + manifest.json 扫描 → 动态加载
- 只有 static require 或 const SKILLS 数组 → 静态硬编码

---

## 能力 7：GA（增长顾问）6阶段流程完整执行

**问题**：GA 诊断流程的 6 个阶段是否都有真实代码？还是只有阶段 1 和 6？

**命令**：
```bash
echo "=== 7. GA（增长顾问）流程阶段 ==="
grep -rn "Phase.*1\|Phase.*2\|Phase.*3\|Phase.*4\|Phase.*5\|Phase.*6" src/orchestrator/ src/agent/ --include="*.ts" | wc -l
grep -rn "phase\|stage\|step" src/orchestrator/ --include="*.ts" | wc -l
echo "---"
echo "=== 7.1 GA 编排函数 ==="
grep -rn "runGA\|runDiagnosis\|runAdvisor\|orchestrate" src/orchestrator/ --include="*.ts" | head -10
grep -rn "export.*function\|export.*const" src/orchestrator/ --include="*.ts" | head -20
echo "---"
echo "=== 7.2 阶段间数据传递 ==="
grep -rn "context.*pass\|state.*transfer\|result.*next" src/orchestrator/ --include="*.ts" | wc -l
```

**判定**：
- 6 个阶段都有函数实现 + 阶段间数据传递 → 完整流程
- 只有阶段 1（输入）和阶段 6（报告），中间缺失 → 空壳

---

## 能力 8：执行跟踪与闭环反馈

**问题**：建议发出后，Agent 能跟踪"被执行了吗"？效果数据能回流吗？

**命令**：
```bash
echo "=== 8. 执行跟踪 ==="
grep -rn "track\|follow.*up\|action.*status\|execution" src/ --include="*.ts" | wc -l
grep -rn "ticket.*close\|ticket.*resolve\|ticket.*status" src/ --include="*.ts" | wc -l
echo "---"
echo "=== 8.1 反馈与进化 ==="
grep -rn "feedback\|calibrate\|evolve\|rule.*reflow\|learn" src/ --include="*.ts" | wc -l
grep -rn "measure.*calibrat\|threshold.*adjust" src/ --include="*.ts" | wc -l
echo "---"
echo "=== 8.2 数据库中的跟踪表 ==="
sqlite3 data/synova.db ".tables" 2>/dev/null | grep -i "ticket\|action\|track\|feedback\|execution"
sqlite3 data/synova.db "SELECT COUNT(*) FROM sentinel_tickets" 2>/dev/null
sqlite3 data/synova.db "SELECT COUNT(*) FROM actions" 2>/dev/null
```

**判定**：
- 有 track/feedback 函数 + 数据库表有数据 → 闭环真实
- 只有报告生成，无跟踪表或表为空 → 开环，建议发出后无后续

---

## 结果记录模板

Claude Code 执行完 8 项命令后，按以下模板填写结果：

```markdown
# Agent 基础设施物理扫描报告

> 执行者：Claude Code  
> 日期：2026-08-14  
> 方法：8 项 Bash grep + 文件抽查  
> 术语说明：GA = 增长顾问（原 FDE）

## 扫描结果汇总

| # | 能力 | 状态 | 证据摘要 | 空壳风险 |
|---|------|:---:|---------|:-------:|
| 1 | 存在与身份（多企业隔离） | [PASS/PARTIAL/FAIL] | | |
| 2 | 上下文管理（对话状态机） | [PASS/PARTIAL/FAIL] | | |
| 3 | 状态持久化（跨会话记忆） | [PASS/PARTIAL/FAIL] | | |
| 4 | LLM 网关（Provider 降级） | [PASS/PARTIAL/FAIL] | | |
| 5 | MCP 协议（工具标准化） | [PASS/PARTIAL/FAIL] | | |
| 6 | Skill 动态加载 | [PASS/PARTIAL/FAIL] | | |
| 7 | GA 6阶段流程完整执行 | [PASS/PARTIAL/FAIL] | | |
| 8 | 执行跟踪与闭环反馈 | [PASS/PARTIAL/FAIL] | | |

## 详细扫描输出

（每项粘贴命令输出，保留原始 grep 结果，不做解释）

### 1. 存在与身份
\`\`\`bash
[paste command output]
\`\`\`

### 2. 上下文管理
...

（以此类推）

## 总体判定

- **真实能力数**：X/8
- **部分实现数**：X/8
- **疑似空壳数**：X/8
- **关键缺口**：...

## 与诊断链路审计的交叉引用

| 基础设施能力 | 诊断链路审计关联 |
|------------|----------------|
| 状态持久化 | 哨兵基线 580 行 ✅，但 findings 内存丢失 ❌ |
| 执行跟踪 | sentinel_tickets 表 0 行 → 与 P0-1 死代码互证 |
| GA 6阶段 | 若阶段缺失，则诊断报告可能是模板填充而非真实推理 |
```

---

## 验收标准

1. 8 项命令全部执行，输出粘贴到报告
2. 每项有 PASS/PARTIAL/FAIL 判定
3. 原始 grep 结果保留，不做主观过滤
4. 输出文件：`docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md`

---

## 执行后交接

Claude Code 完成扫描并填写模板后：
1. `git add docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md`
2. 通知 Kimi K3（代码审计 session）读取报告，做最终判定
3. K3 输出：`AGENT-INFRASTRUCTURE-AUDIT-20260814.md`（含判定与 L4 防线缺口）

*任务定义完。Claude Code 按此清单执行扫描。*
