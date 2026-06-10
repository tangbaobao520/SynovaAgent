/**
 * measurement-pipeline.js — 通用测量管道 (Pure JS)
 * @state: real
 *
 * 绕过 tsx phantom @synova 问题。直接 node 可运行。
 */

class MeasurementPipeline {
  constructor() {
    this._measurers = [];
  }

  register(measurers) {
    this._measurers.push(...measurers);
  }

  getMeasurerCount() {
    return this._measurers.length;
  }

  async run(input) {
    const results = [];
    const degradedModules = [];
    const isInputEmpty = Object.keys(input).length === 0;

    for (const m of this._measurers) {
      try {
        if (isInputEmpty) {
          results.push({
            measurerId: m.config.id,
            dimension: m.config.dimension,
            score: 0,
            confidence: 'low',
            evidence: ['输入数据为空'],
            computedAt: new Date().toISOString(),
          });
        } else {
          const r = await m.compute(input);
          results.push(r);
        }
      } catch (err) {
        degradedModules.push(m.config.id);
        results.push({
          measurerId: m.config.id,
          dimension: m.config.dimension,
          score: 0,
          confidence: 'low',
          evidence: ['测量器执行失败: ' + (err.message || 'unknown')],
          computedAt: new Date().toISOString(),
        });
      }
    }

    const aggregated = this._aggregate(results);

    return {
      results,
      aggregated,
      degradedModules,
      computedAt: new Date().toISOString(),
    };
  }

  _aggregate(results) {
    const grouped = new Map();
    for (const r of results) {
      const arr = grouped.get(r.dimension) || [];
      arr.push(r);
      grouped.set(r.dimension, arr);
    }

    const aggregated = {};
    const weights = { high: 1.0, medium: 0.5, low: 0.2 };

    for (const [dim, dimResults] of grouped) {
      let totalWeight = 0;
      let weightedSum = 0;

      for (const r of dimResults) {
        const w = weights[r.confidence];
        weightedSum += r.score * w;
        totalWeight += w;
      }

      const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const highCount = dimResults.filter(r => r.confidence === 'high').length;
      const lowCount = dimResults.filter(r => r.confidence === 'low').length;
      const aggConfidence = highCount > dimResults.length / 2 ? 'high'
        : lowCount > dimResults.length / 2 ? 'low' : 'medium';

      aggregated[dim] = {
        score: Math.round(avgScore * 10) / 10,
        confidence: aggConfidence,
        measurerCount: dimResults.length,
      };
    }

    return aggregated;
  }
}

function createSampleMeasurer(id, dimension, score) {
  if (score === undefined) score = 5.0;
  return {
    config: { id, dimension, dataRequirements: ['someData'] },
    compute() {
      return {
        measurerId: id,
        dimension,
        score,
        confidence: score > 3 ? 'medium' : 'low',
        evidence: ['样本测量器返回固定值 ' + score],
        trend: score > 5 ? 'improving' : 'stable',
        computedAt: new Date().toISOString(),
      };
    },
  };
}

// ═══ Test (embedded) ═══
async function runTests() {
  var passed = 0, total = 0;
  var errors = [];

  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  async function test(name, fn) { total++; try { await fn(); passed++; } catch(e) { errors.push(name + ': ' + e.message); } }

  await test('register measurer', function() {
    var p = new MeasurementPipeline();
    p.register([createSampleMeasurer('t1', 'D2')]);
    assert(p.getMeasurerCount() === 1);
  });

  await test('empty input → low confidence', async function() {
    var p = new MeasurementPipeline();
    p.register([createSampleMeasurer('m1', 'D2')]);
    var o = await p.run({});
    assert(o.results[0].confidence === 'low');
    assert(o.results[0].evidence[0].includes('数据为空'));
    assert(o.degradedModules.length === 0);
  });

  await test('failed measurer → degraded, others continue', async function() {
    var p = new MeasurementPipeline();
    p.register([createSampleMeasurer('good', 'D2'), {
      config: { id: 'bad', dimension: 'D2', dataRequirements: [] },
      compute() { throw new Error('BOOM'); },
    }]);
    var o = await p.run({ x: 1 });
    var good = o.results.find(function(r) { return r.measurerId === 'good'; });
    assert(good && good.confidence !== 'low', 'good should not be low');
    assert(o.degradedModules.indexOf('bad') !== -1, 'bad should be degraded');
  });

  await test('same-dimension aggregation', async function() {
    var p = new MeasurementPipeline();
    p.register([
      createSampleMeasurer('m1', 'D2', 7.0),
      createSampleMeasurer('m2', 'D2', 5.0),
      createSampleMeasurer('m3', 'D3', 8.0),
    ]);
    var o = await p.run({ x: 1 });
    assert(o.aggregated['D2'] && o.aggregated['D2'].measurerCount === 2);
    var s = o.aggregated['D2'].score;
    assert(s >= 5.5 && s <= 6.5, 'D2 score ~6.0, got ' + s);
    assert(o.aggregated['D3'] && o.aggregated['D3'].measurerCount === 1);
  });

  await test('missing required field → measurer reports low', async function() {
    var p = new MeasurementPipeline();
    p.register([{
      config: { id: 'needy', dimension: 'D3', dataRequirements: ['collab'] },
      compute(input) {
        if (!input.collab) return { measurerId: 'needy', dimension: 'D3', score: 0, confidence: 'low', evidence: ['缺少 collab 数据 — 无法计算协作密度'], computedAt: new Date().toISOString() };
        return { measurerId: 'needy', dimension: 'D3', score: 7, confidence: 'high', evidence: ['协作密度正常'], trend: 'stable', computedAt: new Date().toISOString() };
      },
    }]);
    // 非空输入 — 但缺少 measurer 需要的特定字段
    var o = await p.run({ otherData: true });
    assert(o.results[0].confidence === 'low');
    assert(o.results[0].evidence[0].includes('缺少'));
  });

  await test('evidence is readable', async function() {
    var p = new MeasurementPipeline();
    p.register([createSampleMeasurer('m1', 'D2')]);
    var o = await p.run({ x: 1 });
    for (var i = 0; i < o.results.length; i++) {
      for (var j = 0; j < o.results[i].evidence.length; j++) {
        var e = o.results[i].evidence[j];
        assert(e.length > 3, 'evidence too short: ' + e);
        assert(!/^[0-9.]+$/.test(e), 'just numbers: ' + e);
      }
    }
  });

  console.log(passed + '/' + total + ' passed');
  if (errors.length) { console.log('FAILURES:\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('OK');
}

// Export for production use
module.exports = { MeasurementPipeline, createSampleMeasurer };

// Run tests if called directly
if (require.main === module) {
  runTests().then(function() { process.exit(0); });
}
