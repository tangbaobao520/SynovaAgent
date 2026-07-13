/**
 * tests/agent/prompt-assembler.test.ts — D54 + D55 6模块提示词组装
 *
 * 覆盖: 按需加载 / M2在M3前 / Token截断 / 占位符注入 / 降级路径
 *       M3四层推理链(42边引用) / M4两道防线 / detectExpertLoop循环检测
 * 约束: ≥8测试 / 零as any / 覆盖单专家+多专家场景
 */
import { describe, it, expect } from 'vitest';
import {
  assemblePrompt,
  detectExpertLoop,
  resolvePromptMode,
  type ExpertManifest,
  type PromptContext,
} from '../../src/agent/prompt-assembler';

// ═══ Test fixture ═══

const testManifest: ExpertManifest = {
  name: 'test-expert',
  displayName: '测试专家',
  description: '用于D54测试的模拟专家',
  tone: '精确、审慎、量化。每一项金额估算必须标明假设和误差范围。',
  boundaries: [
    '不替代专业财务审计',
    '不出品牌策略建议',
  ],
  frameworks: [
    '杜邦分析 (ROE拆解)',
    'ROI 排序',
  ],
  edges: ['E-05', 'E-06', 'E-13'],
  computes: ['COMPUTE-BREAK-EVEN-v1', 'COMPUTE-DOL-v1'],
  crossDomainRule: '当遇到越界问题时，必须回复：这不在我的诊断范围内。',
  moduleLoading: {
    always: ['M1', 'M2', 'M3', 'M5'],
    onDemand: {
      M4: '多专家协作场景',
      M6: '有数据冲突时',
    },
  },
};

// ═══ Helper ═══

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    findings: [
      { id: 'f1', title: '现金流紧张', severity: 'high', description: '运营现金流为负' },
      { id: 'f2', title: '毛利率下降', severity: 'medium', description: '从45%降至38%' },
    ],
    topEdges: ['E-05 (现金流→运营)', 'E-06 (利润→成本)'],
    hasConflict: false,
    severity: 'P1',
    ...overrides,
  };
}

// ═══ Tests ═══

describe('D54 — prompt-assembler 按需加载', () => {
  it('单专家场景 → 4模块(M1+M2+M3+M5)', () => {
    const ctx = makeContext({ collaboratingExperts: undefined });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.modules).toEqual(['M1', 'M2', 'M3', 'M5']);
    expect(result.systemPrompt).toContain('你是测试专家');
    expect(result.systemPrompt).toContain('工具调用');
    expect(result.systemPrompt).toContain('推理链');
    expect(result.systemPrompt).toContain('边界约束');
    expect(result.systemPrompt).not.toContain('交叉验证');
    expect(result.systemPrompt).not.toContain('数据冲突感知');
  });

  it('多专家场景 → 6模块(含M4+M6)', () => {
    const ctx = makeContext({ collaboratingExperts: ['finance', 'strategy'], hasConflict: true });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.modules).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
    expect(result.systemPrompt).toContain('交叉验证');
    expect(result.systemPrompt).toContain('数据冲突感知');
  });

  it('P0紧急场景 → M4被加载', () => {
    const ctx = makeContext({ severity: 'P0', collaboratingExperts: undefined, hasConflict: false });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.modules).toContain('M4');
    expect(result.modules).not.toContain('M6'); // hasConflict=false → 无M6
  });
});

describe('D54 — M2在M3之前', () => {
  it('systemPrompt中M2内容在M3内容之前', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    const m2Pos = result.systemPrompt.indexOf('工具调用');
    const m3Pos = result.systemPrompt.indexOf('推理链');
    expect(m2Pos).toBeGreaterThan(-1);
    expect(m3Pos).toBeGreaterThan(-1);
    expect(m2Pos).toBeLessThan(m3Pos);
  });

  it('模块列表顺序 M1→M2→M3→M5', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.modules.indexOf('M2')).toBeLessThan(result.modules.indexOf('M3'));
  });
});

describe('D54 — Token预算控制', () => {
  it('超长发现 → M3被截断 + degraded=true', () => {
    // 构造300个发现事项使总提示词超过32000字符
    const manyFindings = Array.from({ length: 300 }, (_, i) => ({
      id: `f${i}`,
      title: `发现事项${i}`,
      severity: 'low' as const,
      description: '这是一条用于触发Token超限截断的发现事项描述文本，重复填充使总长度超过32000字符阈值。'.repeat(3),
    }));
    const ctx = makeContext({ findings: manyFindings, topEdges: undefined });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.degraded).toBe(true);
    // 截断后提示词远低于32000（M3替换为短摘要）
    expect(result.systemPrompt.length).toBeLessThan(2000);
    // 截断标记存在
    expect(result.systemPrompt).toContain('超出Token预算');
  });

  it('正常长度 → 不截断 + degraded=false', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.degraded).toBe(false);
    expect(result.systemPrompt).not.toContain('[提示词已截断]');
  });

  it('tokenCount ≈ 字符数/4', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    const expectedTokens = Math.ceil(result.systemPrompt.length / 4);
    expect(result.tokenCount).toBe(expectedTokens);
  });
});

describe('D54 — {{PLACEHOLDER}} 动态注入', () => {
  it('{{FINDINGS_SUMMARY}} 被替换为发现摘要', () => {
    const ctx = makeContext({
      findings: [
        { id: 'f1', title: '现金流紧张', severity: 'high', description: '运营现金流为负' },
      ],
    });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('[high] 现金流紧张');
    expect(result.systemPrompt).not.toContain('{{FINDINGS_SUMMARY}}');
  });

  it('{{TOP_3_CAUSAL_EDGES}} 被替换', () => {
    const ctx = makeContext({ topEdges: ['E-05', 'E-06'] });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('E-05, E-06');
    expect(result.systemPrompt).not.toContain('{{TOP_3_CAUSAL_EDGES}}');
  });

  it('{{DATA_CONFLICT_ALERTS}} 有冲突 → 注入警告', () => {
    const ctx = makeContext({ hasConflict: true });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('数据冲突警告');
    expect(result.systemPrompt).not.toContain('{{DATA_CONFLICT_ALERTS}}');
  });

  it('{{DATA_CONFLICT_ALERTS}} 无冲突 → 占位符被移除', () => {
    const ctx = makeContext({ hasConflict: false });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    // M6不加载时不会有DATA_CONFLICT_ALERTS占位符
    expect(result.systemPrompt).not.toContain('{{DATA_CONFLICT_ALERTS}}');
  });
});

describe('D54 — 降级路径', () => {
  it('manifest不存在 → degraded=true + 空systemPrompt', () => {
    const ctx = makeContext();
    const result = assemblePrompt('non-existent-expert', ctx);
    expect(result.degraded).toBe(true);
    expect(result.systemPrompt).toBe('');
    expect(result.modules).toEqual([]);
  });
});

describe('D54 — 模块内容验证', () => {
  it('M1: 角色定义包含displayName+description+tone+frameworks', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('你是测试专家');
    expect(result.systemPrompt).toContain('用于D54测试的模拟专家');
    expect(result.systemPrompt).toContain('语调');
    expect(result.systemPrompt).toContain('杜邦分析');
  });

  it('M2: 工具调用包含edges和computes', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('E-05');
    expect(result.systemPrompt).toContain('COMPUTE-BREAK-EVEN-v1');
    expect(result.systemPrompt).toContain('禁止调用其他专家的compute');
  });

  it('M3: 推理链包含四层追溯协议 (D55)', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    // 四层标题
    expect(result.systemPrompt).toContain('信号确认（症状）');
    expect(result.systemPrompt).toContain('传导路径（直接原因）');
    expect(result.systemPrompt).toContain('结构原因（系统性条件）');
    expect(result.systemPrompt).toContain('根因（根本原因）');
    // 每层引用真实42边
    expect(result.systemPrompt).toContain('E-05');
    expect(result.systemPrompt).toContain('E-06');
    expect(result.systemPrompt).toContain('E-13');
    // 每层有输出要求
    expect(result.systemPrompt).toContain('输出要求');
    expect(result.systemPrompt).toContain('至少3个独立数据点');
    expect(result.systemPrompt).toContain('至少2个系统性条件');
    expect(result.systemPrompt).toContain('可证伪');
  });

  it('M4: 交叉验证包含两道防线 (D55)', () => {
    const ctx = makeContext({ collaboratingExperts: ['finance'] });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    // 第一道防线：格式规范
    expect(result.systemPrompt).toContain('交叉验证');
    expect(result.systemPrompt).toContain('第一道防线');
    expect(result.systemPrompt).toContain('输出格式规范');
    expect(result.systemPrompt).toContain('不一致度');
    expect(result.systemPrompt).toContain('0.3');
    // 第二道防线：循环检测
    expect(result.systemPrompt).toContain('第二道防线');
    expect(result.systemPrompt).toContain('循环引用');
  });

  it('M5: 边界约束+3级置信度+信息不足强制输出 (D56)', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('不替代专业财务审计');
    expect(result.systemPrompt).toContain('越界处理');
    expect(result.systemPrompt).toContain('这不在我的诊断范围内');
    // 3级置信度标注
    expect(result.systemPrompt).toContain('0.8');
    expect(result.systemPrompt).toContain('直接陈述');
    expect(result.systemPrompt).toContain('0.5-0.8');
    expect(result.systemPrompt).toContain('推断');
    expect(result.systemPrompt).toContain('0.5');
    expect(result.systemPrompt).toContain('猜测');
    // 信息不足强制输出
    expect(result.systemPrompt).toContain('信息不足强制输出');
    expect(result.systemPrompt).toContain('数据不足以支持');
  });

  it('M6: 数据冲突感知含4条规则+示例输出 (D56)', () => {
    const ctx = makeContext({ hasConflict: true });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('数据冲突感知');
    // 4条规则
    expect(result.systemPrompt).toContain('告知歧义');
    expect(result.systemPrompt).toContain('展示冲突版本');
    expect(result.systemPrompt).toContain('分别诊断');
    expect(result.systemPrompt).toContain('不默认选择');
    // 示例输出
    expect(result.systemPrompt).toContain('示例输出');
    expect(result.systemPrompt).toContain('毛利率');
    // hasConflict=true时注入冲突警告
    expect(result.systemPrompt).toContain('数据冲突警告');
  });

  it('userMessage包含诊断上下文JSON', () => {
    const ctx = makeContext({
      findings: [
        { id: 'f1', title: '现金流紧张', severity: 'high', description: '运营现金流为负' },
      ],
    });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.userMessage).toContain('当前诊断上下文');
    expect(result.userMessage).toContain('现金流紧张');
    expect(result.userMessage).toContain('"severity": "high"');
  });
});

describe('D55 — detectExpertLoop 循环检测', () => {
  it('无循环: finance→strategy, strategy→空', () => {
    const result = detectExpertLoop('finance', (t) => {
      if (t === 'finance') return ['strategy'];
      return [];
    });
    expect(result.hasLoop).toBe(false);
    expect(result.path).toEqual([]);
  });

  it('有循环: A→B→A 直接循环', () => {
    const result = detectExpertLoop('finance', (t) => {
      if (t === 'finance') return ['strategy'];
      if (t === 'strategy') return ['finance'];
      return [];
    });
    expect(result.hasLoop).toBe(true);
    expect(result.path).toContain('finance');
    expect(result.path).toContain('strategy');
    expect(result.path.length).toBeGreaterThanOrEqual(3);
    expect(result.path[0]).toBe(result.path[result.path.length - 1]);
  });

  it('有循环: A→B→C→A 三层循环', () => {
    const result = detectExpertLoop('finance', (t) => {
      if (t === 'finance') return ['org'];
      if (t === 'org') return ['strategy'];
      if (t === 'strategy') return ['finance'];
      return [];
    });
    expect(result.hasLoop).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(4);
    expect(result.path[0]).toBe(result.path[result.path.length - 1]);
  });

  it('无循环: 分叉依赖不形成循环', () => {
    const result = detectExpertLoop('finance', (t) => {
      if (t === 'finance') return ['strategy', 'org'];
      if (t === 'strategy') return ['tech'];
      if (t === 'org') return ['marketing'];
      return [];
    });
    expect(result.hasLoop).toBe(false);
    expect(result.path).toEqual([]);
  });

  it('起始专家无依赖 → 无循环', () => {
    const result = detectExpertLoop('standalone', () => []);
    expect(result.hasLoop).toBe(false);
    expect(result.path).toEqual([]);
  });

  it('纯确定性函数 — 零外部调用', () => {
    const fnStr = detectExpertLoop.toString();
    expect(fnStr).not.toContain('fetch');
    expect(fnStr).not.toContain('readFile');
    expect(fnStr).not.toContain('import');
  });
});

describe('D57 — M1四源Tone融合', () => {
  it('M1含Tone声明和角色一致性', () => {
    const ctx = makeContext();
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('专业客观');
    expect(result.systemPrompt).toContain('温暖度');
    expect(result.systemPrompt).toContain('性格表达');
    expect(result.systemPrompt).toContain('角色一致性');
    expect(result.systemPrompt).toContain('财务专家不说战略专家的语言');
  });

  it('报告场景下M1含散文约束', () => {
    const ctx = makeContext({ mode: 'report' });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('诊断报告用自然段落');
  });
});

describe('D57 — M2对话约束', () => {
  it('对话场景下M2含一次一问约束', () => {
    const ctx = makeContext({ mode: 'conversation' });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).toContain('一次只问一个问题');
    expect(result.systemPrompt).toContain('不要在同一轮中追问多个问题');
  });

  it('报告场景下M2无对话约束', () => {
    const ctx = makeContext({ mode: 'report' });
    const result = assemblePrompt('test-expert', ctx, testManifest);
    expect(result.systemPrompt).not.toContain('一次只问一个问题');
  });

  it('resolvePromptMode: 显式mode优先级最高', () => {
    expect(resolvePromptMode({ mode: 'report' })).toBe('report');
    expect(resolvePromptMode({ mode: 'conversation' })).toBe('conversation');
  });

  it('resolvePromptMode: teamId+reportId推断为report', () => {
    expect(resolvePromptMode({ teamId: 't1', reportId: 'r1' })).toBe('report');
    expect(resolvePromptMode({ teamId: 't1' })).toBe('conversation');
    expect(resolvePromptMode({ reportId: 'r1' })).toBe('conversation');
  });
});
