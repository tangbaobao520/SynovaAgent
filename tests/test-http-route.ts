/**
 * tests/test-http-route.ts — HTTP 路由端到端测试
 * @state: real — 真实API调用，验证完整HTTP链路
 *
 * 绕过完整服务器启动问题(其他包依赖缺失)，只测试诊断上传路由。
 */
import express from 'express';

async function main() {
  console.log('=== HTTP 路由端到端测试 ===\n');

  // 创建最小 Express app，只加载诊断上传路由
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const uploadRoute = await import('../src/routes/diagnosis-upload-v2');
  app.use(uploadRoute.default);

  const PORT = 3099;
  const server = app.listen(PORT, () => {
    console.log(`测试服务器: http://localhost:${PORT}\n`);
  });

  // ═══ 测试 1: POST /api/diagnosis/upload ═══
  console.log('测试 1: POST /api/diagnosis/upload');

  const SAMPLE = `## 企业访谈 — XX科技有限公司
### 任务目标
3年目标成为西南地区企业服务头部。年营收从2000万到5000万。

### 业务价值
主营企业培训和管理咨询。毛利率45%。客户认可课程质量和落地效果。

### 现状起点
团队35人。讲师10人，销售8人，运营17人。用的是钉钉办公。

### 资源约束
现金流健康但预算偏紧。核心讲师只有3个资深老师。

### 风险瓶颈
1)3个核心讲师离职风险 2)大客户B占50%营收 3)市场竞争加剧

### 成功标准
3年后客户续约率>80%，年营收>5000万。今年先做到续约率70%。

### 市场定位
客户说：课程不便宜但落地效果好。和竞品差异：我们只做落地，不做理论。

### 数字底座
钉钉+微信+Excel管理。没有CRM系统。客户数据散落在销售微信里。`;

  try {
    const uploadRes = await fetch(`http://localhost:${PORT}/api/diagnosis/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: SAMPLE,
        teamId: 'test-001',
        orgName: 'XX科技有限公司',
      }),
    });

    const uploadData = await uploadRes.json() as any;
    console.log(`  Status: ${uploadRes.status}`);
    console.log(`  jobId: ${uploadData.jobId}`);

    if (!uploadData.jobId) {
      console.error('  ❌ 未返回 jobId');
      server.close();
      process.exit(1);
    }

    // ═══ 测试 2: GET /api/diagnosis/report/:jobId (轮询) ═══
    console.log('\n测试 2: 轮询报告 (最多60s)...');

    let report = '';
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const reportRes = await fetch(`http://localhost:${PORT}/api/diagnosis/report/${uploadData.jobId}`);
      const contentType = reportRes.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
        report = await reportRes.text();
        console.log(`  ✅ 报告就绪 (${(report.length / 1024).toFixed(1)} KB) — 轮询 ${(i + 1) * 2}s`);
        break;
      } else {
        const status = await reportRes.json() as any;
        process.stdout.write(`  ⏳ ${status.status}... `);
      }
    }

    if (!report) {
      console.error('\n  ❌ 60s 内报告未完成');
      server.close();
      process.exit(1);
    }

    // ═══ 验证 ═══
    console.log('\n测试 3: 验证报告内容...');
    const checks = [
      { name: 'HTML结构完整', pass: report.startsWith('<!DOCTYPE html>') && report.includes('</html>') },
      { name: '包含核心结论', pass: report.includes('核心结论') },
      { name: '包含企业名称', pass: report.includes('XX科技有限公司') },
      { name: '包含战略/组织/财务专家', pass: report.includes('战略健康') && report.includes('组织能力') && report.includes('财务视角') },
      { name: '包含行动建议', pass: report.includes('行动建议') },
      { name: '零内部术语', pass: !report.includes('测量器') && !report.includes('GapDimension') },
    ];

    let allPass = true;
    for (const c of checks) {
      console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
      if (!c.pass) allPass = false;
    }

    if (allPass) {
      console.log('\n🎉 HTTP 路由端到端测试通过！');
    } else {
      console.log('\n❌ 部分验证失败');
    }

  } catch (e: any) {
    console.error(`\n❌ 测试失败: ${e.message}`);
  } finally {
    server.close();
    process.exit(0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
