// packages/client/cli/src/hooks/use-debug-logs.ts
/**
 * useDebugLogs - DebugBridge → React state 批量桥接
 *
 * - Logger.onLog 同步写入 DebugBridge (ring buffer)
 * - setInterval 100ms 批量刷新 bridge → state
 * - 最多 10 次 setState/秒
 * - enabled=false 时零开销
 */

import { useState, useEffect, useRef } from 'react';
import { Logger, type DebugLogEntry, type LogLevel } from '@tramber/shared';
import { DebugBridge } from '../debug-bridge.js';

export type FilterLevel = 'all' | 'error' | 'warn';

export interface UseDebugLogsReturn {
  logs: DebugLogEntry[];
  totalCount: number;
  visible: boolean;
  filterLevel: FilterLevel;
  toggleVisible: () => void;
  setFilterLevel: (level: FilterLevel) => void;
}

export function useDebugLogs(enabled: boolean): UseDebugLogsReturn {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [visible, setVisible] = useState(enabled);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const bridgeRef = useRef<DebugBridge | null>(null);

  useEffect(() => {
    if (!enabled) {
      bridgeRef.current = null;
      setLogs([]);
      setVisible(false);
      return;
    }

    const bridge = new DebugBridge(100);
    bridgeRef.current = bridge;

    // 1. Logger → Bridge（同步 push）
    const logger = Logger.getInstance();
    logger.onLog = (entry) => bridge.push(entry);

    // 2. Bridge → State（100ms 批量刷新）
    const timer = setInterval(() => {
      if (bridge.count > 0) {
        setLogs([...bridge.recent(30)]);
      }
    }, 100);

    return () => {
      clearInterval(timer);
      logger.onLog = undefined;
      bridgeRef.current = null;
    };
  }, [enabled]);

  // 级别过滤
  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'all') return true;
    if (filterLevel === 'error') return log.level === LogLevel.ERROR;
    if (filterLevel === 'warn') return log.level === LogLevel.ERROR || log.level === LogLevel.BASIC;
    return true;
  });

  return {
    logs: filteredLogs,
    totalCount: bridgeRef.current?.count ?? 0,
    visible,
    filterLevel,
    toggleVisible: () => setVisible(v => !v),
    setFilterLevel,
  };
}
