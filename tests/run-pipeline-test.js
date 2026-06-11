// Run measurement pipeline tests directly (bypass vitest phantom @synova issue)

async function run() {
  var passed = 0, failed = 0;
  var errors = [];

  async function test(name, fn) {
    try { await fn(); passed++; process.stdout.write('.'); }
    catch(e) { failed++; errors.push(name + ': ' + e.message); process.stdout.write('X'); }
  }

  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

  // Dynamic import
  var mod;
  try {
    mod = require('../packages/engine-core/src/pipeline/diagnosis/measurement-pipeline.ts');
  } catch(e) {
    console.error('Import failed:', e.message);
    process.exit(1);
  }

  console.log('\n=== Measurement Pipeline Tests ===\n');

  await test('should register measurers', function() {
    var p = new mod.MeasurementPipeline();
    var m = mod.createSampleMeasurer('t1', 'D2');
    p.register([m]);
    assert(p.getMeasurerCount() === 1, 'Expected 1 measurer');
  });

  await test('empty input returns low-confidence results', async function() {
    var p = new mod.MeasurementPipeline();
    var m = mod.createSampleMeasurer('m1', 'D2');
    p.register([m]);
    var output = await p.run({});
    assert(output.results.length === 1, 'Expected 1 result');
    assert(output.results[0].confidence === 'low', 'Expected low confidence');
    assert(output.results[0].evidence[0].includes('输入数据为空'), 'Expected empty data evidence');
    assert(output.degradedModules.length === 0, 'Expected no degraded');
  });

  await test('failed measurer does not block others', async function() {
    var p = new mod.MeasurementPipeline();
    var good = mod.createSampleMeasurer('good', 'D2');
    var bad = {
      config: { id: 'bad', dimension: 'D2', dataRequirements: [] },
      compute: function() { throw new Error('BOOM'); },
    };
    p.register([good, bad]);
    var output = await p.run({ someData: true });
    var goodResult = output.results.find(function(r) { return r.measurerId === 'good'; });
    assert(goodResult !== undefined, 'Good measurer should have run');
    assert(goodResult.confidence !== 'low', 'Good measurer should not be low');
    assert(output.degradedModules.indexOf('bad') !== -1, 'Bad measurer should be in degraded');
  });

  await test('aggregates same-dimension measurers', async function() {
    var p = new mod.MeasurementPipeline();
    var m1 = mod.createSampleMeasurer('m1', 'D2', 7.0);
    var m2 = mod.createSampleMeasurer('m2', 'D2', 5.0);
    var m3 = mod.createSampleMeasurer('m3', 'D3', 8.0);
    p.register([m1, m2, m3]);
    var output = await p.run({ someData: true });
    assert(output.aggregated['D2'] !== undefined, 'D2 should be aggregated');
    assert(output.aggregated['D2'].measurerCount === 2, 'D2: expected 2 measurers');
    // weighted avg: both medium(0.5) → (7*0.5+5*0.5)/(0.5+0.5)=6.0
    var d2Score = output.aggregated['D2'].score;
    assert(d2Score >= 5.5 && d2Score <= 6.5, 'D2 score around 6.0, got ' + d2Score);
    assert(output.aggregated['D3'] !== undefined, 'D3 should be aggregated');
    assert(output.aggregated['D3'].measurerCount === 1, 'D3: expected 1 measurer');
  });

  await test('missing data lowers confidence', async function() {
    var p = new mod.MeasurementPipeline();
    var m = {
      config: { id: 'needy', dimension: 'D3', dataRequirements: ['collaborationData'] },
      compute: function(input) {
        if (!input.collaborationData) {
          return { measurerId: 'needy', dimension: 'D3', score: 0, confidence: 'low',
            evidence: ['缺少 collaborationData — 无法计算'], computedAt: new Date().toISOString() };
        }
        return { measurerId: 'needy', dimension: 'D3', score: 7.0, confidence: 'high',
          evidence: ['协作密度正常'], trend: 'stable', computedAt: new Date().toISOString() };
      },
    };
    p.register([m]);
    var output = await p.run({});
    assert(output.results[0].confidence === 'low', 'Expected low when data missing');
    assert(output.results[0].evidence[0].includes('缺少'), 'Expected missing data message');
  });

  await test('evidence is readable text', async function() {
    var p = new mod.MeasurementPipeline();
    var m = mod.createSampleMeasurer('m1', 'D2');
    p.register([m]);
    var output = await p.run({ someData: true });
    for (var i = 0; i < output.results.length; i++) {
      for (var j = 0; j < output.results[i].evidence.length; j++) {
        var e = output.results[i].evidence[j];
        assert(e.length > 5, 'Evidence too short: ' + e);
        assert(!/^[0-9.]+$/.test(e), 'Evidence is just numbers: ' + e);
      }
    }
  });

  console.log('\n\n' + passed + '/' + (passed+failed) + ' passed');
  if (errors.length) { console.log('Errors:\n  ' + errors.join('\n  ')); process.exit(1); }
  process.exit(0);
}

run();
