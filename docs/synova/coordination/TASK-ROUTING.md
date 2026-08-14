# 任务路由表（v3，2026-08-16 创始人定）

> 派活前查这张表。同一模块同一时间只允许一个角色认领（防撞车）。
> 状态标注：`进行中·<角色>` → `已完成·<角色·日期>`。

---

## 〇、给创始人的大白话版（30 秒看懂，下面技术版可以不用看）

**一句话：两个人各管一块地，互不踩线，你只负责点"合并"按钮。**

| 谁 | 管什么（大白话） | 打比方 |
|----|----------------|--------|
| **Mac DSH** | 新修的地：验证系统（场景/进度页/CI）、接企业用的门面（MCP/桌面安装包）、以及所有"管 AI 的 AI"（控制塔） | 建仪表盘的人 |
| **Win Claude** | 老地皮：产品核心业务代码（诊断/哨兵/数据） | 修发动机的人 |
| **Codex** | 写施工图纸（dev doc）+ 维护任务看板 | 画图纸的人 |
| **K3** | 验收（审别人干得对不对） | 监理 |
| **你** | 定产品长什么样 + 点 Merge 按钮 | 老板 |

**为什么永远不会打架**：两块地没有一块重叠。每块地上同时只允许一个人干活，干完交给你合并。

**决策分工（2026-08-16 创始人定）**：
- **技术决策**（怎么实现、选什么方案、排什么顺序）→ **DSH 按 DECISION-REFERENCE 四步框架做**：第一性原理（梁文峰）+ Anthropic 工程 + 收敛检查，每次决策记录参考系（K3 可核）
- **产品与业务决策**（产品该有什么、卖给谁、收多少钱、放什么权）→ **只有你**

**你要做的全部事情**：
1. 定产品方向（要什么线绿）
2. PR 绿勾 → 点 Merge（自动合并开了以后，连等都不用等）
3. 页面顶部的"待裁决"区，30 秒判断题

---

## 一、模块所有权表（唯一权威，撞车时查这张表）

| 模块/目录 | 所有者 | 职责 |
|-----------|--------|------|
| scripts/product-lines/ + docs/synova/product-lines/ | **Mac DSH** | v1.5 四值升级、证据回填、进度页维护 |
| scripts/golden-scenarios/ | **Mac DSH** | GS-01~08 场景脚本（先做 GS-02/03/04） |
| .github/workflows/ | **Mac DSH** | 场景回归 CI、产品进度 CI |
| src/mcp/ | **Mac DSH** | MCP 企业接入 P0 |
| electron/ + electron-renderer/ | **Mac DSH** | Electron 一体化 P0（自启/双平台打包/D337） |
| scripts/control-tower/ + scripts/backup/ + 门禁脚本 + docs/synova/coordination/ | **Mac DSH**（已有） | 控制塔持续维护 |
| src/（L1-L5 业务）+ extensions/ + packages/ + synova_worker/ | **Win Claude Code** | 诊断核心修复 |
| docs/计划库 + 双仪表盘 | **Codex (Win)** | 双线并行出 dev doc、任务登记 |
| scripts/audit/ + 审计执行 | **Kimi K3 (Win)** | 逢绿必验、首审、标准执行 |

### 存量任务归属（规则，不是快照——Codex 派活时套规则，不看旧清单）

| 规则 | 归属 |
|------|------|
| 动 `scripts/`（控制塔/门禁/协作/审计体系基建） | Mac DSH |
| 动 `scripts/golden-scenarios|product-lines` / `.github/` / `src/mcp/` / `electron/` | Mac DSH |
| 动 `src/`（除 mcp）/ `extensions/` / `packages/` / `synova_worker/` | Win Claude |
| 只动文档（docs/ 口径） | Codex |
| 审计判定与标准 | K3 |

> 当前任务映射示例（08-16 快照，**以规则为准**）：D307/D332/D340-D349/D352/D323 → DSH；D309/D310/D333/D334/D336/D338/D351/D353/D354/D355-D358/D360/D110 → Claude；D339/D359 文档部分 → Codex。
> ⚠️ D343-D349 红线：DSH 实现只做**容器/格式/派发**工程（bypass 双轨、报告跟踪、JSON 外壳解析），判定规则一律引用 K3 标准——**不新增任何"怎么算过"**。

### 串行点（机器强制 + 惯例）

| 点 | 规则 | 强制方式 |
|----|------|---------|
| `src/server.ts` | Claude 专属（DSH 不碰，mcp/ 内部除外） | CODEOWNERS（机器） |
| 门禁脚本 + coordination 文档 + VERSION.md | DSH 专属 | CODEOWNERS（机器） |
| `package.json`/锁文件 | 每批只有一个 agent 改依赖，dev doc 写集声明 | 惯例 |
| 写集重叠 | Codex 出 dev doc 声明写集；verify-parallel 查重叠；重叠 → 停手问创始人 | 机器（pre-push） |

### PR 审查路由

- Claude 的 PR → **DSH 预审**（PR 审查 ≠ 审计）+ 创始人 Merge
- DSH 的 PR → **Codex 预审**（写集/范围/门禁）+ 创始人 Merge
- 合并后 → **K3 审计**（红线 3：无豁免）

---

## 二、自动化清单（流程尽量自动化——已做/待做）

| # | 自动化 | 状态 | 效果 |
|---|--------|:---:|------|
| B1 | **CODEOWNERS**（.github/CODEOWNERS：文件 → 所有者） | 待建（DSH，1 小时） | GitHub 自动给 PR 指派审查人；branch protection 可强制"动别人地盘必须经主人审查"——**地盘规则从"文档自律"变"机器强制"** |
| B2 | **Auto-merge**（PR 开启：CI 全绿 + 审查通过 → 自动合并） | 待建（创始人可在 PR 页一键开启） | 你从"等 CI 再点合并"变"批准一次，绿了自动合"——创始人等待归零 |
| B3 | **A7 审计派发**（gen-k3-task.py 自动生成 K3 复核任务书） | ✅ D371 已建 | 转绿自动生成任务书，你不用记得找 K3 |
| B4 | **进度页自动刷新**（refresh-all.sh + product-progress.yml + auto 分支） | ✅ D371/D372 已建 | 每周五自动重算，页面即真相 |
| B5 | **写集重叠自动检测**（verify-parallel.sh，随 pre-push） | ✅ 已有（CT-28 语义缺陷待 D332 修） | 撞车自动拦 |
| B6 | **认领一条命令**（claim/release CLI 写路由表+registry，替代手改表格） | 待建（DSH，Phase 2） | 认领/交还不靠人记 |
| B7 | **PR 写集重叠 CI**（PR 打开时与在飞 PR 写集对比，重叠告警） | 待建（Phase 2，依赖 D307） | 并行防撞的第三道机器防线 |

**自动化原则（最少机制）**：B1/B2 先做（一小时级，收益最大——把"防撞车"和"等你合并"两个最大人工环节机器化）；B6/B7 等 D307 隔离落地后按需加，不为完整度堆机制。

---

## 三、每周节奏（建议，非规则）

```
周一/三：Codex 双线并行出 dev doc（写集声明）
周中：两条线同时实现（一人一事一分支）
周五：你批量看 PR（Auto-merge 开了以后只看"绿了吗"）
下周初：K3 逢绿必验
```

## 四、协作环（为什么这样最快）

```
DSH 先建 GS-02/03/04 场景（K3 审计断点 → 机器断言）
   ↓ 场景红 = Claude 的验收标准
Claude 修 D355-D360（对着场景修，不再盲写）
   ↓ 修完 → 场景转绿 → 自动进待验池
K3 逢绿必验 → 进度页数字上涨 → 你看真值
```

两边产出互相是对方的输入；你只需要在周末看一次进度页。

---

## 五、当前模块认领状态

| 模块/区域 | 状态 | 备注 |
|-----------|------|------|
| scripts/control-tower/（控制塔） | 进行中·DeepSeek Harness | D334-D336 连续迭代 |
| scripts/backup/（备份） | 已完成·DeepSeek Harness·08-14 | launchd 已装 |
| .claude/skills + .dsh/skills + DSH preset | 已完成·DeepSeek Harness·08-15 | D370 P0-P3，PR 已合并 |
| src/ 业务代码（L1-L5） | 空闲 | Claude Code 主力 |
| src/mcp/ | 空闲·待 DSH 认领 | MCP P0 |
| electron/ + electron-renderer/ | 空闲·待 DSH 认领 | Electron 一体化 P0 |
| .github/workflows/ | 进行中·DeepSeek Harness | D371 已建；场景回归 CI 待加 |
| scripts/audit/ | Kimi K3 专属 | 红线：其他角色禁碰 |
| docs/synova/coordination/ | DeepSeek Harness | 创始人批准后变更 |
| scripts/product-lines/ | 已完成·DeepSeek Harness·08-16 | D371（PR #19）+ D372（PR #20）已合并 |
| scripts/golden-scenarios/ | 进行中·DeepSeek Harness·08-16 | GS-01~08 本体下一任务 |

## 六、认领/交还流程

1. 接任务 → 在本表对应行标注 `进行中·<角色>·<日期>`（B6 落地后一条命令完成）
2. 完成任务（PR 已合并）→ 标注 `已完成·<角色>·<日期>`
3. 中途放弃 → 标注 `空闲` 并说明原因
4. 撞车（两人同时认领）→ 停手，问创始人仲裁
