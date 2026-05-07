// packages/agent/src/virtual-tools/spawn-task.ts
/**
 * spawn_task — 执行意识派生子任务
 *
 * 执行意识在执行中发现需要其他领域协助时调用。
 * 封存当前 conversation 状态到 subtask 实体，返回 spawn 信号。
 * 守护意识收到信号后会 dispatch 子任务，完成后 resume 当前任务。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class SpawnTaskTool implements Tool {
  id = 'spawn_task';
  name = 'spawn_task';
  description = '派生一个子任务。当你的任务需要其他领域协助时调用（如编码任务中需要写文档）。当前任务会被挂起，子任务完成后自动恢复。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      domain: {
        type: 'string',
        description: '子任务所属领域'
      },
      taskDescription: {
        type: 'string',
        description: '子任务描述'
      },
      context: {
        type: 'string',
        description: '传给子任务的上下文信息（你目前的发现、分析结果等）'
      }
    },
    required: ['domain', 'taskDescription']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      domain: string;
      taskDescription: string;
      context?: string;
    };

    if (!params.domain || !params.taskDescription) {
      return { success: false, error: 'domain and taskDescription are required' };
    }

    const { consciousnessManager, currentSubtaskId, currentConversation } = this.context;
    const taskId = consciousnessManager.getTaskId();

    if (!taskId || !currentSubtaskId) {
      return { success: false, error: 'No active task context' };
    }

    if (!currentConversation) {
      return { success: false, error: 'No conversation available to suspend' };
    }

    const memoryStore = consciousnessManager.getMemoryStore();

    // 封存当前 conversation 状态到 subtask 实体
    memoryStore.updateEntity(taskId, currentSubtaskId, {
      status: 'suspended',
      suspendedState: {
        messages: currentConversation.messages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt: currentConversation.systemPrompt,
        spawnReason: params.taskDescription
      }
    });

    debug(NS, LogLevel.BASIC, 'Task spawned, parent suspended', {
      parentSubtask: currentSubtaskId,
      spawnDomain: params.domain,
      spawnTask: params.taskDescription
    });

    return {
      success: true,
      data: {
        spawned: true,
        domain: params.domain,
        taskDescription: params.taskDescription,
        context: params.context || ''
      }
    };
  }
}
