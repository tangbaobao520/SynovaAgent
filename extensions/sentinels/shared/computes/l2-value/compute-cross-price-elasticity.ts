/**
 * compute-cross-price-elasticity.ts — 交叉价格弹性 (Cross-Price Elasticity)
 *
 * 契约ID: COMPUTE-CROSS-PRICE-ELASTICITY-v1
 * 管理经济学(托马斯) Ch4 — 交叉价格弹性
 * @input products: Array<{name:string, price:number, quantity:number, rivalPrice:number, rivalQuantity:number}>
 * @output { elasticities: Array<{product, crossElasticity, relationship}>, avgCrossElasticity }
 * @degraded products.length===0 -> degraded:true
 */
export interface CrossPriceInterpretation {
  marketRelationship: string;
  competitivePressure: string;
  substitutionThreat: string;
}
export interface CrossPriceResult {
  elasticities: Array<{ product: string; crossElasticity: number; relationship: string }>;
  avgCrossElasticity: number;
  economicInterpretation: CrossPriceInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeCrossPriceElasticity(products: Array<{ name: string; price: number; quantity: number; rivalPrice: number; rivalQuantity: number }>): CrossPriceResult {
  const w: string[] = [];
  if (products.length === 0) {
    return { elasticities: [], avgCrossElasticity: 0,
      economicInterpretation: { marketRelationship: 'unknown', competitivePressure: '无数据', substitutionThreat: 'N/A' },
      degraded: true, warnings: ['No products'] };
  }
  const elasticities = products.map(p => {
    const qChange = p.quantity > 0 ? (p.rivalQuantity - p.quantity) / p.quantity : 0;
    const pChange = p.price > 0 ? (p.rivalPrice - p.price) / p.price : 1;
    const crossE = pChange !== 0 ? qChange / pChange : 0;
    return {
      product: p.name,
      crossElasticity: Math.round(crossE * 10000) / 10000,
      relationship: crossE > 0 ? 'substitute' : crossE < 0 ? 'complement' : 'independent',
    };
  });
  const avg = elasticities.reduce((s, e) => s + e.crossElasticity, 0) / elasticities.length;
  return {
    elasticities,
    avgCrossElasticity: Math.round(avg * 10000) / 10000,
    economicInterpretation: {
      marketRelationship: avg > 0.5 ? '强替代关系' : avg > 0 ? '弱替代关系' : '互补关系',
      competitivePressure: Math.abs(avg) > 0.3 ? '高竞争压力' : '低竞争压力',
      substitutionThreat: avg > 0.3 ? '高替代威胁' : '低替代威胁',
    }, degraded: false, warnings: w };
}
