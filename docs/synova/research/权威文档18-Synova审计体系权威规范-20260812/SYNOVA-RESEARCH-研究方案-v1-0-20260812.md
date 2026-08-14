<!--
  权威文档 18 研究方案 v1.0
  任务: Synova 审计体系权威规范
  日期: 2026-08-12
  加速方案: 两周冲刺（Sprint 模式）
  前置条件: D328/D329/D330 审计闭环完成，审计协议 v1.1 验证通过
-->

# Synova 审计体系权威规范 — 研究方案 v1.0

> 权威文档 18 | 2026-08-12
> 定位：Synova 质量基础设施的顶层规范，与 17 份产品权威文档并列
> 状态：研究方案已确认，进入两周冲刺

---

## 零、为什么这是整个控制塔的疫苗

控制塔 12 组 pre-commit + 铁律门禁是**实时免疫系统**。但它有一个结构性盲区：**自检者无法发现自己的盲区**。

D328 审计暴露了这个问题：
- Claude Code 自检：6/6 测试通过（工作区含未提交 WIP）
- Kimi K3 独立审计：干净快照 6/6 通过，但故障注入复现静默放行
- **同一个上下文下的自检，会把"未执行"和"通过"压缩成同一个 exit 0**

这是认知科学的基本事实：人（和 LLM）无法发现自己不知道的东西。控制塔防的是**已知错误模式**，审计防的是**未知盲区**。

权威文档 01 定义了企业数字孪生的本体真理。权威文档 18 定义了"我们如何确保这个真理不被自己的假设扭曲"。

---

## 零-A、核心思想：三权分立 + 审计驱动进化

### 三权分立

```
规划者（Codex + DeepSeek）写 dev doc
        ↓
编码者（Claude Code + DeepSeek）实现
        ↓
自检者（Agent 6问 + pre-commit 12组）验证
        ↓
独立审计者（K3 零上下文会话）复核 ← 审计体系的位置
```

审计者不共享规划者的上下文、不共享编码者的假设、不共享自检者的先验。这是**他证**，不是自证。

### 审计驱动进化

不是"审计找 bug"，是"审计发现盲区 → 盲区固化为控制塔规则 → 下次同类问题被自动拦截"。

```
D328 审计发现：测试在临时 repo 中因 BASH_SOURCE 失效
        ↓
L4 防线缺口收割：Done 标准只断言 exit 0，不断言全绿
        ↓
控制塔升级：brief-compose skill DS1 模板强制 [ "$FAIL" = "0" ]
        ↓
D329+ 任务：同类问题被自动拦截
```

这是免疫系统学习机制：白细胞（控制塔）杀不死的病原体，被病理切片（审计）分析后，生成抗体（新规则）。

---

## 一、设计哲学：四层审计模型

| 层级 | 对象 | 方法 | 执行者 | 成本 | 频率 |
|:---:|------|------|--------|------|:---|
| L1 物理强制 | 代码格式、类型、架构边界 | 脚本（tsc/oxlint/grep） | pre-commit | ¥0 | 每次 commit |
| L2 自动验证 | 接口存在性、测试通过性 | 脚本（vitest/doc-audit） | CI | ¥0 | 每次 PR |
| L3 独立审计 | 语义盲区、隐含假设、边界条件 | LLM 红队（K3） | Kimi CLI | ¥5-20/次 | 每个任务 |
| L4 可复现记录 | 审计 diff、防线缺口追溯 | 文件系统（JSON/Markdown） | git | ¥0 | 每季度 |

**关键设计**：L1/L2 由脚本自动执行，零成本；L3 由 K3 执行，成本可控但不可省略；L4 形成可追溯的历史基线。

---

## 二、第一性原理：为什么不是自审计

### 反证：如果只有自审计

| 防线 | 自检者 | 盲区 | 历史案例 |
|------|--------|------|---------|
| 铁律 0-2 Step 4 | Codex 自己 | "测试存在 = 测试通过" | D328 首次审计 P0 |
| PostToolUse verify | Claude Code 自己 | 工作区 WIP 污染测试环境 | D328 首次审计 P0 |
| Agent 自检 6 问 | 编码 Agent 自己 | 问"有断言"不问"全绿" | D328 DS1 声称矛盾 |
| pre-commit 组 2 | 同一上下文 | 只检查文件存在性 | D328 测试 2/6 失败但 pre-commit 通过 |

### 独立审计的独特能力

| 能力 | 来源 | 案例 |
|------|------|------|
| 零上下文 | 不知道规划时的妥协 | D328 发现"测试在临时 repo 失效" |
| 跨模型 | K3 盲区 ≠ Claude 盲区 | D329 发现"tag 孤儿提交" |
| 故障注入 | 主动破坏环境验证 fail-open | D328 复现"python3 损坏时静默放行" |
| L4 防线缺口收割 | 每任务必答"哪道防线本该拦住" | 已产出 3 条控制塔升级建议 |

---

## 三、现状：已运转与已知缺口

### 3.1 已运转（验证通过）

| 组件 | 状态 | 证据 |
|------|------|------|
| 代码审计协议 v1.1 | ✅ 定稿 | `KIMI-AUDIT-INSTRUCTION.md` |
| 触发方式（选项 A） | ✅ 验证 | Kimi CLI 自动收集 7 项材料 |
| 分级标准（P0/P1/P2） | ✅ 验证 | 3 份报告分级一致 |
| L4 防线缺口收割 | ✅ 运转 | 每份报告含固定章节 |
| `<claim>` 标签规范 | ✅ 定稿 | `CLAIM-TAG-SPEC.md` |
| `doc-audit` 接口定义 | ✅ 定稿 | `doc-audit-interface.sh` v0.1 |

### 3.2 已知系统性缺口（需两周冲刺修复）

| 缺口 | 证据 | 影响 | Sprint |
|------|------|------|:------:|
| bypass.log 记录空窗 | D328/D329/D330 共 4-5 个提交无记录 | 可审计性缺失 | Sprint 1 |
| 审计报告未 git 跟踪 | `docs/synova/audit-reports/` 未纳入版本控制 | 历史不可追溯 | Sprint 1 |
| 审计无自动触发 | 依赖人工输入"审计任务 DXXX" | 可能遗漏 | Sprint 1 |
| `doc-audit` 未实现 | 只有接口，无实际解析/验证逻辑 | 无法自动验证 `<claim>` | Sprint 1 |
| pre-commit 无文档组 | 修改权威文档不触发任何检查 | 新文档格式错误可能流入 | Sprint 1 |
| 审计报告只有 Markdown | 不可机器 diff | 无法自动追踪审计质量趋势 | Sprint 2 |
| 旧文档无 `<claim>` 标签 | 17 份文档纯 Markdown | 无法自动验证文档声称 | Sprint 2 |

---

## 四、对齐 Anthropic：差距与路径

| Anthropic 特征 | 我们当前 | 差距 | Sprint 路径 |
|---------------|---------|------|-----------|
| 脚本跑 80%，LLM 跑 20% | LLM 跑 100%（14 项全人工） | 差 80% 自动化 | Sprint 1 填充 `doc-audit` + 组 13 |
| `<claim>` 机器标签 | 纯 Markdown | 差文档格式 | Sprint 2 迁移核心旧文档 |
| JSON 可 diff 报告 | Markdown（人读） | 差可复现性 | Sprint 2 JSON 双轨输出 |
| pre-commit 自动触发 | 人工触发 | 差自动化 | Sprint 1 dispatcher 集成 |

**不追求一步到位**，两周内完成基础设施，达到 L1/L2/L3 全贯通。

---

## 五、研究任务拆分：两周冲刺（Sprint 模式）

### Sprint 1（本周）：基础设施五任务并行

**Codex 写 5 份 dev doc（并行）**：
- **D331**: bypass.log A+B 修复 — A: synova-commit.sh 强制签名写入；B: bypass-log-reconcile.sh 定期对账
- **D332**: 审计报告 git 跟踪 + dispatcher 集成 — pre-push 自动检测未审计任务
- **D333**: doc-audit 脚本填充实现 — 解析 `<claim>`、验证 evidence、检查矛盾
- **D334**: pre-commit 组 13（文档契约验证）— 修改权威文档时自动跑 doc-audit
- **D335**: 审计报告 JSON 输出规范 — Markdown + JSON 双轨格式定义

**Claude Code 编码批次（按依赖分组）**：

| 批次 | 任务 | 依赖 | 工期 |
|:---:|------|------|:---|
| **Batch A** | bypass.log A 修复 | 无 | 半天 |
| **Batch B** | bypass.log B 对账 | 无 | 半天 |
| **Batch C** | dispatcher 集成 | 无 | 半天 |
| **Batch D** | doc-audit 填充 | `CLAIM-TAG-SPEC.md`（已有）| 1-2 天 |
| **Batch E** | pre-commit 组 13 | Batch D 完成 | 半天 |

**K3 并行（不阻塞基础设施）**：
- 继续跑权威文档审计（材料已发）
- 本周抽空审 D331-D335 的 dev doc

### Sprint 2（下周）：CLAIM 标签 + 双轨报告

**Codex 写 2 份 dev doc**：
- **D336**: 核心旧文档（01/03/13/14/17）CLAIM 标签迁移
- **D337**: 审计报告 JSON 格式规范 + 生成器

**Claude Code 实现**：
- `doc-audit --scan-all`：全仓库扫描 `<claim>`
- 审计报告生成器：Markdown + JSON 双轨输出
- 5 份核心旧文档加 `<claim>` 标签

**K3 验收**：
- 抽查 D336 标签质量
- 审 D337 JSON 格式
- 输出 Sprint 2 审计报告

---

## 六、交付物

```
权威文档18-Synova审计体系权威规范-20260812/
├── SYNOVA-RESEARCH-研究方案-v1-0-20260812.md          ← 本文件
├── SYNOVA-RESEARCH-第一章-审计架构与四层模型.md
├── SYNOVA-RESEARCH-第二章-代码审计协议与14项清单.md
├── SYNOVA-RESEARCH-第三章-权威文档审计与CLAIM标签规范.md
├── SYNOVA-RESEARCH-第四章-bypass.log修复与执行证据链.md
├── SYNOVA-RESEARCH-第五章-与Anthropic对齐路径.md
├── SYNOVA-RESEARCH-第六章-控制塔升级与防线缺口收割.md
└── SYNOVA-RESEARCH-附录-审计报告模板与分级标准.md

代码交付：
├── scripts/control-tower/synova-audit-dispatcher.sh   ← 已存在
├── scripts/control-tower/doc-audit-interface.sh       ← 已存在（Phase 0 接口）
├── scripts/control-tower/doc-audit.sh                 ← Sprint 1 填充
├── scripts/control-tower/bypass-log-reconcile.sh      ← Sprint 1 新增
├── tests/control-tower/claim-tag-spec.test.sh         ← 已存在
└── .git/hooks/pre-push                                ← Sprint 1 集成 dispatcher
```

---

## 七、验收标准

1. **bypass.log A+B 双轨修复**：`git log` 与 `bypass.log` 可定期对账，无空窗
2. **审计报告 git 跟踪**：3 份现有报告 + 未来报告均纳入版本控制
3. **pre-push 自动检测**：D329+ 未审计任务推送前自动阻断（可 `--no-verify` 绕过但记录）
4. **doc-audit 脚本实现**：能解析 `<claim>`、验证 evidence 文件存在性、输出 JSON
5. **pre-commit 组 13**：修改权威文档时自动验证 `<claim>` 格式，错误阻断提交
6. **JSON 双轨输出**：审计报告同时生成 Markdown（人读）+ JSON（机器 diff）
7. **核心旧文档标签化**：5 份核心文档（01/03/13/14/17）至少 80% 的 IMPLEMENTED 声明带 `<claim>`
8. **两周内全部合并**：Sprint 1 + Sprint 2 所有任务进入 main 分支

---

## 八、本周 Sprint 1 启动项

| 优先级 | 任务 | Dev Doc | 说明 |
|:---:|------|:-------:|------|
| **P0** | bypass.log A+B 修复 | D331 | A 防新增缺口，B 补历史缺口 |
| **P0** | 审计报告 git 跟踪 | D332 | 现有 3 份报告先落盘 |
| **P1** | dispatcher 集成 | D332 | pre-push 自动检测 |
| **P1** | doc-audit 填充 | D333 | 解析 `<claim>` + 验证 evidence |
| **P1** | pre-commit 组 13 | D334 | 文档契约验证 |

**第一批可并行（今天开工）**：D331-A、D331-B、D332-dispatcher — 三者互不依赖。

**第二批（明天）**：D333 doc-audit 填充 — 依赖 `CLAIM-TAG-SPEC.md`（已有）。

**第三批（后天）**：D334 组 13 — 依赖 D333 完成。

---

## 九、前置研究

无独立前置研究。本研究方案直接基于以下已有审计基础：
- D328/D329/D330 审计报告（已验证流程）
- A线-产品完整性缺口审计（2026-08-01）
- 跨文档一致性审计（2026-07-27）
- 控制塔当前状态 v3（2026-07-29）

---

*研究方案 v1.0 完。确认后进入 Sprint 1，Codex 开始写 D331-D335 dev doc。*
