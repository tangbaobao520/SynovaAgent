# Synova TUI v2 (ink 版本)

## 状态

已完成全部代码开发，等待在真实终端环境测试。

## 启动方式

### 方式 1: 演示模式（纯 UI，不依赖后端）
```bash
npx tsx src/tui-v2/demo.tsx
```

### 方式 2: 完整模式（连接真实后端）
```bash
npx tsx src/tui-v2/chat.tsx
```

### 方式 3: npm 脚本
```bash
npm run tui:v2
```

## 重要：必须在真实终端中运行

ink 需要 TTY 终端才能捕获键盘输入。**不能在 IDE 内置终端中运行**。

### Windows
1. 打开 Windows Terminal 或 PowerShell
2. cd 到项目目录
3. 运行 `npx tsx src/tui-v2/demo.tsx`

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

## 文件结构

```
src/tui-v2/
├── chat.tsx              # 主入口（完整业务逻辑）
├── demo.tsx              # 演示入口（纯 UI）
├── types.ts              # 类型定义
├── lib/
│   ├── theme.ts          # 主题系统
│   ├── grapheme.ts       # 字符边界处理
│   └── streaming.ts      # 流式输出引擎
├── components/
│   ├── header.tsx        # 顶部标题栏
│   ├── status-bar.tsx    # 底部状态栏
│   ├── chat-panel.tsx    # 对话面板
│   ├── side-panel.tsx    # 右侧面板
│   ├── composer.tsx      # 输入框
│   ├── message.tsx       # 单条消息
│   └── streaming-text.tsx # 流式文本
└── hooks/
    ├── use-event-bus.ts  # EventBus 订阅
    └── use-streaming.ts  # 流式输出管理
```

## 已知问题

1. **IDE 内置终端不支持**：必须在 Windows Terminal / PowerShell / CMD 中运行
2. **Map 迭代类型错误**：项目已有的 `downlevelIteration` 问题，不影响运行
