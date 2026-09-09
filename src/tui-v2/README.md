# Synova TUI v2 (ink 版本)

## 状态

方案 A 最小入口（D596/D603 裁决保留）：`chat.tsx` 主线 + components/lib/hooks 依赖闭包。
半死坏入口（index.ts + app.tsx）、演示入口（demo.tsx）、死代码（hooks/use-event-bus.ts）、
tui-v3 实验目录、l1-interaction/tui-adapter-v2.ts 已于 D603 删除（全仓零引用后清理）。

## 启动方式

### npm 脚本（推荐）
```bash
npm run tui        # 等价于: tsx src/tui-v2/chat.tsx
npm run synova     # 同一入口的别名
```

### 直接运行
```bash
npx tsx src/tui-v2/chat.tsx
```

## 重要：必须在真实终端中运行

ink 需要 TTY 终端才能捕获键盘输入。**不能在 IDE 内置终端中运行**。

### Windows
1. 打开 Windows Terminal 或 PowerShell
2. cd 到项目目录
3. 运行 `npm run tui`

### 验证终端支持
```bash
node -e "console.log('isTTY:', process.stdin.isTTY)"
```
如果输出 `isTTY: true`，说明终端支持 ink。
如果输出 `isTTY: undefined`，说明当前环境不支持。

## 与旧版本对比

| 特性 | neo-blessed (旧) | ink v2 (新) |
|------|-----------------|-------------|
| 输入处理 | readInput() 黑盒，易崩溃 | useInput Hook，纯 React 状态 |
| 颜色渲染 | blessed tags，Windows 失效 | chalk，跨平台一致 |
| 光标位置 | 计算错误，乱跑 | 由 ink 管理，准确 |
| 叠词 | submit 事件重复触发 | 纯状态管理，无事件重复 |
| 崩溃 | _done/_listener 状态混乱 | 无内部状态机，稳定 |

## 文件结构（D603 清理后）

```
src/tui-v2/
├── chat.tsx              # 主入口（唯一活入口，铁律 40-45 冻结项所在）
├── types.ts              # 类型定义
├── lib/
│   ├── bootstrap.ts      # 启动装配（存储装配经 L2 session-storage-service，D603）
│   ├── commands.ts       # 斜杠命令处理
│   ├── theme.ts          # 主题系统
│   ├── grapheme.ts       # 字符边界处理
│   ├── sidebar-aggregator.ts # 侧栏聚合
│   ├── mouse-input.ts    # 鼠标输入
│   └── thinking.ts       # 思考内容
├── components/           # UI 组件（header/chat-panel/side-panel/composer/status-bar/message/streaming-text）
└── hooks/
    └── use-streaming.ts  # 流式输出管理（铁律 41 模式所在）
```

## 架构边界（铁律 39，D603 起执行）

TUI 属 L1 交互层：启动装配（SQLite/SessionStore）经 L2
`src/agent/session-storage-service.ts`，cron 调度器经 L2
`src/agent/scheduler-service.ts`——不直触 `store/`、`better-sqlite3`、`cron/`（L5）。
存量动态 import（chat.tsx 的 knowledge-agent / sqlite-graph-store）登记于
`tests/architecture/l1-cross-layer-baseline.txt`，后续批次治理。

## 已知问题

1. **IDE 内置终端不支持**：必须在 Windows Terminal / PowerShell / CMD 中运行
2. **WAL 双进程写**：TUI 与 API server 同时运行时共享 synova.db（低频开发者本机场景，
   L1 审计 §8.2 已登记，随 TUI 后续处置消解）
