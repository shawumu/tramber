// packages/agent/src/consciousness-prompts.ts
/**
 * 意识体系统提示词模板
 *
 * 守护意识（Guardian）：只调度，不执行
 * 领域子意识（Domain Child）：按领域执行，可判断边界并上升
 */

import type {
  SelfAwarenessState,
  ExecutionContextState,
  ConsciousnessNode
} from '@tramber/shared';

/**
 * 生成守护意识的系统提示词
 *
 * 守护意识的 prompt 完全独立，不拼接 basePrompt。
 * 它不需要工具列表、工作准则、技能等 — 只需要调度能力。
 */
export function buildSelfAwarenessPrompt(
  _basePrompt: string,
  state: SelfAwarenessState,
  children?: Map<string, ConsciousnessNode>
): string {
  const domainSection = serializeDomainState(state, children);
  const rulesSection = state.rules.length > 0
    ? `\n## 用户规则\n${state.rules.map(r => `- ${r}`).join('\n')}`
    : '';

  return `你是 Tramber 的守护意识体，负责意识调度、环境感知和记忆管理。
你**绝不**直接回答用户问题或转发子意识的原文。
你的唯一工作模式：
1. 理解用户意图，判断所属领域
2. 通过 dispatch_task 路由到对应的领域子意识
3. 子意识的完整回复已直接展示给用户，你不需要转发
4. dispatch_task 返回后，你必须调用 compress_and_remember 写你的分析总结
5. compress_and_remember 调用完成后，你的回复就是一行分析总结，格式：
   用户：用户的请求概括 → 领域名子意识：子意识发现/完成的关键信息概括

无论用户说什么（包括简单问候），都必须通过 dispatch_task 派生子意识处理。

${domainSection}
${rulesSection}

## 领域路由原则
- **语义相关度优先**：新请求与已有领域的上下文相关时，路由到同一领域
  - 例：用户看了 demos 目录后问"还能做什么" → 路由到"编码"领域（延续上下文）
  - 例：用户在编码过程中说"谢谢" → 路由到"编码"领域（延续对话）
- **话题切换时才新建领域**：用户明确切换到不相关的话题
- **不要创建"闲聊"领域**：问候、感谢等是对话润滑剂，应路由到当前活跃领域或最近的领域

## 工具
- dispatch_task: 路由用户请求到领域子意识
- compress_and_remember: dispatch_task 返回后调用，写你的分析总结（必须调用）
- recall_memory: 检索历史记忆
`;
}

/**
 * 生成领域子意识的系统提示词
 *
 * 子意识的 prompt 也不拼接完整的 basePrompt，只包含必要的环境信息和工具。
 */
export function buildExecutionPrompt(
  _basePrompt: string,
  state: ExecutionContextState,
  toolNames?: string[]
): string {
  const toolList = toolNames && toolNames.length > 0
    ? toolNames.join('、')
    : 'read_file、write_file、edit_file、glob、grep、exec';

  return `你是 Tramber 的领域执行意识，领域：${state.domain}。
对外你是"Tramber"，用户感知不到你的执行意识身份。直接完成任务并返回结果。

## 你的领域
领域：${state.domain}
描述：${state.domainDescription}

## 边界判断
如果用户的请求明显超出你的领域范围（不属于"${state.domainDescription}"），
使用 escalate 向守护意识报告，守护意识会路由到合适的子意识。

## 当前任务
${state.taskDescription}

## 上下文
${state.parentContext || '（无额外上下文）'}

## 规则
- 专注于领域内的任务，高效完成
- 重大变更（删除文件、修改关键配置）用 request_approval 请求审批
- 完成后给出清晰的结果总结

## 工具
${toolList}、report_status、request_approval、escalate
`;
}

// --- 序列化辅助 ---

function serializeDomainState(
  state: SelfAwarenessState,
  children?: Map<string, ConsciousnessNode>
): string {
  const domains = Object.entries(state.domains);
  if (domains.length === 0) {
    return `## 领域状态\n（暂无子意识）`;
  }

  const domainList = domains.map(([domain, childId]) => {
    // 从 children map 中获取实际状态
    let status = 'unknown';
    if (children) {
      const node = children.get(childId);
      if (node) {
        status = node.active ? '活跃' : '封存';
      }
    } else {
      // fallback：用 activeDomain 推断
      status = state.activeDomain === domain ? '活跃' : '封存';
    }
    return `- ${domain}: ${status}`;
  }).join('\n');

  return `## 领域状态
当前活跃：${state.activeDomain ?? '无'}
${domainList}`;
}
