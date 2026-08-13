# SYNOVA-IMPL-进化体系升级-v1-20260705

> 版本: v1.0 | 日期: 2026-07-05 | 状态: 实施中
> 关联方案: ../strategy/SYNOVA-DESIGN-进化体系-v3-20260705.md
> 关联方案: ../strategy/SYNOVA-DESIGN-本体层最终规范-v2.4-20260704.html
> 前置依赖: Task A+B完成。graph-traversal.ts和temporal-baseline.ts已就位。

## 0. 执行前审计

### 0.1 当前代码状态（经重新审计，非之前误判的"30%")

| 模块 | 位置 | 状态 | 说明 |
|------|------|------|------|
| `evolution-engine.ts` | `packages/engine-core/src/evolution/` | 23KB ✅ | 核心引擎——GA显式反馈+知识偏差检测+进化周期 |
| `evolution-types.ts` | `packages/evolution/src/` | 5.6KB ✅ | 类型定义 |
| `evolution-metrics.ts` | `packages/evolution/src/` | 4.8KB ✅ | 指标计算 |
| `expert-evolution.ts` | `packages/evolution/src/` | 9KB ✅ | 专家进化 |
| `evolution-loop.ts` | `packages/engine-core/src/pipeline/diagnosis/` | 13.1KB ✅ | 进化循环(worktree分支) |
| `evolution.ts` | `src/routes/` | 7.1KB ✅ | 进化API路由 |
| `ga-evolution.ts` | `src/routes/` | 16KB ✅ | GA进化管理路由 |
| 测试 | `tests/evolution/` + `tests/routes/` | 4个文件 ✅ | 单元测试 |

**实际完成度约60%**（而非之前误判的30%）。缺失的是v3设计文档中新增的四个模块：
- `org-adapter.ts` — 企业行为自动检测+外部数据聚合+矛盾检测（来源二三四）
- `feedback-collector.ts` — 统一反馈采集接口
- `global-analyzer.ts` — 跨企业统计量聚合+NCI全局模式
- `rule-version-manager.ts` — 灰度发布/快照/回滚

### 0.2 Anopic工程原则（贯穿全文）

1. 一次性切换，零兼容层，零过渡期。
2. 用自动化验证器确保切换后输出不变。
3. 并行化一切可并行的工作。
4. 只新增文件，不修改存量代码（最小侵入原则——除非明确标注）。

### 0.3 铁律速查
- 铁律24: catch+log.warn+degraded
- 铁律31: 降级标记传播
- 铁律38: as any 零容忍
- 铁律39: L4只与L3/L5通信
- B模式禁止: 跨模块目录import
- 新export有调用方: grep确认

---

## 1. 核心变更概述

本任务的目标是将进化体系从v2（仅GA显式反馈通道）升级到v3（5个信号来源+三种审核级别+NCI专属触发器）。

**不修改现有文件。** 所有新增功能通过新建文件实现，挂载到现有API和pipeline上。唯一可能修改的是`ga-evolution.ts`路由——增加新API端点（追加代码块，不删不改已有端点）。

---

## 2. 新增文件清单（Claude Code逐文件创建）

### 2.1 packages/evolution/src/feedback-collector.ts

**职责：** 统一的反馈采集接口。抽象GA显式反馈、企业行为隐式反馈、外部数据自动聚合三种来源。

```typescript
// packages/evolution/src/feedback-collector.ts

export interface FeedbackEvent {
  id: string;
  source: 'ga_explicit' | 'user_behavior' | 'external_data' | 'diagnosis_contradiction';
  timestamp: string;
  teamId: string;
  payload: Record<string, unknown>;
  requiresReview: boolean;  // true=需要人工审核才生效
  autoApplicable: boolean;   // true=自动生效，无需审核
}

export function collectFeedback(
  store: GraphStoreReader,
  traversal: GraphTraversal,
  teamId: string,
  options?: { since?: string; sourceFilter?: string[] }
): FeedbackEvent[] {
  // 1. 采集GA显式反馈（从现有markApplied/markDismissed记录中读取）
  // 2. 采集企业行为隐式反馈（见org-adapter.ts的detectBehavioralValidation）
  // 3. 采集外部数据更新（见org-adapter.ts的aggregateExternalData）
  // 4. 采集诊断矛盾（见org-adapter.ts的detectDiagnosisContradiction）
  // 5. 按requiresReview分类输出
}
```

**验收：**
- `npx tsc --noEmit` 通过
- 单元测试：模拟四种来源的反馈事件→collectFeedback正确分类为requiresReview/autoApplicable

### 2.2 packages/evolution/src/org-adapter.ts

**职责：** 第二层（组织自适应）的核心模块。实现v3设计文档中来源二、三、四的全部功能。这是本任务中代码量最大的文件。

```typescript
// packages/evolution/src/org-adapter.ts

// ===== 来源二：企业行为隐式反馈 =====

/**
 * 检测企业行为是否正在验证/推翻之前的NCI判断。
 * 
 * 检测逻辑：
 * 1. CEO是否重新提起被沉默的Signal？
 *    → 扫描会议纪要中是否出现被silenced的Signal的key_themes
 *    → 如果出现→该Signal的lifecycle从silenced更新为discussed
 *    → 自动修正该Signal提出者的信源权重（+0.1）
 * 
 * 2. 预算是否流向之前被驳回的方向？
 *    → 检测FUNDS边的resource_allocation_delta是否从0变为正数
 *    → 回溯对应Signal→修正"被压制"判定→lifecycle更新为budgeted
 * 
 * 3. 竞品是否在同方向布局？
 *    → AdversarialFrame检测到竞品在相同key_themes方向上的配置权重增加
 *    → 如果对应Signal曾被归类为"噪音干扰型"→自动修正分类→标记为"可能被误判"
 * 
 * 4. 招聘方向是否指向被沉默的Signal？
 *    → 检测DEPLOYS边新增的PERSON→ACTIVITY部署
 *    → 如果新部署的方向与某个被silenced的Signal高度相关→lifecycle更新
 */
export function detectBehavioralValidation(
  store: GraphStoreReader,
  traversal: GraphTraversal,
  teamId: string
): ValidationResult[] {
  // 实现上述四类检测
  // 每个检测返回ValidationResult { signalId, originalClassification, newEvidence, suggestedUpdate }
  // 所有自动生效——不进入人工审核队列
}
```

```typescript
// ===== 来源三：外部数据自动聚合 =====

/**
 * 从新接入的客户数据中自动更新ExternalBaseline的行业当前值。
 * 这不是"学习"——是"数据库更新"。
 * 
 * 更新项：
 * - 行业出生人口增速、市场规模增速、融资笔数等（母婴行业示例）
 * - 基础设施渗透率当前值
 * - 同行业企业的财务/运营数据统计量（用于行业百分位计算）
 * 
 * 触发条件：新客户接入时自动触发。或每周Cron定期聚合。
 * 
 * 成本模板过期检测：
 * 当某行业的实际成本持续低于ExternalBaseline存储的理论下限时，
 * 不自动修改模板——生成"成本模板过期"建议，进入人工审核队列。
 */
export function aggregateExternalData(
  store: GraphStoreReader,
  teamId: string
): ExternalDataUpdate[] {
  // 1. 读取当前行业的所有已接入企业数据
  // 2. 计算聚合统计量（中位数、百分位、均值）
  // 3. 更新ExternalBaseline的行业当前值
  // 4. 检测成本模板是否过期→生成建议
}

export function detectCostTemplateDrift(
  store: GraphStoreReader,
  teamId: string
): TemplateDriftAlert[] {
  // 实际成本持续低于理论下限→触发过期检测
  // 返回TemplateDriftAlert { industry, template, actualCost, theoreticalMin, driftPercent }
  // requiresReview=true
}
```

```typescript
// ===== 来源四：哨兵-诊断矛盾检测 =====

/**
 * 检测NCI判断、三阶推理引擎建议、企业实际行为三者之间的矛盾。
 * 
 * 矛盾类型：
 * 1. NCI高非共识 vs 三阶推理引擎保守建议
 *    → "系统内部在对这个方向的重要性上产生了分歧"——提交人工审核
 * 2. 企业实际行为 vs 诊断建议方向
 *    → 检测DEPLOYS/FUNDS边变化是否与上次诊断建议方向一致
 *    → 不一致→自动记录（不强制告警——企业有权选择不听）
 * 3. 哨兵得分趋势与行业基准矛盾
 *    → 企业在某个哨兵上的得分在改善，但行业同行在恶化→可能是企业真的在变好
 *    → 企业在某个哨兵上的得分在恶化，但行业同行在改善→需要关注
 */
export function detectDiagnosisContradiction(
  store: GraphStoreReader,
  traversal: GraphTraversal,
  teamId: string
): ContradictionResult[] {
  // 实现上述三类矛盾检测
  // 类型1→requiresReview=true
  // 类型2→automatic, 仅记录
  // 类型3→requiresReview=true
}
```

```typescript
// ===== NCI专属：信号确认/驳回自动学习 =====

/**
 * 每次GA驳回或确认一个Signal时，自动更新该提出者的信源可靠性权重。
 * 这是贝叶斯更新——不是"替换"权重，是根据新证据"调整"权重。
 * 
 * GA确认Signal（有价值）→提出者权重+0.05
 * GA驳回Signal（低质量）→提出者权重-0.1（惩罚大于奖励——减少噪音）
 * 同一提出者连续3次被驳回→权重自动归零，该提出者后续Signal的NCI降权
 * 同一提出者连续3次被确认→该提出者标记为"高可靠信源"
 */
export function updateSignalSourceWeight(
  store: GraphStoreReader,
  teamId: string,
  signalId: string,
  gaAction: 'confirmed' | 'dismissed'
): void {
  // 1. 读取Signal.author_id
  // 2. 读取该author_id的历史GA反馈记录
  // 3. 计算贝叶斯更新后的权重
  // 4. 连续3次驳回→权重归零
  // 5. 连续3次确认→标记为高可靠
}
```

**验收：**
- `npx tsc --noEmit` 通过
- 单元测试每个函数：
  - detectBehavioralValidation: 模拟silenced Signal→CEO会议重提→lifecycle变为discussed→信源权重+0.1
  - aggregateExternalData: 模拟2个同行业企业数据→聚合统计量正确
  - detectCostTemplateDrift: 模拟实际成本连续6个月低于理论下限→触发过期建议
  - detectDiagnosisContradiction: 模拟NCI高+三阶保守→矛盾检测正确
  - updateSignalSourceWeight: 模拟连续3次驳回→权重归零

### 2.3 packages/evolution/src/global-analyzer.ts

**职责：** 第三层（全局进化）的核心模块。跨企业统计量聚合+NCI全局模式识别。

```typescript
// packages/evolution/src/global-analyzer.ts

/**
 * 每月Cron触发。聚合所有组织的匿名化数据，生成改进提案。
 * 所有提案必须经过人工审核门禁。
 * 
 * 分析维度：
 * 1. 行业哨兵阈值校准建议
 * 2. NCI全局模式识别
 * 3. 沉默分类器版本管理
 * 4. NCI计算公式权重调整建议
 */
export function analyzeGlobalPatterns(
  options: { since?: string; industries?: string[] }
): GlobalAnalysisReport {
  // 1. 聚合所有组织的匿名化哨兵得分分布
  // 2. 识别行业级阈值偏差
  // 3. 检测新型沉默模式跨企业出现
  // 4. 生成改进提案列表
  // 所有提案标记为 requiresReview=true
}

export function detectNciGlobalPatterns(): NciGlobalPattern[] {
  // 1. AI创业公司的NCI得分均值趋势
  // 2. 新型沉默模式在多个企业中同时出现
  // 3. 同行业NCI得分与增长的相关性分析
}
```

**验收：**
- `npx tsc --noEmit` 通过
- 单元测试：模拟3个同行业企业的NCI数据→识别行业级模式→生成改进提案

### 2.4 packages/evolution/src/rule-version-manager.ts

**职责：** 规则版本管理——快照/回滚/灰度发布。

```typescript
// packages/evolution/src/rule-version-manager.ts

export interface RuleVersion {
  versionId: string;
  createdAt: string;
  rules: Record<string, unknown>;
  description: string;
  status: 'active' | 'grayscale' | 'rolled_back';
}

export function createSnapshot(description: string): RuleVersion {
  // 当前所有活跃规则的快照
}

export function rollback(versionId: string): RuleVersion {
  // 回滚到指定版本
}

export function startGrayscale(versionId: string, targetPercent: number): void {
  // 灰度发布：先对targetPercent%的组织启用新规则
}

export function checkGrayscaleHealth(versionId: string): GrayscaleHealth {
  // 灰度发布健康检查：对比新旧规则下的诊断准确率
}
```

**验收：**
- `npx tsc --noEmit` 通过
- 单元测试：createSnapshot→修改规则→rollback→规则恢复

---

## 3. 修改现有文件（仅追加，不删除）

### 3.1 src/routes/ga-evolution.ts

追加三个API端点（在已有端点代码块之后追加，不删不改已有代码）：

```typescript
// === v3 新增端点（追加到文件末尾） ===

// POST /api/evolution/feedback/collect
// 触发反馈采集：GA显式+企业行为+外部数据+矛盾检测
app.post('/api/evolution/feedback/collect', async (req, res) => {
  const events = collectFeedback(store, traversal, req.body.teamId);
  res.json({ events, autoApplied: events.filter(e => e.autoApplicable).length, reviewRequired: events.filter(e => e.requiresReview).length });
});

// POST /api/evolution/signal/update-weight
// GA确认/驳回Signal→自动更新信源权重
app.post('/api/evolution/signal/update-weight', async (req, res) => {
  updateSignalSourceWeight(store, req.body.teamId, req.body.signalId, req.body.action);
  res.json({ success: true });
});

// GET /api/evolution/global/analyze
// 触发全局分析——仅管理员可调用
app.get('/api/evolution/global/analyze', async (req, res) => {
  const report = analyzeGlobalPatterns({ since: req.query.since, industries: req.query.industries });
  res.json({ report, proposalsPendingReview: report.proposals.length });
});
```

---

## 4. 执行顺序与验收

### Phase 1（2天）：创建四个新模块

按顺序创建：
1. `feedback-collector.ts` ＋ 单元测试
2. `org-adapter.ts` ＋ 单元测试（最复杂——5个导出函数）
3. `global-analyzer.ts` ＋ 单元测试
4. `rule-version-manager.ts` ＋ 单元测试

每个文件完成后立即运行 `npx tsc --noEmit` + `npx vitest run [test-file]`

### Phase 2（1天）：扩展GA路由

修改 `src/routes/ga-evolution.ts` ——追加三个API端点代码块。
追加后运行已有测试确保无回归：`npx vitest run tests/routes/ga-evolution.test.ts`

### Phase 3（1天）：端到端验证

1. 模拟企业场景完整流程：
   - 插入silenced Signal → 模拟CEO会议重提 → detectBehavioralValidation自动检测 → lifecycle更新
   - 模拟GA驳回Signal → updateSignalSourceWeight自动降权 → 连续3次→权重归零
   - 模拟实际成本低于理论下限6个月 → detectCostTemplateDrift触发过期建议

2. 全量测试：`npx vitest run` 通过
3. 铁律检查：`npm run check:iron-laws` 通过
4. 架构检查：`npm run check:architecture` 通过

### 提交

```bash
git checkout -b feat/evolution-v3
git add packages/evolution/src/feedback-collector.ts packages/evolution/src/org-adapter.ts
git add packages/evolution/src/global-analyzer.ts packages/evolution/src/rule-version-manager.ts
git add packages/evolution/src/*.test.ts
git add src/routes/ga-evolution.ts
git commit -m "feat(evolution): v3 — 5 feedback sources, org-adapter, global-analyzer, rule-version-manager"
```

---

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| org-adapter.ts5个函数工作量超预期 | 每个函数独立可测试。先做detectBehavioralValidation——这是最核心的。其他四个可分批 |
| feedback-collector与已有GA反馈记录格式不兼容 | 在collectFeedback中做格式兼容转换——不对已有数据强制迁移 |
| global-analyzer需要跨企业数据——当前测试数据不足 | 模拟数据优先。单元测试不依赖真实跨企业数据 |
| ga-evolution.ts已有16KB——追加代码可能导致文件过长 | 如果超过25KB，拆分GA进化路由为独立模块。Phase 2中判断 |
