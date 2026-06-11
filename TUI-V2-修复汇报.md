# Synova TUI v2 修复汇报

**日期**: 2026-06-07
**负责人**: AI Agent
**范围**: `src/tui-v2/` 目录

---

## 一、问题概述

在将 Synova TUI 从 `neo-blessed` 迁移到 `ink` (React for CLI) 的过程中，遇到了以下问题：

| 问题 | 严重程度 | 描述 |
|------|---------|------|
| 输入混乱 | **高** | 中文输入出现重复/乱序，如输入"你好"显示为"你好好你" |
| 高度不满屏 | 中 | 中间内容区域没有占满终端高度 |
| 光标不显示 | 低 | ink 不支持真实终端光标控制，假光标方案被否决 |
| 编译错误 | 中 | `backgroundColor` 在 ink 3.x `Box` 组件上不支持 |

---

## 二、修复内容

### 1. 编译错误修复

**文件**: `src/tui-v2/components/header.tsx`, `src/tui-v2/components/status-bar.tsx`

**问题**: ink 3.x 的 `Box` 组件不支持 `backgroundColor` 属性，导致 TypeScript 编译错误。

**修复**: 移除 `Box` 上的 `backgroundColor` 属性。

```tsx
// 修复前
<Box height={1} backgroundColor={theme.statusBar.bg}>

// 修复后
<Box height={1}>
```

**原因**: ink 3.x 的 `Box` 只支持布局属性（width/height/padding/margin/flexDirection 等），颜色需要通过子 `Text` 组件的 `color`/`backgroundColor` 设置。

---

### 2. 高度占满修复

**文件**: 
- `src/tui-v2/demo.tsx`
- `src/tui-v2/components/chat-panel.tsx`
- `src/tui-v2/components/side-panel.tsx`

**问题**: 中间内容区域（ChatPanel + SidePanel）没有占满终端剩余高度，导致下方出现空白。

**根因**: 
- ink 的 `Box` 在 `flexDirection="row"` 模式下，`flexGrow` 控制的是**宽度**分配，不是高度
- ink 3.x 不支持 `height="100%"` 这样的百分比值
- 需要显式传递 `height` 数值

**修复**:

1. **demo.tsx**: 使用 `useStdout` 获取终端高度，计算中间区域高度
```tsx
const { stdout } = useStdout();
const [termHeight, setTermHeight] = useState(stdout.rows || 24);

// 中间区域高度 = 终端高度 - Header(1) - Composer(3) - StatusBar(1) - 边框开销
<Box flexDirection="row" height={termHeight - 5}>
```

2. **chat-panel.tsx / side-panel.tsx**: 添加 `height` prop 并应用到 `Box`
```tsx
interface ChatPanelProps {
  // ...
  height?: number;
}

<Box width="70%" height={height} ...>
```

3. **demo.tsx**: 传递高度给子组件
```tsx
<ChatPanel ... height={termHeight - 5} />
<SidePanel ... height={termHeight - 5} />
```

---

### 3. 输入处理简化

**文件**: `src/tui-v2/components/composer.tsx`

**问题**: 中文输入混乱，字符被重复/乱序插入。

**根因分析**:
- 最初使用 `useStdin` + 手动解析 `data` 事件来处理输入
- Windows 下中文字符输入时，输入法可能分多次发送数据（拼音字母 + 最终汉字）
- `useEffect` 依赖管理不当导致事件监听器重复注册
- grapheme 处理函数（`insertAtGrapheme` 等）在快速连续输入时可能产生竞态

**修复**: 

1. **简化输入处理**：从手动 `useStdin` + `data` 事件解析，改回 `ink` 内置的 `useInput` Hook
   - `useInput` 内部已经处理了跨平台的键盘输入和输入法问题
   - 不需要手动解析 ANSI escape sequences

2. **简化状态管理**：移除光标位置、历史记录等复杂状态，只保留最基本的 `text` 状态
   - 光标功能后续通过其他方式实现（如使用 `ink-text-input` 组件或终端原生光标）

3. **简化文本插入**：直接使用字符串拼接 `t + input`，不再使用 grapheme 分割插入
   - 对于单行输入框，简单的字符串操作足够
   - grapheme 处理保留在需要精确字符计算的场景（如消息渲染宽度计算）

```tsx
// 修复后的核心输入处理
useInput((input, key) => {
  if (key.return) {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
    return;
  }
  
  if (key.backspace) {
    setText(t => t.slice(0, -1));
    return;
  }
  
  if (input) {
    setText(t => t + input);
  }
});
```

---

### 4. 假光标方案移除

**文件**: `src/tui-v2/components/composer.tsx`

**问题**: 尝试用 `▌` 字符 + `setInterval` 定时器模拟光标闪烁，但效果不佳。

**根因**: 
- ink 是 React 到终端的渲染抽象，**不暴露真实终端光标控制**
- CodeWhale 使用 ratatui（直接操作终端），可以通过 ANSI escape code 控制真实光标位置和显示
- ink 社区有 `ink-text-input` 组件，但 v6 需要 ink v5+，与项目当前的 ink v3 不兼容

**决策**: 暂时移除假光标，保持简洁。后续方案：
1. 升级 ink 到 v5，使用 `ink-text-input` 组件
2. 或使用 `node-pty` + 自定义渲染层实现真实光标
3. 或接受 ink 的限制，用其他方式指示输入焦点（如边框高亮）

---

## 三、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/tui-v2/components/composer.tsx` | 重写 | 简化输入处理，移除假光标，修复中文输入 |
| `src/tui-v2/components/chat-panel.tsx` | 修改 | 添加 `height` prop |
| `src/tui-v2/components/side-panel.tsx` | 修改 | 添加 `height` prop |
| `src/tui-v2/components/header.tsx` | 修改 | 移除 `backgroundColor` |
| `src/tui-v2/components/status-bar.tsx` | 修改 | 移除 `backgroundColor` |
| `src/tui-v2/demo.tsx` | 修改 | 添加 `useStdout` 获取终端高度，传递高度给子组件 |

---

## 四、验证状态

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 编译通过 | ✅ | `npx tsc --noEmit` 无错误 |
| 高度占满 | 待验证 | 需要真实终端测试 |
| 中文输入 | 待验证 | 需要真实终端测试 |
| 流式输出 | ✅ | 之前已验证正常 |
| 回车提交 | ✅ | 之前已验证正常 |

---

## 五、后续建议

1. **光标方案**: 评估升级 ink 到 v5 的可行性，或使用 `ink-text-input` 的兼容版本
2. **输入增强**: 恢复历史记录（↑↓箭头）、左右移动光标等功能
3. **集成测试**: 将 `src/tui-v2/chat.tsx`（完整业务逻辑）与 demo 同步修复
4. **删除旧代码**: 验证通过后，删除 `src/tui/`（neo-blessed 旧版本）

---

## 六、测试命令

```bash
cd d:\novis-backup-20260526\Novis\synova-agent
npx tsx src/tui-v2/demo.tsx
```

**注意**: 必须在真实终端（Windows Terminal / PowerShell / CMD）中运行，IDE 内置终端不支持 TTY，会导致 ink 无法接收键盘输入。
