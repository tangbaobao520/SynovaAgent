# SynovaAgent — D86 自助诊断check-self-diagnosis.sh 实施方案 v1.0

> 2026-07-15 | 第14份权威文档（系统集成与实施路线图）第二章 §2.2
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-15 审计确认）

- D49: healthz 6项健康检查 ✅ — 复用为Step 1/2数据源
- D84: check-integration.sh ✅ — 复用统一注册表
- D83: Bootstrap启动序列 ✅ — 检查Phase状态
- 自助诊断脚本: **零存在**
- 权威文档14第二章: 6步骤诊断流程 + Step 3.5溢出监控 + 自然语言输出

---

## 做了什么

### 1. scripts/workflow/check-self-diagnosis.sh — 自助诊断脚本（新建）

权威文档14 §2.2完整6+1步骤流程。每步输出自然语言结果：

```
Step 1: 数据源在线检查 (< 3s)
  检查 /api/healthz → data_freshness 状态 → 输出 "数据源正常（最近更新：X小时前）" 或 "⚠ 数据源financial_baseline中断X天"

Step 2: 哨兵健康检查 (< 5s)
  检查 sentinel registry → 活跃哨兵数 → 最近扫描时间 → "X/Y哨兵正常（最近扫描：X分钟前）"

Step 3: Loop Engineering 健康检查 (< 3s)
  检查 Bootstrap Phase状态 → loop-state.json → "Phase 0-5全部正常" 或 "⚠ Phase X degraded"

Step 3.5: 溢出监控与趋势健康检查 (< 3s)
  检查 CycleRegistry加载状态 → 子循环溢出值 → 趋势方向 → "溢出监控正常：4/4子循环在周期内"

Step 4: 边参数健康检查 (< 2s)
  检查42边transfer_function参数范围 → "底层参数在正常范围（fixed_cost_ratio=0.58）"

Step 5: 专家加载检查 (< 2s)
  检查expert manifest.json加载 → "X/Y专家就绪"

Step 6: 综合诊断报告 (< 1s)
  汇总所有Step结果 → 自然语言输出 + 置信度评级
```

**输出格式**: 自然语言面向GA/管理员。每步输出一条通俗易懂的判断，不含技术术语。

### 2. 用法

```bash
bash scripts/workflow/check-self-diagnosis.sh              # 完整6步
bash scripts/workflow/check-self-diagnosis.sh --quick      # 仅Step 1-3
bash scripts/workflow/check-self-diagnosis.sh --json       # JSON格式输出
```

---

## 不做什么

- 不修改D49 healthz（只消费其API）
- 不修改D84 check-integration（只复用它产出的system-registry.json）
- 不修改D83 Bootstrap
- 不创建新的数据采集管线

---

## 架构层

运维工具（`scripts/workflow/check-self-diagnosis.sh`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | check-self-diagnosis.sh | 2.5h | 6+1步骤+自然语言输出 |

**总工时: 2.5h（半天）**

---

## 完成标准

```
[ ] check-self-diagnosis.sh: 6+1步骤全部实现
[ ] Step 1: 复用 healthz API (/api/healthz)
[ ] Step 2: 复用 sentinel registry
[ ] Step 3: 复用 Bootstrap Phase状态
[ ] Step 3.5: 溢出监控+trenDirection检查
[ ] Step 4: 42边参数范围检查
[ ] Step 5: expert manifest加载检查
[ ] Step 6: 综合报告+置信度
[ ] 每步输出自然语言（面向GA/管理员）
[ ] 支持 --quick 和 --json 参数
[ ] 本地验证可独立运行
[ ] zero as any（bash脚本，不适用）
```

---

## 权威文档引用

- 第14份权威文档: 系统集成与实施路线图 第二章 §2.2
  - check-self-diagnosis.sh 六步骤完整流程
  - Step 3.5: 溢出监控与趋势健康检查（trendDirection+consecutiveDirection）
  - 自然语言输出格式
  - 减少GA找工程师频率：80%的"诊断不准确"报告是数据管道问题