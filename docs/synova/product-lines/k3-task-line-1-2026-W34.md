# 审计复核任务书 — 线 1 桌面端

> 生成: 2026-08-29 | 触发: 线首次到 100%（全部验收点已验证），按规则必须全量复核
> 红线说明: 本任务书只提供材料与问题清单；审什么、怎么算过，由审计员定夺。
> 数据源: docs/synova/product-lines/product-progress.json + product-lines.yaml

## 这条线到 100% 的定义（产品承诺）

创始人双击安装包 → 装好 → 服务自启 → 开窗即用，Win 和 Mac 都实测过

## 证据包清单（全部 git 跟踪，可复核可重跑）

- 验收点 1-1 | 安装包能打出来（Electron 打包流程产出可安装产物） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D517.json
- 验收点 1-2 | Windows 双击安装 → 启动 → 出窗（30 分钟首诊旅程起点） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D523.json
- 验收点 1-3 | Mac 版安装包可用（双平台承诺） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D519.json
- 验收点 1-4 | 服务自启、开窗即用（用户不用碰命令行） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D522.json
- 验收点 1-5 | 安装引导单一入口（双引导收敛） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D518.json
- 验收点 1-6 | 30 分钟内从安装到可诊断（零命令行） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D527.json
- 验收点 1-7 | 升级/重装不丢数据（企业数据安全底线） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D528.json
- 验收点 1-8 | 审计员复核安装实测记录（独立重跑） | 状态: verified | 证据: docs/synova/product-lines/evidence/task-D527.json

## 复核问题清单（供审计员参考，不构成审计标准）

1. 抽查 ≥1 个"已验证"验收点：证据文件是否真实存在？重跑/核对后是否仍成立？
2. 验收点措辞是否保持产品承诺实质（没有把做不到的包装成不需要）？
3. 线进度与各验收点状态加总是否一致？
4. 证据是否在有效期内？相关代码变更后证据是否已失效待重跑？

## 结论栏（审计员填写）

- [ ] 复核通过（线可标 100%）
- [ ] 复核不通过（写明原因与退回项）
