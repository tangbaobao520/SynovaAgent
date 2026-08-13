/**
 * T6: AI 软件生态匹配度
 *
 * 理论依据: 企业 AI 技术栈与主流 AI 生态的兼容程度。
 * 生态匹配度 = 兼容 API 比例 x 平台覆盖度 x 开发者支持度。
 *
 * 评分方法:
 * - apiCompatibility: 兼容主流 AI 平台的 API 比例
 * - platformCoverage: 企业支持的 AI 平台 / 主流平台总数
 * - devEcosystem: 开发者生态支持度 [0,1]
 */
export interface EcosystemFitResult {
  score: number;
  apiCompatibility: number;
  platformsCovered: number;
  devEcosystem: number;
  degraded: boolean;
}

export function computeAiEcosystemFit(params: {
  apiCompatible: number;
  totalApis: number;
  platformsCovered: number;
  totalPlatforms: number;
  devEcosystemScore: number;
}): EcosystemFitResult {
  const { apiCompatible, totalApis, platformsCovered, totalPlatforms, devEcosystemScore } = params;
  if (totalApis === 0 || totalPlatforms === 0) return { score: 0.5, apiCompatibility: 0, platformsCovered: 0, devEcosystem: 0, degraded: true };
  const apiCompatScore = totalApis > 0 ? apiCompatible / totalApis : 0;
  const platformScore = platformsCovered / totalPlatforms;
  const devScore = Math.min(devEcosystemScore, 1);
  return {
    score: Math.round((0.4 * apiCompatScore + 0.3 * platformScore + 0.3 * devScore) * 100) / 100,
    apiCompatibility: Math.round(apiCompatScore * 100) / 100,
    platformsCovered,
    devEcosystem: Math.round(devScore * 100) / 100,
    degraded: false,
  };
}
