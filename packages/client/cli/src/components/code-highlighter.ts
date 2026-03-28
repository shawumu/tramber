// packages/client/cli/src/components/code-highlighter.ts
/**
 * 轻量级终端代码语法高亮
 *
 * 基于正则的行扫描，非 AST 解析。
 * 支持语言: js/ts, python, json, bash/sh, yaml
 */

export interface HighlightSegment {
  text: string;
  color: string;
}

const COLORS = {
  keyword: 'magenta',
  string: 'green',
  number: 'yellow',
  comment: 'gray',
  type: 'cyan',
  function: 'blue',
  operator: 'white',
  plain: 'white',
} as const;

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'implements',
  'new', 'this', 'super', 'import', 'export', 'from', 'default', 'as', 'async',
  'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in',
  'of', 'void', 'delete', 'yield', 'interface', 'type', 'enum', 'namespace',
  'declare', 'abstract', 'readonly', 'private', 'protected', 'public', 'static',
  'get', 'set', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
]);

const PYTHON_KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
  'continue', 'import', 'from', 'as', 'with', 'try', 'except', 'finally',
  'raise', 'pass', 'yield', 'lambda', 'and', 'or', 'not', 'in', 'is', 'del',
  'global', 'nonlocal', 'assert', 'True', 'False', 'None', 'self', 'async',
  'await',
]);

const JS_TYPES = new Set([
  'string', 'number', 'boolean', 'object', 'any', 'void', 'never', 'unknown',
  'Array', 'Promise', 'Map', 'Set', 'Record', 'Partial', 'Required', 'Readonly',
]);

function tokenizeJsTs(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // 空白
    if (/\s/.test(line[i])) {
      let j = i;
      while (j < len && /\s/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.plain });
      i = j;
      continue;
    }

    // 单行注释
    if (line[i] === '/' && line[i + 1] === '/') {
      segments.push({ text: line.slice(i), color: COLORS.comment });
      i = len;
      continue;
    }

    // 字符串（双引号/单引号）
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      segments.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // 模板字符串（简化：不处理嵌套插值）
    if (line[i] === '`') {
      let j = i + 1;
      while (j < len && line[j] !== '`') {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      segments.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // 数字
    if (/\d/.test(line[i]) || (line[i] === '.' && i + 1 < len && /\d/.test(line[i + 1]))) {
      let j = i;
      if (line[j] === '0' && (line[j + 1] === 'x' || line[j + 1] === 'X')) {
        j += 2;
        while (j < len && /[0-9a-fA-F]/.test(line[j])) j++;
      } else {
        while (j < len && /[\d.]/.test(line[j])) j++;
      }
      segments.push({ text: line.slice(i, j), color: COLORS.number });
      i = j;
      continue;
    }

    // 标识符/关键字
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (JS_KEYWORDS.has(word)) {
        segments.push({ text: word, color: COLORS.keyword });
      } else if (JS_TYPES.has(word)) {
        segments.push({ text: word, color: COLORS.type });
      } else if (line[j] === '(') {
        segments.push({ text: word, color: COLORS.function });
      } else {
        segments.push({ text: word, color: COLORS.plain });
      }
      i = j;
      continue;
    }

    // 装饰器 @
    if (line[i] === '@' && /[a-zA-Z]/.test(line[i + 1] ?? '')) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.type });
      i = j;
      continue;
    }

    // 其他字符（运算符、括号等）
    segments.push({ text: line[i], color: COLORS.operator });
    i++;
  }

  return segments;
}

function tokenizePython(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (/\s/.test(line[i])) {
      let j = i;
      while (j < len && /\s/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.plain });
      i = j;
      continue;
    }

    // 注释
    if (line[i] === '#') {
      segments.push({ text: line.slice(i), color: COLORS.comment });
      i = len;
      continue;
    }

    // 字符串 (""" 和 f-string 简化处理)
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      segments.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // f-string 前缀
    if ((line[i] === 'f' || line[i] === 'r' || line[i] === 'b') && (line[i + 1] === '"' || line[i + 1] === "'")) {
      const j = i + 1;
      segments.push({ text: line.slice(i, j), color: COLORS.keyword });
      i = j;
      continue;
    }

    // 装饰器
    if (line[i] === '@' && /[a-zA-Z]/.test(line[i + 1] ?? '')) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.type });
      i = j;
      continue;
    }

    // 数字
    if (/\d/.test(line[i])) {
      let j = i;
      while (j < len && /[\d.]/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.number });
      i = j;
      continue;
    }

    // 标识符/关键字
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (PYTHON_KEYWORDS.has(word)) {
        segments.push({ text: word, color: COLORS.keyword });
      } else if (line[j] === '(') {
        segments.push({ text: word, color: COLORS.function });
      } else {
        segments.push({ text: word, color: COLORS.plain });
      }
      i = j;
      continue;
    }

    segments.push({ text: line[i], color: COLORS.operator });
    i++;
  }

  return segments;
}

function tokenizeJson(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (/\s/.test(line[i])) {
      let j = i;
      while (j < len && /\s/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.plain });
      i = j;
      continue;
    }

    // 字符串
    if (line[i] === '"') {
      let j = i + 1;
      while (j < len && line[j] !== '"') {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      const color = (i === 0 || /[,\[\s]/.test(line[i - 1])) && line[j] === ':' ? COLORS.type : COLORS.string;
      segments.push({ text: line.slice(i, j), color });
      i = j;
      continue;
    }

    // 数字
    if (/[\d\-]/.test(line[i]) && (i === 0 || /[,:\[\s]/.test(line[i - 1]))) {
      let j = i;
      if (line[j] === '-') j++;
      while (j < len && /[\d.eE+\-]/.test(line[j])) j++;
      if (j > i) {
        segments.push({ text: line.slice(i, j), color: COLORS.number });
        i = j;
        continue;
      }
    }

    // 布尔/null
    const rest = line.slice(i);
    if (rest.startsWith('true') || rest.startsWith('false') || rest.startsWith('null')) {
      const word = rest.startsWith('true') ? 'true' : rest.startsWith('false') ? 'false' : 'null';
      segments.push({ text: word, color: COLORS.keyword });
      i += word.length;
      continue;
    }

    segments.push({ text: line[i], color: COLORS.operator });
    i++;
  }

  return segments;
}

function tokenizeBash(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // 注释
    if (line[i] === '#') {
      segments.push({ text: line.slice(i), color: COLORS.comment });
      i = len;
      continue;
    }

    // 字符串
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      segments.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // 变量 $xxx
    if (line[i] === '$' && /[a-zA-Z_{]/.test(line[i + 1] ?? '')) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      if (j < len && line[j] === '}') j++;
      segments.push({ text: line.slice(i, j), color: COLORS.type });
      i = j;
      continue;
    }

    // 关键字
    if (/[a-zA-Z]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_\-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const keywords = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'echo', 'cd', 'ls', 'grep', 'awk', 'sed', 'cat', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'export', 'source', 'local', 'readonly', 'set', 'unset', 'shift']);
      if (keywords.has(word)) {
        segments.push({ text: word, color: COLORS.keyword });
      } else if (line[j] === '(' || line[j] === ' ') {
        segments.push({ text: word, color: COLORS.function });
      } else {
        segments.push({ text: word, color: COLORS.plain });
      }
      i = j;
      continue;
    }

    segments.push({ text: line[i], color: COLORS.operator });
    i++;
  }

  return segments;
}

function tokenizeYaml(line: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (/\s/.test(line[i])) {
      let j = i;
      while (j < len && /\s/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.plain });
      i = j;
      continue;
    }

    // 注释
    if (line[i] === '#') {
      segments.push({ text: line.slice(i), color: COLORS.comment });
      i = len;
      continue;
    }

    // 字符串
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) j++;
      j = Math.min(j + 1, len);
      segments.push({ text: line.slice(i, j), color: COLORS.string });
      i = j;
      continue;
    }

    // 布尔/null
    const rest = line.slice(i);
    if (rest.startsWith('true') || rest.startsWith('false') || rest.startsWith('null') || rest.startsWith('yes') || rest.startsWith('no')) {
      const word = rest.slice(0, 4);
      segments.push({ text: word, color: COLORS.keyword });
      i += word.length;
      continue;
    }

    // 数字
    if (/[\d\-]/.test(line[i])) {
      let j = i;
      if (line[j] === '-') j++;
      while (j < len && /[\d.]/.test(line[j])) j++;
      segments.push({ text: line.slice(i, j), color: COLORS.number });
      i = j;
      continue;
    }

    // key: (YAML key)
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_\-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      // 检查后面是否是冒号
      let k = j;
      while (k < len && line[k] === ' ') k++;
      if (line[k] === ':') {
        segments.push({ text: word, color: COLORS.type });
        i = j;
        continue;
      }
      segments.push({ text: word, color: COLORS.plain });
      i = j;
      continue;
    }

    segments.push({ text: line[i], color: COLORS.operator });
    i++;
  }

  return segments;
}

type Tokenizer = (line: string) => HighlightSegment[];

const TOKENIZERS: Record<string, Tokenizer> = {
  js: tokenizeJsTs,
  javascript: tokenizeJsTs,
  jsx: tokenizeJsTs,
  ts: tokenizeJsTs,
  typescript: tokenizeJsTs,
  tsx: tokenizeJsTs,
  python: tokenizePython,
  py: tokenizePython,
  json: tokenizeJson,
  bash: tokenizeBash,
  sh: tokenizeBash,
  shell: tokenizeBash,
  zsh: tokenizeBash,
  yaml: tokenizeYaml,
  yml: tokenizeYaml,
};

/**
 * 高亮代码，返回每行的分段着色
 */
export function highlightCode(code: string, language: string): HighlightSegment[][] {
  const tokenizer = TOKENIZERS[language.toLowerCase()];
  if (!tokenizer) {
    // 不支持的语言，原样输出
    return code.split('\n').map(line => [{ text: line, color: COLORS.plain }]);
  }

  return code.split('\n').map(line => tokenizer(line));
}
