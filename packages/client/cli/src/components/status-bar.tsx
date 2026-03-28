// packages/client/cli/src/components/status-bar.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  version?: string;
  scene?: string;
  tokenUsage?: { input: number; output: number; total: number };
  iteration?: number;
  maxIterations?: number;
  isExecuting?: boolean;
  currentTool?: string;
}

export function StatusBar({
  version = '0.2.0',
  scene = 'coding',
  tokenUsage,
  iteration,
  maxIterations = 30,
  isExecuting = false,
  currentTool
}: StatusBarProps) {
  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <Box flexShrink={0} borderStyle="single" borderColor="cyan" paddingLeft={1} paddingRight={1}>
      <Text bold color="cyan">
        Tramber v{version}
      </Text>
      <Text dimColor> │ </Text>
      <Text>{scene}</Text>
      {tokenUsage && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>tokens: </Text>
          <Text>{formatTokens(tokenUsage.total)}</Text>
        </>
      )}
      {iteration !== undefined && (
        <>
          <Text dimColor> │ </Text>
          <Text dimColor>iter: </Text>
          <Text color={iteration >= maxIterations ? 'red' : 'white'}>
            {iteration}/{maxIterations}
          </Text>
        </>
      )}
      {isExecuting && currentTool && (
        <>
          <Text dimColor> │ </Text>
          <Text color="yellow">⟳ {currentTool}</Text>
        </>
      )}
    </Box>
  );
}
