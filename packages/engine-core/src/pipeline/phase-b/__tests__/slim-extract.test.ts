/**
 * slim-extract.test.ts — SlimPersona 提取器单元测试
 *
 * 3 用例: Token≤60 / 退化触发 / 45→≤5 缩减率
 */

import { extractSlimPersona } from '../slim-extract';
import type { Framework } from '../framework-library';

function makeFramework(id: string, name: string, insight: string, category: Framework['category'] = 'psychology'): Framework {
  return {
    id, name, category,
    coreInsight: insight,
    applicableDecisionTypes: ['通用决策'],
    limitations: ['通用局限'],
    constraintPatterns: [],
    applicableRoles: ['*'],
  };
}

describe('extractSlimPersona', () => {
  test('TC-01: Token计数 ≤60，无退化风险', () => {
    const frameworks: Framework[] = [
      makeFramework('f1', '激励偏差', '人的行为由激励结构驱动，而非由应该做什么决定。'),
      makeFramework('f2', '确认偏误', '人们倾向于寻找支持已有观点的信息。'),
      makeFramework('f3', '安全边际', '在不确定环境中为最坏情况留出缓冲空间。'),
    ];

    const result = extractSlimPersona(frameworks, 'test-role');

    expect(result.totalTokenCount).toBeLessThanOrEqual(60);
    expect(result.degradationRisk).toBe('none');
    expect(result.fallbackTriggered).toBe(false);
  });

  test('TC-02: 退化检测触发 — 8个长描述框架超过阈值', () => {
    const longDescriptions = [
      '在复杂系统中任何单一指标的优化都会导致其他指标的劣化这是坎贝尔定律的核心洞见适用于绩效',
      '市场并不总是有效的投资者情绪会导致价格大幅偏离基本面安全边际原则要求为不确定性留出缓冲',
      '人们在面对损失时的痛苦感约等于同等收益快乐感的2倍这种损失厌恶影响谈判策略和风险管理',
      '系统中最薄弱的环节决定了整体可靠性的上限约束理论提醒管理者不应该平均分配改进资源',
      '复利效应不仅适用于金融投资也适用于知识积累和团队建设小改进的长期累积会产生指数级影响',
      '第一性原理要求将问题分解到最基本元素然后从零重建解决方案这是在成熟行业中创新的方法论',
      '信息的非对称分布会导致市场中的逆向选择高质量供给者因为无法传递信号而被迫退出市场',
      '在博弈论中可信的承诺需满足可观察性和不可逆性两个条件否则承诺只是廉价的空谈',
    ];
    const frameworks: Framework[] = longDescriptions.map((desc, i) =>
      makeFramework(`fw${i}`, `框架${i}`, desc),
    );

    const result = extractSlimPersona(frameworks, 'test-role');

    expect(result.slimMentalModels.length).toBeLessThanOrEqual(5);
    expect(result.degradationRisk).not.toBe('none');
    expect(result.suppressedCount).toBeGreaterThanOrEqual(3);
  });

  test('TC-03: 45→≤5 框架缩减率', () => {
    const frameworks: Framework[] = [];
    for (let i = 0; i < 45; i++) {
      const categories: Framework['category'][] = [
        'psychology', 'economics', 'math-engineering', 'medicine', 'biology-physics', 'law-governance',
      ];
      frameworks.push(
        makeFramework(
          `fw${i}`, `认知框架${i}`,
          `核心洞见内容${i}：关于组织设计和团队协作的深度洞察。`,
          categories[i % 6],
        ),
      );
    }

    const result = extractSlimPersona(frameworks, 'test-role');

    expect(result.slimMentalModels.length).toBeLessThanOrEqual(5);
    expect(result.suppressedCount).toBeGreaterThanOrEqual(40);
  });
});
