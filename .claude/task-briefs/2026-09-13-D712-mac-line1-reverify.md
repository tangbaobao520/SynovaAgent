# D712 桌面端线 1 证据重验批（Mac 侧）— Task Brief

> 派单: docs/synova/coordination/派单-桌面端线1重验批-D712-20260912.md（在 fix/d712-desktop-reverify-dispatch 分支）
> 执行: dsh-harness-mac | 2026-09-13 | 本单**只产证据，不改产品代码**

#CRITERIA: A

## Q0: 定位

- 项目拼图: 线 1「桌面端」（Electron 品牌表层，🟢 死守）8 个验收点中的 Mac 侧 6 点（1-1/1-3/1-4/1-5/1-6/1-7）证据过期（stale），本任务=重验出**机器可读证据**，不写新功能。
- 现状: 7 点 stale + 1 点待 K3（1-8）；旧证据 `stale-reverify-D589-line1.json` 未闭环。
- 决策: 复用既有实测脚本（`scripts/desktop/mac-install-verify.sh` / `first-diagnosis-timing.sh` / `upgrade-data-verify.sh`）+ `scripts/product-lines/evidence-writer.py` 写证据；**零新增产品代码**（改线 1 modules 会让整线证据再失效）。

## Q1: 调研

- 业界基线: 证据必须可由第三方按同一命令重跑（source + quote 写清"哪里来、怎么重跑"），不接受文档声称。
- memory/ 历史教训: D589 产出 stale-reverify 证据但未按 schema 落库 → 进度不计分；D510 F1 红线=禁止静态 grep 冒充物理实测；D316 假绿（lazy require 成功 ≠ 原生模块可用）。
- 决策参考系: 参考 第一性原理（证据=可复跑命令的物理输出）+ Anthropic 工程基线（fail-closed：跑不通写 failed，不静默）+ DeepSeek 开源实证（`evidence-writer.py` 既有 schema，不自造）→ 收敛：用现有脚本 + 现有 writer。

## Q2: 范围

做什么：
- docs/synova/product-lines/evidence/D712-mac-20260913/1-1-artifacts.txt（打包产物 + 版本一致性）
- docs/synova/product-lines/evidence/D712-mac-20260913/1-3-1-4-mac-install-assertions.txt（四断言）
- docs/synova/product-lines/evidence/D712-mac-20260913/1-5-dual-guide-check.txt（双引导物理核查）
- docs/synova/product-lines/evidence/D712-mac-20260913/1-6-timing.json（计时）
- docs/synova/product-lines/evidence/D712-mac-20260913/1-7-upgrade-assertions.txt（数据保留断言）
- docs/synova/product-lines/evidence/scenario-2026-09-13.json（1-1 pass 记录）
- docs/synova/product-lines/evidence/scenario-2026-09-13-1.json（1-3/1-4 pass 记录）
- docs/synova/product-lines/evidence/scenario-2026-09-13-2.json（1-6 pass 记录）
- docs/synova/product-lines/evidence/scenario-2026-09-13-3.json（1-7 pass 记录）
- docs/synova/product-lines/evidence/scenario-2026-09-13-4.json（1-5 fail 记录）
- task-state/D712.json（任务状态 + evidence 引用路径，全部指向被 git 跟踪文件）

不做什么：
- 不改 electron/main.cjs（打包/自启实现，本单只测）
- 不改 electron/backend-spawn.cjs（服务自启实现，本单只测）
- 不改 .github/workflows/desktop-build.yml（含 build-synova.cjs 构建链准备步缺口，只登记不修）
- 不改 scripts/desktop/mac-install-verify.sh（既有实测脚本，本单复用）
- 不改 scripts/desktop/upgrade-data-verify.sh（rows 探针瑕疵只登记不修）
- 不改 scripts/desktop/first-diagnosis-timing.sh（计时脚本，本单复用）
- 不改 scripts/install.sh（Mac 侧不碰安装脚本实现）
- 不改 src/server.ts（1-5 判 failed 的静态挂载点，修复另起 FIX 任务）
- 不改 app/setup.html（旧引导页面，修复另起 FIX 任务）
- 不改 docs/synova/product-lines/product-progress.json（CI 单点生成物，合并后由 workflow 重算）

## Q3: 验收

- 入口: 本机 `release/SynovaAgent-0.1.0-arm64.dmg`（三步链 + native 依赖准备后打包产物）
- 处理: ① mac-install-verify.sh 四断言 ② first-diagnosis-timing.sh 里程碑计时 ③ upgrade-data-verify.sh 覆盖安装断言 ④ 起后端 curl 旧 Web 引导探活
- 结果: 6 点状态 + `docs/synova/product-lines/evidence/` 下机器可读证据（schema=1）+ `refresh-all.sh` 重算线 1 状态

## 架构层: L1 交互（桌面端品牌表层，Electron 壳 + 首诊 UI）

## Done 标准

- [ ] 线 1 状态重算完成（1-1/1-3/1-4/1-6/1-7 机器绿转 pending_k3、1-5 如实 failed）——verify: `python3 -c "import json;d=json.load(open('docs/synova/product-lines/product-progress.json'));l=[x for x in d['lines'] if x['id']==1][0];print({p['id']:p['status'] for p in l['points']})"`
- [ ] 5 条证据记录由 evidence-writer.py 写入且 JSON 可解析——verify: `python3 -c "import json,glob;[json.load(open(f)) for f in glob.glob('docs/synova/product-lines/evidence/scenario-2026-09-13*.json')];print('OK')"`
- [ ] task-state/D712.json 的 evidence 引用路径逐条存在——verify: `python3 -c "import json,os;d=json.load(open('task-state/D712.json'));print(all(os.path.exists(p) for p in d['impl']['evidence']['records']))"`
