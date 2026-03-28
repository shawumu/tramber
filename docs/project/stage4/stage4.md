# Tramber Stage 4: Ink CLI 重构

> **创建时间**: 2026-03-28
> **前置依赖**: Stage 3 (多轮对话 + 工具增强)
> **预计周期**: 3-4 个工作日
> **当前状态**: Phase 1-8 已完成

---

## 1. 背景与动机

### 1.1 当前问题

Stage 3 完成了多轮对话、流式输出、工具增强等核心功能，但 CLI 的输入输出体验仍然粗糙：

| 问题 | 表现 |
|------|------|
| **输出侵入** | 流式文本、工具调用、debug 日志、权限确认共享 stdout，互相打断 |
| **无法回看** | 流式文本直接写 stdout，没有滚动支持，长输出被冲掉 |
| **工具展示简陋** | 工具调用只显示名称，没有参数详情、耗时、结果预览 |
| **权限确认不清晰** | 用户无法看到完整上下文（文件路径、内容预览） |
| **输入能力弱** | 只支持单行输入，不支持多行、粘贴、历史搜索 |
| **Spinner 冲突** | Spinner 和流式文本抢占同一行，显示混乱 |

### 1.2 为什么选 Ink

- **React 生态**：组件化思维，状态管理成熟，开发效率高
- **Flexbox 布局**：终端原生 Flexbox，区域隔离天然解决输出侵入问题
- **`<Static>` 组件**：已完成的输出永久渲染，不参与重绘，天然支持滚动回看
- **大量生态**：ink-ui、ink-spinner、ink-markdown 等开箱即用
- **业界验证**：Claude Code、Gemini CLI、GitHub Copilot CLI 均使用 Ink
- **TypeScript 原生**：与项目技术栈一致

---

## 2. 目标架构

### 2.1 界面布局

```
┌──────────────────────────────────────────────────────────────────┐
│ Tramber v0.2.0 │ coding │ tokens: 1.2k │ iter: 3/30 │ ⟳ edit  │  ← StatusBar（动态区）
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Debug [12] ─────── [F] 级别: ERROR ──────────────────── [X] ┐ │
│ │ [ERROR] tramber:tool:file - ENOENT: no such file             │ │  ← DebugPanel（动态区）
│ │ [INFO ] tramber:agent:loop - Iteration 3/10                  │ │     可折叠，仅 --debug 时启用
│ │ [WARN ] tramber:permission - Permission denied: exec          │ │
│ └───────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  You: 修复登录页面的样式问题                                      │  ← Static 区域
│                                                                  │     （只追加不修改，不参与重绘）
│  ▸ read_file: src/pages/login.tsx  ✓ 12ms                       │
│  ▸ edit_file: src/pages/login.tsx  ✓ 8ms                        │
│  ▸ read_file: src/pages/login.tsx  ✓ 3ms                        │
│                                                                  │
│  Tramber: 我已经修复了登录页面的样式问题，主要改动：                │
│  1. 调整了容器宽度...                                             │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ▸ exec: npm run test ...                                        │  ← 进行中工具（动态区）
│  Tramber: 正在运行测试以验证修复...█                              │  ← 流式文本（动态区）
├──────────────────────────────────────────────────────────────────┤
│  ┌─ ⚠ Permission Required ────────────────────────────────────┐  │  ← 权限确认（动态区，条件渲染）
│  │  file_write (write_file)                                   │  │
│  │  File: src/pages/login.tsx                                │  │
│  │  Allow? [Y/n]                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│ You: _                                                           │  ← InputBox（固定底部）
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **区域隔离**：StatusBar、DebugPanel、消息区、InputBox 各自独立
2. **全动态渲染**：不使用 `<Static>`（Static 与固定高度布局不兼容），全部由 Ink virtual DOM 差异更新
3. **固定高度布局**：根 Box 设 `height={termHeight}`，StatusBar/InputBox 设 `flexShrink={0}` 防缩放
4. **消息行数截断**：通过 `estimateMessageLines` 估算每条消息行数，从最新消息往前累加，超出可用行数就截断，防止溢出挤掉 InputBox
5. **Debug 日志内化**：通过 DebugBridge → useDebugLogs hook → DebugPanel 组件，日志在 Ink 布局内渲染，不泄漏到终端
6. **批量更新**：高频日志通过 100ms 批量刷新 bridge → state，避免每次 setState 触发重绘
7. **权限确认不阻塞主界面**：条件渲染替换 InputBox

### 2.3 组件树

```
<App height={termHeight}>
  ├── <StatusBar flexShrink={0} />           ← 顶栏（版本/Scene/Token/迭代/当前工具）
  │
  ├── <DebugPanel />                        ← 仅 --debug 时渲染（可折叠）
  │     ├── 标题栏：日志数 + 级别过滤器 + 关闭按钮
  │     └── 日志列表（ring buffer 最近 15 条）
  │
  ├── <WelcomeBanner />                     ← 首次显示，首次输入后隐藏
  │
  ├── <Box flexGrow={1}>                    ← 消息区（行数截断，防止溢出）
  │     ├── <MessageItem /> × N             ← 已完成消息（按行数估算截断）
  │     ├── <ActiveTool />                  ← 进行中工具
  │     ├── <StreamingText />               ← AI 流式响应（纯文本，不做 Markdown）
  │     └── <PermissionPrompt />            ← 权限确认（条件渲染）
  │
  └── <InputBox flexShrink={0} />           ← 底栏（命令补全 + 多行粘贴 + 历史）
```

### 2.4 消息行数截断机制

Ink 不支持终端区域裁剪（`overflowY` 无效），因此通过数据截断防止溢出：

```
可用行数 = termHeight - StatusBar(3) - InputBox(3) - DebugPanel(0或18) - 安全边距(2)

从最新消息往前累加估算行数：
  user:       1 + ceil(content长度 / 终端宽度)
  assistant:  min(换行数 + 代码块×3 + 2, 30)
  tool_call:  2~3 行（错误时有详情）
  error:      4 行（边框 + 内容）

超出可用行数 → 截断旧消息，只显示能放下的部分
```

---

## 3. 技术选型

### 3.1 核心依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `ink` | ^6.x | React 终端渲染引擎 |
| `react` | ^18.x | 核心框架 |
| `chalk` | ^5.x | 颜色（Ink 内部已依赖） |

> **Ink 6 API 注意**：Text 组件用 `color="cyan"` 而非 `cyan` 布尔 prop；`dimColor` 是布尔值无参数。

### 3.2 可选依赖（已引入）

| 包 | 用途 | 阶段 |
|----|------|------|
| `marked` | Markdown lexer（仅用词法分析，不做 HTML 转换） | Phase 7 |

---

## 4. DebugPanel 架构设计

### 4.1 问题分析

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 禁止 console 输出 | 最简单 | 无法实时观察 |
| **B. Ink 内渲染 DebugPanel** | 日志与 UI 一体，体验好 | 需要缓冲层解决高频 setState |
| C. stderr 分离 | 不干扰 Ink | 视觉上仍"跑到窗口外" |

**选择方案 B**，通过 DebugBridge 缓冲层解决性能问题。

### 4.2 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Engine / Agent / Tool 深层代码                                   │
│    │                                                             │
│    ▼                                                             │
│  Logger.log(namespace, level, message, data)                    │
│    │                                                             │
│    │  ┌─ 条件：enabled=true（仅 --debug 时开启）                   │
│    │  │                                                          │
│    ├─→ [原有] console.error / file append                        │
│    │                                                             │
│    └─→ [新增] onLog?.(entry) ──────────── 同步，< 0.01ms         │
│              │                                                   │
│              ▼                                                   │
│         DebugBridge.push(entry)                                  │
│              │                                                   │
│              │  Ring Buffer (max=100)                            │
│              │  ├─ 新条目追加到尾部                                │
│              │  └─ 超出 100 条时裁剪头部                           │
│              │                                                   │
│              │  ──── 不触发任何 React 更新 ────                    │
│              │                                                   │
│              ▼                                                   │
│         setInterval(100ms)                                       │
│              │                                                   │
│              ▼                                                   │
│         setDebugLogs(bridge.recent(30))                          │
│              │                                                   │
│              │  最多 10 次 setState/秒                            │
│              │                                                   │
│              ▼                                                   │
│         Ink 重绘动态区（Static 完全不受影响）                      │
│              │                                                   │
│              ▼                                                   │
│         DebugPanel.render(filteredLogs)                          │
│              │                                                   │
│              │  仅渲染最近 30 条                                  │
│              │  按级别过滤（用户可切换）                           │
│              │                                                   │
│              ▼                                                   │
│         ┌─ Debug [45] ──── ERROR ──── [X] ─┐                    │
│         │ [ERROR] agent:loop - ...         │                    │
│         │ [ERROR] tool:file - ...          │                    │
│         └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 模块定义

#### DebugLogEntry（类型）

```typescript
// packages/shared/src/logger.ts 中新增
export interface DebugLogEntry {
  timestamp: number;       // Date.now()
  level: LogLevel;         // 'error' | 'basic' | 'verbose' | 'trace'
  namespace: string;       // 'tramber:agent:loop'
  message: string;         // 'Iteration 1/10 started'
  data?: unknown;          // { taskId: '...', maxIterations: 10 }
}
```

#### DebugBridge（纯数据类，无 React 依赖）

```typescript
// packages/client/cli/src/debug-bridge.ts
export class DebugBridge {
  private buffer: DebugLogEntry[] = [];
  private readonly maxItems: number;

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  /** 同步 push，< 0.01ms */
  push(entry: DebugLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxItems) {
      this.buffer = this.buffer.slice(-this.maxItems);
    }
  }

  /** 返回最近 n 条 */
  recent(n: number): DebugLogEntry[] {
    return this.buffer.slice(-n);
  }

  /** 总条目数（用于计数显示） */
  get count(): number {
    return this.buffer.length;
  }

  /** 清空 */
  clear(): void {
    this.buffer = [];
  }
}
```

#### Logger.onLog 回调（shared 层扩展）

```typescript
// packages/shared/src/logger.ts - Logger 类新增
export class Logger {
  // ...现有字段...

  /** 新增：日志回调钩子 */
  onLog?: (entry: DebugLogEntry) => void;

  private log(namespace: string, level: LogLevel, message: string, data?: unknown): void {
    if (!this.enabled) return;
    if (!this.shouldLog(namespace, level)) return;

    // 新增：触发回调（同步，调用方只做 array.push）
    this.onLog?.({
      timestamp: Date.now(),
      level,
      namespace,
      message,
      data
    });

    // 原有逻辑不变
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const levelTag = this.levelTag(level);
    const fullMessage = `[${timestamp}] [${namespace}] ${levelTag} ${message}`;

    if (this.output === 'console') {
      console.error(fullMessage);
      if (data !== undefined) console.error(JSON.stringify(data, null, 2));
    } else if (this.output === 'file' && this.filePath) {
      // ...文件写入...
    }
  }
}
```

#### useDebugLogs Hook（React ↔ Bridge 桥接）

```typescript
// packages/client/cli/src/hooks/use-debug-logs.ts
import { useState, useEffect, useRef } from 'react';
import { Logger, type DebugLogEntry, type LogLevel } from '@tramber/shared';
import { DebugBridge } from '../debug-bridge.js';

type FilterLevel = 'all' | 'error' | 'warn' | 'info';

export function useDebugLogs(enabled: boolean) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [visible, setVisible] = useState(enabled);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const bridgeRef = useRef(new DebugBridge(100));

  useEffect(() => {
    if (!enabled) {
      // 未启用 --debug：不收集、不渲染
      setLogs([]);
      setVisible(false);
      return;
    }

    const bridge = bridgeRef.current;

    // 1. 注册 Logger 回调（同步 push）
    Logger.getInstance().onLog = (entry) => bridge.push(entry);

    // 2. 批量刷新 → state（100ms 一次，最多 10 次/秒 setState）
    const timer = setInterval(() => {
      setLogs([...bridge.recent(30)]);
    }, 100);

    return () => {
      clearInterval(timer);
      Logger.getInstance().onLog = undefined;
    };
  }, [enabled]);

  // 级别过滤
  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'all') return true;
    if (filterLevel === 'error') return log.level === LogLevel.ERROR;
    if (filterLevel === 'warn') return log.level === LogLevel.ERROR || log.level === LogLevel.BASIC;
    return true; // 'info' = 全部
  });

  return {
    logs: filteredLogs,
    totalCount: bridgeRef.current.count,
    visible,
    filterLevel,
    toggleVisible: () => setVisible(v => !v),
    setFilterLevel,
  };
}
```

#### DebugPanel 组件

```tsx
// packages/client/cli/src/components/debug-panel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { DebugLogEntry } from '@tramber/shared';
import type { FilterLevel } from '../hooks/use-debug-logs.js';

interface DebugPanelProps {
  logs: DebugLogEntry[];
  totalCount: number;
  filterLevel: FilterLevel;
  visible: boolean;
  onClose: () => void;
  onFilterChange: (level: FilterLevel) => void;
}

const LEVEL_COLORS: Record<string, string> = {
  error: 'red',
  basic: 'gray',
  verbose: 'gray',
  trace: 'gray',
};

const LEVEL_TAGS: Record<string, string> = {
  error: 'ERR',
  basic: 'INF',
  verbose: 'VRB',
  trace: 'TRC',
};

const FILTER_OPTIONS: { label: string; value: FilterLevel }[] = [
  { label: 'ALL', value: 'all' },
  { label: 'ERROR', value: 'error' },
  { label: 'WARN+', value: 'warn' },
  { label: 'INFO', value: 'info' },
];

export function DebugPanel({ logs, totalCount, filterLevel, visible, onClose, onFilterChange }: DebugPanelProps) {
  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      {/* 标题栏 */}
      <Box justifyContent="space-between">
        <Text bold color="yellow">Debug [{totalCount}]</Text>
        <Box>
          {FILTER_OPTIONS.map(opt => (
            <Text key={opt.value} color={filterLevel === opt.value ? 'cyan' : 'gray'}>
              {' '}[{opt.label}]{' '}
            </Text>
          ))}
          <Text color="red"> [X]</Text>
        </Box>
      </Box>

      {/* 日志列表（最近若干条） */}
      {logs.slice(-20).map((log, i) => {
        const time = new Date(log.timestamp).toISOString().split('T')[1].slice(0, 12);
        const ns = log.namespace.replace('tramber:', '');
        return (
          <Text key={i}>
            <Text dimColor>{time}</Text>{' '}
            <Text color={LEVEL_COLORS[log.level]}>[{LEVEL_TAGS[log.level]}]</Text>{' '}
            <Text dimColor>{ns}</Text>{' '}
            <Text>{log.message}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
```

### 4.4 交互设计

| 操作 | 行为 | 触发条件 |
|------|------|----------|
| `--debug` 启动 | Logger.onLog 启用 + DebugPanel 默认展开 | 命令行参数 |
| 无 `--debug` | Logger.onLog 不注册，零开销 | 默认 |
| `/debug` | 切换 DebugPanel 展开/折叠 | 命令输入 |
| `[F]` 循环切换 | 过滤级别：ALL → ERROR → WARN+ → INFO → ALL | 键盘交互 |
| `[X]` | 关闭面板（`/debug` 可重新打开） | 键盘交互 |

### 4.5 集成到 App

```tsx
// app.tsx 关键改动
export function App({ engine, context, autoConfirm, debugEnabled }: AppProps) {
  const { logs, totalCount, visible, filterLevel, toggleVisible, setFilterLevel } = useDebugLogs(debugEnabled);

  return (
    <Box flexDirection="column">
      <StatusBar ... />
      {debugEnabled && (
        <DebugPanel
          logs={logs}
          totalCount={totalCount}
          filterLevel={filterLevel}
          visible={visible}
          onClose={toggleVisible}
          onFilterChange={setFilterLevel}
        />
      )}
      <Static items={messages}>...</Static>
      {/* 动态区 */}
      {/* InputBox */}
    </Box>
  );
}
```

### 4.6 性能估算

| 环节 | 耗时 | 频率 |
|------|------|------|
| Logger.log → onLog callback | < 0.01ms | 每次 Logger 调用（可能数百次/秒） |
| DebugBridge.push | < 0.01ms | 每次 Logger 调用 |
| setInterval → setDebugLogs | ~0.1ms | 10 次/秒 |
| Ink 重绘动态区 | ~1-5ms | 10 次/秒（含日志刷新） |
| Static 区域 | 0ms | 不参与重绘 |

**关键**：非 --debug 时，Logger.onLog 未注册，DebugBridge 不存在，hook 直接 return，零内存零 CPU 开销。

---

## 5. 实施计划

### 5.1 文件结构

```
packages/client/cli/
├── src/
│   ├── app.tsx                      ← [已完成] Ink 根组件，全动态渲染
│   ├── cli.ts                       ← [已完成] 入口 render
│   ├── debug-bridge.ts              ← [已完成] DebugBridge ring buffer
│   ├── components/
│   │   ├── status-bar.tsx           ← [已完成] 状态栏
│   │   ├── message-item.tsx         ← [已完成] 消息渲染（含 Markdown）
│   │   ├── input-box.tsx            ← [已完成] 输入框（补全/粘贴/历史）
│   │   ├── welcome-banner.tsx       ← [已完成] 欢迎画面
│   │   ├── debug-panel.tsx          ← [已完成] Debug 面板
│   │   ├── markdown-renderer.tsx    ← [已完成] Markdown → Ink 渲染
│   │   └── code-highlighter.ts      ← [已完成] 正则语法高亮
│   ├── hooks/
│   │   └── use-debug-logs.ts        ← [已完成] Debug bridge → React hook
│   ├── output-manager.ts            ← [保留] 子命令仍在用
│   └── ...
└── packages/shared/
    └── src/logger.ts                ← [已完成] onLog 回调 + DebugLogEntry + callback 模式
```

### 5.2 Phase 划分

---

#### Phase 1-5: Ink 基础框架 (已完成 ✓)

- [x] 安装 ink@6, react@18, @types/react
- [x] app.tsx: 根组件，全动态渲染布局
- [x] cli.ts: render + 单次命令模式
- [x] status-bar.tsx: 状态栏
- [x] input-box.tsx: 输入框 + 历史回溯
- [x] welcome-banner.tsx: 欢迎画面
- [x] message-item.tsx: 用户/AI/工具/错误消息
- [x] 权限确认组件（内嵌在 app.tsx）
- [x] Ink 6 Text API 迁移（color prop 替代布尔 prop）
- [x] currentTool 闭包修复：useState → useRef

---

#### Phase 6: DebugPanel 日志面板 (已完成 ✓)

**目标**：在 Ink 布局内渲染 debug 日志，不泄漏到终端。

- [x] shared/logger.ts：新增 `DebugLogEntry` 类型 + `onLog` 回调 + `output: 'callback'` 模式
- [x] 新建 `debug-bridge.ts`：ring buffer 数据类
- [x] 新建 `hooks/use-debug-logs.ts`：bridge → state 批量桥接
- [x] 新建 `components/debug-panel.tsx`：折叠面板 + 级别过滤（纯展示，无 useInput）
- [x] app.tsx：集成 DebugPanel，统一 useInput 管理 F/X 键
- [x] cli.ts：`--debug` 时 Logger 配置 `output: 'callback'`
- [x] 非 --debug 时零开销

---

#### Phase 7: 输出美化 (已完成 ✓)

**目标**：Markdown 渲染、代码高亮、消息样式增强。

- [x] 新建 `components/code-highlighter.ts`：正则关键字高亮（js/ts/python/json/bash/yaml）
- [x] 新建 `components/markdown-renderer.tsx`：marked lexer → Ink 组件映射
- [x] 支持：heading、code block（边框+行号）、inline code、bold、italic、list、blockquote、table
- [x] message-item.tsx：assistant 消息使用 MarkdownRenderer
- [x] 错误消息：红色圆角边框 + redBright 内容
- [x] 工具调用：成功 ✓ 绿色，失败 ✗ 红色 + 错误详情
- [x] 迭代计数修复：onProgress 中提取 iteration → setIteration
- [x] 依赖：marked（仅用 lexer）

---

#### Phase 8: 交互增强 (已完成 ✓)

**目标**：快捷键、多行粘贴、命令补全。

- [x] 多行粘贴：显示行号，flexDirection="column"
- [x] Ctrl+L：清屏保留会话（与 /clear 完整重置不同）
- [x] Tab 补全：/help /scene /skills 等命令，唯一匹配直接补全，多匹配补全公共前缀
- [x] DebugPanel 键盘交互：F 切换级别、X 关闭（已通过 Phase 6 完成）

---

#### Phase 8.5: 布局稳定性修复 (已完成 ✓)

**目标**：解决内容溢出挤扁顶底栏的问题。

- [x] 根 Box `height={termHeight}` 固定总高度
- [x] StatusBar / InputBox `flexShrink={0}` 防止被压缩
- [x] 消息区 `flexGrow={1}` 填充剩余空间
- [x] `estimateMessageLines` 按消息类型估算终端行数
- [x] `displayMessages` 从最新消息往前累加行数，超出可用行数截断
- [x] DebugPanel 可见时额外扣除 18 行

---

#### Phase 9: 清理 + 集成测试

**目标**：清理旧代码，全流程验证。

- [ ] 移除 `io-manager.ts`、`repl.ts`
- [ ] 重构 `single-command-executor.ts`：纯 Engine 调用，不启动 Ink
- [ ] 重构 `task.ts`：纯业务逻辑，不负责输出
- [ ] 全流程测试：多轮对话、工具调用、权限确认、流式输出、debug 面板
- [ ] 更新 stage4.md 文档

---

## 6. 关键技术决策

### 6.1 全动态渲染（不使用 Static）

**问题**：`<Static>` 将内容累积在终端顶部，导致 StatusBar 和 InputBox 无法固定在顶部/底部。`<Static>` + `height` 组合会导致清屏。

**方案**：全部动态渲染，不使用 `<Static>`。Ink virtual DOM 对比差异只更新变化部分。通过 `estimateMessageLines` 手动截断消息数量防止溢出。

**为什么 Ink 不支持 CSS 式布局**：Ink 是 React 渲染器，不是 TUI 框架。`height` 只影响 yoga flex 计算，不裁剪实际输出。`overflowY` 在终端中无意义（终端没有滚动区域概念）。因此只能通过数据截断来控制内容量。

### 6.2 Debug 日志隔离

**问题**：Logger 写 console.error → patchConsole 拦截 → 日志出现在 Ink 窗口外或干扰渲染。

**方案**：DebugBridge + useDebugLogs + DebugPanel，日志完全在 Ink 布局内渲染。非 --debug 时零开销。

详见 [第 4 节](#4-debugpanel-架构设计)。

### 6.3 流式输出策略

**问题**：每个 token 都触发 Ink 重绘。

**方案**：
- `<Static>` 固化已完成消息，重绘面积最小
- 动态区仅包含：streaming text + active tool + permission prompt
- Ink 6 的 Yoga 布局引擎足够快

### 6.4 Permission 确认流程

**方案**：
- `permissionRequest` state 控制 InputBox / PermissionPrompt 条件渲染
- PermissionPrompt 用 `useInput` 监听 y/n/Enter
- Ctrl+C 在权限确认时拒绝并返回

---

## 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| Ink 6 在 Windows 上兼容性 | 中 | 高 | 已验证基础功能正常；patchConsole 有已知问题，用 DebugPanel 绕过 |
| 流式输出闪烁 | 中 | 中 | Static 减少重绘面积；token 批量更新 |
| DebugPanel 高频更新性能 | 低 | 中 | 100ms 批量刷新 + ring buffer，最多 10 次 setState/秒 |
| React 组件树过深 | 低 | 中 | 保持扁平；DebugPanel 用 React.memo |
| 多行输入 + 中文 IME | 中 | 中 | usePaste 处理粘贴；IME 依赖 useCursor |

---

## 8. 工期估算

```
Phase 1-5:  Ink 基础框架              ✓ 已完成
Phase 6:    DebugPanel 日志面板        ✓ 已完成
Phase 7:    输出美化                   ✓ 已完成
Phase 8:    交互增强                   ✓ 已完成
Phase 8.5:  布局稳定性修复             ✓ 已完成
Phase 9:    清理 + 集成测试             0.5 天    ← 当前
────────────────────────────────────────────────
剩余                               0.5 天
```

---

## 9. 完成标准

- [x] 流式文本和工具调用不互相侵入
- [x] 工具调用显示参数和结果状态
- [x] 权限确认在界面内完成
- [x] 状态栏显示 Token、迭代进度、Scene
- [x] 底部输入框支持历史回溯
- [x] Ctrl+C 中断执行 / 退出
- [x] Debug 日志在 Ink 面板内渲染，不泄漏到终端
- [x] Debug 面板支持级别过滤
- [x] 非 --debug 时零开销
- [x] Markdown 渲染 + 代码块语法高亮
- [x] 错误/成功消息样式增强
- [x] 多行粘贴支持
- [x] Ctrl+L 清屏保留会话
- [x] Tab 命令补全
- [x] 消息溢出截断，顶底栏不被挤扁
