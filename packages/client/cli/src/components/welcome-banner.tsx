// packages/client/cli/src/components/welcome-banner.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeBannerProps {
  version?: string;
  sceneName?: string;
  sceneDescription?: string;
  commands?: string[][];
}

export function WelcomeBanner({
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
      <Box borderStyle="round" borderColor="cyan" paddingLeft={1} paddingRight={1}>
        <Box marginY={1}>
          <Text bold color="cyan">  Welcome to Tramber (MVP v{version})  </Text>
        </Box>
        <Text>  {sceneName} - {sceneDescription}</Text>
        <Box marginY={1} />
        <Text bold>  Commands:</Text>
        {commands.map(([cmd, desc]) => (
          <Text key={cmd}>
            {'    '}
            <Text bold>{cmd.padEnd(maxLen + 2)}</Text>
            <Text dimColor>- {desc}</Text>
          </Text>
        ))}
        <Box marginY={1} />
      </Box>
    </Box>
  );
}
