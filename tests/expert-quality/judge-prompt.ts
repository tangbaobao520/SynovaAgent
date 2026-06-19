/**
 * tests/expert-quality/judge-prompt.ts — LLM 法官评分标准
 *
 * 六维加权评分体系，用于评估 SynovaAgent 诊断专家的产出质量。
 * 遵循 Anthropic 工程标准: 行为锚定 + Chain-of-Thought + 结构化输出。
 */

// ═══ 六维权重 ═══

export const DIMENSION_WEIGHTS = {
  factualAccuracy: 0.25,
  evidenceQuality: 0.20,
  reasoningDepth: 0.20,
  actionability: 0.15,
  domainBoundary: 0.10,
  expressionQuality: 0.10,
} as const;

export type DimensionName = keyof typeof DIMENSION_WEIGHTS;

// ═══ 行为锚定表 ═══

export const RUBRIC_ANCHORS: Record<DimensionName, Record<number, string>> = {
  factualAccuracy: {
    1: '编造事实，无法在证据中找到任何支撑——幻觉',
    2: '多个关键 claim 无证据支撑或与证据矛盾',
    3: '大部分准确，1-2 处轻微不精确或过度推断',
    4: '所有 claim 有证据支撑，措辞轻微不精确',
    5: '每个 claim 精确匹配证据，零幻觉，零过度推断',
  },
  evidenceQuality: {
    1: '无任何证据引用；finding 完全无据',
    2: '引用的证据不相关（答非所问）或明显不充分',
    3: '部分 finding 有相关证据，但其他缺乏引用或证据弱',
    4: '大部分 finding 引用具体、相关的证据',
    5: '所有 finding 引用高质量、具体的证据，有交叉验证/多源支撑',
  },
  reasoningDepth: {
    1: '事实重述——把输入数据换了一种说法重新排列，无诊断推理',
    2: '简单模式匹配——识别了表面问题但无因果分析（"A 不好所以要改进 A"）',
    3: '有因果推理但不完整——找到了原因但未追问深层原因，或遗漏了关键连接',
    4: '清晰的因果链——证据→发现→结论，逻辑连贯，有诊断思路',
    5: '深层诊断——差异化思考（排除了其他可能）、多层因果链（追问了"为什么"）、标注了不确定性',
  },
  actionability: {
    1: '无任何建议，或建议为空话（"提高效率""加强管理""优化流程"）',
    2: '模糊建议——方向正确但缺乏任何具体步骤（如"建议降低客户集中度"但没说怎么降）',
    3: '部分建议具体但缺少上下文——知道做什么但不知道从哪开始',
    4: '清晰的、与诊断发现挂钩的具体建议——有操作对象、有方向',
    5: '带优先级排序、与上下文匹配、可直接执行的具体建议——企业负责人拿到就能开工',
  },
  domainBoundary: {
    1: '大规模越界——如在 tech 专家的输出中给出财务重组建议',
    2: '多处不当跨域判断，未标注不确定性',
    3: '偶有轻微越界，但跨域结论标注了不确定性',
    4: '在自身域内工作，跨域发现明确标注"需与 XX 专家交叉验证"',
    5: '严格域内诊断——完全在自身领域内推理，跨域时主动引用具体其他专家',
  },
  expressionQuality: {
    1: '充满内部术语（D1/D2/测量器/GapDimension/本体层/EvidenceRef），企业负责人完全看不懂',
    2: '多处术语泄漏或表达混乱——部分段落像技术文档',
    3: '基本可读——有少量术语或学术化表达，但大意可理解',
    4: '清晰具体——用企业负责人的语言，几乎无术语，容易理解',
    5: '企业负责人的语言——具体、生动、简洁，可以直接用作决策输入，没有任何内部术语',
  },
};

// ═══ 总分等级 ═══

export const GRADE_THRESHOLDS = [
  { grade: 'A', min: 4.0, label: '优秀——可直接交付客户' },
  { grade: 'B', min: 3.0, label: '良好——需轻微修改' },
  { grade: 'C', min: 2.0, label: '一般——需要实质性修改' },
  { grade: 'D', min: 1.0, label: '差——需要重做' },
  { grade: 'F', min: 0.0, label: '不可用——幻觉或结构错误' },
] as const;

// ═══ LLM 法官输出 Schema ═══

export interface JudgeVerdict {
  /** 逐维度评分 (1-5) */
  perDimensionScores: Record<DimensionName, number>;
  /** 加权总分 (0-5) */
  overallScore: number;
  /** 等级 */
  grade: string;
  /** 逐维度推理 (CoT) */
  dimensionReasoning: Record<DimensionName, string>;
  /** 关键优点 (2-4 条) */
  keyStrengths: string[];
  /** 关键缺陷 (2-4 条) */
  keyWeaknesses: string[];
  /** 总体评价 (1-2 句) */
  summaryVerdict: string;
}

// ═══ 构建法官 System Prompt ═══

export function buildJudgeSystemPrompt(expertName: string, enterpriseContext: string): string {
  const dimensionSections = (Object.keys(DIMENSION_WEIGHTS) as DimensionName[])
    .map(dim => {
      const anchors = RUBRIC_ANCHORS[dim];
      const anchorLines = Object.entries(anchors)
        .map(([score, desc]) => `    ${score}分 = ${desc}`)
        .join('\n');
      return `### ${dim} (权重: ${(DIMENSION_WEIGHTS[dim] * 100).toFixed(0)}%)
${anchorLines}`;
    })
    .join('\n\n');

  return `你是 SynovaAgent 的诊断质量评估官。你的任务是评估一位名叫"${expertName}"的 AI 诊断专家的产出质量。

## 企业背景

${enterpriseContext}

## 评分标准（六维加权）

${dimensionSections}

## 评分步骤（Chain-of-Thought）

请严格按以下步骤进行评估：

1. **逐维分析**: 对于每个维度，先引用专家输出中的具体内容作为证据，再给出 1-5 的评分。不要跳过——每个维度都必须有具体的引用。
2. **边界判断**: 如果你的判断在两个分数之间，使用以下规则：
   - 倾向于较低分数（宁可严格，不可放水）
   - 如果你不确定某个 claim 是否有证据支撑，假设它没有（疑罪从有）
3. **关键优缺点**: 提取 2-4 个关键优点和 2-4 个关键缺陷。每条必须引用专家输出的具体内容。
4. **综合评分**: 按权重计算加权总分，确定等级。

## 校准边界案例

**案例 A (factualAccuracy=3)**: "企业面临核心人员流失风险"——这和其他专家一致但未引用具体证据 → 3 分（真实但不是从数据推断的）
**案例 B (factualAccuracy=4)**: "张老师承担 60% 课程量，企业访谈中王总明确表示'他走了研发就停了'"→ 4 分（精确匹配证据）
**案例 C (factualAccuracy=2)**: "企业利润率约 40%"——但企业数据明确写着毛利率 45%，净利率 15% → 2 分（数据有矛盾）

**案例 D (actionability=2)**: "建议优化组织架构"→ 2 分（方向正确但完全无法执行）
**案例 E (actionability=4)**: "建议在 90 天内完成张老师知识体系文档化，将至少 40% 课程内容转移给另外 2 位讲师，同步修改薪酬结构使课程交付量与收入挂钩"→ 4 分（有时间、有对象、有量化目标）

## 输出格式

必须输出以下 JSON（不要 Markdown 代码块包裹）:

{
  "perDimensionScores": {
    "factualAccuracy": <1-5>,
    "evidenceQuality": <1-5>,
    "reasoningDepth": <1-5>,
    "actionability": <1-5>,
    "domainBoundary": <1-5>,
    "expressionQuality": <1-5>
  },
  "overallScore": <加权总分，保留1位小数>,
  "grade": "<A/B/C/D/F>",
  "dimensionReasoning": {
    "factualAccuracy": "<逐维推理，引用专家输出具体内容作为评分依据>",
    "evidenceQuality": "<同上>",
    "reasoningDepth": "<同上>",
    "actionability": "<同上>",
    "domainBoundary": "<同上>",
    "expressionQuality": "<同上>"
  },
  "keyStrengths": ["<引用具体内容的优点>", ...],
  "keyWeaknesses": ["<引用具体内容的缺陷>", ...],
  "summaryVerdict": "<1-2句总体评价>"
}`;
}

// ═══ 计算加权总分 ═══

export function computeOverallScore(scores: Record<DimensionName, number>): number {
  let total = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS) as [DimensionName, number][]) {
    total += (scores[dim] || 0) * weight;
  }
  return Math.round(total * 10) / 10; // 保留 1 位小数
}

// ═══ 获取等级 ═══

export function getGrade(score: number): { grade: string; label: string } {
  for (const threshold of GRADE_THRESHOLDS) {
    if (score >= threshold.min) return { grade: threshold.grade, label: threshold.label };
  }
  return { grade: 'F', label: '不可用' };
}

// ═══ 验证法官输出 ═══

export function validateJudgeOutput(raw: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!raw.perDimensionScores || typeof raw.perDimensionScores !== 'object') {
    errors.push('缺少 perDimensionScores');
  } else {
    const scores = raw.perDimensionScores as Record<string, unknown>;
    for (const dim of Object.keys(DIMENSION_WEIGHTS)) {
      const v = scores[dim];
      if (typeof v !== 'number' || v < 1 || v > 5) {
        errors.push(`perDimensionScores.${dim} 无效: ${v}`);
      }
    }
  }

  if (typeof raw.overallScore !== 'number' || raw.overallScore < 0 || raw.overallScore > 5) {
    errors.push(`overallScore 无效: ${raw.overallScore}`);
  }

  if (!raw.grade || !['A', 'B', 'C', 'D', 'F'].includes(raw.grade as string)) {
    errors.push(`grade 无效: ${raw.grade}`);
  }

  if (!raw.summaryVerdict || typeof raw.summaryVerdict !== 'string' || raw.summaryVerdict.length < 10) {
    errors.push('summaryVerdict 缺失或过短');
  }

  if (!Array.isArray(raw.keyStrengths) || raw.keyStrengths.length < 1) {
    errors.push('keyStrengths 缺失或为空');
  }

  if (!Array.isArray(raw.keyWeaknesses) || raw.keyWeaknesses.length < 1) {
    errors.push('keyWeaknesses 缺失或为空');
  }

  return { valid: errors.length === 0, errors };
}
