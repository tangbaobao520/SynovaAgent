# Task Brief: D581-win-verify-build-guard

> 生成: 2026-09-06 03:27:34 | 分支: feat/mac-d581-win-verify-guard | as any: 0
> 派单: docs/synova/coordination/派单-D581-D578收尾三残留-20260906.md（小任务直派，无独立 spec）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于基础设施层（构建/验证工具链 + Win 真机验证脚本），非 L1-L5 业务代码。
D578 Win 真机实测完成（台账 1493539f）后转来 3 项 DSH 收尾残留：A ps1 BOM 编码、B evidence 路径、C 构建守卫；连带 D 项仅登记不实现。
1-2 兑换被本单阻塞：四断言未跑 + evidence 未入 git——本单修好后路径打通。

### b) 文件审计
- scripts/desktop/win-install-verify.ps1 — D523 切片 B Win 四断言唯一入口；现状 UTF-8 无 BOM（PowerShell 5.1 中文注释乱码，Win 实测 Missing expression）；L24 evidence 落根级 evidence/（被 .gitignore:76 禁用）
- build-synova.cjs — electron-builder 配置，头注释三步构建链契约；extraResources 依赖 dist/backend.mjs，但 npm scripts 不前置 build:backend → 本地构建出空包
- tests/electron/desktop-build.test.ts — 产物断言组（静态文本断言 + release/ 存在时物理断言），守卫测试的配对落点
- .gitignore:76 `evidence/` 无路径锚定 = 匹配任意层级同名目录，实证 git check-ignore 命中 docs/synova/product-lines/evidence/ 下新文件 → 验收 2 非忽略的物理前提缺失
- docs/synova/runbooks/founder-demo-win.md L4 — 一键实跑 runbook 行（任务 A 要求注明双 PowerShell 可跑）
- expert/ sentinel/ extensions/ knowledge/ 零涉及（纯脚本/构建层，无文件驱动模块冲突）

### c) 决策
无已有覆盖可复用（三处都是缺陷修复非新能力），无新建硬编码类型。
撞车检查: D579 在途 scripts/product-lines/、D580 spec docs/plans + 编码 src/sentinel —— 本单写集零重叠。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① Done = 派单验收 6 条（BOM 字节/路径 grep/check-ignore/守卫 fail-fast/回归全绿/tsc 28=28）
② 测试 = tests/electron/desktop-build.test.ts 新增 D581 守卫断言组：接线 WIRE CHECK + 正常路径放行 + 缺失路径 fail-fast（临时目录注入，不触碰真实 dist/）
③ 实现 = ps1（BOM+路径）→ build-synova.cjs（beforePack 守卫）→ .gitignore（evidence 豁免）→ runbook 注记 → 台账登记
④ 接线 = electron-builder 25.1.8 doPack() 无条件调用 beforePack（node_modules/app-builder-lib/out/platformPackager.js:147-159 实证），真实打包路径必经
⑤ 验证 = 验收 1-4 逐条命令 + 自检 5 问

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: 守卫必须挂在真实打包路径上——beforeBuild 在 npmRebuild:false 下永不执行（packager.js:405 提前 return 实证），禁止用死钩子假装守卫
  verify: "grep -c 'beforePack' build-synova.cjs"
- rule: ps1 首三字节必须为 EF BB BF（PowerShell 5.1 中文注释兼容，验收 1）
  verify: "head -c 3 scripts/desktop/win-install-verify.ps1 | xxd | grep -qi 'efbb bf'"
- rule: evidence 输出路径必须 check-ignore 非忽略（CT-57 口径：断言摘要/md5 入 git）
  verify: "grep -q 'docs/synova/product-lines/evidence' scripts/desktop/win-install-verify.ps1 && ! grep -q 'evidence/D523' scripts/desktop/win-install-verify.ps1"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
参考：第一性原理 + Anthropic(fail-closed) + 开源实证（electron-builder 25.1.8 源码 packager.js/platformPackager.js）+ 结论：
1) 守卫方案 b 语义保留（fail-fast 断言、不强制重建，与 CI test -f 同语义），但载体从派单字面的 beforeBuild 改为 beforePack——实证 beforeBuild 挂在 installAppDependencies() 内，npmRebuild:false（D529 冻结项，bcrypt 挂死修复，不可回退）时提前 return 永不执行 = 静默死守卫（违反铁律 11）；beforePack 在 doPack() 开头无条件调用。派单明示"编码自决记录依据"。
2) .gitignore 追加一行 !docs/synova/product-lines/evidence/ —— `evidence/` 无锚定匹配任意层级，实证新 evidence 文件被忽略；验收 2 要求非忽略，缺此行 Win 侧 git add 直接被拒（evidence 入 git 物理前提）。
3) beforePack 成功路径必须返回 undefined——packager.js:417 实证返回 false 会跳过 node_modules 处理。

### d) 相关 Note 引用
- 无治理脚本区/规则文档区变更（写集为 scripts/desktop/ + 构建配置 + 测试 + docs），commit-msg D534 门禁不触发；决策依据已沉淀本字段（K3 可核）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/desktop/win-install-verify.ps1 — 重存 UTF-8 with BOM + L24 EVIDENCE_DIR 改 docs/synova/product-lines/evidence/D578-win-real-machine + 头注释入口行注明 powershell.exe 5.1 与 pwsh 7 均可跑
- build-synova.cjs — 新增 assertBackendArtifact 守卫（JSDoc 契约）+ beforePack 钩子接线，缺失 fail-fast 且信息含 npm run build:backend
- .gitignore — 追加 !docs/synova/product-lines/evidence/ 豁免行（验收 2 物理前提）
- tests/electron/desktop-build.test.ts — 新增 D581 守卫断言组（接线/正常/缺失三路径，expect 断言）
- docs/synova/runbooks/founder-demo-win.md — L4 一键实跑行注明双 PowerShell 可跑
- docs/synova/coordination/审计发现台账-DSH-CTO.md — 追加 D 项连带登记（1-7 NSIS 升级路径实测缺）
- task-state/D581.json — impl 段回填 impl_done
- .claude/task-briefs/2026-09-06-D581-win-verify-build-guard.md — 本 brief

不做什么：
- 不改 package.json（方案 b 语义无需动 scripts 段——守卫载体在 build-synova.cjs 内生效）
- 不改 src/server.ts（及 src/ 下全部业务代码——本单纯脚本/构建/测试层）
- 不改 electron-renderer/src/App.tsx（及 electron-renderer/ 全目录——渲染层与本单无关）
- 不改 scripts/product-lines/product-lines.yaml（D579 认领中，零重叠）
- 不改 scripts/audit/AUDIT-PROTOCOL.md（及 scripts/audit/ 全目录——审计红线永不修改）
- 不改 scripts/pre-commit-check.sh（门禁脚本不属于本单写集）
- 不改 VERSION.md（纯脚本/构建配置，无产品代码变更，CT-42 不触发）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：Win 目标机 `powershell -File scripts/desktop/win-install-verify.ps1`；开发者本地 `npm run electron:build:win`
处理（中间经过哪些步骤）：脚本把四断言 evidence 落到 git 跟踪目录 docs/synova/product-lines/evidence/D578-win-real-machine/；electron-builder 打包前 beforePack 断言 dist/backend.mjs 存在
结果（最终展示在哪）：evidence 文件可 git add 入 git（1-2 兑换证据链打开）；缺产物时构建 fail-fast 且错误信息含 build:backend（不再出空包）

物理验收命令（对应派单验收 1-4）：
1. BOM: head -c 3 scripts/desktop/win-install-verify.ps1 | xxd 首三字节 EF BB BF
2. 路径: grep "docs/synova/product-lines/evidence" scripts/desktop/win-install-verify.ps1 有命中且 evidence/D523 零命中；git check-ignore 新 evidence 文件 exit 1 非忽略
3. 守卫: node -e "require('./build-synova.cjs')" 正常；vitest 守卫组三路径全绿（接线/放行/fail-fast）；另做一次性手动演练——临时移走 dist/backend.mjs 后 npm run electron:build:win fail-fast 输出含 build:backend（演练后还原，不进自动化 verify 以免动真实产物）
4. 回归: npx vitest run tests/electron/desktop-build.test.ts 全绿；npx tsc --noEmit 错误计数 28=28（基线实测 28）

## 架构层: 基础设施
L1-L5 业务代码零触碰；变更面 = scripts/desktop/（验证脚本）+ 构建配置 + 测试 + 文档/台账
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: 验收1 BOM 在位 — verify: head -c 3 scripts/desktop/win-install-verify.ps1 | xxd | grep -qi "efbb bf"
- [ ] 链路走通: 验收2 证据路径新值在位且旧前缀清零 — verify: grep -q "docs/synova/product-lines/evidence" scripts/desktop/win-install-verify.ps1 && ! grep -q "evidence/D523" scripts/desktop/win-install-verify.ps1
- [ ] 结果可见: 验收3+4 守卫接线断言与回归全绿 — verify: npx vitest run tests/electron/desktop-build.test.ts
- [ ] 类型门禁零漂移: tsc 错误计数维持 28 — verify: npx tsc --noEmit 2>&1 | grep -c "error TS"
