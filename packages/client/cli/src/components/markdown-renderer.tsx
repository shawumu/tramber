// packages/client/cli/src/components/markdown-renderer.tsx
/**
 * Markdown → Ink 终端渲染
 *
 * 使用 marked.lexer() 解析 Markdown，映射到 Ink <Box>/<Text> 组件。
 * 支持: heading, code block, inline code, bold, italic, list, blockquote, paragraph, hr。
 */

import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { highlightCode } from './code-highlighter.js';

interface MarkdownRendererProps {
  content: string;
}

// 配置 marked 只做词法分析
marked.setOptions({ gfm: true });

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const tokens = marked.lexer(content);

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <RenderBlock key={i} token={token} />
      ))}
    </Box>
  );
}

function RenderBlock({ token }: { token: marked.Token }) {
  switch (token.type) {
    case 'heading':
      return <RenderHeading token={token as marked.Tokens.Heading} />;
    case 'code':
      return <RenderCodeBlock token={token as marked.Tokens.Code} />;
    case 'list':
      return <RenderList token={token as marked.Tokens.List} />;
    case 'blockquote':
      return <RenderBlockquote token={token as marked.Tokens.Blockquote} />;
    case 'hr':
      return <Box marginTop={1}><Text dimColor>{'─'.repeat(40)}</Text></Box>;
    case 'paragraph':
      return <RenderParagraph token={token as marked.Tokens.Paragraph} />;
    case 'table':
      return <RenderTable token={token as marked.Tokens.Table} />;
    case 'space':
      return <Text> </Text>;
    default:
      return null;
  }
}

function RenderHeading({ token }: { token: marked.Tokens.Heading }) {
  const prefix = '#'.repeat(token.depth) + ' ';
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>{prefix}{token.text}</Text>
    </Box>
  );
}

function RenderCodeBlock({ token }: { token: marked.Tokens.Code }) {
  const lang = token.lang || '';
  const highlighted = highlightCode(token.text, lang);

  return (
    <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray">
      {/* 语言标签 */}
      {lang && (
        <Box paddingX={1}>
          <Text dimColor>{lang}</Text>
        </Box>
      )}
      {/* 代码内容 */}
      {highlighted.map((segments, lineIdx) => (
        <Box key={lineIdx} paddingX={1}>
          <Text dimColor>{String(lineIdx + 1).padStart(3)} │ </Text>
          {segments.map((seg, segIdx) => (
            <Text key={segIdx} color={seg.color}>{seg.text}</Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function RenderList({ token }: { token: marked.Tokens.List }) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      {token.items.map((item, i) => (
        <Box key={i} flexDirection="column">
          <Box>
            <Text>{token.ordered ? `${i + 1}. ` : '• '}</Text>
            <RenderInline tokens={item.tokens} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function RenderBlockquote({ token }: { token: marked.Tokens.Blockquote }) {
  return (
    <Box flexDirection="column" marginLeft={2} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor="gray">
      {token.tokens.map((t, i) => (
        <RenderBlock key={i} token={t} />
      ))}
    </Box>
  );
}

function RenderParagraph({ token }: { token: marked.Tokens.Paragraph }) {
  return (
    <Box marginTop={1}>
      <RenderInline tokens={token.tokens} />
    </Box>
  );
}

function RenderTable({ token }: { token: marked.Tokens.Table }) {
  return (
    <Box marginTop={1} flexDirection="column">
      {token.header.map((cell, i) => (
        <Box key={i} paddingLeft={2} paddingRight={2}>
          <Text bold>{cell.text}</Text>
        </Box>
      ))}
      <Text dimColor>{'─'.repeat(30)}</Text>
      {token.rows.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((cell, cellIdx) => (
            <Box key={cellIdx} paddingLeft={2} paddingRight={2}>
              <Text>{cell.text}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

/**
 * 渲染 inline tokens（粗体、斜体、代码、链接等）
 */
function RenderInline({ tokens }: { tokens: marked.Token[] }) {
  return (
    <Text>
      {tokens.map((token, i) => <RenderInlineToken key={i} token={token} />)}
    </Text>
  );
}

function RenderInlineToken({ token }: { token: marked.Token }) {
  switch (token.type) {
    case 'text':
      return <>{(token as marked.Tokens.Text).text}</>;
    case 'strong':
      return <Text bold>{renderInlineTokens((token as marked.Tokens.Strong).tokens)}</Text>;
    case 'em':
      return <Text italic>{renderInlineTokens((token as marked.Tokens.Em).tokens)}</Text>;
    case 'codespan':
      return <Text backgroundColor="gray" color="white"> {(token as marked.Tokens.Codespan).text} </Text>;
    case 'link':
      return <Text color="cyan">{(token as marked.Tokens.Link).text}</Text>;
    case 'br':
      return <>{'\n'}</>;
    default:
      if ('text' in token && typeof (token as any).text === 'string') {
        return <>{(token as any).text}</>;
      }
      if ('tokens' in token && Array.isArray((token as any).tokens)) {
        return <>{renderInlineTokens((token as any).tokens)}</>;
      }
      return null;
  }
}

function renderInlineTokens(tokens: marked.Token[]): React.ReactNode {
  return tokens.map((token, i) => <RenderInlineToken key={i} token={token} />);
}
