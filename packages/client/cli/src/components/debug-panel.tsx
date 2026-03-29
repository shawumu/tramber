// packages/client/cli/src/components/debug-panel.tsx
/**
 * DebugPanel - 可折叠的 debug 日志面板
 *
 * 纯展示组件，不自行管理 useInput（由 App 统一调度）。
 * 避免与 InputBox 的 useInput 冲突。
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DebugLogEntry } from '@tramber/shared';
import type { FilterLevel } from '../hooks/use-debug-logs.js';

interface DebugPanelProps {
  logs: DebugLogEntry[];
  totalCount: number;
  filterLevel: FilterLevel;
  visible: boolean;
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
];

const DISPLAY_LINES = 15;

export const DebugPanel = React.memo(function DebugPanel({ logs, totalCount, filterLevel, visible }: DebugPanelProps) {
  // 所有 hooks 必须在条件判断之前
  const displayLogs = useMemo(() => logs.slice(-DISPLAY_LINES), [logs]);

  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {/* 标题栏 */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="yellow">Debug</Text>
          <Text color="white"> [{totalCount}]</Text>
        </Box>
        <Box>
          {FILTER_OPTIONS.map(opt => (
            <Text key={opt.value} color={filterLevel === opt.value ? 'cyan' : 'gray'}>
              {' '}[{opt.label}]
            </Text>
          ))}
          <Text color="red"> [X]</Text>
        </Box>
      </Box>

      {/* 日志列表 */}
      {displayLogs.length === 0 ? (
        <Text dimColor>  (no logs)</Text>
      ) : (
        displayLogs.map((log, i) => {
          const time = new Date(log.timestamp).toISOString().split('T')[1].slice(0, 12);
          const ns = log.namespace.replace('tramber:', '');
          return (
            <Box key={i}>
              <Text dimColor>{time}</Text>
              <Text>{' '}</Text>
              <Text color={LEVEL_COLORS[log.level] ?? 'gray'}>[{LEVEL_TAGS[log.level] ?? '???'}]</Text>
              <Text>{' '}</Text>
              <Text dimColor>{ns}</Text>
              <Text>{': '}</Text>
              <Text>{log.message}</Text>
            </Box>
          );
        })
      )}
    </Box>
  );
});
