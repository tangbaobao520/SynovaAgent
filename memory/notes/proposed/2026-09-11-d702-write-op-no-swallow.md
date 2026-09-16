---
状态: proposed
日期: 2026-09-11
决策: D702（写操作吞错修复 K3 W-2）交付过程三教训固化——①brief Q2 include 必须「- 路径: 描述」冒号紧跟路径；②本地 pre-commit G12 软提示≠CI 硬阻断，SYNO_CI=1 预演须带真实写集 stage；③clean tree 上的门禁预演必假绿（STAGED_ALL 空 → G12/接线组空转）
理由: D702 首推 CI 波红在 G12「task brief Q2 范围一致性: 4 处」——根因是 brief_parser.parse_q2 以首个 [:：]| — 切分提取路径（brief_parser.py:80），Q2 include 行写成「src/growth/user-store.ts updateUser/deleteUser 返回 { ok: ...」（路径后直接跟散文）→ 提取出「src/growth/user-store.ts updateUser/deleteUser 返回 { ok」污染模式 → G12 matches() 的 (^|/) + escape(pat) + $ 末段锚定永不命中。82/83 两行（anomaly-detector.ts/enterprise.ts）只因恰好写了「:86」「:239」行号才切净——侥幸通过更具迷惑性。本地 synova-commit 时 G12 已 ⚠️ 报 4 处但 soft_check 本地不阻断（「V5 软提示——CI 为权威」），属 D586「本地软提示≠CI strict」教训的第二实例。
---

## 变更清单
1. brief 格式规则（本 note 固化，无代码改动）：Q2 include/exclude 含路径行一律「- <路径>: <描述>」，冒号紧跟路径末字符；禁「路径 散文」无分隔写法（D599 已有同款先例，本次为第二次实证）
2. CI 预演方法修正：SYNO_CI=1 bash scripts/pre-commit-check.sh 预演必须先把本次写集 git add 到暂存区再跑——本地无 GITHUB_ACTIONS=true 时 STAGED_ALL 取 git diff --cached，clean tree 预演 = G12 空转假绿（D702 实证：修后复跑「13 组通过」实为空暂存假绿，CI 波次才暴露真状态）
3. 排除项污染无害论（实测）：Q2 exclude 模式被散文污染只产生假阴性（该拦不拦的排除项失效方向是「漏报」不是「误报」），含空格/中文的长模式经 escape + 末段锚定不可能匹配真实路径——修 include 时 exclude 可不连带改

## 关联
- PR #497（feat/win-d702-write-op-no-swallow）：c7988968 修复提交（brief 8 条 include 裸路径化），修复波 CI 12/12 job 全绿（run 34555115755）
- 首推波红证据：CI run 34511671762/34511901540 quality job G12 4 处（user-store.ts / user-store.test.ts / enterprise.test.ts / anomaly-detector.test.ts 不在 Q2 范围内）
- D599（Q2 include 须裸路径）、D586（本地软提示≠CI strict）、D479（find|head -1 多同日 brief）同族教训；本次新增维度：解析器切分语义 + 预演假绿陷阱
