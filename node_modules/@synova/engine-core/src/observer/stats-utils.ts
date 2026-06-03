/**
 * stats-utils.ts — 统计工具函数
 *
 * Wilson score interval + Welch's t-test
 * 用于误报率控制和退化检测
 */

/**
 * Wilson score interval 下界（95% 置信度）
 * 给定观测比例和样本量，返回置信区间下界。
 * 用于进化信号有效性判定——信号强度下界低于阈值则不应触发。
 */
export function wilsonCILower(observed: number, n: number, z: number = 1.96): number {
  if (n <= 0) return 0;
  const p = observed / n;
  const denominator = 1 + z * z / n;
  const center = p + z * z / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return Math.max(0, (center - margin) / denominator);
}

/**
 * Welch's t-test（不等方差独立样本 t 检验）
 * 用于比较 before 和 after 两个分数序列是否有显著差异。
 */
export function welchTTest(
  before: number[],
  after: number[],
): { significant: boolean; pValue: number; meanDiff: number; tStat: number; df: number } {
  const n1 = before.length;
  const n2 = after.length;
  if (n1 < 2 || n2 < 2) {
    return { significant: false, pValue: 1, meanDiff: 0, tStat: 0, df: 0 };
  }

  const mean1 = before.reduce((s, v) => s + v, 0) / n1;
  const mean2 = after.reduce((s, v) => s + v, 0) / n2;
  const meanDiff = mean2 - mean1;

  const var1 = before.reduce((s, v) => s + (v - mean1) ** 2, 0) / (n1 - 1);
  const var2 = after.reduce((s, v) => s + (v - mean2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    return { significant: false, pValue: 1, meanDiff, tStat: 0, df: 0 };
  }

  const tStat = meanDiff / se;

  // Welch-Satterthwaite 自由度
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom = (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = denom > 0 ? Math.min(num / denom, n1 + n2 - 2) : n1 + n2 - 2;

  // t 分布近似 -> p 值（双侧检验）
  // 使用 Abramowitz & Stegun 近似
  const pValue = twoTailPValue(Math.abs(tStat), df);

  return {
    significant: pValue < 0.05,
    pValue,
    meanDiff,
    tStat,
    df,
  };
}

/**
 * 简化版 t 分布双侧 p 值近似
 * 基于 Abramowitz & Stegun 26.7.1
 */
function twoTailPValue(t: number, df: number): number {
  if (df <= 0 || !isFinite(t)) return 1;
  const a = df / (df + t * t);
  const b = Math.sqrt(df) * specialBeta(a, 0.5, df / 2);
  const p = 1 - b;
  return Math.min(1, Math.max(0, 2 * p)); // 双侧
}

/**
 * 正则化不完全 Beta 函数近似（仅用于 t 检验 p 值计算）
 * 足够精确到判断 p < 0.05
 */
function specialBeta(a: number, alpha: number, bet: number): number {
  // 简化版: 对 t>3 且 df>5 的场景足够准确
  if (a <= 0) return 0;
  if (a >= 1) return 1;
  // 对 t 检验常用场景的近似: a = df/(df+t^2)
  // 当 t 较大时 a 接近 0，p 值小
  // 当 t 较小时 a 接近 1，p 值大
  const x = 1 - a;
  // 连分式近似
  return incompleteBetaCF(a, alpha, bet);
}

/**
 * 连分式法计算不完全 Beta 函数
 */
function incompleteBetaCF(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return x < 0 ? 0 : 1;
  if (x === 0 || x === 1) return x;

  const maxIter = 100;
  const epsilon = 1e-10;

  // 连分式 Lentz's method
  let f = 1;
  let C = 1;
  let D = 1 - (a + b) * x / (a + 1);
  if (Math.abs(D) < epsilon) D = epsilon;
  D = 1 / D;
  let h = D;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    // 偶数步
    let alpha = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    D = 1 + alpha * D;
    if (Math.abs(D) < epsilon) D = epsilon;
    C = 1 + alpha / C;
    if (Math.abs(C) < epsilon) C = epsilon;
    D = 1 / D;
    h = h * D * C;

    // 奇数步
    alpha = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    D = 1 + alpha * D;
    if (Math.abs(D) < epsilon) D = epsilon;
    C = 1 + alpha / C;
    if (Math.abs(C) < epsilon) C = epsilon;
    D = 1 / D;
    const delta = D * C;
    h = h * delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const lnFactor = a * Math.log(x) + b * Math.log(1 - x);
  const result = Math.exp(lnFactor - lnBeta) * h / a;

  return Math.min(1, Math.max(0, result));
}

/**
 * ln(Gamma(x)) — Stirling 近似
 */
function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
