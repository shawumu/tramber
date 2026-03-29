// packages/client/cli/src/components/welcome-banner.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeBannerProps {
  version?: string;
  sceneName?: string;
  sceneDescription?: string;
  commands?: string[][];
}

const LOGO = [
  '  /\\_/\\  ',
  ' ( o.o ) ',
  '  > ^ <  ',
];

export const WelcomeBanner = React.memo(function WelcomeBanner({
  version = '0.2.0',
  sceneName = 'Coding Scene',
  sceneDescription = 'AI Assisted Programming',
  commands = [
    ['/help', 'Show available commands'],
    ['/scene', 'List/switch scenes'],
    ['/skills', 'List available skills'],
    ['/routines', 'List available routines'],
    ['/config', 'Show/set configuration'],
    ['/clear', 'Clear conversation'],
    ['/exit', 'Exit REPL']
  ]
}: WelcomeBannerProps) {
  const maxLen = Math.max(...commands.map(([cmd]) => cmd.length));

  return (
    <Box flexDirection="column" marginY={1}>
      <Box borderStyle="round" borderColor="cyan">
        <Box flexDirection="column" paddingX={2}>
          {/* Logo + 标题 */}
          <Box marginY={1}>
            <Box flexDirection="column" marginRight={2}>
              {LOGO.map((line, i) => (
                <Text key={i} color="yellow">{line}</Text>
              ))}
            </Box>
            <Box flexDirection="column" justifyContent="center">
              <Text bold color="cyan">Tramber v{version}</Text>
              <Text dimColor>{sceneName} - {sceneDescription}</Text>
            </Box>
          </Box>
          {/* 命令列表 */}
          <Box marginY={1} flexDirection="column">
            <Text bold dimColor>Commands:</Text>
            {commands.map(([cmd, desc]) => (
              <Text key={cmd}>
                {'  '}
                <Text bold color="cyan">{cmd.padEnd(maxLen + 2)}</Text>
                <Text dimColor>{desc}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
