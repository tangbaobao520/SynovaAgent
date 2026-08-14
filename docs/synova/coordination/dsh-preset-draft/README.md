# DSH 预设：SynovaAgent 纪律模式（L0 + D370 升级）

> 状态：**已批准**（创始人 2026-08-15 批准 P0-P3 全量执行）。
> 关联：D336 多 Agent 协作协议 + D370 能力升级（技能同步/组 13 门禁/预设一键安装）。

## 这是什么

一个基于 DSH「标准模式」的复制预设，唯一改动是 **persona（角色提示词）**：
标准模式的全部工具/能力原样保留，persona 里内置了 SynovaAgent 的铁律速览、任务 SOP、
自检 5 问、**决策模式（D333）**、**审计免疫（K3 错误闭环）**、**DSH 原生能力接入**
（goal/workflow/后台 job/技能路由，D370 新增）和 DSH 环境注意。
**子代理自动继承**（DSH 的 subagent 通过 composeFrom 认父）。

## 为什么需要它

仓库的控制塔（`.claude/settings.json` 的 PreToolUse/PostToolUse hooks）只对 Claude Code
触发，**对 DSH 不生效**。本预设把"先填 brief / 先验证 / 自检 / 禁 --no-verify"等纪律写进
persona，让每个 DSH 会话自动携带纪律，替代 hook 的写前拦截（提交时的 13 组 pre-commit
门禁仍然是物理兜底，与预设无关）。

> **决策记录（创始人 2026-08-14）**：SynovaAgent 将取消 TUI/CLI 部署方式，
> 本预设不含 TUI/CLI 相关内容（TUI 铁律 40-45 不收录）。

## 文件清单

| 文件 | 内容 |
|---|---|
| `preset.yml` | 预设显示元信息（name/description）——**最终版** |
| `persona.md` | persona 全文（含 D370 原生能力接入段）——**最终版** |
| `persona-block.yml` | 可直接替换 agent.cordis.yml 中 persona 行的 YAML 片段（含缩进）——**最终版** |

## 落位/漂移检查（D370 起一键化，不再手工 cp + 编辑 YAML）

```bash
# 落位（幂等: 整目录确定性替换）
bash scripts/control-tower/install-dsh-preset.sh --install

# 漂移检查（三态: 0 一致 / 1 漂移 / 2 检查失败, fail-closed）
bash scripts/control-tower/install-dsh-preset.sh --check

# 专项测试（正常/降级/边界 + 接线）
bash tests/control-tower/install-dsh-preset.test.sh
```

脚本行为：① 自动探测 DSH 安装目录的 standard 预设（`$DSH_INSTALL_DIR` → `npm root -g`）
② 复制整目录 ③ 用仓库 `persona-block.yml` 替换 persona 行（python 顶层 `- id: ` 边界状态机，
CRLF 兼容）④ 替换 `preset.yml` ⑤ 写 `.synova-preset-version` 来源标记。
源预设无 persona 行 → exit 2 拒绝落位（绝不产出坏预设，D328 三态）。

## 落位后验证清单

- [ ] `bash scripts/control-tower/install-dsh-preset.sh --check` → exit 0 + SYNC-OK
- [ ] GUI 设置 → Agent 预设出现 "SynovaAgent 纪律模式"
- [ ] 新会话选择该预设后，会话头部显示该预设
- [ ] 子代理继承（可选验证：在会话里派一个 subagent，问它自己的角色定位）

## D370 技能体系（预设配套）

- 技能单源 `.claude/skills/`（8 个），同步副本 `.dsh/skills/`（DSH 技能发现根 rank 100）
- 同步/校验：`bash scripts/workflow/sync-dsh-skills.sh [--check]`
- 漂移物理门禁：pre-commit 组 13（只改一边技能文件 → 提交硬阻断）
- 8 技能：git-sync-pr / brief-compose / claim-verifier / windows-compat / synova-audit
  + pr-review / ctrl-tower-change / contract-template（D370 新增 3 个）

## 后续可选升级（不在本 L0 范围）

- L1：创造模式会话用 cordis 工具集原型 pre-execute 门（写代码前查 brief）——重启即失
- L2：正式插件包挂 tools/pre-execute + tools/post-execute 监听器（包装现有 bash 脚本），
  实现 hook-block-write / verify-incremental 的 DSH 原生等价物——持久
- 红线：一切只做"门禁执行"，`scripts/audit/` 审计权属不变（K3 专属）
