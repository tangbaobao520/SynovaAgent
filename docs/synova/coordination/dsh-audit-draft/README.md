# DSH 预设：Synova-K3 独立审计（synova-k3-audit）

> 状态：草稿待审。审批后落位 `~/.dsh/.agent-presets/synova-k3-audit/`。
> 关联：D336 多 Agent 协作（审计线 = Kimi K3）+ D374（DSH 体系）+ AUDIT-PROTOCOL v1.0。

## 这是什么

零上下文独立审计线程。脑 = Kimi K3（provider `kimi-coding` / model `k3`），
工作区 = `/Users/wane/Synova-k3独立审计`（产品仓库的独立 clone，物理隔离）。

**极简工具**（12 行，砍掉编排与联网）：bash / 文件读写 / fs-search / 技能 / jobs /
compaction / ask-user / todo。**已砍**：goal / plan mode / subagent / workflow / ralph / web。
理由（D333 收敛）：审计者只"读材料→物理验证→写判定"，多一个编排/联网工具都是越界面与成本。

## persona 五板块

1. **审计定位**：AUDIT-PROTOCOL L1-L4 四层 + 15 项清单
2. **物理证据铁律**：每条结论 file:line，声称无据 = 显式标出，绝不默认通过
3. **跑偏第二道**：对照 PRODUCT-BRIEF 三问（真实用户？接近终态？变味？）——零上下文复判 dev-doc 的自检
4. **错误归因闭环**：每个错误归因 audit/implement/devdoc/control-tower 之一 + M 模式表守门（一类一机制，防臃肿）
5. **任务状态机**：读 `task-state/<D#>.json` → 审计 → 写回 verdict（结果传递不靠人转达）

## 脑 = K3 的接线（关键，落位后必须做这一步）

DSH 预设**不固化模型**（模型是 session 级选择）。启动审计会话时：
1. 新开会话 → 选预设 **🔍 Synova-K3 独立审计**
2. 在**模型选择器**选 **kimi-coding / k3**（你的 `settings.yaml` 已配 `KIMI_CODING_API_KEY`，pi-ai 内置此路由，端点 `https://api.kimi.com/coding`）
3. 会话头部应显示 k3 模型 + 🔍 预设名

> 若模型选择器里没有 kimi-coding/k3，检查环境变量 `KIMI_CODING_API_KEY` 是否 export。

## 落位方式（手动，不走 install-dsh-preset.sh）

审计预设是**自定义极简组合**（非 standard 派生），`install-dsh-preset.sh` 的
"复制 standard + 替换 persona"逻辑不适用。手动落位：

```bash
mkdir -p ~/.dsh/.agent-presets/synova-k3-audit
cp docs/synova/coordination/dsh-audit-draft/agent.cordis.yml ~/.dsh/.agent-presets/synova-k3-audit/
cp docs/synova/coordination/dsh-audit-draft/preset.yml          ~/.dsh/.agent-presets/synova-k3-audit/
```

> 已知缺口：`install-dsh-preset.sh --check` 目前不覆盖本预设（它是 standard 派生类）。
> 如需纳入漂移检查，后续可扩展该脚本支持"自定义组合"类预设（本 L0 不做）。

## 红线（persona 内已写死，此处重申）

- 只读产品仓库，绝不写产品代码/brief/记忆
- 绝不修改 `scripts/audit/`、绝不编写审计标准（归 K3/创始人）
- 不修 bug、不改 dev doc——只报告，不越界
- 报告回流走"只含报告的 PR 分支"，创始人合并

## 落位后验证清单

- [ ] GUI 预设选择器出现 "🔍 Synova-K3 独立审计"
- [ ] 新会话选它 + 模型选 kimi-coding/k3 → 头部显示
- [ ] 问它"你的角色和红线是什么" → 回答零上下文审计员 + 只读 + 不碰 scripts/audit/
- [ ] 派一个真实审计任务（D#）→ 产出 file:line 证据 + 归因标注的报告
