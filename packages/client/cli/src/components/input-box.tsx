// packages/client/cli/src/components/input-box.tsx
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputBoxProps {
  onSubmit: (input: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const KNOWN_COMMANDS = [
  '/help', '/scene', '/skills', '/routines', '/config',
  '/clear', '/exit', '/quit', '/q', '/debug',
];

export function InputBox({ onSubmit, placeholder = '', disabled = false }: InputBoxProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const submit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setHistory(prev => [...prev, trimmed]);
    setInput('');
    setHistoryIndex(-1);
  }, [onSubmit]);

  useInput((ch, key) => {
    if (disabled) return;

    if (key.return) {
      submit(input);
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    // Tab 补全命令
    if (key.tab) {
      const trimmed = input.trim();
      if (trimmed.startsWith('/')) {
        const lower = trimmed.toLowerCase();
        const matches = KNOWN_COMMANDS.filter(cmd => cmd.startsWith(lower));
        if (matches.length === 1) {
          setInput(matches[0] + ' ');
        } else if (matches.length > 1) {
          // 补全公共前缀
          let common = matches[0];
          for (const m of matches) {
            let i = 0;
            while (i < common.length && i < m.length && common[i] === m[i]) i++;
            common = common.slice(0, i);
          }
          if (common.length > lower.length) {
            setInput(common);
          }
        }
      }
      return;
    }

    if (key.upArrow) {
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
      return;
    }

    // Ctrl+C - 由外层处理
    if (key.ctrl && ch === 'c') return;

    if (ch) {
      setInput(prev => prev + ch);
    }
  });

  const lines = input.split('\n');
  const isMultiLine = lines.length > 1;

  return (
    <Box flexShrink={0} borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1} flexDirection="column">
      {isMultiLine ? (
        lines.map((line, i) => (
          <Box key={i}>
            {i === 0 ? <Text bold color="green">You: </Text> : <Text dimColor>{String(i + 1).padStart(2)}│ </Text>}
            <Text>{line}</Text>
          </Box>
        ))
      ) : (
        <Box>
          <Text bold color="green">You: </Text>
          <Text>{input || (placeholder ? <Text dimColor>{placeholder}</Text> : '')}</Text>
        </Box>
      )}
      <Text color="white"> </Text>
    </Box>
  );
}
