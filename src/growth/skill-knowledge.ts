/**
 * src/growth/skill-knowledge.ts — SKILL 知识条目与 pull-mode 工具 (D63)
 *
 * 管理经济学(托马斯) Ch4 S4.1-S4.2 — 4 个 SKILL 知识条目。
 * 专家通过 tool_query_knowledge(skill_name) 拉取。
 *
 * 流程:
 *   seedSkillKnowledge(store) → 将4个SKILL条目写入KnowledgeStore
 *   registerToolQueryKnowledge(registry, store) → 注册tool_query_knowledge工具
 */
import { createLogger } from '@synova/logger';

const log = createLogger('growth/skill-knowledge');

// ═══ 类型定义 ═══

/** SKILL 知识条目定义 */
export interface SkillKnowledgeEntry {
  /** SKILL 名称（也是 pkb_type） */
  name: string;
  /** 触发条件描述 */
  triggerConditions: string[];
  /** 知识内容 */
  content: string;
  /** 目标专家 */
  targetExpert: string;
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2';
}

/** KnowledgeStore 最小接口 */
export interface KnowledgeStoreLike {
  insert(chunk: {
    text: string;
    sourceType: string;
    sourceId: string;
    authorityLevel: string;
    accessLevel: string;
    accessTeamId?: string;
    accessOwnerId?: string;
    accessSensitivity: string;
    orgId?: string;
  }): string;
}

/** ToolRegistry 最小接口 */
export interface ToolRegistryLike {
  register(tool: {
    name: string;
    description: string;
    parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
    executionMode?: string;
    handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }): void;
}

// ═══ 4 个 SKILL 知识条目 ═══

/**
 * 4 个管理经济学 SKILL 条目定义。
 * 专家在对应 compute 被调用时通过 tool_query_knowledge 拉取。
 */
export const SKILL_ENTRIES: SkillKnowledgeEntry[] = [
  {
    name: 'me_pricing_strategy',
    triggerConditions: ['computeOptimalPrice invoked', 'computePriceElasticity invoked'],
    targetExpert: 'strategy',
    priority: 'P0',
    content: `## 定价策略决策树

根据市场结构和价格弹性选择定价策略:

### 1. 统一定价 (Uniform Pricing)
- 适用: 价格弹性低 (< -1), 市场无显著细分
- 方法: 边际成本 = 边际收益定价
- 条件: MR = MC, P = MC / (1 + 1/|e|)

### 2. 差异化定价 (Tiered Pricing)
- 适用: 市场可细分为2-3个价格敏感度不同的群体
- 方法: 每群体独立定价, 高弹性群体低价, 低弹性群体高价
- 条件: 细分市场可隔离, 无套利可能

### 3. 捆绑定价 (Bundled Pricing)
- 适用: 产品互补性强, 客户估值异质性高
- 方法: 纯捆绑/混合捆绑/单独定价对比
- 条件: 捆绑价 < 各单品价之和, 边际成本低时捆绑更优

### 4. 价格弹性校准
- |e| > 1: 弹性需求 → 降价可增收入
- |e| = 1: 单位弹性 → 收入最大化
- |e| < 1: 非弹性需求 → 提价可增收入`,
  },
  {
    name: 'me_cost_structure',
    triggerConditions: ['computeBreakEven invoked', 'computeDOL invoked'],
    targetExpert: 'finance',
    priority: 'P0',
    content: `## 成本结构分析框架

### 固定成本 vs 变动成本分解
- 固定成本: 不随产量变化的成本 (租金、折旧、管理人员工资)
- 变动成本: 随产量线性变化的成本 (原材料、直接人工)
- 混合成本: 用高低点法或回归分析分解

### 经营杠杆 (DOL) 解读
- DOL > 3: 高风险高弹性 — 销售额小幅波动 → EBIT大幅波动
- DOL 1.5-3: 中等杠杆 — 风险可控
- DOL < 1.5: 低杠杆 — 利润相对稳定

### 盈亏平衡分析
- 盈亏平衡点 = 固定成本 / (单价 - 单位变动成本)
- 安全边际率 = (实际收入 - 盈亏平衡收入) / 实际收入
- > 20%: 安全; 10-20%: 一般; < 10%: 高风险`,
  },
  {
    name: 'me_market_power',
    triggerConditions: ['computeHHI invoked', 'computeLernerIndex invoked'],
    targetExpert: 'strategy',
    priority: 'P0',
    content: `## 市场势力分析框架

### HHI (Herfindahl-Hirschman Index) 阈值
- HHI < 1000: 竞争市场 — 无显著市场势力
- HHI 1000-2500: 中等集中 — 需关注寡头行为
- HHI > 2500: 高集中 — 可能存在市场势力滥用

### 勒纳指数 (Lerner Index) 解读
- L = (P - MC) / P, 0 ≤ L ≤ 1
- L = 0: 完全竞争 (P = MC)
- L 接近 1: 高市场势力 (P >> MC)
- L > 0.5: 显著定价权

### 市场结构四象限
| 进入壁垒↓ | 高产品差异化 | 低产品差异化 |
|-----------|------------|------------|
| 高 | 寡头垄断 | 寡头(同质) |
| 低 | 垄断竞争 | 完全竞争 |

### 定价权指标
- 毛利率趋势: 持续上升 → 定价权增强
- 客户流失率与提价的关系: 提价后流失率升幅 < 5% → 有定价权`,
  },
  {
    name: 'me_investment_decision',
    triggerConditions: ['computeNPV invoked', 'computeIRR invoked'],
    targetExpert: 'finance',
    priority: 'P0',
    content: `## 投资决策规则框架

### NPV (净现值) 决策规则
- NPV > 0: 接受项目 — 投资回报超过资本成本
- NPV = 0: 边际项目 — 回报等于资本成本
- NPV < 0: 拒绝项目 — 投资回报低于资本成本
- 互斥项目: 选择 NPV 最大的项目 (规模不一时用 PI)

### IRR (内部收益率) 与 WACC 比较
- IRR > WACC: 接受项目
- IRR = WACC: 边际决策
- IRR < WACC: 拒绝项目
- IRR 局限: 非常规现金流→多解, 互斥项目→规模偏好

### 回收期 (Payback Period)
- 简单回收期: 累计现金流 = 初始投资的时间
- 折现回收期: 考虑资金时间价值后的回收期
- 决策规则: 回收期 < 公司门槛期限 → 接受

### 现金流预测注意事项
- 增量现金流 (含机会成本)
- 沉没成本不计入
- 考虑营运资本变动 (Ch14)
- 税后现金流, 含折旧税盾`,
  },
];

// ═══ SKILL 播种 ═══

/**
 * 将 4 个 SKILL 知识条目写入 KnowledgeStore。
 * 每条使用 pkb_type = skill_name 存储。
 * 多次调用幂等 — 先清空同类型再写入。
 *
 * @param store — KnowledgeStore 实例
 * @returns 写入成功的条目数
 */
export function seedSkillKnowledge(store: {
  insert(chunk: {
    text: string;
    sourceType: string;
    sourceId: string;
    authorityLevel: string;
    accessLevel: string;
    accessTeamId?: string;
    accessOwnerId?: string;
    accessSensitivity: string;
  }): string;
  db?: {
    prepare: (sql: string) => {
      run: (...params: unknown[]) => unknown;
    };
  };
}): number {
  let inserted = 0;

  for (const entry of SKILL_ENTRIES) {
    try {
      // 先清理同类型旧条目（幂等）
      if (store.db) {
        store.db.prepare('DELETE FROM knowledge_chunks WHERE pkb_type = ?').run(entry.name);
      }

      const id = store.insert({
        text: entry.content,
        sourceType: 'skill_knowledge',
        sourceId: `skill-${entry.name}`,
        authorityLevel: 'internal_stored',
        accessLevel: 'team',
        accessTeamId: entry.targetExpert,
        accessSensitivity: 'normal',
      });

      // 注入 pkb_type (通过 update 或直接 SQL)
      if (store.db) {
        store.db.prepare(
          'UPDATE knowledge_chunks SET pkb_type = ?, pkb_domain = ?, pkb_confidence = 1.0, pkb_status = ?, knowledge_level = 1 WHERE id = ?'
        ).run(entry.name, 'me_skill', 'active', id);
      }

      inserted++;
      log.info({ skill: entry.name, id }, 'SKILL 知识条目已写入');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, skill: entry.name }, 'SKILL 知识条目写入失败 — 降级');
    }
  }

  return inserted;
}

// ═══ 工具注册 ═══

/**
 * 注册 tool_query_knowledge 工具到 ToolRegistry。
 *
 * @param registry — ToolRegistry 实例
 * @param store — KnowledgeStore 实例（含 getBySkill 方法）
 */
export function registerToolQueryKnowledge(
  registry: ToolRegistryLike,
  store: {
    getBySkill(skillName: string, limit?: number): { text: string; sourceType: string }[];
  },
): void {
  try {
    registry.register({
      name: 'tool_query_knowledge',
      description: '查询管理经济学 SKILL 知识。专家在诊断过程中按需拉取。',
      parameters: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            description: 'SKILL 名称: me_pricing_strategy / me_cost_structure / me_market_power / me_investment_decision',
            enum: ['me_pricing_strategy', 'me_cost_structure', 'me_market_power', 'me_investment_decision'],
          },
        },
        required: ['skill_name'],
      },
      executionMode: 'local',
      handler: async (params: Record<string, unknown>) => {
        const skillName = String(params.skill_name || '');
        if (!skillName) {
          return { ok: false, error: 'skill_name 必填', results: [] };
        }

        const results = store.getBySkill(skillName, 5);
        return {
          ok: true,
          skill: skillName,
          results: results.map((r) => ({
            text: r.text,
            sourceType: r.sourceType,
          })),
          count: results.length,
        };
      },
    });

    log.info('tool_query_knowledge 已注册 (D63 pull-mode)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'tool_query_knowledge 注册失败 — 降级');
  }
}
