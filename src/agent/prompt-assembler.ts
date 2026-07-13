/**
 * agent/prompt-assembler.ts — 6模块提示词组装 (D54)
 *
 * 消费 D53 expert manifest.json，按专家类型+任务类型按需组装6个
 * 标准提示词模块 (M1-M6)。输出 ≤4K tokens 的标准提示词。
 *
 * 约束:
 *  - M2(工具调用)必须在M3(推理链)前加载（代码级排序保证）
 *  - Token预算 ≤32000 字符 (~4000 tokens)，超限截断M3
 *  - 零 as any（铁律38）
 *  - 按需加载（单专家不加载M4/M6）
 *
 * 铁律 24+31: 文件加载失败独立降级，返回 degraded: true
 * 铁律 32: 错误带 .code + .phase + .retryable
 */
import { createLogger } from '@synova/logger';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const log = createLogger('agent/prompt-assembler');

// ═══ Types ═══

/** D53专家manifest结构（核心字段，manifest.json的可消费子集） */
export interface ExpertManifest {
  name: string;
  displayName: string;
  description: string;
  tone: string;
  boundaries: string[];
  frameworks: string[];
  edges: string[];
  computes: string[];
  crossDomainRule: string;
  moduleLoading: {
    always: string[];
    onDemand: Record<string, string>;
  };
  dependencies?: {
    peers: string[];
    sentinels?: string[];
    computes?: string[];
  };
  [key: string]: unknown;
}

/** 调用assemblePrompt时传入的上下文 */
export interface PromptContext {
  /** 当前诊断发现事项 */
  findings?: Array<{
    id: string;
    title: string;
    severity: string;
    description: string;
  }>;
  /** 核心因果边列表 */
  topEdges?: string[];
  /** 是否存在数据冲突 */
  hasConflict?: boolean;
  /** 已完成的专家输出（文本数组） */
  previousOutputs?: string[];
  /** 严重等级 */
  severity?: 'P0' | 'P1' | 'P2' | 'P3';
  /** 协作专家列表（不为空=多专家场景） */
  collaboratingExperts?: string[];
  /** 项目根目录覆盖（用于测试） */
  projectRoot?: string;
  /** 提示词模式 — 'report'(报告场景) 或 'conversation'(对话场景) */
  mode?: 'report' | 'conversation';
  /** 团队ID（用于推断报告场景） */
  teamId?: string;
  /** 报告ID（与teamId同时存在时推断为报告场景） */
  reportId?: string;
}

/** assemblePrompt 的返回类型 */
export interface AssembleResult {
  systemPrompt: string;
  userMessage: string;
  /** 估算Token数（字符数/4） */
  tokenCount: number;
  /** 实际加载的模块列表（按加载顺序） */
  modules: string[];
  /** 是否降级（manifest缺失、Token超限等） */
  degraded: boolean;
}

// ═══ Module builders ═══

/**
 * M1: 角色定义 + 四源Tone融合 + 角色一致性 (D57 扩展)
 *
 * 注入四源Tone声明（§5.1/§5.2）:
 *   P0(Professional objectivity) > P1(温暖度) > P2(性格表达)
 * 角色一致性（§5.3）: 当前专家的语调，不模仿其他专家
 * 散文格式（§5.4）: 报告用自然段落，而非Markdown列表
 */
function buildM1(expert: ExpertManifest, context: PromptContext): string {
  const isReport = (context.mode ?? resolvePromptMode(context)) === 'report';
  const proseRule = isReport
    ? '\n- 报告输出格式：诊断报告用自然段落。复合发现写成"几个因素同时作用：首先……其次……"，不用层级缩进列表。每个发现独立成段。'
    : '';
  return `## 你的角色
你是${expert.displayName}。
${expert.description}

## 语调
${expert.tone}

## 框架
${expert.frameworks.map(f => `- ${f}`).join('\n')}

## Tone声明
### P0 — 专业客观（最高优先级）
准确性不可妥协。客观纠正 > 错误认同。避免过度赞扬。
### P1 — 温暖度
温暖但诚实。不预判用户能力。${isReport ? '散文而非列表/子弹点。' : ''}
### P2 — 性格表达
可以有意见、有偏好。公平呈现对立观点。在呈现数据冲突时，两个版本都呈现，不替用户选择"正确"版本。

## 角色一致性（§5.3）
你当前的语调是"${expert.tone}"。使用你的专业语言，不要模仿其他专家的语调。
财务专家不说战略专家的语言，组织专家不说技术专家的语言。${proseRule}`;
}

/**
 * M2: 工具调用 + 对话场景约束 (D57 扩展)
 *
 * 对话场景（mode === 'conversation'）:
 *   一次只问一个问题，等待用户回答后再继续
 * 报告场景（mode === 'report'）:
 *   每个发现独立成段
 */
function buildM2(expert: ExpertManifest, context: PromptContext): string {
  const edges = expert.edges.map(e => `  - ${e}`).join('\n');
  const computes = expert.computes.map(c => `  - ${c}`).join('\n');
  const isConversation = (context.mode ?? resolvePromptMode(context)) === 'conversation';
  const conversationRule = isConversation
    ? '\n\n对话交互原则：一次只问一个问题。等待用户回答后再继续。不要在同一轮中追问多个问题。'
    : '';
  return `## 工具调用
你可以查询以下边参数:
${edges}

可调用compute:
${computes}

禁止调用其他专家的compute。每次工具调用后使用结构化引用格式。${conversationRule}`;
}

/**
 * M3: 推理链 — 四层追溯协议 (D55 完整实现)
 *
 * 将专家的42边分布到4个推理层，每层引用对应的边参数。
 * 层1: 信号确认（症状）— 数据层面的发现确认
 * 层2: 传导路径（直接原因）— 因果传导链
 * 层3: 结构原因（系统性条件）— 支撑问题的结构性因素
 * 层4: 根因（根本原因）— 最深层的驱动因素
 */
function buildM3(expert: ExpertManifest, context: PromptContext): string {
  const edges = expert.edges;
  const total = edges.length;
  const perLayer = Math.max(1, Math.ceil(total / 4));

  const layer1Edges = edges.slice(0, perLayer).join(', ');
  const layer2Edges = edges.slice(perLayer, perLayer * 2).join(', ');
  const layer3Edges = edges.slice(perLayer * 2, perLayer * 3).join(', ');
  const layer4Edges = edges.slice(perLayer * 3).join(', ');

  return `## 推理链
请按以下四层追溯协议逐步推理，每层引用相关的42边参数进行分析。

### 第1层：信号确认（症状）
识别哪些数据/信号表明当前发现确实存在。检查数据源的可靠性、时效性和覆盖度。
参考边: ${layer1Edges || '根据当前专家域选择'}
输出要求：列出至少3个独立数据点，标注每个数据点的置信度。

### 第2层：传导路径（直接原因）
分析信号如何传导至当前表现。识别直接因果路径，区分相关性和因果性。
参考边: ${layer2Edges || '根据当前专家域选择'}
输出要求：绘制因果链（A→B→C），标注每条链的证据强度。

### 第3层：结构原因（系统性条件）
分析支撑当前问题的组织结构、流程或系统性因素。区分偶发问题和结构性问题。
参考边: ${layer3Edges || '根据当前专家域选择'}
输出要求：识别至少2个系统性条件，评估是否可改变。

### 第4层：根因（根本原因）
追溯最深层的驱动因素，回答"为什么会存在这个结构"。根因通常与商业模式、激励机制或文化相关。
参考边: ${layer4Edges || '根据当前专家域选择'}
输出要求：根因陈述必须可证伪（"如果X改变，Y是否会消失"）。

当前发现:
{{FINDINGS_SUMMARY}}

核心因果边:
{{TOP_3_CAUSAL_EDGES}}`;
}

/**
 * M4: 交叉验证 — 两道防线 (D55 完整实现)
 *
 * 第一道防线: 输出格式规范（结构性预防——确保交叉引用可机器解析）
 * 第二道防线: 循环引用检测（逻辑性预防——防止专家循环依赖）
 */
function buildM4(): string {
  return `## 交叉验证 — 两道防线

### 第一道防线：输出格式规范
当引用其他专家结论时，必须使用以下结构化格式：
[expert:{expertName}, finding:{findingId}, confidence:{confidence值}]

不一致度计算公式：
不一致度 = 1 - (置信度A × 置信度B × 方向一致性系数)
其中方向一致性系数：结论方向相同=1.0，相反=-1.0，部分一致=0.5

当不一致度 > 0.3 时，触发交叉验证流程：
1. 双方提供各自的数据来源
2. 检查是否使用了不同的假设
3. 若仍不一致，降低一方置信度或引入第三方专家仲裁

### 第二道防线：循环引用检测
专家依赖图中若存在循环引用（A→B→A），必须在推理中标注风险：

⚠️ 循环检测: A→B→A
可能原因：两个专家共享同一假设基础
处理方式：至少一方降低置信度或引入第三方专家仲裁

交叉验证结论格式：
{verified: boolean, sourceExpert: string, targetFinding: string, discrepancy: number, resolution: string}`;
}

/**
 * M5: 边界识别 + 置信度三级标注 + 信息不足强制输出 (D56 扩展)
 *
 * 置信度三级标注规范(§4.4):
 *   >0.8 直接陈述 / 0.5-0.8 推断标注 / <0.5 猜测标注
 * 信息不足强制输出(§4.3):
 *   数据不足时必须使用标准模板，不得编造
 */
function buildM5(expert: ExpertManifest): string {
  const boundaries = expert.boundaries.map((b, i) => `${i + 1}. ${b}`).join('\n');
  return `## 边界约束（不可违反）
${boundaries}

## 置信度三级标注
- 置信度 > 0.8：直接陈述（"数据显示..."）
- 置信度 0.5-0.8：标注推断程度（"数据表明可能..."）
- 置信度 < 0.5：标注为猜测（"初步推测..."），不用于决策

## 信息不足强制输出
当数据不足以支持诊断时，必须使用以下标准格式：
"当前数据不足以支持[领域]诊断。需要补充：[具体数据需求列表]。"
禁止空泛表述（如"需要更多数据"）。

## 越界处理
${expert.crossDomainRule}`;
}

/**
 * M6: 数据冲突感知 — 4条规则 + 示例输出 (D56 完整实现)
 *
 * 第10份权威文档第四章4.1: has_conflict 4条规则
 *   规则1: 告知歧义 / 规则2: 展示冲突版本 / 规则3: 分别诊断 / 规则4: 不默认选择
 */
function buildM6(): string {
  return `## 数据冲突感知
{{DATA_CONFLICT_ALERTS}}

当检测到数据冲突时 (has_conflict=true)，遵循以下4条规则：

### 规则1：告知歧义
在推理结论中明确标注"当前数据存在歧义"，解释冲突来源（不同数据源/不同时间口径/不同计算方法）。

### 规则2：展示冲突版本
列出所有冲突版本的核心差异，标注每个版本的来源和时效性。
格式：[版本X: {来源}, {时效性}, {核心差异}]

### 规则3：分别诊断
基于每个冲突版本分别给出对应的诊断结论（而非选择一个版本进行诊断）。

### 规则4：不默认选择
不默认选择任一版本为"正确"——留给用户或决策者判断。

示例输出：
冲突警告：节点"毛利率"存在2个版本
- 版本1（2026-06-30，财务系统）：毛利率 = 38%
- 版本2（2026-07-05，业务报表）：毛利率 = 42%
基于版本1的诊断 → 毛利率下降趋势持续
基于版本2的诊断 → 毛利率已企稳回升
建议：核对数据源，确认哪个口径更符合当前分析需求。`;
}

// ═══ Module registry ═══

type ModuleBuilder = (expert: ExpertManifest, context: PromptContext) => string;

const moduleBuilders: Record<string, ModuleBuilder> = {
  M1: buildM1,
  M2: buildM2,
  M3: buildM3,
  M4: buildM4,
  M5: buildM5,
  M6: buildM6,
};

/** 代码级模块加载顺序（硬编码保证M2在M3之前） */
const MODULE_ORDER: string[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

// ═══ Prompt mode resolution ═══

/**
 * 解析提示词模式：报告场景 vs 对话场景。
 *
 * 优先级:
 *   1. context.mode 显式指定
 *   2. context.teamId 和 context.reportId 同时存在 → 'report'
 *   3. 默认 → 'conversation'
 */
export function resolvePromptMode(context: PromptContext): 'report' | 'conversation' {
  if (context.mode === 'report' || context.mode === 'conversation') {
    return context.mode;
  }
  if (context.teamId && context.reportId) {
    return 'report';
  }
  return 'conversation';
}

// ═══ Expert loop detection ═══

/** 循环检测结果 */
export interface LoopResult {
  /** 是否存在循环 */
  hasLoop: boolean;
  /** 循环路径（如 ['finance', 'strategy', 'finance']） */
  path: string[];
}

/**
 * 检测专家依赖图中是否存在循环引用。
 *
 * 纯确定性的DFS图遍历——零外部调用（约束3）。
 * 使用 getPeers 回调避免文件I/O依赖，方便测试。
 * 使用三色标记法（WHITE/GRAY/BLACK）检测有向图循环。
 *
 * @param startExpert - 起始专家类型
 * @param getPeers    - 返回指定专家的peer依赖列表的回调
 * @returns 检测结果
 *
 * @example
 * detectExpertLoop('finance', (t) =>
 *   t === 'finance' ? ['strategy'] : t === 'strategy' ? ['finance'] : []
 * )
 * // => { hasLoop: true, path: ['finance', 'strategy', 'finance'] }
 */
export function detectExpertLoop(
  startExpert: string,
  getPeers: (expertType: string) => string[],
): LoopResult {
  // 三色标记: 0=未访问(WHITE), 1=在路径中(GRAY), 2=已处理完(BLACK)
  const color = new Map<string, number>();
  const path: string[] = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  function dfs(current: string): boolean {
    color.set(current, GRAY);
    path.push(current);

    for (const peer of getPeers(current)) {
      const c = color.get(peer) ?? WHITE;
      if (c === GRAY) {
        // 发现后向边 → 循环
        path.push(peer);
        return true;
      }
      if (c === WHITE) {
        if (dfs(peer)) return true;
      }
      // c === BLACK: 已处理完，无需继续
    }

    color.set(current, BLACK);
    path.pop();
    return false;
  }

  const hasLoop = dfs(startExpert);

  if (hasLoop) {
    return { hasLoop: true, path: [...path] };
  }
  return { hasLoop: false, path: [] };
}

// ═══ Placeholder helpers ═══

function summarizeFindings(
  findings?: Array<{ id: string; title: string; severity: string; description: string }>,
): string {
  if (!findings || findings.length === 0) return '暂无发现事项';
  return findings
    .map(f => `- [${f.severity}] ${f.title}: ${f.description}`)
    .join('\n');
}

function injectPlaceholders(template: string, context: PromptContext): string {
  return template
    .replace('{{FINDINGS_SUMMARY}}', summarizeFindings(context.findings))
    .replace(
      '{{TOP_3_CAUSAL_EDGES}}',
      context.topEdges?.join(', ') || '无',
    )
    .replace(
      '{{DATA_CONFLICT_ALERTS}}',
      context.hasConflict
        ? '⚠️ 数据冲突警告：节点存在多个数据版本，可能影响分析准确性。请在推理中标注冲突来源并给出两个版本解读。'
        : '无数据冲突',
    )
    .replace(
      '{{PREVIOUS_EXPERT_OUTPUTS}}',
      context.previousOutputs?.join('\n') || '',
    );
}

/**
 * M3截断策略: 保留1完整示例 + 3关键模式
 * 超限时保留推理链框架（4步协议）但裁剪占位符值到最短形式
 */
function truncateM3Content(_template: string, context: PromptContext): string {
  // 保留标题 + 四层追溯协议框架（只保留层标题和核心指令）
  const header = `## 推理链
请按以下四层追溯协议逐步推理：

### 第1层：信号确认（症状）
### 第2层：传导路径（直接原因）
### 第3层：结构原因（系统性条件）
### 第4层：根因（根本原因）`;
  const findings =
    context.findings && context.findings.length > 0
      ? `当前发现: 共 ${context.findings.length} 项发现（详情见user message）`
      : '当前发现: 暂无发现事项';
  const edges = context.topEdges?.join(', ') || '无';
  return `${header}

${findings}

核心因果边: ${edges}

[提示词已截断 — 超出Token预算，保留推理链框架]`;
}

// ═══ User message builder ═══

function buildUserMessage(context: PromptContext): string {
  const parts: string[] = ['## 当前诊断上下文'];
  if (context.findings && context.findings.length > 0) {
    parts.push('### 发现事项');
    parts.push(JSON.stringify(context.findings, null, 2));
  }
  if (context.previousOutputs && context.previousOutputs.length > 0) {
    parts.push('### 已完成的专家输出');
    parts.push(context.previousOutputs.join('\n\n'));
  }
  return parts.join('\n\n');
}

// ═══ Manifest loader ═══

function loadExpertManifest(expertType: string, projectRoot?: string): ExpertManifest {
  const root = projectRoot ?? process.cwd();
  const manifestPath = join(root, 'expert', expertType, 'manifest.json');

  if (!existsSync(manifestPath)) {
    const err = new Error(`专家manifest不存在: ${manifestPath}`);
    Object.assign(err, { code: 'MANIFEST_NOT_FOUND', phase: 'prompt-assembly', retryable: false });
    throw err;
  }

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as ExpertManifest;
    return parsed;
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    const err = new Error(`专家manifest解析失败 (${expertType}): ${msg}`);
    Object.assign(err, { code: 'MANIFEST_PARSE_FAILED', phase: 'prompt-assembly', retryable: true });
    throw err;
  }
}

// ═══ Default moduleLoading fallback ═══

const DEFAULT_ALWAYS_MODULES = ['M1', 'M2', 'M3', 'M5'];
const DEFAULT_ON_DEMAND_MODULES: Record<string, string> = {
  M4: '多专家协作场景',
  M6: '有数据冲突时',
};

// ═══ On-demand conditions ═══

/**
 * 判断某个on-demand模块在给定上下文中是否应该被加载
 *
 * 条件规则（匹配第10份权威文档第二章2.1-2.4节）:
 * - M4: 多专家协作场景或P0紧急场景
 * - M6: 存在数据冲突
 * - 其他on-demand模块: 留空（等待D55定义）
 */
function shouldLoadOnDemand(moduleId: string, context: PromptContext): boolean {
  switch (moduleId) {
    case 'M4':
      return (context.collaboratingExperts?.length ?? 0) > 0 || context.severity === 'P0';
    case 'M6':
      return context.hasConflict === true;
    default:
      return false;
  }
}

// ═══ Main entry ═══

/**
 * 按专家类型+上下文组装提示词
 *
 * @param expertType - 专家类型名，对应 expert/{type}/manifest.json（如 finance, tech, org）
 * @param context   - 诊断上下文
 * @param manifestOverride - 可选的manifest覆盖（测试用，不传递则从磁盘加载）
 * @returns 组装结果
 */
export function assemblePrompt(
  expertType: string,
  context: PromptContext,
  manifestOverride?: ExpertManifest,
): AssembleResult {
  let expert: ExpertManifest;
  let degraded = false;

  // Step 1: 加载manifest
  try {
    expert = manifestOverride ?? loadExpertManifest(expertType, context.projectRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ code: 'PROMPT_ASSEMBLY_FAILED', expertType, err: msg }, '专家manifest加载失败');
    return {
      systemPrompt: '',
      userMessage: '',
      tokenCount: 0,
      modules: [],
      degraded: true,
    };
  }

  // Step 2: 按需选择模块
  const moduleLoading = expert.moduleLoading ?? {
    always: DEFAULT_ALWAYS_MODULES,
    onDemand: DEFAULT_ON_DEMAND_MODULES,
  };

  const moduleSet = new Set<string>(moduleLoading.always ?? DEFAULT_ALWAYS_MODULES);

  // 检查on-demand条件
  for (const [modId] of Object.entries(moduleLoading.onDemand ?? {})) {
    if (shouldLoadOnDemand(modId, context)) {
      moduleSet.add(modId);
    }
  }

  // Step 3: 排序（代码级保证 M2 在 M3 之前）
  const modules = MODULE_ORDER.filter(m => moduleSet.has(m));

  // 额外检查: M2必须在M3之前
  const idxM2 = modules.indexOf('M2');
  const idxM3 = modules.indexOf('M3');
  if (idxM2 !== -1 && idxM3 !== -1 && idxM2 > idxM3) {
    log.error({ expertType, modules }, '加载顺序违规: M2在M3之后 — 强制纠正');
    // 从modules中取出M2放到M3前面
    modules.splice(idxM2, 1);
    const newIdxM3 = modules.indexOf('M3');
    modules.splice(newIdxM3, 0, 'M2');
    degraded = true;
  }

  // Step 4: 组装模块内容
  const moduleContents: Record<string, string> = {};
  for (const m of modules) {
    const builder = moduleBuilders[m];
    if (!builder) {
      log.warn({ module: m }, '未知模块ID，跳过');
      continue;
    }
    let content = builder(expert, context);
    content = injectPlaceholders(content, context);
    moduleContents[m] = content;
  }

  // Step 5: 预估Token预算，超限则截断M3
  let systemPrompt = modules.map(m => moduleContents[m] ?? '').join('\n\n---\n\n');
  const BUDGET_CHARS = 32000;

  if (systemPrompt.length > BUDGET_CHARS && modules.includes('M3')) {
    const truncatedM3 = truncateM3Content(
      moduleBuilders.M3(expert, context),
      context,
    );
    moduleContents.M3 = truncatedM3;
    systemPrompt = modules.map(m => moduleContents[m] ?? '').join('\n\n---\n\n');
    degraded = true;
    log.warn(
      { expertType, moduleCount: modules.length },
      '提示词超32000字符 — M3已截断（保留推理链框架+最短占位符）',
    );
  }

  const tokenCount = Math.ceil(systemPrompt.length / 4);
  const userMessage = buildUserMessage(context);

  return { systemPrompt, userMessage, tokenCount, modules, degraded };
}
