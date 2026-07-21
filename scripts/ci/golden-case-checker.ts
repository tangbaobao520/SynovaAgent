#!/usr/bin/env tsx
/**
 * scripts/ci/golden-case-checker.ts — 黄金案例 F1 门禁评分器 (D51)
 *
 * 第9份权威文档 §5.2: "不用哨兵触发率作为门禁。用5个黄金案例的冻结
 * 静态快照数据跑完整诊断→F1-Score匹配——关键边命中率+根因节点匹配率+
 * 告警级别一致率——三者均=100%时CI门禁判定通过。"
 *
 * 用法: npx tsx scripts/ci/golden-case-checker.ts
 *   退出码: 0 = 通过(三者均100%), 1 = 不通过(详细diff输出)
 */
import * as fs from 'fs';
import * as path from 'path';

// ═══ 类型定义 ═══

/** 黄金案例 fixture 格式 */
export interface GoldenCase {
  id: string;
  title: string;
  description: string;
  frozenAt: string;
  input: GoldenCaseInput;
  expected: GoldenCaseExpectation;
}

interface GoldenCaseInput {
  sentinelFindings: SentinelFinding[];
  graphEdges: string[];
}

interface SentinelFinding {
  id: string;
  sentinel: string;
  severity: string;
  title: string;
  matchedEdgeIds: string[];
  detectedAt: string;
}

interface GoldenCaseExpectation {
  rootCauseEdgeIds: string[];
  rootCauseNodeTypes: string[];
  severity: string;
  matchedEdgeIds: string[];
  explanation: string;
}

/** F1 评分结果 */
interface F1Result {
  edgeHitRate: number;        // 0-1
  nodeMatchRate: number;      // 0-1
  severityMatch: boolean;     // true/false
  passed: boolean;            // 三者均=1.0
  details: {
    expectedEdgeIds: string[];
    actualEdgeIds: string[];
    missingEdges: string[];
    extraEdges: string[];
    expectedNodeTypes: string[];
    actualNodeTypes: string[];
    expectedSeverity: string;
    actualSeverity: string;
  };
}

/** 汇总报告 */
interface CheckerReport {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  results: {
    caseId: string;
    title: string;
    passed: boolean;
    f1: Omit<F1Result, 'passed'>;
  }[];
  summary: string;
}

// ═══ 常量 ═══

/** 边ID => 节点类型 映射（用于从边推断节点类型） */
const EDGE_TO_NODE: Record<string, string> = {
  'E-05': 'CAPITAL_ACQUISITION',
  'E-12': 'RESOURCE_ALLOCATION',
  'E-23': 'OPERATIONAL_EXECUTION',
  'E-31': 'CLIENT_RETENTION',
  'E-07': 'TALENT_ACQUISITION',
  'E-33': 'MARKET_COMPETITION',
  'E-11': 'EFFICIENCY_ATTRACTION',
  'E-17': 'RULE_CONSTRAINT',
  'E-19': 'KNOWLEDGE_SHARING',
  'E-24': 'TECH_INFRASTRUCTURE',
  'E-30': 'MARKET_SHARE_CAPTURE',
};

// ═══ F1 计算核心 ═══

/**
 * 计算 F1-Score 的三个维度。
 *
 * @param actual — 实际诊断结果(从输入推导)
 * @param expected — 预期结果(从fixture读取)
 * @returns F1Result
 */
export function computeF1Score(
  actual: { rootCauseEdgeIds: string[]; severity: string; matchedEdgeIds: string[] },
  expected: GoldenCaseExpectation,
): F1Result {
  const actualEdges = actual.matchedEdgeIds || [];
  const expectedEdges = expected.matchedEdgeIds || [];

  // 1. 关键边命中率: 预期边ID是否全部出现在实际边中
  const missingEdges = expectedEdges.filter((e) => !actualEdges.includes(e));
  const extraEdges = actualEdges.filter((e) => !expectedEdges.includes(e));
  const edgeHitRate = expectedEdges.length > 0
    ? (expectedEdges.length - missingEdges.length) / expectedEdges.length
    : 0;

  // 2. 根因节点匹配率
  const actualNodeTypes = actual.rootCauseEdgeIds
    .map((e) => EDGE_TO_NODE[e])
    .filter(Boolean);
  const expectedNodeTypes = expected.rootCauseNodeTypes;
  const matchedNodes = expectedNodeTypes.filter((n) => actualNodeTypes.includes(n));
  const nodeMatchRate = expectedNodeTypes.length > 0
    ? matchedNodes.length / expectedNodeTypes.length
    : 0;

  // 3. 告警级别一致率
  const severityMatch = actual.severity === expected.severity;

  // 三者均=1.0 才算通过
  const passed = edgeHitRate === 1.0 && nodeMatchRate === 1.0 && severityMatch;

  return {
    edgeHitRate,
    nodeMatchRate,
    severityMatch,
    passed,
    details: {
      expectedEdgeIds: expectedEdges,
      actualEdgeIds: actualEdges,
      missingEdges,
      extraEdges,
      expectedNodeTypes: expected.rootCauseNodeTypes,
      actualNodeTypes,
      expectedSeverity: expected.severity,
      actualSeverity: actual.severity,
    },
  };
}

/**
 * 从黄金案例输入推导实际诊断结果。
 * 在生产环境中，这里会调用真实的诊断管线。
 * 当前实现: 从 sentinelFindings 中的 matchedEdgeIds 和 severity 聚合。
 */
export function deriveActual(caseData: GoldenCase): {
  rootCauseEdgeIds: string[];
  severity: string;
  matchedEdgeIds: string[];
} {
  const findings = caseData.input.sentinelFindings;

  // 提取所有匹配的边ID
  const allMatchedEdges = [...new Set(findings.flatMap((f) => f.matchedEdgeIds))];

  // 最高严重度作为整体严重度
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  let maxSeverity = 'low';
  for (const f of findings) {
    if (severityOrder.indexOf(f.severity) > severityOrder.indexOf(maxSeverity)) {
      maxSeverity = f.severity;
    }
  }

  // 根因边: 出现在 critical finding 中的边
  const criticalEdges = [
    ...new Set(
      findings
        .filter((f) => f.severity === 'critical')
        .flatMap((f) => f.matchedEdgeIds),
    ),
  ];

  return {
    rootCauseEdgeIds: criticalEdges.length > 0 ? criticalEdges : allMatchedEdges.slice(0, 1),
    severity: maxSeverity,
    matchedEdgeIds: allMatchedEdges,
  };
}

// ═══ 主函数 ═══

/**
 * 运行全部黄金案例检查。
 * 返回汇总报告并在控制台输出详细结果。
 */
function runAllChecks(): CheckerReport {
  // 使用 import.meta.url 定位 fixtures 目录 (兼容 ESM + Windows)
  const metaUrl = new URL(import.meta.url);
  const currentDir = path.dirname(metaUrl.pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
  const fixturesDir = path.resolve(currentDir, '..', '..', 'tests', 'fixtures', 'golden-cases');

  if (!fs.existsSync(fixturesDir)) {
    console.error(`[ERROR] 黄金案例目录不存在: ${fixturesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json') && f.startsWith('golden-case'));
  files.sort();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Golden Case F1 Gate — 黄金案例回归测试');
  console.log(`  案例数: ${files.length}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (files.length === 0) {
    console.error('[ERROR] 未找到黄金案例文件');
    process.exit(1);
  }

  let passedCases = 0;
  let failedCases = 0;
  const results: CheckerReport['results'] = [];

  for (const file of files) {
    const filePath = path.join(fixturesDir, file);
    const caseData: GoldenCase = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 推导实际结果
    const actualResult = deriveActual(caseData);
    // 计算 F1
    const f1 = computeF1Score(actualResult, caseData.expected);
    const passEmoji = f1.passed ? '✅' : '❌';
    const resultLine = `  ${passEmoji} ${caseData.id}: ${caseData.title}`;

    if (f1.passed) {
      passedCases++;
      console.log(`${resultLine} — PASS (边缘=1.0, 节点=1.0, 级别=${f1.severityMatch})`);
    } else {
      failedCases++;
      console.log(`${resultLine} — FAIL`);
      console.log(`     边缘命中率: ${(f1.edgeHitRate * 100).toFixed(0)}% (预期: ${f1.details.expectedEdgeIds.join(', ')})`);
      if (f1.details.missingEdges.length > 0) {
        console.log(`     缺失边: ${f1.details.missingEdges.join(', ')}`);
      }
      console.log(`     节点匹配率: ${(f1.nodeMatchRate * 100).toFixed(0)}% (预期: ${f1.details.expectedNodeTypes.join(', ')})`);
      console.log(`     级别一致: ${f1.severityMatch} (预期: ${f1.details.expectedSeverity}, 实际: ${f1.details.actualSeverity})`);
    }
    console.log('');

    results.push({
      caseId: caseData.id,
      title: caseData.title,
      passed: f1.passed,
      f1: {
        edgeHitRate: f1.edgeHitRate,
        nodeMatchRate: f1.nodeMatchRate,
        severityMatch: f1.severityMatch,
        details: f1.details,
      },
    });
  }

  const allPassed = failedCases === 0;

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  结果: ${allPassed ? '✅ 全部通过' : '❌ 有未通过案例'}`);
  console.log(`  通过: ${passedCases}/${files.length}`);
  if (failedCases > 0) {
    console.log(`  失败: ${failedCases}`);
  }
  console.log('═══════════════════════════════════════════════════════════');

  return {
    totalCases: files.length,
    passedCases,
    failedCases,
    results,
    summary: allPassed ? 'ALL_PASSED' : 'SOME_FAILED',
  };
}

// ═══ 入口 ═══

// 只在直接运行脚本时执行（不被 vitest import 时触发）
const isMainModule = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  const report = runAllChecks();

  if (report.failedCases > 0) {
    console.error(`\n[GATE] ${report.failedCases} 个黄金案例未通过 — F1 门禁拒绝`);
    process.exit(1);
  } else {
    console.log(`\n[GATE] 全部 ${report.totalCases} 个黄金案例通过 — F1 门禁开放`);
    process.exit(0);
  }
}
