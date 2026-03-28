// packages/client/cli/src/components/message-item.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from './markdown-renderer.js';

export interface MessageItem {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system' | 'error';
  content: string;
  timestamp?: Date;
  // tool_call 专用
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolStatus?: 'pending' | 'success' | 'error';
  toolDuration?: number;
  toolResult?: unknown;
  toolError?: string;
}

interface MessageItemProps {
  item: MessageItem;
}

export function MessageItem({ item }: MessageItemProps) {
  switch (item.type) {
    case 'user':
      return (
        <Box marginTop={1}>
          <Text bold color="green">You: </Text>
          <Text>{item.content}</Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">Tramber: </Text>
          <MarkdownRenderer content={item.content} />
        </Box>
      );
    case 'tool_call':
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text dimColor>▸ </Text>
            <Text color="cyan">{item.toolName}</Text>
            <Text dimColor>: {formatToolParams(item.toolParams)}</Text>
            {item.toolStatus === 'success' && (
              <Text color="green"> ✓</Text>
            )}
            {item.toolStatus === 'error' && (
              <Text color="red"> ✗</Text>
            )}
            {item.toolDuration !== undefined && (
              <Text dimColor> {item.toolDuration}ms</Text>
            )}
          </Box>
          {item.toolStatus === 'error' && item.toolError && (
            <Box paddingLeft={2}>
              <Text color="red" dimColor>{item.toolError}</Text>
            </Box>
          )}
        </Box>
      );
    case 'tool_result':
      return null;
    case 'error':
      return (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
          <Text bold color="red">✗ Error</Text>
          <Text color="redBright">{item.content}</Text>
        </Box>
      );
    case 'system':
      return (
        <Text dimColor>{item.content}</Text>
      );
    default:
      return null;
  }
}

function formatToolParams(params?: Record<string, unknown>): string {
  if (!params) return '';
  if (params.path) return String(params.path);
  if (params.command) return String(params.command);
  const keys = Object.keys(params);
  if (keys.length === 0) return '';
  return keys.slice(0, 2).join(', ');
}
