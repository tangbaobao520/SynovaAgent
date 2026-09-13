# Task Brief: D732 dispatch-batch3-registration

> 生成: 2026-09-13 | 任务: D732 | 认领: 主 CTO（synova-cto）
> 参考: cto-handover §〇b/§〇c（派单 SOP）+ 创始人指令「所有派出的任务都回来了，像真正的 CTO 一样安排接下来的工作」

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
派单与任务号登记（非五层）。前批（D715-D718/D725/D726/D716-impl）全部回报完毕，本单按 CTO 判断重排下一批并登记任务号。
### b) 文件审计
- 前序回报实测：D715 K3 审计（七任务 PASS）/ D717 真债（CI 12-12）/ D718 四项 / D725 spec（gatekeeper exit 0）/ D726（状态机 machine 段已重写）/ D716 spec1 实现（501+303 行）
- 新暴露的产品级空洞：evidence 表在生产库**不存在** + EvidenceStore 零实例化 + expires_at 零写入方（D725 spec 实测）
- 编号纪律：D727-D732 全部经 alloc-task-id.sh 实分配（此前曾凭计划号臆写 D727 vs 实为 D725）
### c) 决策
出第三批派单文档 + 五个任务号登记；零代码改动。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 铁律 0-2：spec → test → impl → wire → review → merge → 证据链必须先有契约再动数据模型
- 铁律 47：声明必须由物理证据支撑（本批每项均附实测证据）
- 历史教训：① 派单文档写错 D# 导致执行方核对成本（本批起核 task-state）② 声明解析四套口径（G12/D708/棘轮/staging-guard）堵死钥匙 PR
### 参考：第一性原理（产品可溯源是卖点物理前提）+ 铁律 0-2/47 → 产品空洞优先于体系缺陷优先于小修

## Q2: 范围 — 正确的最简方案
做什么：
- docs/synova/coordination/派单-第四批-D733-D736-20260913.md — 第四批派单（五条机制补强，分三批）
- task-state/D733.json — ownership 机器化登记
- task-state/D734.json — PR 预算门禁登记
- task-state/D735.json — bypass.log 出库登记
- task-state/D736.json — 测试 hermetic 化登记
- docs/synova/coordination/派单-第三批-D727-D731-20260913.md — 第三批派单（五项 + 依赖图 + 四段复制块）
- task-state/D727.json — 证据层数据流 spec（dev-doc）
- task-state/D728.json — 证据层接线实现（Mac 编码）
- task-state/D729.json — 死码/死键清理小批（Mac 编码）
- task-state/D730.json — 声明单一事实源 + 门禁覆盖后来者（并行 CTO）
- task-state/D731.json — 第三批审计（K3）
- task-state/D732.json — 本派单登记
不做什么：
- 不改 src/**（各任务由执行方实现）
- 不改 scripts/audit/**（审计红线）
- 不改 .github/workflows/ci.yml（#520 在途持有）
- 不改 scripts/control-tower/**（D730 将由并行 CTO 认领）

## Q3: 验收 — 入口 → 交互 → 结果
入口：创始人从派单文档复制四段说明转给对应 session
处理：四线并行执行（D727 spec 先行 → D728 依赖它）
结果：证据链可溯源 + 门禁口径统一 + 死码清零 + K3 第三批报告

## 架构层: 基础设施（派单与任务登记，非五层）
本批次为派单登记；各任务实施层按其自身 spec 声明

## Done 标准:
- [ ] 派单文档含五项：for s in D727 D728 D729 D730 D731; do grep -q "$s" docs/synova/coordination/派单-第三批-D727-D731-20260913.md || echo "MISSING $s"; done → 零输出
- [ ] 六个 task-state 合法：python3 -c "import json;[json.load(open(f'task-state/D{d}.json')) for d in (727,728,729,730,731,732)];print('ok')" → ok
- [ ] 复制块齐备：grep -c "【D7" docs/synova/coordination/派单-第三批-D727-D731-20260913.md → ≥4
