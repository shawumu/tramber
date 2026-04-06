// packages/agent/src/virtual-tools/request-approval.ts
/**
 * request_approval — 向父意识/用户请求审批
 *
 * 审批路由：
 * - 根意识的请求 → 人类用户（onPermissionRequired）
 * - 子意识的请求 → 父意识（LLM 审批，当前简化为直接通过 low/medium，high 路由到用户）
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import { debug, NAMESPACE, LogLevel } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class RequestApprovalTool implements Tool {
  id = 'request_approval';
  name = 'request_approval';
  description = '向父意识请求审批。执行重大变更前使用。';
  category = 'execution' as const;
  inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', description: '需要审批的操作' },
      reason: { type: 'string', description: '为什么需要此操作' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: '风险级别' }
    },
    required: ['action', 'reason', 'riskLevel']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      action: string;
      reason: string;
      riskLevel: 'low' | 'medium' | 'high';
    };

    if (!params.action || !params.riskLevel) {
      return { success: false, error: 'action and riskLevel are required' };
    }

    const { consciousnessManager, currentConsciousnessId, onPermissionRequired } = this.context;

    // 创建审批请求
    const request = consciousnessManager.createApprovalRequest(
      currentConsciousnessId,
      params.action,
      params.reason,
      params.riskLevel
    );

    debug(NS, LogLevel.BASIC, 'Approval requested', {
      requestId: request.id,
      action: params.action,
      riskLevel: params.riskLevel
    });

    // 根意识 → 用户审批
    if (currentConsciousnessId === 'root') {
      if (onPermissionRequired) {
        const approved = await onPermissionRequired(
          { id: request.id, name: params.action, parameters: {} },
          `意识体审批: ${params.action}`,
          params.reason
        );
        consciousnessManager.resolveApproval(request.id, {
          requestId: request.id,
          approved,
          feedback: approved ? undefined : '用户拒绝'
        });
        return {
          success: true,
          data: { approved, feedback: approved ? '已批准' : '用户拒绝' }
        };
      }
      // 没有回调，low/medium 自动通过
      if (params.riskLevel !== 'high') {
        return { success: true, data: { approved: true, feedback: '自动通过（无用户回调）' } };
      }
      return { success: false, error: '高风险操作需要用户确认，但无权限回调可用' };
    }

    // 子意识 → low 自动通过，medium/high 路由到用户
    if (params.riskLevel === 'low') {
      consciousnessManager.resolveApproval(request.id, {
        requestId: request.id,
        approved: true,
        feedback: '低风险自动通过'
      });
      return { success: true, data: { approved: true, feedback: '低风险操作已自动通过' } };
    }

    // medium/high → 路由到用户
    if (onPermissionRequired) {
      const approved = await onPermissionRequired(
        { id: request.id, name: params.action, parameters: {} },
        `子意识审批请求 (${params.riskLevel}风险): ${params.action}`,
        params.reason
      );
      consciousnessManager.resolveApproval(request.id, {
        requestId: request.id,
        approved,
        feedback: approved ? '已批准' : '用户拒绝'
      });
      return { success: true, data: { approved, feedback: approved ? '已批准' : '用户拒绝' } };
    }

    // 没有回调，根据风险级别决定
    const autoApproved = params.riskLevel === 'medium';
    return {
      success: true,
      data: { approved: autoApproved, feedback: autoApproved ? '中风险自动通过' : '高风险操作被拒绝（无审批回调）' }
    };
  }
}
