/**
 * expert-knowledge.ts — 专家知识库 + 冷启动
 * Step 2b: 每个专家独立知识条目, 对标 Hermes 技能库
 */
import type { ExpertKnowledgeEntry, ExpertType } from './types';

const knowledgeStore = new Map<ExpertType, ExpertKnowledgeEntry[]>();
let knowledgeCounter = 0;

// ═══ 冷启动内容 ═══

const SEED_KNOWLEDGE: Partial<Record<ExpertType, Omit<ExpertKnowledgeEntry, 'id'|'addedAt'|'lastUpdatedAt'>[]>> = {
  financial_analyst: [
    { expertType: 'financial_analyst', category: '准则', content: '中国会计准则(CAS): 资产负债表/利润表/现金流量表。收入确认: 权责发生制 vs 收付实现制。成本分类: 固定成本 vs 变动成本。', source: 'CAS' },
    { expertType: 'financial_analyst', category: '基准', content: '中小企业财务比率基准: 流动比率1.5-2.0(健康), 资产负债率40-60%(合理), 毛利率服务业30-50%/制造业15-30%, 净利率服务业10-20%/制造业5-10%, 现金周转天数30-60天(健康)', source: '行业基准' },
    { expertType: 'financial_analyst', category: '基准', content: 'Token经济学基准: 输入\$3-15/1M tokens, 输出\$15-75/1M tokens, 缓存命中节省90%', source: 'Anthropic定价' },
  ],
  marketing_analyst: [
    { expertType: 'marketing_analyst', category: '理论', content: '定位理论(特劳特/里斯): 定位不是改变产品是改变心智, 一个品牌只能占据一个词, 二元法则——市场最终只有两个主导品牌', source: 'Positioning, 1981' },
    { expertType: 'marketing_analyst', category: '理论', content: '品类设计(Play Bigger): 品类>品牌——先定义新品类再成为品类之王。品类命名用客户能理解的词不用术语。', source: 'Play Bigger, 2016' },
    { expertType: 'marketing_analyst', category: '基准', content: '三方一致性标准: 对外声称vs客户感知对齐度>70%=健康, 对外vs内部>80%=健康, 内部vs客户>60%=健康', source: 'Synova内部基准' },
    { expertType: 'marketing_analyst', category: '词库', content: '常见品类词库: SaaS/平台/工具/系统/服务/解决方案, 效率/协同/管理/自动化/智能', source: '中文品类词频统计' },
  ],
  org_diagnostician: [
    { expertType: 'org_diagnostician', category: '模型', content: '六缝隙模型(GapDimension×6): 决策权/信息流/知识共享/信任/目标对齐/角色清晰度。每个缝隙独立评分0-10。', source: 'Synova内部模型' },
    { expertType: 'org_diagnostician', category: '反模式', content: '常见协作反模式: 信息孤岛(跨部门信息不共享), 决策瓶颈(审批链过长), 角色模糊(职责重叠或无人负责), 信任缺失(指责文化)', source: '组织诊断实践' },
  ],
  strategic_analyst: [
    { expertType: 'strategic_analyst', category: '模型', content: '7 Powers(Hamilton Helmer): 规模经济/网络效应/反向定位/转换成本/品牌效应/垄断资源/流程优势。每个Power评估: 增强/稳定/衰减。', source: '7 Powers, 2016' },
    { expertType: 'strategic_analyst', category: '模型', content: '战略姿态矩阵: 生存突破型(现金紧缺/快速验证)/稳健经营型(现金流稳定/效率优先)/创新突围型(技术驱动/快速迭代)/生态构建型(平台化/网络效应)', source: 'Synova内部模型' },
  ],
  tech_architect: [
    { expertType: 'tech_architect', category: '基准', content: 'AI工具能力对比: Claude(推理+编码)/GPT(通用+多模态)/Gemini(长上下文+搜索)/DeepSeek(性价比+中文)。企业选型考虑: 精度/成本/延迟/合规。', source: '2026Q1模型对比' },
    { expertType: 'tech_architect', category: '基准', content: '技术债务量化: 代码重复率>5%=警告, 测试覆盖率<50%=风险, 依赖过期>6月=安全风险, 部署频率<1次/周=流程瓶颈', source: '行业基准' },
  ],
};

// ═══ 初始化 ═══

let initialized = false;

export function initExpertKnowledge(): void {
  if (initialized) return;
  initialized = true;
  const now = new Date().toISOString();
  for (const [type, entries] of Object.entries(SEED_KNOWLEDGE)) {
    const list: ExpertKnowledgeEntry[] = [];
    for (const e of entries as any[]) {
      list.push({ ...e, id: `kn_${++knowledgeCounter}`, addedAt: now, lastUpdatedAt: now });
    }
    knowledgeStore.set(type as ExpertType, list);
  }
}

// ═══ CRUD ═══

export function getExpertKnowledge(type: ExpertType): ExpertKnowledgeEntry[] {
  initExpertKnowledge();
  return knowledgeStore.get(type) || [];
}

export function renderKnowledgeForSystemPrompt(type: ExpertType): string {
  const entries = getExpertKnowledge(type);
  if (entries.length === 0) return '';
  const lines = entries.map(e => `- [${e.category}] ${e.content}`);
  return `<expert_knowledge>\n${lines.join('\n')}\n</expert_knowledge>`;
}

export function addExpertKnowledge(type: ExpertType, entry: Omit<ExpertKnowledgeEntry, 'id'|'addedAt'|'lastUpdatedAt'>): ExpertKnowledgeEntry {
  initExpertKnowledge();
  const now = new Date().toISOString();
  const full: ExpertKnowledgeEntry = { ...entry, id: `kn_${++knowledgeCounter}`, addedAt: now, lastUpdatedAt: now };
  if (!knowledgeStore.has(type)) knowledgeStore.set(type, []);
  knowledgeStore.get(type)!.push(full);
  return full;
}

export function clearKnowledgeStore(): void {
  knowledgeStore.clear();
  initialized = false;
  knowledgeCounter = 0;
}
