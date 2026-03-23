# Tramber - 架构设计方案

> **Tramber** = **Tree** + **Amber**
>
> 寓意：如琥珀保存古生物般，将 AI 交互中的知识、经验、规范沉淀下来，形成可复用的智能资产

---

## 一、项目概述

### 1.1 项目定位

Tramber 是一个**知识沉淀型多场景 AI 智能体**，旨在解决现有 AI 助手"每次都需重新理解"的问题。通过独特的知识沉淀机制，让 AI 越用越快、越用越智能。

### 1.2 核心价值

| 价值 | 说明 |
|------|------|
| **越用越快** | Routine 直接执行，无需 AI 重复理解 |
| **知识沉淀** | Skill → Routine 自动沉淀机制 |
| **场景分离** | Coding/Drawing/Video/Writing 独立场景 |
| **多客户端** | CLI/Web/Telegram/Discord/Slack 统一访问 |
| **插件扩展** | Builtin/Community 插件生态 |

### 1.3 Tramber 独有优势

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Tramber 独有优势                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. 知识沉淀机制                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  第一次: AI 慢速理解 → 成功 → 沉淀为 Routine                      │     │
│     │  以后:   直接执行 Routine → 快速完成 ✅                           │     │
│     │                                                                  │     │
│     │  越用越快，越用越智能                                             │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  2. Scene 固化工作流                                                          │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Workflow (灵活) → 验证稳定 → Scene (固化)                        │     │
│     │       ↓                            ↓                             │     │
│     │    可编辑                       一键执行                          │     │
│     │    可组合                       开箱即用                          │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  3. 多场景统一架构                                                            │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  同一 Server/Client 架构支持：                                     │     │
│     │  • Coding Scene - 软件开发                                        │     │
│     │  • Drawing Scene - 图像生成                                       │     │
│     │  • Video Scene - 视频制作                                         │     │
│     │  • Writing Scene - 内容创作                                       │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  4. Agent Loop 执行模型                                                       │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  收集上下文 → 执行动作 → 验证结果                                  │     │
│     │  Gather Context → Take Action → Verify Results                   │     │
│     │                                                                  │     │
│     │  最多 10 次迭代，自动重试直到成功                                  │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 与其他项目对比

| 维度 | **Tramber** | **Claude Code** | **OpenClaw** | **OpenCode** |
|------|------------|----------------|--------------|--------------|
| **定位** | 知识沉淀型多场景 AI 智能体 | 专精型代码智能体 | 通用型数字员工框架 | 开源代码助手 |
| **开源** | ✅ 开源 | ❌ 官方闭源 | ✅ 开源 (MIT) | ✅ 开源 |
| **架构** | Server/Client 分离 | CLI 本地执行 | Gateway + 扩展 | 单体应用 |
| **场景支持** | Coding/Drawing/Video/Writing | 仅 Coding | 全场景 | 仅 Coding |
| **核心特色** | Skill → Routine 知识沉淀 | Agentic Loop + Auto Memory | 插件化 + 多渠道 | 基础代码补全 |
| **执行模式** | Agent Loop + Scene/Workflow | Agentic Loop | 插件编排 | 简单请求/响应 |
| **客户端** | CLI/Web/Telegram/Discord/Slack | CLI/VSC Extension | CLI/Web/Mobile/IDE | CLI |
| **知识复用** | ✅ Routine 直接执行 | ❌ 每次都 AI 理解 | ❌ 无沉淀机制 | ❌ 无沉淀机制 |
| **扩展性** | Plugin 系统 | MCP/Skills | 90+ 扩展 | 有限扩展 |
| **LSP 集成** | ✅ 内置 | ✅ 内置 | ⚠️ 需插件 | ❌ 无 |
| **Checkpoint** | ✅ 内容寻址存储 | ✅ 快照回滚 | ❌ 无 | ❌ 无 |

---

## 二、核心概念

### 2.1 概念定义

| 概念 | 定义 | 示例 |
|------|------|------|
| **Scene** | 固化的工作流模板 | Coding Scene、Drawing Scene、Video Scene |
| **Workflow** | 可组合的执行步骤序列 | 代码审查、部署流程 |
| **Skill** | 需要 AI 理解和执行的技能 | 修复 bug、代码重构 |
| **Routine** | Skill 固化后的工具（直接执行） | async-error-fix |
| **Tool** | 内置的原子工具 | read_file、bash |
| **Experience** | 全维度的经验记录（安装/使用/配置/故障排除/优化） | Scene 使用心得、Tool 安装问题、Workflow 最佳实践 |

### 2.2 概念层级关系

```
┌─────────────────────────────────────────────────────────────┐
│                    Scene (场景)                           │
│              固化的工作流模板                                │
│        (Coding / Drawing / Video / Writing ...)              │
└────────────────────────┬────────────────────────────────────┘
                         │ 包含
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Workflow (工作流)                           │
│              可组合的执行步骤序列                             │
└────────────────────────┬────────────────────────────────────┘
                         │ 包含
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│Sub-Workflow  │  │    Skill     │  │   Routine    │
│  (子工作流)   │  │  (AI理解)    │  │  (直接执行)  │
└──────────────┘  └──────────────┘  └──────────────┘
                                           ↑
                              沉淀自          │
            ┌─────────────────────────────┘
            │
        ┌───▼──────┐
        │   Tool   │  (内置原子工具)
        └──────────┘
```

### 2.3 Routine vs Experience

| 维度 | Routine | Experience |
|------|---------|------------|
| **来源** | Skill 成功后沉淀 | 所有目标的经验记录 |
| **执行** | 直接执行（快） | 辅助参考（慢） |
| **类比** | 做菜的"固定配方" | 做菜的"心得笔记" |

### 2.4 Experience 全维度经验系统

Experience 是 Tramber 的知识积累系统，记录 Scene/Workflow/Skill/Routine/Tool 的全维度经验：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Experience 经验维度                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    经验目标 (Target)                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │  Scene   │  │ Workflow │  │  Skill   │  │ Routine  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │   │
│  │  ┌──────────┐                                                   │   │
│  │  │   Tool   │                                                   │   │
│  │  └──────────┘                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    经验分类 (Category)                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │ 安装经验     │  │ 使用经验     │  │ 配置经验     │            │   │
│  │  │ installation │  │    usage     │  │ configuration│            │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │   │
│  │  ┌──────────────┐  ┌──────────────┐                            │   │
│  │  │ 故障排除     │  │ 优化建议     │                            │   │
│  │  │troubleshooting│  │ optimization │                            │   │
│  │  └──────────────┘  └──────────────┘                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    经验类型 (Type)                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │  成功    │  │  失败    │  │  模式    │  │ 反模式   │          │   │
│  │  │ success  │  │ failure  │  │ pattern  │  │anti-pattern│          │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Experience 记录示例**：

| Target | Category | 示例 |
|--------|----------|------|
| **Scene** | usage | "Coding Scene 在处理大型项目时需要增加 maxIterations" |
| **Scene** | configuration | "Drawing Scene 需要配置 GPU 加速" |
| **Workflow** | usage | "code-review workflow 建议在 CI/CD 前运行" |
| **Workflow** | troubleshooting | "deploy workflow 失败时检查环境变量" |
| **Skill** | usage | "async-error-fix 对 Promise.all 不适用" |
| **Skill** | optimization | "refactor skill 配合 LSP 效果更好" |
| **Routine** | usage | "async-error-fix 成功率 93%，推荐首选" |
| **Tool** | installation | "typescript-language-server 需要全局安装" |
| **Tool** | troubleshooting | "bash 工具在 Windows 上需要 WSL" |
| **Tool** | optimization | "glob 工具使用 fast-glob 性能提升 10x" |

**Experience 数据流**：

```
用户操作 → 触发 Experience 记录
                 │
                 ▼
┌─────────────────────────────────────┐
│      ExperienceRecorder             │
│  • 自动记录成功/失败                 │
│  • 用户主动贡献经验                  │
│  • 社区分享经验                      │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      ExperienceStorage              │
│  • 本地文件存储                      │
│  • 可扩展数据库存储                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│      ExperienceRetrieval            │
│  • 关键词匹配                        │
│  • 语义检索（可选）                  │
│  • 有效性排序                        │
└─────────────────┬───────────────────┘
                  │
                  ▼
           返回相关经验供参考
```

---

## 三、Scene 系统

### 3.1 Scene 演进生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Scene 演进生命周期                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    执行成功     ┌─────────────────┐    运行稳定       │
│  │   动态 Scene    │─────────────────▶│    Workflow     │─────────────────▶│
│  │ Dynamic Scene   │   提取步骤       │  (可编辑)       │   固化命名       │
│  │                 │                 │                 │                  │
│  │ • AI 动态理解   │                 │ • 可组合        │                  │
│  │ • 临时创建      │                 │ • 可编辑        │                  │
│  │ • 一次性使用    │                 │ • 可重复使用    │                  │
│  └─────────────────┘                 └─────────────────┘                  │
│         ▲                                     │                             │
│         │                                     ▼                             │
│    用户需求                           ┌─────────────────┐                   │
│    自然语言描述                       │   命名 Scene    │                   │
│    "帮我做 X"                         │ Named Scene     │                   │
│                                      │                 │                   │
│                                      │ • 固化          │                   │
│                                      │ • 一键执行      │                   │
│                                      │ • 开箱即用      │                   │
│                                      │ • 可分享        │                   │
│                                      └─────────────────┘                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**演进路径**：

```
用户自然语言需求
       │
       ▼
┌─────────────────┐
│   AI 分析需求   │
│  • 理解意图     │
│  • 规划步骤     │
│  • 选择工具     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 创建动态 Scene  │  ← 临时 Scene，未命名
│ Dynamic Scene   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Agent Loop    │
│  执行任务       │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  成功      失败
    │         │
    │         └─► 记录 Experience，重试
    │
    ▼
┌─────────────────┐
│ 提取为 Workflow │  ← 保存执行步骤，可编辑
└────────┬────────┘
         │
         ▼
    多次执行成功
    (默认 3+ 次)
    (成功率 > 80%)
         │
         ▼
┌─────────────────┐
│ 固化为命名 Scene│  ← 进入 Scene 库，可分享
│ Named Scene     │
└─────────────────┘
```

### 3.2 Scene 分类

**按来源分类**：

| 类型 | 说明 | 示例 | 可分享 |
|------|------|------|--------|
| **内置 Scene** | 官方提供的固化场景 | Coding Scene, Drawing Scene | ✅ |
| **插件 Scene** | 插件提供的场景 | @plugin/3d-model-scene | ✅ |
| **命名 Scene** | 从动态 Scene 固化而来 | my-bug-fix-workflow | ✅ |
| **动态 Scene** | AI 动态创建的临时场景 | Dynamic: 帮我修复这个 bug | ❌ |

**按功能分类**：

| Scene | 说明 | 内置/插件 |
|-------|------|-----------|
| **Coding** | 软件开发 (代码审查、bug 修复、重构、测试) | 内置 |
| **Drawing** | 绘图 (图像生成、编辑、风格转换) | 内置 |
| **Video** | 视频 (视频生成、剪辑、特效) | 内置 |
| **Writing** | 写作 (文章生成、编辑、翻译) | 内置 |
| **3D Model** | 3D 模型 (创建、编辑、渲染) | 插件 |
| **Data Analysis** | 数据分析 (可视化、报表) | 插件 |

### 3.3 Scene 扩展方式

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Scene 获取方式                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   内置 Scene    │    │   插件 Scene    │    │   动态 Scene    │         │
│  │  Built-in       │    │   Plugin        │    │   Dynamic       │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                     │                     │                     │
│           ▼                     ▼                     ▼                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ • Coding        │    │ • 插件提供      │    │ • AI 动态理解    │         │
│  │ • Drawing       │    │ • 社区贡献      │    │ • 用户描述      │         │
│  │ • Video         │    │ • 可安装卸载    │    │ • 临时创建      │         │
│  │ • Writing       │    │                │    │ • 可沉淀固化    │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
│           │                     │                     │                     │
│           └─────────────────────┴─────────────────────┘                     │
│                                  │                                          │
│                                  ▼                                          │
│                    ┌─────────────────────────┐                              │
│                    │    统一 Scene API       │                              │
│                    │  • execute()            │                              │
│                    │  • getConfig()          │                              │
│                    │  • getWorkflow()        │                              │
│                    └─────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Scene 固化机制

**固化条件**：

动态 Scene 满足以下条件时可固化为命名 Scene：

```typescript
// packages/scene/src/manager/manager.ts
export class SceneManager {
  /**
   * 判断动态 Scene 是否可以固化为命名 Scene
   */
  canSolidify(scene: Scene): boolean {
    const config = this.config;

    // 满足所有条件才能固化
    return (
      scene.type === 'dynamic' &&
      scene.stats.totalExecutions >= config.minExecutions &&      // 默认 3 次
      scene.stats.successRate >= config.minSuccessRate &&        // 默认 80%
      scene.stats.successCount >= config.minSuccessCount         // 默认 3 次
    );
  }

  /**
   * 将动态 Scene 固化为命名 Scene
   */
  async solidify(scene: Scene, name: string): Promise<Scene> {
    if (!this.canSolidify(scene)) {
      throw new Error('Scene does not meet solidification criteria');
    }

    // 创建命名 Scene
    const namedScene: Scene = {
      ...scene,
      id: this.generateId(name),
      name,
      type: 'named',
      workflow: await this.optimizeWorkflow(scene.workflow),  // 优化工作流
      stats: {
        ...scene.stats,
        createdAt: new Date()
      }
    };

    // 保存到 Scene 库
    await this.save(namedScene);

    return namedScene;
  }

  /**
   * 从成功执行中提取 Workflow
   */
  async extractWorkflow(
    task: Task,
    executionLog: ExecutionLog
  ): Promise<Workflow> {
    // 从执行日志中提取步骤
    const steps: WorkflowStep[] = executionLog.steps.map(step => {
      if (step.type === 'tool_call') {
        return {
          type: 'tool',
          toolId: step.toolId,
          action: step.action,
          parameters: step.parameters,
          name: step.description
        };
      } else if (step.type === 'ai_reasoning') {
        // AI 推理步骤转换为 Skill
        return {
          type: 'skill',
          skillId: this.inferSkill(step),
          name: step.description
        };
      }
    });

    return {
      id: this.generateId('workflow'),
      name: `${task.description} - Extracted Workflow`,
      description: `从任务"${task.description}"中提取的工作流`,
      steps,
      trigger: { type: 'manual' }
    };
  }
}
```

**动态 Scene 创建示例**：

```typescript
// packages/scene/src/dynamic/factory.ts
export class DynamicSceneFactory {
  /**
   * AI 动态理解用户需求，创建临时 Scene
   */
  async createFromPrompt(
    prompt: string,
    context: ProjectContext
  ): Promise<Scene> {
    // 1. AI 分析用户需求
    const analysis = await this.analyzePrompt(prompt, context);

    // 2. 确定场景类型
    const category = this.inferCategory(analysis);

    // 3. 生成工作流步骤
    const workflow = await this.generateWorkflow(analysis, category);

    // 4. 创建动态 Scene
    const dynamicScene: Scene = {
      id: this.generateTempId(),
      name: `Dynamic: ${prompt.slice(0, 50)}...`,
      description: prompt,
      category,
      type: 'dynamic',
      workflow,
      config: {
        defaultProvider: analysis.recommendedProvider,
        defaultModel: analysis.recommendedModel,
        recommendedClients: ['cli', 'web']
      },
      stats: {
        totalExecutions: 0,
        successCount: 0,
        successRate: 0,
        createdAt: new Date(),
        lastExecutedAt: new Date()
      },
      source: {
        type: 'ai_generated',
        originalPrompt: prompt
      }
    };

    return dynamicScene;
  }
}
```

---

## 四、系统架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tramber 整体架构                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ╔═════════════════════════════════════════════════════════════════════════╗  │
│  ║                           客户端层                                     ║  │
│  ║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               ║  │
│  ║  │   CLI    │  │   Web    │  │ Telegram │  │ Discord  │               ║  │
│  ║  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘               ║  │
│  ╚══════╤══════════╤════════╤════════╤════════╤════════╤═════════════════════╝  │
│         └───────────┴──────────┴──────────┴──────────┘                       │
│                           │                                                  │
│  ╔════════════════════════╪═════════════════════════════════════════════════╗  │
│  ║                       通信层 (WebSocket/HTTP)                          ║  │
│  ╚════════════════════════╪═════════════════════════════════════════════════╝  │
│                           │                                                  │
│  ╔════════════════════════╪═════════════════════════════════════════════════╗  │
│  ║                      服务端层 (核心)                                    ║  │
│  ║                                                                          ║  │
│  ║  ┌────────────────────────────────────────────────────────────────────┐ ║  │
│  ║  │                        Agent 系统                                 │ ║  │
│  ║  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ ║  │
│  ║  │  │构建 Agent  │  │规划 Agent  │  │通用 Agent  │                 │ ║  │
│  ║  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │ ║  │
│  ║  │         └────────────────┼────────────────┘                        │ ║  │
│  ║  │                          ▼                                         │ ║  │
│  ║  │  ┌─────────────────────────────────────────────────────────────┐   │ ║  │
│  ║  │  │              Agentic Loop (每个 Agent 独立执行)             │   │ ║  │
│  ║  │  │          收集上下文 ──► 执行动作 ──► 验证结果               │   │ ║  │
│  ║  │  │                          │                                   │   │ ║  │
│  ║  │  │                          ▼                                   │   │ ║  │
│  ║  │  │  ┌─────────────────────────────────────────────────────┐    │   │ ║  │
│  ║  │  │  │  Scene → Workflow → Skill/Routine → Tool             │    │   │ ║  │
│  ║  │  │  └─────────────────────────────────────────────────────┘    │   │ ║  │
│  ║  │  └─────────────────────────────────────────────────────────────┘   │ ║  │
│  ║  │                                                                  │ ║  │
│  ║  │  ┌─────────────────────────────────────────────────────────────┐   │ ║  │
│  ║  │  │              核心系统 (Scene/Workflow/Skill/...)             │   │ ║  │
│  ║  │  └─────────────────────────────────────────────────────────────┘   │ ║  │
│  ║  └────────────────────────────────────────────────────────────────────┘ ║  │
│  ╚═════════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              任何 Client 都可访问任何 Scene
```

**Client 与 Scene 正交设计**：

| Client | 可访问 Scene | 特点 |
|--------|-------------|------|
| **CLI** | 全部 | 本地开发，适合技术用户 |
| **Web** | 全部 | 可视化界面，适合新手 |
| **Telegram** | 全部 | 移动便捷，随时使用 |
| **Discord** | 全部 | 团队协作，集成沟通 |
| **Slack** | 全部 | 企业场景，工作流集成 |

### 4.2 Agent Loop 执行模型

每个 Agent 都执行独立的 Agentic Loop:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Agentic Loop (智能体循环)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │     阶段 1:     │    │     阶段 2:     │    │     阶段 3:     │     │
│  │   Gather        │───▶│    Take         │───▶│    Verify       │     │
│  │   收集上下文     │    │    执行动作     │    │    验证结果     │     │
│  │                 │    │                 │    │                 │     │
│  │  • 读取文件     │    │  • AI 决策      │    │  • 运行测试     │     │
│  │  • 搜索代码     │    │  • 执行工具     │    │  • 检查错误     │     │
│  │  • 理解模式     │    │  • 编辑文件     │    │  • 验证修改     │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│           │    ┌─────────────────┴──────────────────────┐               │
│           │    │                                       │               │
│           │    ▼                                       │               │
│           │  ┌─────────────────────────────────────┐   │               │
│           │  │         成功?  Success?             │   │               │
│           │  └─────────────┬───────────────────────┘   │               │
│           │         是Yes│              │否No            │               │
│           │            ▼               ▼                 │               │
│           │      ┌──────────┐   ┌─────────────┐         │               │
│           │      │ 完成任务 │   │ 带反馈重试  │         │               │
│           │      │ Complete │   │ Retry with  │         │               │
│           │      │ Task     │   │ Feedback    │         │               │
│           │      └──────────┘   └──────┬──────┘         │               │
│           │                             │                │               │
│           └─────────────────────────────┼────────────────                │
│                                         ▼                                │
│                              ┌─────────────────┐                         │
│                              │ 最多 10 次迭代  │                         │
│                              │   Max 10 iters  │                         │
│                              └─────────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 执行层次

```
用户请求 User Request
      │
      ▼
┌─────────────┐     ┌─────────────┐
│   客户端    │────▶│   服务端    │
│  Client    │     │   Agent     │
│ (CLI/Web)  │     │  (智能体)   │
└─────────────┘     └──────┬──────┘
                          │
                          ▼
                    ┌───────────┐
                    │   场景     │  (固化的工作流模板)
                    │   Scene    │
                    │ (coding/  │
                    │ drawing/ │
                    │  video)  │
                    └─────┬─────┘
                          │
                          ▼
                    ┌───────────┐
                    │  工作流    │  (可组合的执行步骤序列)
                    │ Workflow  │
                    └─────┬─────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │子工作流   │    │   技能    │    │   常规    │
   │Sub-Work  │    │  Skill   │    │ Routine  │
   │  flow    │    │ (AI理解) │    │(直接执行) │
   └──────────┘    └────┬─────┘    └────┬─────┘
                        │                │
                        ▼                ▼
                  ┌──────────┐      ┌──────────┐
                  │   AI     │      │  工具集   │
                  │ Provider │      │  Tools   │
                  │  提供商   │      │(read/    │
                  │          │      │ write/   │
                  └──────────┘      │  bash/   │
                                    │  git/...) │
                                    └──────────┘
```

---

## 五、代码组织架构

### 5.1 顶层目录结构

```
tramber/
├── packages/
│   │
│   # ==================== 核心引擎 ====================
│   ├── core/                    # Agent 执行引擎核心
│   │   ├── src/
│   │   │   ├── agent/           # Agent 执行引擎
│   │   │   │   ├── loop.ts      # Agentic Loop
│   │   │   │   ├── agent.ts     # Agent 类型实现
│   │   │   │   └── types.ts     # Agent 类型定义
│   │   │   ├── session/         # 会话管理
│   │   │   │   ├── manager.ts   # SessionManager
│   │   │   │   └── store.ts     # Session 存储抽象
│   │   │   └── context/         # 上下文管理
│   │   │       ├── manager.ts   # ContextManager
│   │   │       └── builder.ts   # ContextBuilder
│   │   └── package.json
│   │
│   # ==================== 执行单元系统 ====================
│   ├── scene/                   # Scene 系统（独立包）
│   │   ├── src/
│   │   │   ├── manager/         # Scene 管理
│   │   │   │   ├── manager.ts   # SceneManager
│   │   │   │   ├── solidify.ts  # 固化逻辑
│   │   │   │   └── registry.ts  # Scene 注册表
│   │   │   ├── dynamic/          # 动态 Scene 创建
│   │   │   │   ├── factory.ts   # DynamicSceneFactory
│   │   │   │   └── analyzer.ts  # 需求分析
│   │   │   └── types.ts         # Scene 类型定义
│   │   └── package.json
│   │
│   ├── workflow/                # Workflow 系统（独立包）
│   │   ├── src/
│   │   │   ├── executor/        # Workflow 执行器
│   │   │   │   ├── executor.ts  # WorkflowExecutor
│   │   │   │   ├── step.ts      # Step 执行逻辑
│   │   │   │   └── parser.ts    # Workflow 解析
│   │   │   └── types.ts         # Workflow 类型定义
│   │   └── package.json
│   │
│   ├── skill/                   # Skill 系统（独立包）
│   │   ├── src/
│   │   │   ├── executor/        # Skill 执行器
│   │   │   │   ├── executor.ts  # SkillExecutor
│   │   │   │   └── planner.ts   # Skill 执行规划
│   │   │   └── types.ts         # Skill 类型定义
│   │   └── package.json
│   │
│   ├── routine/                 # Routine 系统（独立包）
│   │   ├── src/
│   │   │   ├── manager/         # Routine 管理
│   │   │   │   ├── manager.ts   # RoutineManager
│   │   │   │   ├── matcher.ts   # Routine 匹配
│   │   │   │   └── solidify.ts  # Routine 沉淀
│   │   │   └── types.ts         # Routine 类型定义
│   │   └── package.json
│   │
│   ├── tool/                    # Tool 系统（独立包）
│   │   ├── src/
│   │   │   ├── registry/        # Tool 注册表
│   │   │   │   ├── registry.ts  # ToolRegistry
│   │   │   │   └── executor.ts  # ToolExecutor
│   │   │   ├── builtin/         # 内置工具
│   │   │   │   ├── file/        # 文件操作
│   │   │   │   ├── search/      # 搜索
│   │   │   │   └── execution/   # 执行
│   │   │   └── types.ts         # Tool 类型定义
│   │   └── package.json
│   │
│   # ==================== 支撑系统 ====================
│   ├── experience/              # Experience 系统（独立包）
│   │   ├── src/
│   │   │   ├── storage/         # Experience 存储
│   │   │   │   ├── adapter.ts   # 存储适配器
│   │   │   │   ├── memory.ts    # 内存存储
│   │   │   │   └── filesystem.ts # 文件存储
│   │   │   ├── retrieval/       # Experience 检索
│   │   │   │   ├── vector.ts    # 向量检索
│   │   │   │   └── semantic.ts  # 语义检索
│   │   │   └── types.ts         # Experience 类型定义
│   │   └── package.json
│   │
│   ├── provider/                # AI Provider（独立包）
│   │   ├── src/
│   │   │   ├── anthropic/       # Anthropic Claude
│   │   │   │   ├── client.ts
│   │   │   │   └── adapter.ts
│   │   │   ├── openai/          # OpenAI GPT
│   │   │   │   ├── client.ts
│   │   │   │   └── adapter.ts
│   │   │   ├── gemini/          # Google Gemini
│   │   │   │   ├── client.ts
│   │   │   │   └── adapter.ts
│   │   │   ├── base/            # 基础接口
│   │   │   │   ├── provider.ts  # AIProvider 接口
│   │   │   │   └── types.ts     # 通用类型
│   │   │   └── index.ts         # 统一导出
│   │   └── package.json
│   │
│   ├── checkpoint/              # Checkpoint 系统（独立包）
│   │   ├── src/
│   │   │   ├── manager.ts       # CheckpointManager
│   │   │   ├── storage/         # 快照存储
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── lsp/                     # LSP 集成（独立包）
│   │   ├── src/
│   │   │   ├── pool.ts          # LSPConnectionPool
│   │   │   ├── client/          # LSP 客户端封装
│   │   │   └── config.ts        # LSP 配置
│   │   └── package.json
│   │
│   # ==================== 客户端 ====================
│   ├── client/                  # 客户端包
│   │   ├── cli/                 # CLI 客户端
│   │   │   ├── src/
│   │   │   │   ├── cli.ts       # CLI 主入口
│   │   │   │   ├── commands/    # 命令实现
│   │   │   │   └── ui/          # 终端 UI
│   │   │   └── package.json
│   │   ├── web/                 # Web 客户端
│   │   │   ├── src/
│   │   │   │   ├── App.tsx
│   │   │   │   └── ...
│   │   │   └── package.json
│   │   └── message/             # 消息客户端
│   │       ├── telegram/        # Telegram Bot
│   │       ├── discord/         # Discord Bot
│   │       └── slack/           # Slack Bot
│   │
│   # ==================== 插件系统 ====================
│   ├── plugin/                  # 插件系统
│   │   ├── core/                # 插件核心
│   │   │   ├── src/
│   │   │   │   ├── loader.ts    # PluginLoader
│   │   │   │   ├── registry.ts  # PluginRegistry
│   │   │   │   └── types.ts
│   │   │   └── package.json
│   │   ├── builtin/             # 内置插件
│   │   │   ├── media/           # 媒体处理
│   │   │   ├── browser/         # 浏览器自动化
│   │   │   ├── git/             # Git 工具
│   │   │   └── lsp/             # LSP 工具（增强）
│   │   └── community/          # 社区插件目录
│   │
│   # ==================== 共享 ====================
│   ├── shared/                  # 共享类型和工具
│   │   ├── src/
│   │   │   ├── types/           # 统一类型定义
│   │   │   │   ├── index.ts     # 导出所有类型
│   │   │   │   ├── scene.ts     # Scene 类型
│   │   │   │   ├── workflow.ts  # Workflow 类型
│   │   │   │   ├── skill.ts     # Skill 类型
│   │   │   │   ├── routine.ts   # Routine 类型
│   │   │   │   ├── tool.ts      # Tool 类型
│   │   │   │   └── agent.ts     # Agent 类型
│   │   │   ├── utils/           # 工具函数
│   │   │   │   ├── logger.ts
│   │   │   │   ├── crypto.ts
│   │   │   │   └── format.ts
│   │   │   └── constants/       # 常量
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   └── sdk/                     # 客户端 SDK
│       ├── src/
│       │   ├── client.ts        # TramberClient 接口
│       │   ├── transport/       # 传输层
│       │   │   ├── websocket.ts
│       │   │   └── http.ts
│       │   └── types.ts
│       └── package.json
│
├── .tramber/                    # 配置目录
│   ├── settings.json            # 全局配置
│   ├── scenes/                  # Scene 定义
│   ├── workflows/               # Workflow 定义
│   ├── skills/                  # Skill 定义
│   ├── routines/                # Routine 沉淀
│   ├── experiences/             # Experience 积累
│   └── plugins/                 # 插件配置
│
├── package.json                 # 根 package.json
├── pnpm-workspace.yaml          # pnpm workspace 配置
├── tsconfig.base.json           # 基础 TS 配置
└── README.md
```

### 5.2 包职责

| 包 | 职责 | 依赖 |
|------|------|------|
| **core** | Agent 执行引擎核心 | shared |
| **scene** | Scene 管理与固化 | shared, workflow |
| **workflow** | Workflow 执行 | shared, skill, routine, tool |
| **skill** | Skill 执行（AI 理解） | shared, tool, experience |
| **routine** | Routine 执行（直接执行） | shared, tool |
| **tool** | Tool 注册与执行 | shared |
| **experience** | Experience 存储与检索 | shared |
| **provider** | AI Provider 统一接口 | shared |
| **checkpoint** | 快照与回滚 | shared |
| **lsp** | LSP 连接池 | shared |
| **plugin/core** | 插件加载与注册 | shared |
| **plugin/builtin/** | 内置插件实现 | shared, tool |
| **shared** | 共享类型和工具 | - |
| **sdk** | 客户端通信 SDK | shared |
| **client/cli** | CLI 客户端 | sdk |
| **client/web** | Web 客户端 | sdk |
| **client/message/** | 消息客户端 | sdk |

### 5.3 包依赖关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Tramber 包依赖关系                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                         ┌─────────────────┐                             │
│                         │     shared      │ ◄──── 基础层（无依赖）      │
│                         └────────┬────────┘                             │
│                                  │                                       │
│         ┌────────────────────────┼────────────────────────┐             │
│         │                        │                        │             │
│         ▼                        ▼                        ▼             │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐     │
│  │   tool      │          │  provider   │          │  experience │     │
│  └──────┬──────┘          └─────────────┘          └─────────────┘     │
│         │                                                              │
│         ├────────────────────────────────────────────────┐             │
│         │                        │                        │             │
│         ▼                        ▼                        ▼             │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐     │
│  │  routine    │          │   skill     │          │   tool      │     │
│  └──────┬──────┘          └──────┬──────┘          └─────────────┘     │
│         │                        │                                       │
│         └────────────┬───────────┘                                       │
│                      ▼                                                  │
│               ┌─────────────┐                                           │
│               │  workflow   │                                           │
│               └──────┬──────┘                                           │
│                      │                                                   │
│         ┌────────────┴────────────┐                                     │
│         │                         │                                     │
│         ▼                         ▼                                     │
│  ┌─────────────┐          ┌─────────────┐                               │
│  │   scene     │          │    core     │                               │
│  └─────────────┘          └──────┬──────┘                               │
│                                  │                                       │
│                         ┌────────┴────────┐                             │
│                         │                 │                             │
│                         ▼                 ▼                             │
│                  ┌─────────────┐   ┌─────────────┐                      │
│                  │  sdk        │   │  plugin     │                      │
│                  └──────┬──────┘   └─────────────┘                      │
│                         │                                                 │
│                  ┌──────┴──────┐                                         │
│                  │             │                                         │
│                  ▼             ▼                                         │
│           ┌─────────────┐ ┌─────────────┐                                │
│           │   client    │ │   server    │                                │
│           └─────────────┘ └─────────────┘                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Path Alias 配置

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@tramber/shared": ["packages/shared/src"],
      "@tramber/shared/*": ["packages/shared/src/*"],

      "@tramber/core": ["packages/core/src"],
      "@tramber/core/*": ["packages/core/src/*"],

      "@tramber/scene": ["packages/scene/src"],
      "@tramber/scene/*": ["packages/scene/src/*"],

      "@tramber/workflow": ["packages/workflow/src"],
      "@tramber/workflow/*": ["packages/workflow/src/*"],

      "@tramber/skill": ["packages/skill/src"],
      "@tramber/skill/*": ["packages/skill/src/*"],

      "@tramber/routine": ["packages/routine/src"],
      "@tramber/routine/*": ["packages/routine/src/*"],

      "@tramber/tool": ["packages/tool/src"],
      "@tramber/tool/*": ["packages/tool/src/*"],

      "@tramber/experience": ["packages/experience/src"],
      "@tramber/experience/*": ["packages/experience/src/*"],

      "@tramber/provider": ["packages/provider/src"],
      "@tramber/provider/*": ["packages/provider/src/*"],

      "@tramber/checkpoint": ["packages/checkpoint/src"],
      "@tramber/checkpoint/*": ["packages/checkpoint/src/*"],

      "@tramber/lsp": ["packages/lsp/src"],
      "@tramber/lsp/*": ["packages/lsp/src/*"],

      "@tramber/sdk": ["packages/sdk/src"],
      "@tramber/sdk/*": ["packages/sdk/src/*"]
    }
  }
}
```

---

## 六、核心类型定义

### 6.1 Scene

```typescript
// packages/scene/src/types.ts
export interface Scene {
  // 基础信息
  id: string;
  name: string;
  description: string;
  category: SceneCategory;

  // Scene 类型
  type: 'builtin' | 'plugin' | 'dynamic' | 'named';

  // Workflow
  workflow: Workflow;

  // 配置
  config: SceneConfig;

  // 统计（用于判断是否可固化为命名 Scene）
  stats: {
    totalExecutions: number;
    successCount: number;
    successRate: number;
    createdAt: Date;
    lastExecutedAt: Date;
  };

  // 来源（仅动态/命名 Scene）
  source?: {
    type: 'ai_generated' | 'user_created' | 'plugin_provided';
    originalPrompt?: string;  // 原始用户输入
  };

  // 执行
  execute(input: SceneInput): Promise<SceneOutput>;
}

export type SceneCategory =
  | 'coding'      // 软件开发
  | 'drawing'     // 图像生成/编辑
  | 'video'       // 视频制作
  | 'writing'     // 内容创作
  | 'custom';     // 自定义

export interface SceneConfig {
  systemPrompt?: string;
  defaultProvider: string;
  defaultModel: string;
  recommendedClients: ClientType[];
  maxIterations?: number;
  enableCheckpoint?: boolean;
}
```

### 6.2 Workflow

```typescript
// packages/workflow/src/types.ts
export interface Workflow {
  id: string;
  name: string;
  description: string;

  steps: WorkflowStep[];  // 可嵌套
  trigger: Trigger;

  execute(context: WorkflowContext): Promise<WorkflowResult>;
}

export type WorkflowStep =
  | { type: 'workflow'; workflowId: string; name: string; }
  | { type: 'skill'; skillId: string; name: string; }
  | { type: 'routine'; routineId: string; name: string; }
  | { type: 'tool'; toolId: string; action: string; parameters: Record<string, unknown>; name: string; };

export interface Trigger {
  type: 'manual' | 'automatic' | 'scheduled';
  schedule?: string;  // cron expression
}
```

### 6.3 Skill

```typescript
// packages/skill/src/types.ts
export interface Skill {
  id: string;
  name: string;
  description: string;

  tools: string[];  // Tool IDs

  // AI 执行
  execute(input: SkillInput, context: SkillContext): Promise<SkillOutput>;
}

export interface SkillContext {
  experiences: Experience[];
  queryExperience(query: string): Promise<Experience[]>;
}
```

### 6.4 Routine

```typescript
// packages/routine/src/types.ts
export interface Routine {
  id: string;
  name: string;
  description: string;

  derivedFrom: string;  // 来源 Skill

  // 固化的步骤
  steps: {
    toolId: string;
    action: string;
    parameters: Record<string, unknown>;
  }[];

  condition: {
    trigger: { patterns?: string[]; fileType?: string[] };
    validate?: (input: unknown) => boolean;
  };

  stats: {
    totalExecutions: number;
    successCount: number;
    successRate: number;
  };

  // 直接执行
  execute(input: RoutineInput): Promise<RoutineOutput>;
}
```

### 6.5 Tool

```typescript
// packages/tool/src/types.ts
export interface Tool {
  id: string;
  name: string;
  description: string;

  category: 'file' | 'search' | 'execution' | 'media' | 'git' | 'lsp';

  inputSchema: ToolInputSchema;
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}
```

### 6.6 Experience

```typescript
// packages/experience/src/types.ts
export type ExperienceType = 'success' | 'failure' | 'pattern' | 'anti-pattern';
export type ExperienceTarget = 'scene' | 'workflow' | 'skill' | 'routine' | 'tool';

export interface Experience {
  id: string;
  name: string;
  description: string;

  // 经验类型和目标
  type: ExperienceType;
  target: ExperienceTarget;
  targetId: string;  // 对应的 Scene/Workflow/Skill/Routine/Tool ID

  // 经验分类
  category: 'usage' | 'installation' | 'configuration' | 'troubleshooting' | 'optimization';

  // 内容
  content: {
    problem: string;
    solution: string;
    codeExample?: string;
    keyPoints: string[];
    caveats?: string[];

    // 安装相关（category: installation）
    installCommand?: string;
    installNotes?: string;
    prerequisites?: string[];
    conflicts?: string[];

    // 使用相关（category: usage）
    usageExample?: string;
    bestPractices?: string[];

    // 配置相关（category: configuration）
    configExample?: string;
    configOptions?: Record<string, { description: string; recommended: string }>;

    // 故障排除（category: troubleshooting）
    errorPattern?: string;
    errorSolution?: string;

    // 优化建议（category: optimization）
    optimizationTip?: string;
  };

  // 元数据
  tags: string[];
  confidence: number;     // 0-1，经验可信度
  effectiveness?: number;  // 0-1，解决方案有效性
  frequency: number;       // 使用次数

  // 来源
  source: {
    type: 'ai_generated' | 'user_reported' | 'community_contributed';
    userId?: string;
    sessionId?: string;
  };

  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;

  // 检索相关
  relevance(query: string): number;
}

// Experience 批量记录
export interface ExperienceBatch {
  target: ExperienceTarget;
  targetId: string;
  experiences: Experience[];
}

// Experience 统计
export interface ExperienceStats {
  target: ExperienceTarget;
  targetId: string;
  totalExperiences: number;
  byType: Record<ExperienceType, number>;
  byCategory: Record<string, number>;
  averageEffectiveness: number;
  mostUsed: Experience[];
}
```

### 6.7 Agent 相关类型

```typescript
// packages/core/src/agent/types.ts
export type AgentType = 'build' | 'plan' | 'general';

export interface AgentConfig {
  type: AgentType;
  model: string;
  systemPrompt?: string;
  tools?: string[];
}

export interface Task {
  id: string;
  description: string;
  sceneId: string;
  isComplete: boolean;
  result?: unknown;
}

export interface AgentContext {
  messages: Message[];
  files: FileContent[];
  projectInfo: ProjectInfo;
  tokenUsage: TokenUsage;
  scene: Scene;
  workflow: Workflow;
  experiences: Experience[];
}

export interface ActionResult {
  toolCalls: ToolCall[];
  results: ToolResult[];
}

export interface Verification {
  success: boolean;
  errors?: string[];
  feedback?: string;
}
```

---

## 七、Agent Loop 实现

### 7.1 执行流程说明

Agent Loop 采用三阶段循环执行模型，详见 [第四章 4.2 Agent Loop 执行模型](#42-agent-loop-执行模型)。

### 7.2 AgenticLoop 类实现

```typescript
// packages/core/src/agent/loop.ts
export class AgenticLoop {
  constructor(
    private toolRegistry: ToolRegistry,
    private provider: AIProvider,
    private contextManager: ContextManager,
    private sceneManager: SceneManager
  ) {}

  /**
   * Phase 1: Gather Context
   * - 读取文件
   * - 搜索代码
   * - 理解模式
   */
  async gatherContext(task: Task): Promise<AgentContext> {
    const context = await this.contextManager.create(task);

    // Get scene and workflow
    const scene = await this.sceneManager.getScene(task.sceneId);
    const workflow = scene.workflow;

    // Analyze task to determine what context is needed
    const analysis = await this.analyzeTask(task, workflow);

    // Gather relevant files
    if (analysis.needsFiles) {
      const files = await this.gatherFiles(analysis.filePatterns);
      context.files = files;
    }

    // Search for relevant code patterns
    if (analysis.needsSearch) {
      const searchResults = await this.searchCodebase(analysis.searchQueries);
      context.searchResults = searchResults;
    }

    // Load experiences for skill context
    context.experiences = await this.loadRelevantExperiences(task);

    return context;
  }

  /**
   * Phase 2: Take Action
   * - 编辑文件
   * - 运行命令
   * - 执行工具
   */
  async takeAction(context: AgentContext, task: Task): Promise<ActionResult> {
    // Let AI decide what actions to take
    const response = await this.provider.chat({
      messages: context.messages,
      tools: this.toolRegistry.list(),
      systemPrompt: this.buildSystemPrompt(context.scene)
    });

    // Execute tool calls
    const toolCalls = response.toolCalls || [];
    const results = await Promise.all(
      toolCalls.map(call => this.toolRegistry.execute(call.name, call.parameters))
    );

    return { toolCalls, results };
  }

  /**
   * Phase 3: Verify Results
   * - 运行测试
   * - 检查错误
   * - 验证修改
   */
  async verifyResults(action: ActionResult, task: Task): Promise<Verification> {
    const errors: string[] = [];

    // Check for tool execution errors
    for (const result of action.results) {
      if (result.error) {
        errors.push(result.error);
      }
    }

    // If actions included edits, verify the changes
    const hasEdits = action.toolCalls.some(c => c.name.startsWith('edit_'));
    if (hasEdits) {
      const verification = await this.runTests();
      if (!verification.passed) {
        errors.push(...verification.failures);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Main loop - execute task with agentic loop
   */
  async run(task: Task): Promise<Task> {
    let context = await this.gatherContext(task);
    const maxIterations = 10;
    let iteration = 0;

    while (!task.isComplete && iteration < maxIterations) {
      iteration++;

      // Phase 2: Take Action
      const action = await this.takeAction(context, task);

      // Phase 3: Verify Results
      const verification = await this.verifyResults(action, task);

      if (verification.success) {
        task.isComplete = true;
        task.result = action.results;

        // Record experience if skill was used
        await this.recordExperience(context, action, true);
      } else {
        // Update context with feedback and retry
        context = context.withFeedback(verification.feedback || 'Action failed, please retry');

        // Record failed experience
        await this.recordExperience(context, action, false, verification.errors);
      }
    }

    return task;
  }
}
```

### 7.3 Agent 类型实现

```typescript
// packages/core/src/agent/agent.ts
export abstract class Agent {
  constructor(
    protected config: AgentConfig,
    protected loop: AgenticLoop
  ) {}

  abstract execute(task: Task): Promise<Task>;
}

// Build Agent - 专注构建和测试
export class BuildAgent extends Agent {
  async execute(task: Task): Promise<Task> {
    return this.loop.run(task);
  }
}

// Plan Agent - 专注规划和设计
export class PlanAgent extends Agent {
  async execute(task: Task): Promise<Task> {
    // 先分析需求，生成计划
    const plan = await this.generatePlan(task);
    task.plan = plan;
    return this.loop.run(task);
  }

  private async generatePlan(task: Task): Promise<Plan> {
    // 实现计划生成逻辑
    return {} as Plan;
  }
}

// General Agent - 通用执行
export class GeneralAgent extends Agent {
  async execute(task: Task): Promise<Task> {
    return this.loop.run(task);
  }
}
```

---

## 八、Experience 系统

### 8.1 Experience 记录触发机制

Experience 在多种场景下自动记录：

| 触发时机 | 记录内容 | 示例 |
|----------|----------|------|
| **Skill 成功** | 成功模式、最佳实践 | "async-error-fix 成功修复了 3 个文件" |
| **Skill 失败** | 失败模式、错误分析 | "refactor skill 在 Vue 项目中失败" |
| **Tool 安装** | 安装命令、依赖、注意事项 | "LSP server 需要全局安装" |
| **Tool 使用失败** | 错误模式、解决方案 | "bash 工具在 Windows 需要 WSL" |
| **Workflow 执行** | 使用建议、配置优化 | "code-review workflow 适合团队协作" |
| **Scene 配置** | 最佳配置、注意事项 | "Coding Scene 的 maxIterations 建议设为 15" |
| **用户主动贡献** | 社区经验、最佳实践 | 用户提交的经验文章 |
| **系统分析** | 性能优化、模式识别 | "glob 工具使用 fast-glob 性能更好" |

### 8.2 Experience 记录示例

**Scene 使用经验**：

```typescript
// Scene 使用经验记录
{
  id: 'exp-scene-coding-001',
  name: 'Coding Scene 大型项目配置建议',
  target: 'scene',
  targetId: 'coding',
  type: 'success',
  category: 'configuration',
  content: {
    problem: 'Coding Scene 在处理大型项目时经常超时',
    solution: '增加 maxIterations 到 15，启用 context compact 策略',
    configExample: {
      maxIterations: 15,
      contextCompact: 'summarize'
    },
    bestPractices: [
      '项目文件超过 1000 个时启用 compact',
      '使用 .gitignore 排除 node_modules',
      '定期清理过期经验'
    ]
  },
  tags: ['scene', 'coding', 'performance', 'large-project'],
  confidence: 0.95,
  effectiveness: 0.92,
  frequency: 47,
  source: { type: 'ai_generated' }
}
```

**Tool 安装经验**：

```typescript
// Tool 安装经验记录
{
  id: 'exp-tool-lsp-001',
  name: 'TypeScript LSP 安装注意事项',
  target: 'tool',
  targetId: 'lsp_definition',
  type: 'pattern',
  category: 'installation',
  content: {
    problem: 'typescript-language-server 无法启动',
    solution: '需要全局安装 typescript-language-server',
    installCommand: 'npm install -g typescript-language-server',
    installNotes: '确保 PATH 中包含全局 npm 目录',
    prerequisites: ['Node.js >= 18', 'npm >= 9'],
    conflicts: ['vscode 内置 LSP 可能冲突']
  },
  tags: ['tool', 'lsp', 'typescript', 'installation'],
  confidence: 0.98,
  effectiveness: 0.99,
  frequency: 123,
  source: { type: 'community_contributed', userId: 'user-123' }
}
```

**Workflow 使用经验**：

```typescript
// Workflow 使用经验记录
{
  id: 'exp-workflow-review-001',
  name: 'Code Review Workflow 最佳实践',
  target: 'workflow',
  targetId: 'code-review-workflow',
  type: 'success',
  category: 'usage',
  content: {
    problem: '如何最大化 code-review workflow 的效果',
    solution: '在 CI/CD pipeline 中作为前置检查，配合团队 code review 流程',
    usageExample: '在 PR 创建时自动触发，合并前必须通过',
    bestPractices: [
      '配置严格的 lint 规则',
      '要求测试覆盖率 >= 80%',
      '启用自动格式化修复'
    ],
    optimizationTip: '使用 --fix 参数自动修复可修复的问题'
  },
  tags: ['workflow', 'code-review', 'best-practice', 'ci-cd'],
  confidence: 0.92,
  effectiveness: 0.88,
  frequency: 89,
  source: { type: 'user_reported', userId: 'team-lead' }
}
```

**Skill 故障排除经验**：

```typescript
// Skill 故障排除经验
{
  id: 'exp-skill-refactor-001',
  name: 'Refactor Skill 在 Vue 项目中的兼容问题',
  target: 'skill',
  targetId: 'refactor',
  type: 'failure',
  category: 'troubleshooting',
  content: {
    problem: 'refactor skill 在 Vue 3 组合式 API 中识别失败',
    errorPattern: 'Cannot detect component structure in Vue 3 Composition API',
    errorSolution: '使用 LSP 提供的语义信息，或添加 Vue 3 特定的识别规则',
    codeExample: `// 添加 Vue 3 配置\n{\n  "vue": {\n    "mode": "composition"\n  }\n}`,
    keyPoints: ['Vue 2 和 Vue 3 结构不同', '需要配置检测模式'],
    caveats: ['Options API 暂时只支持部分重构']
  },
  tags: ['skill', 'refactor', 'vue', 'troubleshooting'],
  confidence: 0.85,
  effectiveness: 0.78,
  frequency: 23,
  source: { type: 'ai_generated', sessionId: 'session-456' }
}
```

### 8.3 Experience 管理器

```typescript
// packages/experience/src/manager.ts
export class ExperienceManager {
  constructor(private storage: ExperienceStorage) {}

  /**
   * 记录经验
   */
  async record(experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>): Promise<Experience> {
    const newExperience: Experience = {
      ...experience,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.storage.save(newExperience);
    return newExperience;
  }

  /**
   * 记录批量经验（如安装日志）
   */
  async recordBatch(batch: ExperienceBatch): Promise<void> {
    for (const exp of batch.experiences) {
      await this.record({
        ...exp,
        target: batch.target,
        targetId: batch.targetId
      });
    }
  }

  /**
   * 检索相关经验
   */
  async search(query: ExperienceQuery): Promise<Experience[]> {
    const experiences = await this.storage.findByTarget(query.target, query.targetId);

    // 按相关性、有效性、频率排序
    return experiences
      .filter(exp => this.matchQuery(exp, query))
      .sort((a, b) => {
        const scoreA = a.relevance(query.text) * a.effectiveness! * (1 + a.frequency * 0.01);
        const scoreB = b.relevance(query.text) * b.effectiveness! * (1 + b.frequency * 0.01);
        return scoreB - scoreA;
      })
      .slice(0, query.limit || 10);
  }

  /**
   * 获取经验统计
   */
  async getStats(target: ExperienceTarget, targetId: string): Promise<ExperienceStats> {
    const experiences = await this.storage.findByTarget(target, targetId);

    const byType = {
      success: experiences.filter(e => e.type === 'success').length,
      failure: experiences.filter(e => e.type === 'failure').length,
      pattern: experiences.filter(e => e.type === 'pattern').length,
      'anti-pattern': experiences.filter(e => e.type === 'anti-pattern').length
    };

    const byCategory: Record<string, number> = {};
    for (const exp of experiences) {
      byCategory[exp.category] = (byCategory[exp.category] || 0) + 1;
    }

    const averageEffectiveness = experiences.reduce((sum, e) => sum + (e.effectiveness || 0), 0) / experiences.length;
    const mostUsed = experiences.sort((a, b) => b.frequency - a.frequency).slice(0, 5);

    return {
      target,
      targetId,
      totalExperiences: experiences.length,
      byType,
      byCategory,
      averageEffectiveness,
      mostUsed
    };
  }

  /**
   * 更新经验有效性
   */
  async updateEffectiveness(id: string, feedback: 'positive' | 'negative'): Promise<void> {
    const experience = await this.storage.findById(id);
    if (!experience) return;

    // 更新有效性评分
    const alpha = 0.3; // 学习率
    experience.effectiveness = experience.effectiveness || 0.5;
    experience.effectiveness += alpha * (feedback === 'positive' ? 1 : -1) * 0.1;
    experience.effectiveness = Math.max(0, Math.min(1, experience.effectiveness));

    experience.frequency += 1;
    experience.lastUsedAt = new Date();

    await this.storage.save(experience);
  }
}
```

### 8.4 Experience 检索策略

```typescript
// packages/experience/src/retrieval.ts
export interface ExperienceQuery {
  target: ExperienceTarget;
  targetId?: string;
  text: string;
  category?: string;
  type?: ExperienceType;
  limit?: number;
}

export class ExperienceRetrieval {
  /**
   * 混合检索策略
   */
  async search(query: ExperienceQuery): Promise<Experience[]> {
    // 1. 精确匹配（Target + Category + Type）
    const exactMatches = await this.exactMatch(query);

    // 2. 关键词匹配（Tags + Content）
    const keywordMatches = await this.keywordMatch(query);

    // 3. 语义匹配（可选，需要向量数据库）
    const semanticMatches = await this.semanticMatch(query);

    // 合并去重并排序
    return this.mergeAndRank(exactMatches, keywordMatches, semanticMatches, query.limit);
  }

  /**
   * 上下文感知检索
   */
  async searchWithContext(query: string, context: {
    currentTarget?: ExperienceTarget;
    currentTargetId?: string;
    recentActions?: string[];
  }): Promise<Experience[]> {
    // 根据当前上下文优先检索相关经验
    const experienceQuery: ExperienceQuery = {
      target: context.currentTarget || 'skill',
      targetId: context.currentTargetId,
      text: query,
      limit: 5
    };

    return this.search(experienceQuery);
  }
}
```

---

## 九、Coding Scene 设计

### 9.1 Scene 定义

```json
// .tramber/scenes/coding.json
{
  "$schema": "https://tramber.dev/schema/scene.json",
  "id": "coding",
  "name": "Coding Scene",
  "description": "软件开发场景，包括代码编写、调试、重构、测试",
  "category": "coding",
  "workflow": "coding-workflow",
  "config": {
    "systemPrompt": "You are an expert programming assistant. Help users write, debug, refactor, and test code efficiently.",
    "defaultProvider": "anthropic",
    "defaultModel": "claude-3-5-sonnet-20241022",
    "recommendedClients": ["cli", "web"],
    "maxIterations": 10,
    "enableCheckpoint": true
  }
}
```

### 9.2 Coding 内置工具

```typescript
// packages/tool/src/builtin/coding-tools.ts
export const codingTools: Tool[] = [
  // 文件操作
  { id: 'read_file', name: 'read_file', description: 'Read file contents', category: 'file' },
  { id: 'write_file', name: 'write_file', description: 'Write content to file', category: 'file' },
  { id: 'edit_file', name: 'edit_file', description: 'Edit file with exact string replacement', category: 'file' },

  // 搜索工具
  { id: 'glob', name: 'glob', description: 'Find files by pattern', category: 'search' },
  { id: 'grep', name: 'grep', description: 'Search content in files', category: 'search' },

  // 执行工具
  { id: 'bash', name: 'bash', description: 'Execute bash command', category: 'execution' },

  // Git 工具
  { id: 'git_commit', name: 'git_commit', description: 'Create git commit', category: 'git' },
  { id: 'git_push', name: 'git_push', description: 'Push to remote', category: 'git' },

  // LSP 工具
  { id: 'lsp_definition', name: 'lsp_definition', description: 'Go to definition', category: 'lsp' },
  { id: 'lsp_references', name: 'lsp_references', description: 'Find references', category: 'lsp' },
  { id: 'lsp_rename', name: 'lsp_rename', description: 'Rename symbol', category: 'lsp' }
];
```

### 9.3 Coding Workflow

```json
// .tramber/workflows/coding-workflow.json
{
  "$schema": "https://tramber.dev/schema/workflow.json",
  "id": "coding-workflow",
  "name": "Coding Workflow",
  "description": "通用的软件开发工作流",
  "steps": [
    { "type": "routine", "routineId": "read-understand", "name": "读取并理解代码" },
    { "type": "skill", "skillId": "analyze-requirements", "name": "分析需求" },
    { "type": "skill", "skillId": "implement-changes", "name": "实现修改" },
    { "type": "routine", "routineId": "lint-fix", "name": "代码检查" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" }
  ]
}
```

### 9.4 专用 Workflow 示例

**Code Review Workflow:**
```json
{
  "id": "code-review-workflow",
  "name": "Code Review Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand", "name": "读取并理解" },
    { "type": "skill", "skillId": "analyze-code-quality", "name": "分析代码质量" },
    { "type": "skill", "skillId": "suggest-improvements", "name": "建议改进" },
    { "type": "routine", "routineId": "apply-formatting", "name": "应用格式化" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" }
  ]
}
```

**Bug Fix Workflow:**
```json
{
  "id": "bug-fix-workflow",
  "name": "Bug Fix Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand", "name": "读取并理解" },
    { "type": "skill", "skillId": "analyze-error", "name": "分析错误" },
    { "type": "skill", "skillId": "fix-bug", "name": "修复 Bug" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" },
    { "type": "routine", "routineId": "verify-fix", "name": "验证修复" }
  ]
}
```

**Refactor Workflow:**
```json
{
  "id": "refactor-workflow",
  "name": "Refactor Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand", "name": "读取并理解" },
    { "type": "skill", "skillId": "analyze-structure", "name": "分析结构" },
    { "type": "skill", "skillId": "design-refactor", "name": "设计重构" },
    { "type": "skill", "skillId": "implement-refactor", "name": "实现重构" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" },
    { "type": "routine", "routineId": "verify-refactor", "name": "验证重构" }
  ]
}
```

**TDD Workflow:**
```json
{
  "id": "tdd-workflow",
  "name": "TDD Workflow",
  "steps": [
    { "type": "skill", "skillId": "write-test", "name": "编写测试" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" },
    { "type": "skill", "skillId": "implement-feature", "name": "实现功能" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" },
    { "type": "routine", "routineId": "refactor", "name": "重构" }
  ]
}
```

### 9.5 Skill 与 Routine 示例

**Skill 示例 - async-error-fix:**

```markdown
// .tramber/skills/async-error-fix/SKILL.md
---
name: async-error-fix
description: 修复异步代码中的错误
tools: [read_file, edit_file, grep, bash]
---

## Skill: 修复异步错误

当用户遇到异步代码错误时，使用此技能修复。

### 常见异步错误模式

1. **未 await Promise**
   ```typescript
   // 错误
   function foo() {
       getData(); // 未 await
   }

   // 正确
   async function foo() {
       await getData();
   }
   ```

2. **未处理 Promise rejection**
   ```typescript
   // 错误
   async function foo() {
       throw new Error('fail');
   }
   foo(); // 未 catch

   // 正确
   foo().catch(console.error);
   ```

3. **混用 async/await 和 Promise chain**
   ```typescript
   // 避免
   async function foo() {
       return getData().then(data => processData(data));
   }

   // 推荐
   async function foo() {
       const data = await getData();
       return processData(data);
   }
   ```

### 修复步骤

1. 读取报错的文件
2. 使用 grep 搜索 `async function` 和 `.then(`
3. 检查 async 函数内是否所有 Promise 都被 await
4. 添加缺失的 await 或 try-catch
5. 运行测试验证修复
```

**Routine 沉淀 - async-error-fix:**

```json
// .tramber/routines/async-error-fix.json
{
  "id": "async-error-fix",
  "name": "Async Error Fix Routine",
  "derivedFrom": "async-error-fix",
  "description": "快速修复常见异步代码错误",
  "condition": {
    "trigger": {
      "patterns": ["async error", "promise rejection", "unhandled promise", "await missing"],
      "fileType": ["ts", "tsx", "js", "jsx"]
    }
  },
  "steps": [
    {
      "toolId": "grep",
      "action": "search",
      "parameters": { "pattern": "async function", "glob": "**/*.{ts,tsx,js,jsx}" }
    },
    {
      "toolId": "read_file",
      "action": "read",
      "parameters": { "path": "${errorFile}" }
    },
    {
      "toolId": "edit_file",
      "action": "fix-async",
      "parameters": {
        "path": "${errorFile}",
        "fixes": ["add-missing-await", "add-try-catch", "convert-promise-chain-to-async-await"]
      }
    },
    {
      "toolId": "bash",
      "action": "test",
      "parameters": { "command": "npm test" }
    }
  ],
  "stats": {
    "totalExecutions": 127,
    "successCount": 118,
    "successRate": 0.93
  }
}
```

### 9.6 LSP 集成

```typescript
// packages/lsp/src/pool.ts
export class LSPConnectionPool {
  private connections = new Map<string, LanguageClient>();

  async getForFile(filePath: string): Promise<LanguageClient> {
    const ext = path.extname(filePath);
    const language = this.getLanguage(ext);

    if (this.connections.has(language)) {
      return this.connections.get(language)!;
    }

    // Start LSP server for language
    const config = LSP_CONFIGS[language];
    const client = await this.startServer(config);

    this.connections.set(language, client);
    return client;
  }

  private async startServer(config: LSPServerConfig): Promise<LanguageClient> {
    const server = spawn(config.command, config.args);
    const client = new LanguageClient({
      stdio: server.stdin
    });

    await client.onReady();
    return client;
  }
}

const LSP_CONFIGS = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pyright-langserver', args: ['--stdio'] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: ['serve'] }
};
```

### 9.7 Checkpoint 集成

```typescript
// packages/checkpoint/src/manager.ts
export class CheckpointManager {
  async snapshotBeforeEdit(filePath: string): Promise<string> {
    const content = await readFile(filePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    // Content-addressed storage
    if (this.hasSnapshot(hash)) {
      return hash;
    }

    const snapshot = {
      id: hash,
      filePath,
      timestamp: Date.now(),
      content
    };

    await this.store(snapshot);
    return hash;
  }

  async rollback(filePath: string, snapshotId: string): Promise<void> {
    const snapshot = await this.load(snapshotId);
    await writeFile(filePath, snapshot.content, 'utf-8');
  }
}
```

---

## 十、插件系统

### 10.1 插件接口

```typescript
// packages/plugin/core/src/types.ts
export interface TramberPlugin {
  id: string;
  name: string;
  version: string;

  tools?: Tool[];
  skills?: Skill[];
  routines?: Routine[];
  workflows?: Workflow[];
  scenes?: Scene[];

  initialize?(context: PluginContext): Promise<void>;
  cleanup?(): Promise<void>;
}

export interface PluginContext {
  registerTool(tool: Tool): void;
  registerSkill(skill: Skill): void;
  registerRoutine(routine: Routine): void;
  registerWorkflow(workflow: Workflow): void;
  registerScene(scene: Scene): void;
}
```

### 10.2 内置插件

| 插件 | 提供的功能 |
|------|-----------|
| **plugin-builtin-media** | understand_image, transcribe_audio, generate_speech |
| **plugin-builtin-browser** | browser_goto, browser_click, browser_extract |
| **plugin-builtin-git** | git_commit, git_push, git_branch |
| **plugin-builtin-lsp** | lsp_definition, lsp_references, lsp_rename |

### 10.3 插件示例

```typescript
// packages/plugin/builtin/media/src/index.ts
export const mediaPlugin: TramberPlugin = {
  id: 'builtin-media',
  name: 'Media Plugin',
  version: '1.0.0',

  tools: [
    {
      id: 'understand_image',
      name: 'understand_image',
      description: 'Understand image content with vision model',
      category: 'media',
      inputSchema: {
        type: 'object',
        properties: {
          imagePath: { type: 'string', description: 'Path to image file' }
        },
        required: ['imagePath']
      },
      execute: async ({ imagePath }) => {
        // 实现图像理解逻辑
        return { description: 'Image content description' };
      }
    }
  ],

  async initialize(context: PluginContext) {
    // 注册所有工具
    this.tools!.forEach(tool => context.registerTool(tool));
  }
};
```

---

## 十一、客户端架构

### 11.1 客户端 SDK

```typescript
// packages/sdk/src/client.ts
export interface TramberClient {
  connect(config: ClientConfig): Promise<void>;

  selectScene(sceneId: string): void;

  execute(type: 'workflow' | 'skill' | 'routine', id: string, input: unknown): Promise<ExecuteResult>;

  chat(message: string): AsyncIterable<ChatResponse>;

  on(event: ClientEvent, handler: (data: unknown) => void): void;

  disconnect(): Promise<void>;
}

export interface ClientConfig {
  serverUrl: string;
  apiKey?: string;
  clientType: 'cli' | 'web' | 'telegram' | 'discord' | 'slack';
}

export type ClientEvent = 'connected' | 'disconnected' | 'message' | 'error' | 'scene_changed';
```

### 11.2 CLI 客户端

```bash
# CLI 交互示例
$ tramber

Welcome to Tramber v1.0.0

Available Scenes:
  1. coding    - 软件开发场景
  2. drawing   - 绘图场景
  3. video     - 视频场景
  4. writing   - 写作场景

Select scene [1-4]: 1

[Scene: coding] Connected via CLI Client

# 执行 Workflow
[Scene: coding] You: /workflow code-review

Executing workflow: code-review

Step 1/5: [Routine: read-understand] ✓
Step 2/5: [Skill: analyze-code-quality] ✓
Step 3/5: [Skill: suggest-improvements] ✓
Step 4/5: [Routine: apply-formatting] ✓
Step 5/5: [Tool: bash:test] ✓

Workflow completed ✅
New experience recorded: 'code-review-patterns'

# 执行 Routine
[Scene: coding] You: 修复 async 错误

Matching routine: async-error-fix (success rate: 93%)
Executing routine: async-error-fix
  Step 1/3: grep ✓
  Step 2/3: read_file ✓
  Step 3/3: edit_file ✓
  Step 4/4: run_test ✓
Completed in 2.3s ✅
```

### 11.3 消息客户端

**Telegram Bot:**

```typescript
// packages/client/telegram/src/bot.ts
export class TelegramBot {
  private client: TramberClient;
  private bot: TelegramBotClient;

  constructor(private config: TelegramBotConfig) {}

  async start(): Promise<void> {
    // 初始化 Tramber Client
    this.client = createClient({
      serverUrl: config.serverUrl,
      apiKey: config.apiKey,
      clientType: 'telegram'
    });

    await this.client.connect({});
    await this.client.selectScene(config.defaultScene || 'coding');

    // 启动 Telegram Bot
    this.bot = new TelegramBotClient(config.token);
    this.bot.on('message', async (msg) => {
      await this.handleMessage(msg);
    });

    this.bot.start();
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    // 转发消息到 Tramber Server
    for await (const response of this.client.chat(msg.text)) {
      await this.bot.sendMessage(msg.chat.id, response.content);
    }
  }
}
```

**Discord Bot:**

```typescript
// packages/client/discord/src/bot.ts
export class DiscordBot {
  private client: TramberClient;
  private bot: DiscordClient;

  async start(): Promise<void> {
    this.client = createClient({
      serverUrl: this.config.serverUrl,
      apiKey: this.config.apiKey,
      clientType: 'discord'
    });

    await this.client.connect({});
    await this.client.selectScene('coding');

    this.bot = new DiscordClient({
      intents: GatewayIntentBits.GuildMessages | GatewayIntentBits.MessageContent
    });

    this.bot.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      await this.handleMessage(message);
    });

    await this.bot.login(this.config.token);
  }
}
```

### 11.4 跨平台访问

```bash
# CLI Client
$ tramber --scene coding

# Web Client
# http://localhost:3000

# Telegram
@tramber_bot /scene coding
@tramber_bot 修复 async 错误

# Discord
/tramber scene coding
/tramber 修复 async 错误

# Slack
/tramber scene coding
/tramber 修复 async 错误
```

---

## 十二、配置文件

### 12.1 全局配置

```json
// .tramber/settings.json
{
  "$schema": "https://tramber.dev/schema/settings.json",
  "server": {
    "host": "localhost",
    "port": 3000
  },
  "apiKey": "${ANTHROPIC_API_KEY}",
  "defaultProvider": "anthropic",
  "defaultModel": "claude-3-5-sonnet-20241022",
  "scenes": {
    "default": "coding",
    "available": ["coding", "drawing", "video", "writing"]
  },
  "routine": {
    "autoCreate": true,
    "minSuccessRate": 0.8,
    "minExecutions": 3,
    "minSuccessCount": 3
  },
  "plugins": {
    "builtin": ["media", "browser", "git", "lsp"],
    "community": []
  },
  "checkpoint": {
    "enabled": true,
    "maxSnapshots": 100
  }
}
```

### 12.2 Scene 配置

详见 [第八章 8.1 Scene 定义](#81-scene-定义)。

### 12.3 Workflow 配置

详见 [第八章 8.3 Coding Workflow](#83-coding-workflow)。

---

## 十三、实现路线

### 13.1 Phase 1: 核心 MVP

| 任务 | 状态 | 说明 |
|------|------|------|
| Core: Scene/Workflow/Skill/Routine/Tool | ⬜ | 核心系统实现 |
| Core: Agent 执行引擎 | ⬜ | Agentic Loop 实现 |
| Core: Experience 系统 | ⬜ | 经验记录和检索 |
| Client: CLI Client | ⬜ | 命令行客户端 |

### 13.2 Phase 2: 客户端扩展

| 任务 | 状态 | 说明 |
|------|------|------|
| Client: Web Client | ⬜ | Web 界面 |
| Client: Telegram Bot | ⬜ | Telegram 集成 |
| Client: Discord Bot | ⬜ | Discord 集成 |
| Client: Slack Bot | ⬜ | Slack 集成 |

### 13.3 Phase 3: 插件系统

| 任务 | 状态 | 说明 |
|------|------|------|
| Plugin: 框架 | ⬜ | 插件加载机制 |
| Plugin: Builtin (media) | ⬜ | 媒体处理插件 |
| Plugin: Builtin (browser) | ⬜ | 浏览器自动化插件 |
| Plugin: Builtin (git) | ⬜ | Git 工具插件 |
| Plugin: Builtin (lsp) | ⬜ | LSP 集成插件 |
| Plugin: Community 支持 | ⬜ | 社区插件生态 |

### 13.4 Phase 4: 更多 Scene

| 任务 | 状态 | 说明 |
|------|------|------|
| Scene: Drawing Scene | ⬜ | 图像生成场景 |
| Scene: Video Scene | ⬜ | 视频制作场景 |
| Scene: Writing Scene | ⬜ | 内容创作场景 |

---

## 十四、总结

### 14.1 设计精髓

```
第一次: AI 慢速理解 → 成功 → 沉淀 Routine
以后: 直接执行 Routine → 快速完成 ✅

越用越快，越用越智能
```

### 14.2 核心架构图

```
Workflow (灵活) → 验证稳定 → Scene (固化)
     ↓                            ↓
  可编辑                       一键执行
  可组合                       开箱即用
```

### 14.3 技术选型总结

| 层次 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js 20+ LTS | 稳定版本 |
| **包管理** | pnpm workspaces | 高效 monorepo |
| **语言** | TypeScript 5.8+ | 类型安全 |
| **构建** | tsup + esbuild | 快速构建 |
| **后端服务** | Fastify | Web 服务器 |
| **前端框架** | Vue 3.4+ | Composition API |
| **前端构建** | Vite 5+ | 快速 HMR |
| **前端 UI** | Element Plus / Naive UI | 组件库 |
| **前端状态** | Pinia | 状态管理 |
| **AI SDK** | Vercel AI SDK | 统一 AI 接口 |
| **存储** | 文件系统 | 可扩展为 SQLite |
| **LSP** | vscode-languageserver-node | LSP 协议 |

### 14.4 技术选型说明

**Vue 3 + Vite 选择理由**：

| 优势 | 说明 |
|------|------|
| **渐进式框架** | 可以逐步集成，不需要重写 |
| **Composition API** | 更好的 TypeScript 支持 |
| **Vite HMR** | 极快的开发体验 |
| **生态丰富** | Element Plus、Naive UI 等成熟组件库 |
| **轻量高效** | 打包体积小，运行性能好 |

**前端技术栈**：

```
packages/client/web/
├── src/
│   ├── App.vue                    # 根组件
│   ├── main.ts                    # 入口
│   ├── components/               # 组件
│   │   ├── Chat/
│   │   │   ├── ChatView.vue      # 聊天视图
│   │   │   ├── MessageList.vue   # 消息列表
│   │   │   ├── MessageInput.vue  # 输入框
│   │   │   └── ToolCallView.vue  # 工具调用展示
│   │   ├── Sidebar/
│   │   │   ├── SessionList.vue   # 会话列表
│   │   │   └── FileTree.vue      # 文件树
│   │   └── Status/
│   │       ├── StatusBar.vue     # 状态栏
│   │       └── ContextMeter.vue  # 上下文计数
│   ├── composables/              # Composables
│   │   ├── useWebSocket.ts       # WebSocket 连接
│   │   ├── useSession.ts         # 会话管理
│   │   └── usePermission.ts      # 权限控制
│   ├── stores/                   # Pinia Stores
│   │   ├── chat.ts               # 聊天状态
│   │   ├── settings.ts           # 设置状态
│   │   └── ui.ts                 # UI 状态
│   ├── lib/
│   │   └── client.ts             # TramberClient
│   └── assets/                   # 静态资源
├── public/
├── index.html
├── vite.config.ts
└── package.json
```

**Vite 配置示例**：

```typescript
// packages/client/web/vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@tramber/shared': resolve(__dirname, '../../../shared/src'),
      '@tramber/sdk': resolve(__dirname, '../../../sdk/src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
});
```

---

## 十五、技术栈详解

### 15.1 各包技术栈

**核心引擎包**：

| 包 | 主要依赖 | 说明 |
|------|---------|------|
| `@tramber/core` | @ai-sdk/anthropic, eventemitter3 | Agent Loop 核心 |
| `@tramber/scene` | @tramber/shared, @tramber/workflow | Scene 管理 |
| `@tramber/workflow` | @tramber/shared, @tramber/skill, @tramber/routine | Workflow 执行 |
| `@tramber/skill` | @tramber/shared, @tramber/tool, @tramber/experience | Skill 执行器 |
| `@tramber/routine` | @tramber/shared, @tramber/tool | Routine 管理器 |
| `@tramber/tool` | @tramber/shared, fast-glob, fast-glob | Tool 系统 |
| `@tramber/experience` | @tramber/shared | Experience 存储 |
| `@tramber/provider` | @ai-sdk/anthropic, @ai-sdk/openai | AI Provider |
| `@tramber/checkpoint` | @tramber/shared | 快照系统 |
| `@tramber/lsp` | vscode-languageserver-node | LSP 集成 |

**客户端包**：

| 包 | 主要依赖 | 说明 |
|------|---------|------|
| `@tramber/sdk` | @tramber/shared, eventemitter3 | 客户端 SDK |
| `@tramber/client/cli` | @tramber/sdk, ink, cli-highlight | CLI 客户端 |
| `@tramber/client/web` | @tramber/sdk, vue, vite, element-plus | Web 客户端 |
| `@tramber/client/telegram` | @tramber/sdk, grammy | Telegram Bot |
| `@tramber/client/discord` | @tramber/sdk, discord.js | Discord Bot |

**插件包**：

| 包 | 主要依赖 | 说明 |
|------|---------|------|
| `@tramber/plugin/core` | @trammer/shared | 插件加载器 |
| `@tramber/plugin/builtin/media` | @tramber/plugin/core | 媒体处理 |
| `@tramber/plugin/builtin/browser` | puppeteer | 浏览器自动化 |
| `@tramber/plugin/builtin/git` | simple-git | Git 工具 |
| `@tramber/plugin/builtin/lsp` | @tramber/lsp | LSP 增强 |

**共享包**：

| 包 | 主要依赖 | 说明 |
|------|---------|------|
| `@tramber/shared` | zod, crypto | 共享类型和工具 |

### 15.2 包依赖关系总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tramber 包依赖关系                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐                                                            │
│   │   shared    │ ◄─────────────────────────────────────────────────────┐   │
│   └─────────────┘                                                          │
│         │                                                                    │
│         ├──► ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│         │    │    core     │   │    tool     │   │  provider   │           │
│         │    └─────────────┘   └─────────────┘   └─────────────┘           │
│         │           │                  │                  │                 │
│         │           ├──► ┌─────────────┐   ┌─────────────┐   ┌───────────┐  │
│         │           │    │  routine    │   │   skill     │   │ experience│  │
│         │           │    └─────────────┘   └─────────────┘   └───────────┘  │
│         │           │          │                  │               │         │
│         │           └───────────┼──────────────────┼───────────────┘         │
│         │                       │                  │                         │
│         │           ┌───────────▼──────────────────▼───────────────┐       │
│         │           │              workflow                             │       │
│         │           └───────────────────────────────────────────────┘       │
│         │                              │                                 │       │
│         │           ┌───────────────────┴─────────────┐               │       │
│         │           │                                │               │       │
│         │           ▼                                ▼               │       │
│         │    ┌─────────────┐                  ┌─────────────┐         │       │
│         │    │    scene    │                  │    sdk      │         │       │
│         │    └─────────────┘                  └─────────────┘         │       │
│         │                                                              │       │
│         ├──► ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │
│         │    │  cli client │   │   web client│   │   plugins   │         │
│         │    └─────────────┘   └─────────────┘   └─────────────┘         │
│         │                                                                      │
│         └──► ┌─────────────┐   ┌─────────────┐                                  │
│              │ checkpoint  │   │    lsp      │                                  │
│              └─────────────┘   └─────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 开发工具配置

**根 package.json**：

```json
{
  "name": "tramber",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r --filter './packages/**' build",
    "dev": "pnpm --filter './packages/client/web' dev",
    "cli": "pnpm --filter './packages/client/cli' start",
    "serve": "pnpm --filter './packages/server' start",
    "typecheck": "pnpm -r --filter './packages/**' typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "clean": "pnpm -r clean",
    "test": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@vitejs/plugin-vue": "^5.0.3",
    "eslint": "^8.56.0",
    "prettier": "^3.2.4",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.12",
    "vitest": "^1.2.1",
    "vue": "^3.4.19"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

**pnpm-workspace.yaml**：

```yaml
packages:
  - 'packages/*'
  - 'packages/client/*'
  - 'packages/plugin/*'
```

**tsconfig.base.json**：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@tramber/shared": ["./packages/shared/src"],
      "@tramber/shared/*": ["./packages/shared/src/*"],
      "@tramber/core": ["./packages/core/src"],
      "@tramber/core/*": ["./packages/core/src/*"],
      "@tramber/scene": ["./packages/scene/src"],
      "@tramber/scene/*": ["./packages/scene/src/*"],
      "@tramber/workflow": ["./packages/workflow/src"],
      "@tramber/workflow/*": ["./packages/workflow/src/*"],
      "@tramber/skill": ["./packages/skill/src"],
      "@tramber/skill/*": ["./packages/skill/src/*"],
      "@tramber/routine": ["./packages/routine/src"],
      "@tramber/routine/*": ["./packages/routine/src/*"],
      "@tramber/tool": ["./packages/tool/src"],
      "@tramber/tool/*": ["./packages/tool/src/*"],
      "@tramber/experience": ["./packages/experience/src"],
      "@tramber/experience/*": ["./packages/experience/src/*"],
      "@tramber/provider": ["./packages/provider/src"],
      "@tramber/provider/*": ["./packages/provider/src/*"],
      "@tramber/sdk": ["./packages/sdk/src"],
      "@tramber/sdk/*": ["./packages/sdk/src/*"]
    }
  },
  "exclude": ["node_modules", "dist", "**/*.dist.ts"]
}
```

### 15.4 构建配置

**tsup.config.ts** (通用构建配置)：

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  minify: false,
  splitting: false,
  external: ['@tramber/*']
});
```

---

## 十六、包数量总结

### MVP 包数量：9 个

### 核心引擎 (4)
- `@tramber/core` - Agent Loop 核心
- `@tramber/tool` - 工具系统
- `@tramber/provider` - AI Provider
- `@tramber/experience` - Experience 存储

### 执行单元 (3)
- `@tramber/scene` - Scene 系统
- `@tramber/skill` - Skill 执行器
- `@tramber/routine` - Routine 管理器

### 客户端 (2)
- `@tramber/sdk` - 客户端 SDK
- `@tramber/client/cli` - CLI 客户端

### 共享 (1)
- `@tramber/shared` - 共享类型和工具

### 完整版包数量：16 个 (+7)

### 支撑系统 (3)
- `@tramber/checkpoint` - 快照回滚
- `@tramber/lsp` - LSP 集成
- `@tramber/workflow` - Workflow 系统

### 客户端扩展 (3)
- `@tramber/client/web` - Vue 3 + Vite Web 客户端
- `@tramber/client/telegram` - Telegram Bot
- `@tramber/client/discord` - Discord Bot

### 插件系统 (1)
- `@tramber/plugin/core` - 插件加载器

---

*文档生成时间: 2026-03-23*
