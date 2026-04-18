# 执行意识 Prompt 优化 — 结构化为工作流程

## Context

执行意识的 system prompt 当前使用**平铺规则**结构，导致 LLM 行为混乱：
- 同时输出文本和调用工具（record_discovery 空调用）
- 简单问候也调用 12 个工具中的 record_discovery
- 规则之间互相冲突（"完成后总结" vs "调用工具"）

实测日志证据：子意识 iteration 1 输出问候文本 + record_discovery(resources=[])，iteration 2 再输出类似问候文本 → 用户看到重复回复。

## 问题分析

对比守护意识的 prompt（工作步骤清晰、顺序固定），执行意识的 prompt 缺少工作流程，只有零散的规则条目。

当前结构（`consciousness-prompts.ts:145-157`）：
```
## 规则
- 专注于领域内的任务，高效完成          ← 模糊
- 重大变更用 request_approval           ← 安全规则
- 完成后给出清晰的结果总结              ← 输出要求（和工具调用冲突）
- 如果发现了有价值的资源，用 record_discovery  ← 8 行工具细节
```

核心问题：**"完成后给出清晰的结果总结"和"使用 record_discovery"同时触发，LLM 把两个操作放在同一个 response 里**。

## 优化方案

将平铺规则改为**工作流程**，明确执行顺序：

```
## 工作方式

按以下顺序执行任务：

1. **判断**：任务是否需要使用工具？
   - 不需要（简单对话、问候、知识问答）→ 直接回答用户
   - 需要（读写文件、搜索代码、执行命令）→ 进入步骤 2

2. **执行**：使用工具完成任务
   - 专注高效，一次调用多个工具比多次单调用更好
   - 重大变更（删除文件、修改关键配置）用 request_approval 请求审批

3. **记录**：如果执行中发现了有价值的资源（文件、代码结构、配置），使用 record_discovery 记录
   - subtaskRef 必须使用上面标注的当前子任务 ID
   - summary 必须包含结构概览（title + techStack/features/structure）
   - 没有发现资源就不要调用

4. **总结**：在最终的纯文本回复中给出清晰的结果总结
```

关键改动：
- 把 "规则" 改为 "工作方式"
- 用编号步骤明确顺序：判断 → 执行 → 记录 → 总结
- 步骤 1 区分"直接回答"和"需要工具"两种模式
- 步骤 3 和步骤 4 分离：先记录，后总结，不会同时触发
- record_discovery 的 8 行细节压缩为 3 行

## 修改文件

`packages/agent/src/consciousness-prompts.ts` — `buildExecutionPrompt` 函数，替换规则部分（line 145-157）

## 验证

1. 构建：`pnpm build`
2. 启动 server，在 web 客户端测试：
   - 发送 "你好" → 应该只有一轮纯文本回复，不调用 record_discovery
   - 发送 "查看 demos 目录" → 应该调用工具探索，record_discovery 记录资源，最后给出总结
3. 检查 exec-*.json：确认 LLM 不再在同一 response 中混合文本和工具调用
