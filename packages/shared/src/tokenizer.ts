// packages/shared/src/tokenizer.ts
/**
 * Token 估算器 - 零依赖启发式 token 计数
 *
 * 策略：
 * - CJK 字符（中日韩）：每个字符 ≈ 1.5 tokens
 * - ASCII 文本：每 4 个字符 ≈ 1 token
 * - 代码/混合内容：每 3.5 个字符 ≈ 1 token
 * - 消息格式固定开销：每条消息 ~4 tokens（role + separator + boundary）
 * - 工具定义开销：每个工具 ~20 tokens（name + description + schema 结构）
 *
 * 总体误差约 10-15%，足够上下文窗口管理使用。
 */

/** Unicode 范围判断：CJK 统一汉字 */
const CJK_RANGES = [
  [0x4E00, 0x9FFF],   // CJK Unified Ideographs
  [0x3400, 0x4DBF],   // CJK Unified Ideographs Extension A
  [0xF900, 0xFAFF],   // CJK Compatibility Ideographs
  [0x2E80, 0x2EFF],   // CJK Radicals Supplement
  [0x3000, 0x303F],   // CJK Symbols and Punctuation
  [0x3040, 0x309F],   // Hiragana
  [0x30A0, 0x30FF],   // Katakana
  [0xAC00, 0xD7AF],   // Hangul Syllables
  [0xFF00, 0xFFEF],   // Fullwidth Forms
];

function isCJK(charCode: number): boolean {
  for (const [start, end] of CJK_RANGES) {
    if (charCode >= start && charCode <= end) return true;
  }
  return false;
}

/**
 * 分析文本组成
 */
function analyzeText(text: string): { cjkChars: number; asciiChars: number; otherChars: number } {
  let cjkChars = 0;
  let asciiChars = 0;
  let otherChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      asciiChars++;
    } else if (isCJK(code)) {
      cjkChars++;
    } else {
      otherChars++;
    }
  }

  return { cjkChars, asciiChars, otherChars };
}

/**
 * 估算单段文本的 token 数
 *
 * @param text 文本内容
 * @returns 估算的 token 数
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  const { cjkChars, asciiChars, otherChars } = analyzeText(text);

  // CJK: ~1.5 tokens/char
  const cjkTokens = cjkChars * 1.5;
  // ASCII: ~4 chars/token
  const asciiTokens = asciiChars / 4;
  // 其他 Unicode: ~2.5 chars/token
  const otherTokens = otherChars / 2.5;

  return Math.ceil(cjkTokens + asciiTokens + otherTokens);
}

/**
 * 消息格式固定开销（每条消息）
 * 包括 role 标记、分隔符、边界标记
 */
const MESSAGE_OVERHEAD = 4;

/**
 * 系统提示词额外开销
 */
const SYSTEM_PROMPT_OVERHEAD = 6;

/**
 * 工具定义的估算 token 数（每个工具）
 * 包括 name + description + inputSchema 结构
 */
const TOOL_DEFINITION_OVERHEAD = 25;

/**
 * 估算消息列表的总 token 数
 *
 * 模拟 LLM 输入格式：<|start|>{role}\n{content}<|end|>
 *
 * @param messages 消息列表
 * @returns 估算的总 token 数（含格式开销）
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>
): number {
  let total = 0;

  for (const msg of messages) {
    const overhead = msg.role === 'system' ? SYSTEM_PROMPT_OVERHEAD : MESSAGE_OVERHEAD;
    total += overhead + estimateTokenCount(msg.content);
  }

  return total;
}

/**
 * 估算工具定义的 token 开销
 *
 * @param toolCount 工具数量
 * @returns 估算的 token 数
 */
export function estimateToolsTokens(toolCount: number): number {
  return toolCount * TOOL_DEFINITION_OVERHEAD;
}

/**
 * 完整的上下文 token 估算
 *
 * 包括：系统提示词 + 消息历史 + 工具定义 + 格式开销
 *
 * @param options 各部分内容
 * @returns 估算的总 token 数
 */
export function estimateContextTokens(options: {
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  toolCount?: number;
}): number {
  let total = 0;

  if (options.systemPrompt) {
    total += SYSTEM_PROMPT_OVERHEAD + estimateTokenCount(options.systemPrompt);
  }

  if (options.messages) {
    for (const msg of options.messages) {
      const overhead = msg.role === 'system' ? 0 : MESSAGE_OVERHEAD; // systemPrompt 已算过
      total += overhead + estimateTokenCount(msg.content);
    }
  }

  if (options.toolCount && options.toolCount > 0) {
    total += estimateToolsTokens(options.toolCount);
  }

  return total;
}
