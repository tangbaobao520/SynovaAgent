# SPEC: 自动化工作流门禁系统

## 全局定位
- Synova 是 AI 组织诊断系统，核心是服务于增长
- 本模块属于 工程基础设施 — 不归属于单一架构层，而是横切所有层
- 服务于用户旅程：开发流程质量保障。每一个 feat/ 分支的代码提交质量
- 对接：不对接具体专家。服务对象是开发流程本身

## 接口签名
- check-spec.sh: 检查 SPEC.md 是否存在且包含必填字段 → exit 0/1
- check-test-first.sh: 检查新 public 函数是否有测试引用 → 警告 (MVP)
- check-reality.sh: 检查 @state: 标记 + Mock 检测 → exit 0/1 (已有)
- check-wire.sh: 接线审计 → exit 0/1 (已有)

## 接入点
- .git/hooks/pre-commit → scripts/pre-commit-check.sh → 调用上述所有脚本

## 算法选择
- bash 脚本 + grep 模式匹配。简单、零依赖、git hook 原生支持。
- 不引入 Node.js 工具链——hook 必须在 git 操作中即时响应。

## 边界条件
- SPEC.md 不存在 → 硬阻断，提示创建
- SPEC.md 存在但缺字段 → 硬阻断，提示补充
- 非 feat/fix 分支 → 跳过 SPEC 检查
- 测试门禁 MVP 阶段永远不阻断 (exit 0)，Phase 2 改为 exit 1
