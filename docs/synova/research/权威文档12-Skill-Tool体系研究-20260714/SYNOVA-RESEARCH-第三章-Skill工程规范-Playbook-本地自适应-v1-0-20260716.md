# 第三章：Skill工程规范 + 专家任务剧本 + 本地自适应层

---

## 一、Skill文件结构（对标Hermes五件套）

### 1.1 完整目录结构

```
skills/
├── builtin/                              # 出厂内置
│   └── {skill-name}/
│       ├── SKILL.md                      # 核心指令+领域知识+步骤流程（必须）
│       ├── manifest.json                 # Skill元数据+权限声明（必须）
│       └── tests/
│           ├── fixture-1-normal.json
│           ├── fixture-2-degraded.json
│           ├── fixture-3-critical.json
│           └── fixture-4-conflict.json
├── industry/{industry}/                  # 行业专家贡献
├── custom/{enterpriseId}/                # 企业GA定制
└── candidates/                           # Agent自生成候选（待审核）
```

### 1.2 SKILL.md格式（对标Hermes YAML frontmatter）

```markdown
---
name: diagnose-cashflow-health
version: 1.0.0
description: "四层追溯协议的现金流健康诊断"
category: diagnosis
tier: L3
expert: finance
complexity: composite
lifecycle: active
tags: [cashflow, finance, root-cause]
related_skills: [diagnose-profit-health, diagnose-cost-structure-anomaly]
---

# 现金流健康诊断

## 概述
基于四层追溯协议（表层症状→中层传导→底层结构→根因定位）。

## 何时使用
- 哨兵 cash-runway 触发P1及以上告警
- GA手动触发现金流专项诊断

## 步骤流程
### Step 1: 交叉验证 — tool_cross_validate
确认信号可靠性。超时30s，失败→halt。

### Step 2: 现金流三分法 — tool_cashflow_decompose
拆解经营/投资/融资三类现金流。参数dimension="cashflow", depth=3。

## 输出格式
见 standard_expert_report Schema

## 反模式
- ❌ 不区分经营/投资/融资现金流，笼统说"现金流紧张"
- ❌ 对季节性波动过度反应——需12个月以上趋势判断
```

---

## 二、manifest.json 完整Schema

```typescript
interface SkillManifest {
  name: string;                          // kebab-case唯一标识
  version: string;                       // SemVer 2.0
  type: "skill";                         
  displayName: string;                   // 人类可读中文名
  description: string;
  
  category: "data_acquisition" | "computation" | "diagnosis" | "prescription"
           | "feedback" | "learning" | "self_maintenance"
           | "collaboration" | "workbench";
  tier: "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
  complexity: "atomic" | "composite" | "expert";
  
  expert: ExpertType | "multi" | "host";  // "multi"=跨专家, "host"=主Agent
  lifecycle: "active" | "deprecated" | "archived";
  
  tools: string[];                       // Tool ID列表
  dependencies: {
    skills?: Record<string, string>;     // { "acquire-cashflow-data": ">=1.0.0 <2.0.0" }
    tools?: Record<string, string>;      // { "computeDOL": ">=2.0.0" }
    edges: string[];                     // ["E-05","E-13","E-37"]
    computes: string[];                  // ["COMPUTE-DOL-v2"]
    sentinels: string[];                 // ["cash-runway","profit-health"]
  };
  
  permissions: {
    dataAccess: {
      dimensions: string[];
      sensitiveAccess: "none" | "read" | "read_write";
    };
    crossExpert: ExpertType[];
  };
  
  loading: "always" | "on-demand";
  entryPoint: string;                    // "./SKILL.md"
  policyEngineRef: "D38";
  
  metadata: {
    tags: string[];
    related_skills: string[];
    deprecated_replaced_by?: string;
    deprecated_reason?: string;
  };
}
```

### 完整JSON示例

```json
{
  "name": "diagnose-cashflow-health",
  "version": "1.0.0",
  "type": "skill",
  "displayName": "现金流健康诊断",
  "description": "四层追溯协议的现金流健康诊断",
  "category": "diagnosis",
  "tier": "L3",
  "complexity": "composite",
  "expert": "finance",
  "lifecycle": "active",
  "tools": ["tool_cross_validate","tool_trace_lineage","tool_cashflow_decompose","tool_format_report"],
  "dependencies": {
    "skills": { "acquire-cashflow-data": ">=1.0.0 <2.0.0", "cross-validate": ">=1.0.0 <2.0.0" },
    "tools": { "computeDOL": ">=2.0.0", "computeBreakEven": ">=1.0.0" },
    "edges": ["E-05","E-13","E-37"],
    "computes": ["COMPUTE-DOL-v2","COMPUTE-BREAK-EVEN-v1"],
    "sentinels": ["cash-runway","profit-health","cost-health"]
  },
  "permissions": {
    "dataAccess": { "dimensions": ["financial"], "sensitiveAccess": "read" },
    "crossExpert": ["strategy","business_model"]
  },
  "loading": "on-demand",
  "entryPoint": "./SKILL.md",
  "policyEngineRef": "D38",
  "metadata": {
    "tags": ["cashflow","finance","root-cause"],
    "related_skills": ["diagnose-profit-health","diagnose-cost-structure-anomaly"]
  }
}
```

### 依赖与版本兼容性管理

manifest.json的dependencies字段声明依赖的Skill/Tool及语义版本范围。PlaybookLoader加载时执行：
1. **依赖完整性检查**：递归解析dependencies，确认每个依赖在SkillRegistry/ToolRegistry中存在且版本匹配
2. **循环依赖检测**：DFS检测闭合环→拒绝加载+错误日志
3. **缺失处理**：依赖缺失/版本不兼容→Skill标记degraded，写入L4事件流，但不阻塞系统启动
4. **影响分析**：Tool升级时自动计算影响面，生成报告推GA面板

### 生命周期状态机

```
active → deprecated → archived
  │          │            │
  正常服务    仍可执行      不再加载
             产生WARN      从Registry移除
```

| 状态 | 行为 | 触发 |
|------|------|------|
| active | 正常加载，接受调用 | 新建默认 |
| deprecated | 仍可执行，每次调用WARN+GA提醒 | 联邦进化更优替代/GA判定 |
| archived | 不加载，执行记录保留 | GA确认。deprecated≥60天自动提醒 |

---

## 三、Skill加载器设计（SkillLoader）

对标 `src/sentinel/sentinel-loader.ts` 的文件驱动模式。

```typescript
// src/skill/skill-loader.ts

const SKILL_ROOTS = [
  join(process.cwd(), 'skills', 'custom'),     // 最高优先级
  join(process.cwd(), 'skills', 'industry'),
  join(process.cwd(), 'skills', 'builtin'),    // 最低优先级
];

let skillRegistry: Map<string, LoadedSkill> | null = null;

export function loadSkills(): { skills: LoadedSkill[]; degraded: boolean; errors: string[] } {
  if (skillRegistry) return { skills: Array.from(skillRegistry.values()), degraded: false, errors: [] };
  
  const errors: string[] = [];
  const skills: LoadedSkill[] = [];
  const seenNames = new Set<string>();
  
  // 按优先级从低到高扫描（高优先级覆盖低优先级）
  for (const root of SKILL_ROOTS.filter(existsSync)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      
      const manifestPath = join(root, entry.name, 'manifest.json');
      const skillMdPath = join(root, entry.name, 'SKILL.md');
      if (!existsSync(manifestPath) || !existsSync(skillMdPath)) {
        errors.push(`Skill ${entry.name} 缺少文件`);
        continue;
      }
      
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (manifest.lifecycle === 'archived') continue;  // 跳过归档
      
      // 优先级覆盖
      if (seenNames.has(manifest.name)) {
        const idx = skills.findIndex(s => s.manifest.name === manifest.name);
        if (idx >= 0) skills.splice(idx, 1);  // 移除低优先级版本
      }
      seenNames.add(manifest.name);
      
      skills.push({ manifest, dir: join(root, entry.name), content: readFileSync(skillMdPath, 'utf-8') });
    }
  }
  
  // 依赖校验（不阻塞启动）
  for (const skill of skills) {
    const depErrors = validateDependencies(skill, skills);
    if (depErrors.length > 0) {
      skill.manifest.lifecycle = 'degraded';
      errors.push(...depErrors.map(e => `[${skill.manifest.name}] ${e}`));
    }
  }
  
  skillRegistry = new Map(skills.map(s => [s.manifest.name, s]));
  return { skills, degraded: errors.length > 0, errors };
}
```

---

## 四、Playbook YAML Schema

### 完整YAML示例

```yaml
playbook:
  id: "finance-profitability-root-cause"
  name: "利润率下降根因分析"
  version: "1.2.0"
  expert: "multi"                              # "multi"=跨专家 | 单一专家类型名
  lifecycle: "active"
  description: "当利润率哨兵触发P1及以上告警时启动四层追溯诊断"

  trigger:
    - sentinel: "profit-health"
      condition: "severity >= P1"
    - sentinel: "cost-health"
      condition: "severity >= P2 AND metric == 'fixed_cost_ratio'"

  contextRequirements:
    edges: [E-23, E-30, E-31, E-34]
    computes: [computeDOL, computeBreakEven, computeFixedCostRigidity]
    sentinels: [profit-health, cost-health, revenue-health]

  steps:
    - step: 1
      id: "cross-validate"
      expert: "finance"
      tool: "tool_cross_validate"
      description: "确认利润率下降信号的可靠性"
      params: { minSources: 3, sources: ["financial_baseline","sog_graph","trial_balance"] }
      timeoutMs: 30000
      onFailure: "halt"                        # halt | degrade | skip | retry(3)

    - step: 2
      id: "trace-cost-lineage"
      expert: "finance"
      tool: "tool_trace_lineage"
      description: "追溯E-23成本结构变化证据链"
      params:
        dimension: "{{analytical_context.primary_dimension}}"
        edgeId: "E-23"
        depth: 3
        confidence_threshold: "{{context.finance_confidence_threshold}}"
      condition: "step1.confidence > 0.5"
      timeoutMs: 45000
      onFailure: "degrade"

    - step: 3
      id: "compute-dol"
      expert: "finance"
      tool: "computeDOL"
      params: { edgeRefs: ["E-23","E-34"] }
      onFailure: "degrade"

    - step: 4
      id: "game-theory-check"
      expert: "strategy"                       # 切换战略专家
      tool: "ME_game_theory"
      params: { frame: "pricing_game" }
      condition: "step2.evidence_points_to('competitive_pressure')"
      onFailure: "skip"

    - step: 5
      id: "cross-expert-verify"
      expert: "finance"
      tool: "cross_expert_review"
      params: { targetExpert: "strategy", interaction: "RequestValidation", findings: ["step2.lineage_findings","step3.dol_result"] }
      condition: "step4.output.indicates('competitive_threat')"
      onFailure: "skip"

    - step: 6
      id: "synthesize"
      expert: "host"                           # 主Agent合成
      tool: "format_expert_report"
      params: { includeEvidenceRefs: true, confidenceAnnotation: true, conflictFlag: true }
      onFailure: "degrade"

  output:
    schema: "standard_expert_report"
    requiredFields: [evidenceRefs, confidence, rootCauseHypothesis, alternativeHypotheses, actionRecommendations]
```

### onFailure选项

| 选项 | 行为 | 适用场景 |
|------|------|---------|
| halt | 终止Playbook | 信号确认失败（后续无意义） |
| degrade | 标记degraded，继续 | 计算步骤失败（仍可继续） |
| skip | 跳过，继续 | 非关键路径 |
| retry(N) | 重试N次后降级 | 网络波动 |

---

## 五、PlaybookExecutionRecord

```typescript
interface PlaybookExecutionRecord {
  executionId: string;
  playbookId: string;
  playbookVersion: string;
  enterpriseId: string;
  triggerType: "sentinel" | "cron" | "manual" | "event";
  triggerDetail: { sentinelId?: string; severity?: string; manualBy?: string };
  startTime: string; endTime: string; durationMs: number;
  appliedOverrides: Record<string, any>;
  
  stepResults: Array<{
    stepId: string; stepIndex: number; expert: ExpertType;
    toolCalled: string; startTime: string; endTime: string; durationMs: number;
    status: "success" | "degraded" | "skipped" | "failed" | "halted";
    branchTaken: boolean; conditionEvaluated?: string;
    output?: { evidenceRefs?: string[]; confidence?: number; summary?: string };
    error?: { code: string; message: string; retryable: boolean };
    retryCount: number; fallbackUsed?: string;
  }>;
  
  crossExpertInteractions: Array<{
    fromExpert: ExpertType; toExpert: ExpertType;
    interactionType: "RequestValidation" | "Endorse" | "Challenge";
    timestamp: string; findingRef: string; responseSummary?: string;
  }>;
  
  finalOutput: {
    reportRef: string; confidence: number;
    degradedSteps: number; failedSteps: number;
    expertContributions: Record<ExpertType, number>;
  };
  
  tokenUsage: { totalInput: number; totalOutput: number; byStep: Record<string, { input: number; output: number }> };
  costEstimate: number;
}
// 存储: L5 SQLite playbook_executions表, 保留90天
```

---

## 六、本地自适应层

### 6.1 双层进化架构

```
┌─────────────────────────────┐
│   联邦进化层（全局优化）      │
│   ≥3企业通用→审核→灰度→全量  │
└──────────────┬──────────────┘
               │ 上报通用
┌──────────────▼──────────────┐
│  本地自适应层（企业特异性）   │
│  纠正→判定→持久化→下次应用   │
└─────────────────────────────┘
```

### 6.2 企业参数覆盖表

```typescript
interface EnterprisePlaybookOverrides {
  enterpriseId: string;
  playbookOverrides: Record<string, {
    parameterAdjustments: Record<string, any>;
    stepAdjustments: { addedSteps?: string[]; skippedSteps?: string[] };
    lastModifiedBy: string;
    lastModifiedAt: string;
    correctionReason: string;
  }>;
}
```

**存储位置**：L4本体层 — GraphStore的Enterprise节点下config.playbookOverrides属性
**加载策略**：启动时预加载到内存Map → L4事件流热加载（不重启） → 降级到出厂默认
**生命周期**：12个月未使用→自动标记"待确认"→GA审核
**通用性判定**：≥3企业→候选通用规则→升级联邦进化

### 6.3 自适应标注（adaptationNote）

```json
{
  "findingId": "F-2026-0042",
  "adaptationNote": {
    "applied": true,
    "overrides": [{
      "playbookId": "finance-profitability-root-cause",
      "stepId": "trace-cost-lineage",
      "adjustmentType": "parameter",
      "originalValue": 0.7,
      "appliedValue": 0.6,
      "reason": "小制造企业成本结构阈值需调低",
      "modifiedBy": "GA_LiMing",
      "modifiedAt": "2026-07-15T10:30:00Z"
    }]
  }
}
```

---

## 附录A：StandardExpertReport Schema

```typescript
interface StandardExpertReport {
  reportId: string; playbookExecutionId: string;
  expert: ExpertType; timestamp: string;
  rootCauseHypothesis: { statement: string; confidence: number; evidenceRefs: string[]; causalChain: string[] };
  alternativeHypotheses: Array<{ statement: string; confidence: number; whyRejected?: string }>;
  actionRecommendations: Array<{ action: string; priority: "critical"|"high"|"medium"|"low"; responsibleRole: string; estimatedEffort: string; expectedImpact: string; verificationCriteria: string }>;
  dataConflicts: Array<{ field: string; sourceA: string; sourceB: string; discrepancy: string; resolution: string }>;
  adaptationNotes?: AdaptationNote[];
  metadata: { edgesConsumed: string[]; toolsCalled: string[]; modelsUsed: string[]; tokenUsage: { input: number; output: number } };
}
```
