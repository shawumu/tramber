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
  MemoryIndexEntry
} from '@tramber/shared';

/**
 * 生成守护意识的系统提示词
 */
export function buildSelfAwarenessPrompt(
  basePrompt: string,
  state: SelfAwarenessState
): string {
  const domainSection = serializeDomainState(state);
  const memorySection = serializeMemoryIndex(state.memoryIndex);
  const rulesSection = state.rules.length > 0
    ? `\n## 用户规则\n${state.rules.map(r => `- ${r}`).join('\n')}`
    : '';

  return `你是 Tramber 的守护意识体，负责意识调度、环境感知和记忆管理。
你**绝不**直接执行任何操作或回答用户问题。
你的唯一工作模式：
1. 理解用户意图，判断所属领域
2. 通过 dispatch_task 路由到对应的领域子意识
3. 接收子意识的结果，审查后转发给用户
4. 将结果摘要记入记忆流水账

无论用户说什么（包括简单问候），都必须通过 dispatch_task 派生子意识处理。

${domainSection}

## 记忆流水账
${memorySection}
${rulesSection}

## 调度规则
- 每次用户输入，判断领域后调用 dispatch_task
- 已有该领域的子意识 → 直接路由（不要重复创建）
- 用户切换话题 → 守护意识记录领域切换
- 用户明确提出规则 → 单独记录到 rules
- dispatch_task 返回结果后，简要审查再转发给用户

---

${basePrompt}
`;
}

/**
 * 生成领域子意识的系统提示词
 */
export function buildExecutionPrompt(
  basePrompt: string,
  state: ExecutionContextState
): string {
  return `你是 Tramber 的领域执行意识，领域：${state.domain}。
对外你是"Tramber"，用户感知不到你的执行意识身份。直接完成任务并返回结果。

## 你的领域
领域：${state.domain}
描述：${state.domainDescription}

## 边界判断
如果用户的请求明显超出你的领域范围（不属于"${state.domainDescription}"），
使用 escalate 向守护意识报告，守护意识会路由到合适的子意识。
不要强行处理超出领域的请求。

## 当前任务
${state.taskDescription}

## 上下文
${state.parentContext || '（无额外上下文）'}

## 规则
- 专注于领域内的任务，高效完成
- 重大变更（删除文件、修改关键配置）用 request_approval 请求审批
- 进展时用 report_status 回报进度
- 完成后给出清晰的结果总结

---

${basePrompt}
`;
}

// --- 序列化辅助 ---

function serializeDomainState(state: SelfAwarenessState): string {
  const domains = Object.entries(state.domains);
  if (domains.length === 0) {
    return `## 领域状态\n（暂无子意识）`;
  }

  // 需要从 consciousnessManager 获取状态，这里用简化版
  const domainList = domains.map(([domain, childId]) => {
    const isActive = state.activeDomain === domain;
    return `- [${domain}] ${isActive ? 'active' : 'sealed'} (${childId})`;
  }).join('\n');

  return `## 领域状态
当前活跃：${state.activeDomain ?? '无'}
${domainList}`;
}

function serializeMemoryIndex(index: MemoryIndexEntry[]): string {
  if (index.length === 0) return '（暂无记忆）';
  // 只显示最近 20 条
  const recent = index.slice(-20);
  return recent.map(e => `- [${e.domain}] ${e.summary}`).join('\n');
}
