// packages/client/cli/src/app.tsx
/**
 * Tramber Ink CLI - 主应用组件
 *
 * 布局（全部动态渲染，不使用 Static）：
 *   [StatusBar]        ← 固定顶部
 *   [DebugPanel]       ← 可折叠（仅 --debug）
 *   [WelcomeBanner]    ← 首次显示
 *   [消息历史]         ← 动态渲染
 *   [当前工具/流式文本] ← 动态
 *   [PermissionPrompt]  ← 条件渲染
 *   [InputBox]         ← 固定底部
 *
 * 为什么不用 <Static>：
 *   Static 机制会将内容累积在终端顶部，动态区域被挤到底部。
 *   这导致 StatusBar 和 InputBox 无法固定在顶部/底部。
 *   改为全部动态渲染，Ink 的 virtual DOM 会对比差异只更新变化部分。
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { TramberEngine } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import type { ProgressUpdate } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { StatusBar } from './components/status-bar.js';
import { InputBox } from './components/input-box.js';
import { WelcomeBanner } from './components/welcome-banner.js';
import { MessageItem, type MessageItem as MessageItemType } from './components/message-item.js';
import { DebugPanel } from './components/debug-panel.js';
import { generateId } from '@tramber/shared';
import { useDebugLogs, type FilterLevel } from './hooks/use-debug-logs.js';

const FILTER_CYCLE: FilterLevel[] = ['all', 'error', 'warn'];
const MAX_RENDER_MESSAGES = 80;

/** 估算单条消息占用的终端行数 */
function estimateMessageLines(item: MessageItemType): number {
  switch (item.type) {
    case 'user':
      return 1 + Math.ceil((item.content.length + 5) / (process.stdout.columns ?? 80));
    case 'assistant': {
      // Markdown 渲染后行数 ≈ 原始换行数 + 边框/标签开销
      const codeBlockCount = (item.content.match(/```/g) || []).length;
      const codeBlocks = Math.floor(codeBlockCount / 2);
      const contentLines = item.content.split('\n').length;
      const codeExtraLines = codeBlocks * 3; // 每个代码块: 边框顶+底+行号
      return Math.min(contentLines + codeExtraLines + 2, 30); // 单条消息上限 30 行
    }
    case 'tool_call':
      return item.toolStatus === 'error' && item.toolError ? 3 : 2;
    case 'error':
      return 4; // 边框 + 内容
    case 'system':
      return 1;
    case 'tool_result':
      return 0;
    default:
      return 2;
  }
}

interface AppProps {
  engine: TramberEngine;
  context: CliContext;
  autoConfirm?: boolean;
  debugEnabled?: boolean;
}

interface PermissionRequest {
  toolCall: { id: string; name: string; parameters: Record<string, unknown> };
  operation: string;
  reason?: string;
  resolve: (value: boolean) => void;
}

export function App({ engine, context, autoConfirm = false, debugEnabled = false }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const debugState = useDebugLogs(debugEnabled);

  // 状态
  const [messages, setMessages] = useState<MessageItemType[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentToolDisplay, setCurrentToolDisplay] = useState<string>('');
  const [conversation, setConversation] = useState<Conversation | undefined>();
  const [tokenUsage, setTokenUsage] = useState<{ input: number; output: number; total: number }>({ input: 0, output: 0, total: 0 });
  const [iteration, setIteration] = useState(0);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeTool, setActiveTool] = useState<MessageItemType | null>(null);

  const messagesRef = useRef<MessageItemType[]>([]);
  const streamingRef = useRef('');
  const currentToolRef = useRef<string>('');
  const pendingToolCallsRef = useRef<Map<string, MessageItemType>>(new Map());

  // 按行数截断消息，防止溢出挤掉 InputBox
  // 固定开销：StatusBar(3) + InputBox(3) + 安全边距(2) = 8
  // DebugPanel 可见时额外占：标题(1) + 显示行数(最多15) + 边框(2) = 18
  const debugPanelLines = (debugEnabled && debugState.visible) ? 18 : 0;
  const displayMessages = useMemo(() => {
    const available = termHeight - 8 - debugPanelLines;
    const all = messages.slice(-MAX_RENDER_MESSAGES);
    // 从最新消息往前累加，超出可用行数就截断
    let totalLines = 0;
    const fit: MessageItemType[] = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const lines = estimateMessageLines(all[i]);
      if (totalLines + lines > available && fit.length > 0) break;
      totalLines += lines;
      fit.unshift(all[i]);
    }
    return fit;
  }, [messages, termHeight, debugPanelLines]);

  // 处理用户输入
  const handleInput = useCallback(async (input: string) => {
    if (showWelcome) setShowWelcome(false);

    const trimmed = input.trim().toLowerCase();

    // 退出命令
    if (trimmed === '/exit' || trimmed === 'exit' || trimmed === '/quit' || trimmed === 'quit' || trimmed === '/q' || trimmed === 'q') {
      exit();
      return;
    }

    // 命令处理
    if (input.startsWith('/')) {
      const cmd = input.slice(1).trim().toLowerCase();
      if (cmd === 'clear') {
        setMessages([]);
        messagesRef.current = [];
        setConversation(undefined);
        setTokenUsage({ input: 0, output: 0, total: 0 });
        return;
      }
      if (cmd === 'help') return;
      if (cmd === 'debug' && debugEnabled) {
        debugState.toggleVisible();
        return;
      }
    }

    setIsExecuting(true);
    streamingRef.current = '';
    setStreamingText('');
    pendingToolCallsRef.current.clear();
    setActiveTool(null);

    const userMsg: MessageItemType = {
      id: generateId(),
      type: 'user',
      content: input,
      timestamp: new Date()
    };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages([...messagesRef.current]);

    try {
      const result = await engine.execute(input, {
        sceneId: context.config.scene,
        maxIterations: context.config.maxIterations,
        stream: true,
        onProgress: (update: ProgressUpdate) => {
          if (update.iteration !== undefined) {
            setIteration(update.iteration);
          }

          switch (update.type) {
            case 'text_delta':
              if (update.content) {
                streamingRef.current += update.content;
                setStreamingText(streamingRef.current);
              }
              break;

            case 'tool_call':
              if (update.toolCall) {
                currentToolRef.current = update.toolCall.name;
                setCurrentToolDisplay(update.toolCall.name);
                const toolMsg: MessageItemType = {
                  id: generateId(),
                  type: 'tool_call',
                  content: '',
                  toolName: update.toolCall.name,
                  toolParams: update.toolCall.parameters,
                  toolStatus: 'pending',
                  timestamp: new Date()
                };
                pendingToolCallsRef.current.set(update.toolCall.name, toolMsg);
                setActiveTool(toolMsg);
                setStreamingText('');
              }
              break;

            case 'tool_result':
              if (update.toolResult) {
                const pendingMsg = pendingToolCallsRef.current.get(currentToolRef.current);
                if (pendingMsg) {
                  pendingToolCallsRef.current.delete(currentToolRef.current);
                  setActiveTool(null);

                  const completedMsg: MessageItemType = {
                    ...pendingMsg,
                    toolStatus: update.toolResult.success ? 'success' : 'error',
                    toolResult: update.toolResult.data,
                    toolError: update.toolResult.error
                  };
                  messagesRef.current = [...messagesRef.current, completedMsg];
                  setMessages([...messagesRef.current]);
                }
              }
              break;

            case 'step':
            case 'complete':
            case 'error':
              break;
          }
        },
        onPermissionRequired: async (toolCall, operation, reason) => {
          if (autoConfirm) return true;
          return new Promise<boolean>((resolve) => {
            setPermissionRequest({ toolCall, operation, reason, resolve });
          });
        }
      }, conversation);

      // 完成后更新 messages
      if (streamingRef.current) {
        messagesRef.current = [...messagesRef.current, {
          id: generateId(), type: 'assistant', content: streamingRef.current, timestamp: new Date()
        }];
      }
      for (const pendingMsg of pendingToolCallsRef.current.values()) {
        messagesRef.current = [...messagesRef.current, { ...pendingMsg, toolStatus: 'error' as const, toolError: 'Incomplete' }];
      }
      pendingToolCallsRef.current.clear();
      setActiveTool(null);
      setMessages([...messagesRef.current]);
      setStreamingText('');

      if (result.conversation) {
        setConversation(result.conversation);
        setTokenUsage({
          input: result.conversation.tokenUsage.input,
          output: result.conversation.tokenUsage.output,
          total: result.conversation.tokenUsage.total
        });
      }

      if (!result.success && result.error) {
        messagesRef.current = [...messagesRef.current, {
          id: generateId(), type: 'error', content: result.error, timestamp: new Date()
        }];
        setMessages([...messagesRef.current]);
      }

    } catch (error) {
      messagesRef.current = [...messagesRef.current, {
        id: generateId(), type: 'error', content: error instanceof Error ? error.message : String(error), timestamp: new Date()
      }];
      setMessages([...messagesRef.current]);
    } finally {
      setIsExecuting(false);
      currentToolRef.current = '';
      setCurrentToolDisplay('');
      pendingToolCallsRef.current.clear();
      setActiveTool(null);
    }
  }, [engine, context, autoConfirm, showWelcome, exit, debugEnabled, debugState]);

  // 键盘输入处理（统一管理）
  useInput((ch, key) => {
    // Ctrl+L: 清屏（保留会话）
    if (key.ctrl && ch === 'l') {
      setMessages([]);
      messagesRef.current = [];
      setShowWelcome(false);
      return;
    }

    if (key.ctrl && ch === 'c') {
      if (isExecuting) return;
      if (permissionRequest) {
        permissionRequest.resolve(false);
        setPermissionRequest(null);
        return;
      }
      exit();
      return;
    }

    if (permissionRequest) {
      if (ch === 'y' || ch === 'Y' || key.return) {
        permissionRequest.resolve(true);
        setPermissionRequest(null);
        return;
      }
      if (ch === 'n' || ch === 'N' || key.escape) {
        permissionRequest.resolve(false);
        setPermissionRequest(null);
        return;
      }
      return;
    }

    if (debugEnabled && debugState.visible && !isExecuting) {
      if (ch === 'f' || ch === 'F') {
        const idx = FILTER_CYCLE.indexOf(debugState.filterLevel);
        debugState.setFilterLevel(FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length]);
        return;
      }
      if (ch === 'x' || ch === 'X') {
        debugState.toggleVisible();
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" height={termHeight}>
      <StatusBar
        scene={context.config.scene}
        tokenUsage={tokenUsage}
        iteration={iteration}
        maxIterations={context.config.maxIterations ?? 30}
        isExecuting={isExecuting}
        currentTool={currentToolDisplay}
      />

      <DebugPanel
        logs={debugState.logs}
        totalCount={debugState.totalCount}
        filterLevel={debugState.filterLevel}
        visible={debugState.visible}
      />

      {showWelcome && <WelcomeBanner />}

      {/* 消息历史（动态渲染） */}
      <Box flexDirection="column" paddingLeft={1} paddingRight={1} flexGrow={1}>
        {displayMessages.map(item => (
          <MessageItem key={item.id} item={item} />
        ))}

        {/* 进行中的工具调用 */}
        {activeTool && (
          <Box paddingLeft={2}>
            <Text dimColor>▸ </Text>
            <Text color="cyan">{activeTool.toolName}</Text>
            <Text dimColor>: {String(activeTool.toolParams?.path ?? activeTool.toolParams?.command ?? '')} ...</Text>
          </Box>
        )}

        {/* 流式文本 */}
        {streamingText && (
          <Box marginTop={1}>
            <Text bold color="cyan">Tramber: </Text>
            <Text>{streamingText}</Text>
          </Box>
        )}

        {/* 权限确认 */}
        {permissionRequest && (
          <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingLeft={1} paddingRight={1}>
            <Box marginY={1}>
              <Text bold color="yellow">⚠ Permission Required</Text>
            </Box>
            <Text>  {permissionRequest.operation} ({permissionRequest.toolCall.name})</Text>
            {permissionRequest.toolCall.parameters.path != null && (
              <Text>  File: <Text bold>{String(permissionRequest.toolCall.parameters.path)}</Text></Text>
            )}
            {permissionRequest.toolCall.parameters.command != null && (
              <Text>  Cmd: <Text bold>{String(permissionRequest.toolCall.parameters.command)}</Text></Text>
            )}
            {permissionRequest.reason && (
              <Text dimColor>  {permissionRequest.reason}</Text>
            )}
            <Box marginY={1}>
              <Text>  Allow? </Text>
              <Text bold>[Y/n] </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* 输入框 */}
      {!permissionRequest && (
        <InputBox
          onSubmit={handleInput}
          placeholder={isExecuting ? 'Waiting...' : ''}
          disabled={isExecuting}
        />
      )}
    </Box>
  );
}
