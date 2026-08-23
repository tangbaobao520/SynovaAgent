<!--
  SYNOVA-IMPL-D482: org-expert-tools 连接器声称降级（D357 附带发现收尾）
  状态: dev doc | 2026-08-24 | 优先级 P2
  权威文档: D357 交付报告（K3 可核）「附带发现——src/tools/org-expert-tools.ts:43：同类错误声称『或授权飞书/钉钉/企微连接器自动拉取』——建议后续任务处理」; D357 决策记录（Q1c：连接器声称降级——飞书已接入 FeishuConnector，钉钉/企微待接入，直连推迟部署后）; AGENTS.md 铁律（文档=代码现实）; src/connectors/index.ts（真实连接器出口）
  依赖: D357（连接器降级已合并——本任务收其附带发现）
  并行: 写集=src/tools/org-expert-tools.ts + tests/tools/org-expert-tools.test.ts，与 D481（tests/middleware/）**文件级零交集**，可 worktree 隔离并行；与 DSH 线（scripts/、src/sentinel/）零重叠；若必须并行先 worktree 隔离
-->

# SYNOVA-IMPL-D482 org-expert-tools 连接器声称降级

## 1. 权威文档引用

* **D357 交付报告**（K3 可核，2026-08-19）：「附带发现——src/tools/org-expert-tools.ts:43：同类错误声称『或授权飞书/钉钉/企微连接器自动拉取』——建议后续任务处理」。
* **D357 决策记录 Q1c**：连接器声称降级——`src/connectors/index.ts` L9-13 仅 export `FeishuConnector`/feishu-bridge/types（钉钉/企微待接入）；「飞书/钉钉/企微已对接」→「飞书已接入、钉钉/企微待实现」。
* **物理证据**（D357 报告）：`src/routes/im.ts:88-90` wecom stub——企微未实现。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷 A：manual 分支 nextStep 声称钉钉/企微可自动拉取
* `src/tools/org-expert-tools.ts` L43：`nextStep: '使用 POST /api/ontology/ingest 上传组织结构文档，或授权飞书/钉钉/企微连接器自动拉取。'`——钉钉/企微连接器未实现（D357 已降级此声称，本文件漏网）。

### 缺陷 B：非 manual 分支对未实现 dataSource 声称「已就绪」
* `src/tools/org-expert-tools.ts` L45-48：`return { orgId, dataSource, status: 'pending', message: ${dataSource} 连接器已就绪。用户授权后可自动拉取组织数据。 }`（L45 return / L46 orgId... / L47 message）——dataSource 参数描述（L31）为 `feishu/dingtalk/wecom/manual`，dingtalk/wecom 传入时声称「已就绪」，但物理上仅 feishu 真实接入（src/connectors/index.ts L9-13 仅 export FeishuConnector/feishu-bridge，L4 注释「钉钉/企微待接入」）。

### 现状（实测）
* `rg "buildOrgGraphTool" src/`：定义于 org-expert-tools.ts L23，经 `ORG_EXPERT_TOOLS`（L173-175）→ src/tools/index.ts L3 → src/agent/builtin-tools.ts L299 `registry.register(t)`（生产注册，接线真实）。
* `tests/tools/expert-tools-d234.test.ts`（D234 测试，测 BUSINESS_MODEL_EXPERT_TOOLS + KNOWLEDGE_EXPERT_TOOLS，11 用例全绿）**不 import org-expert-tools**（grep 无命中）——org-expert 无专属测试文件，**需新建** `tests/tools/org-expert-tools.test.ts`。

## 3. 实现方案

### 3.1 写集 (1 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/tools/org-expert-tools.ts | 修改 | manual 分支 L43 nextStep 降级为「…或接入飞书连接器自动拉取（钉钉/企微连接器待接入）」，删除「授权飞书/钉钉/企微」旧声称；非 manual 分支按 dataSource 分支：`feishu` → 维持「已就绪」文案；`dingtalk`/`wecom`/其他 → `message: '钉钉/企微连接器待接入（当前仅飞书可用），请通过手动模式或 POST /api/ontology/ingest 上传组织数据。'`（status 保持 pending，不新造状态） |
| tests/tools/org-expert-tools.test.ts | 新建 | 新建专属测试（配对 src/tools/org-expert-tools.ts，铁律 2b）：buildOrgGraphTool 3 断言——①manual 分支 nextStep 不含「钉钉/企微连接器自动拉取」旧声称、含「飞书」；②feishu → message 含「已就绪」；③dingtalk → message 含「待接入」（red=现状返回「已就绪」 → green=「待接入」）；另加 1 断言：ORG_EXPERT_TOOLS 长度 ≥4（接线守卫） |

> 共享资源标注（S-8）：本写集不含 VERSION.md（声称降级，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享，串行触碰；src/tools/+tests/tools/ 与 D481 的 tests/middleware/ 零交集。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如 message 文案措辞不同、或 dataSource 改为参数校验拒绝 dingtalk/wecom 而非降级文案、或发现 scanCollaborationTool 也有同类声称），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* 不实现钉钉/企微连接器（直连推迟部署后，D357 创始人裁决 B，本任务只对齐声称）。
* 不改 src/connectors/index.ts / src/routes/im.ts（连接器本体与 stub 现状，D357 已降级）。
* 不改 buildOrgGraphTool 参数契约（dataSource 枚举保持 feishu/dingtalk/wecom/manual——降级提示而非拒绝，避免破坏现有调用方）。

## 4. 测试要求（测试优先：先红 → 再绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| L1 | 单元 tests/tools/org-expert-tools.test.ts（新建） | 4 | ①manual 文案不含钉钉/企微自动拉取旧声称、含飞书（red=现状含旧声称 → green=降级）；②feishu → 「已就绪」；③dingtalk → 「待接入」（red=现状「已就绪」 → green=「待接入」）；④ORG_EXPERT_TOOLS 长度 ≥4（接线守卫） |
| L2 | 回归 既有 tools 测试 | 全量 | expert-tools-d234（11）+ tool-registry 不回归 |

**RED 必须覆盖失败模式（S-5）**：用例③以现状 `buildOrgGraphTool({orgId, dataSource:'dingtalk'}).message` 断言含「已就绪」→ **修复前 pass（错误声称）**，改为断言含「待接入」→ **修复前失败 → 修复后通过**；用例①同理反向（现状含旧声称 → 修复后不含）。

## 4.5 决策参考（S-12）
* 决策点 1：声称降级 vs 顺带实现连接器？
  * 参考系：第一性原理——能力真实存在仅推迟（D357 决策），本任务范围是「文档=代码现实」；实现连接器是部署后另一任务，混入会扩写集。
  * 结论：只降级声称。
* 决策点 2：dingtalk/wecom 降级提示 vs 参数校验拒绝？
  * 参考系：Anthropic——fail-open 优于 fail-closed 的交互面：LLM 经工具调用可能传 dataSource=dingtalk（参数契约保留该枚举），拒绝会破坏现有调用；降级文案保留 pending 状态，调用方可见「待接入」。
  * 结论：降级文案，不拒绝参数。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| buildOrgGraphTool（修改内部文案） | ORG_EXPERT_TOOLS → builtin-tools.ts L299 registry.register | `grep -rn "ORG_EXPERT_TOOLS" src/agent/builtin-tools.ts` 命中 |

> 生产调用点（S-3）：builtin-tools.ts L299 是工具注册生产入口；测试调用不计入。

## 6. 完成标准

* **DS1 旧声称清除**：`grep -n "授权飞书/钉钉/企微" src/tools/org-expert-tools.ts` 零命中。
* **DS2 新声称落地**：`grep -n "钉钉/企微连接器待接入" src/tools/org-expert-tools.ts` 命中（manual + 非 manual 分支）。
* **DS3 测试全绿**：`vitest run tests/tools/org-expert-tools.test.ts` 全 pass（4 断言；red 先行已证）。
* **DS4 零回归**：`vitest run tests/tools/tool-registry.test.ts` 绿 + `tsc --noEmit` 零新增（28=28）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（2 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（dingtalk 旧「已就绪」→ 新「待接入」；manual 旧声称 → 降级）
* [ ] 接线要求真实（ORG_EXPERT_TOOLS → builtin-tools 注册）
* [ ] DS verify 命令真实可执行、映射到实际用例
* [ ] 版本编排：声称降级，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 旧声称清除 | grep -n "授权飞书/钉钉/企微" src/tools/org-expert-tools.ts | 零命中 |
| DS2 新声称落地 | grep -n "钉钉/企微连接器待接入" src/tools/org-expert-tools.ts | 命中 |
| DS3 测试全绿 | vitest run tests/tools/org-expert-tools.test.ts | 全 pass |
| DS4 零回归 | vitest run tests/tools/tool-registry.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：与 D481 **可并行**（写集零交集：src/tools/+tests/tools/ vs tests/middleware/），必须 worktree 隔离；**只降级声称，不实现连接器、不扩写集**；dataSource 参数契约不变（降级提示而非拒绝）；新建测试文件必须与 impl 同 commit（铁律 2b）；暂存前查 session-registry（S-9）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
