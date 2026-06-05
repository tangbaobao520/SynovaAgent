# SynovaAgent 包管理说明

> 2026-06-05 | P3 审计项: 包引用正规化

## 当前结构

```
Novis/
├── packages/           ← 本地包 (TypeScript 源码)
│   ├── sog-core/       → @synova/sog-core
│   ├── logger/         → @synova/logger
│   ├── error-types/    → @synova/error-types
│   ├── diagnosis-engine/ → @synova/diagnosis-engine
│   ├── connector-registry/ → @synova/connector-registry
│   ├── extension-registry/ → @synova/extension-registry
│   └── knowledge-ingest/ → @synova/knowledge-ingest
├── server/vendor/
│   └── @synova/engine-core/ → @synova/engine-core (vendor 代码)
└── synova-agent/       ← 主应用
```

## 引用方式

所有本地包使用 `file:` 协议引用:

```json
{
  "dependencies": {
    "@synova/sog-core": "file:../packages/sog-core",
    "@synova/engine-core": "file:../server/vendor/@synova/engine-core"
  }
}
```

## 为什么用 file: 而不是 workspace？

- `file:` 是 npm 的标准本地包引用方式，不需要额外工具 (pnpm/yarn)
- `npm install` 直接创建 symlink 到本地目录
- 开发时 `tsx` 直接加载 TypeScript 源码，无需编译
- 跨平台兼容 (Windows/Linux/Mac)

## 已知限制

1. **版本管理**: 所有包版本为 `0.1.0`，未独立版本化
2. **发布流程**: 若需发布到 npm，需改为 `version` 依赖 + 各自 publish
3. **CI/CD**: `npm install` 需要完整的 monorepo 目录结构

## 未来迁移路径 (if needed)

```
npm workspaces → pnpm workspaces → 独立发布
     ↓               ↓               ↓
  零改动         改管理工具       改依赖声明
  (当前已兼容)    pnpm-workspace.yaml   workflow/publish.sh
```

## 决策

当前 `file:` 方案满足开发需求。保持现状，升级时机为:
- 需要独立版本管理时 (多项目依赖不同版本)
- 需要发布到私有/公共 npm registry 时
- CI/CD 需要跨仓库构建时
