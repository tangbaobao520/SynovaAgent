# Task Brief: 第9专家 host（主持人）文件化配置

> 生成: 2026-07-02 | 来源: HOST-EXPERT-DESIGN.md | 类型: 文件驱动扩展
> 交付链路: task brief → 创建文件 → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

属于**扩展解耦（文件驱动，不改 TypeScript）**。

host 是第9位专家，担任用户和专家团队之间的主持人/调度者。用户只和 host 对话，host 决定何时调度领域专家。

参照 HOST-EXPERT-DESIGN.md 的完整设计。

## Q1: 调研

决策链: 创建文件 → 更新 yaml → 验证 → 提交
引用: 铁律 21(文件驱动)，docs/plans/codex/HOST-EXPERT-DESIGN.md

执行约束:
- rule: "host 目录必须包含 5 个文件"
  verify: "ls expert/host/{IDENTITY,THEORY,RULES,TOOLS,CROSS_EXPERT}.md"
- rule: "expert-registry.yaml 必须有 host 条目"
  verify: "grep -q 'host:' expert/expert-registry.yaml"
- rule: "领域专家全部 background: true"
  verify: "grep -c 'background: true' expert/expert-registry.yaml"

## Q2: 范围

做什么：
1. 创建 `expert/host/` 目录 + 5 个文件（直接复用 HOST-EXPERT-DESIGN.md 的内容）
2. expert-registry.yaml 添加 host 条目（tools: route_to_expert, summarize_findings, escalate, query_memory, query_knowledge, get_sentinel_status）
3. 7 个领域专家改为 background: true（strategy/finance/org/tech/marketing/action/business_model）

不做什么：
- ❌ 不实现 route_to_expert 工具（后续任务）
- ❌ 不改任何 TypeScript 文件
- ❌ 不涉及 ConversationEngine 改造

## Q3: 验收

入口: expert/host/ 目录存在 + 5 个文件齐全
处理: ExpertFileLoader 启动时自动扫描加载
结果: ExpertRegistry.listTypes() 包含 'host'，yaml 中 host 条目已注册

## 本任务在哪一层
扩展层（文件驱动，不涉及代码）

## Done 标准
- [ ] expert/host/ 目录存在且包含 5 个文件
- [ ] expert-registry.yaml 有 host 条目
- [ ] 7 个领域专家 background: true
- [ ] expert-config-loader 测试通过
- [ ] pre-commit 组 8（文件驱动完整性）通过
- [ ] CI success
