# Tramber - 架构设计方案

> **Tramber** = **Tree** + **Amber**
>
> 寓意：如琥珀保存古生物般，将 AI 交互中的知识、经验、规范沉淀下来，形成可复用的智能资产

---

## 一、核心理念

### 1.1 概念层级

```
┌─────────────────────────────────────────────────────────────┐
│                    Scene (场景)                           │
│              固化的工作流模板                                │
│        (Coding / Drawing / Video / Writing ...)              │
└────────────────────────┬────────────────────────────────────┘
                         │ 由组成
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Workflow (工作流)                           │
│              可组合的执行步骤序列                             │
└────────────────────────┬────────────────────────────────────┘
                         │ 由组成
        ┌────────────────┼────────────────┐
        │                │                │
        ↓                ↓                ↓
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

### 1.2 概念定义

| 概念 | 定义 | 示例 |
|------|------|------|
| **Scene** | 固化的工作流模板 | Coding Scene、Drawing Scene、Video Scene |
| **Workflow** | 可组合的执行步骤序列 | 代码审查、部署流程 |
| **Skill** | 需要 AI 理解和执行的技能 | 修复 bug、代码重构 |
| **Routine** | Skill 固化后的工具（直接执行） | async-error-fix |
| **Tool** | 内置的原子工具 | read_file、bash |
| **Experience** | Skill 执行的经验记录（辅助参考） | async-error-handling |

### 1.3 与其他项目对比

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

### 1.4 Tramber 独有优势

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

### 1.5 Scene 演进机制

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

**演进路径：**

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

### 1.6 Scene 扩展方式

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

### 1.7 Scene 配置结构

```typescript
// packages/core/src/scene/types.ts
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

### 1.8 Scene 固化条件

```typescript
// packages/core/src/scene/manager.ts
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

### 1.9 动态 Scene 创建示例

```typescript
// packages/core/src/scene/dynamic.ts
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

  /**
   * AI 分析用户需求
   */
  private async analyzePrompt(prompt: string, context: ProjectContext) {
    const response = await this.aiProvider.chat({
      messages: [
        {
          role: 'system',
          content: `分析用户需求，确定：
1. 任务类型（coding/drawing/video/writing/custom）
2. 需要的工具
3. 执行步骤
4. 推荐的 AI 模型`
        },
        {
          role: 'user',
          content: `用户需求: ${prompt}\n项目上下文: ${JSON.stringify(context)}`
        }
      ],
      tools: [],  // 不需要工具，只是分析
      responseFormat: { type: 'json_object' }
    });

    return JSON.parse(response.content);
  }
}
```

### 1.10 Scene 分类

**按来源分类：**

| 类型 | 说明 | 示例 | 可分享 |
|------|------|------|--------|
| **内置 Scene** | 官方提供的固化场景 | Coding Scene, Drawing Scene | ✅ |
| **插件 Scene** | 插件提供的场景 | @plugin/3d-model-scene | ✅ |
| **命名 Scene** | 从动态 Scene 固化而来 | my-bug-fix-workflow | ✅ |
| **动态 Scene** | AI 动态创建的临时场景 | Dynamic: 帮我修复这个 bug | ❌ |

**按功能分类：**

| Scene | 说明 | 内置/插件 |
|-------|------|-----------|
| **Coding** | 软件开发 (代码审查、bug 修复、重构、测试) | 内置 |
| **Drawing** | 绘图 (图像生成、编辑、风格转换) | 内置 |
| **Video** | 视频 (视频生成、剪辑、特效) | 内置 |
| **Writing** | 写作 (文章生成、编辑、翻译) | 内置 |
| **3D Model** | 3D 模型 (创建、编辑、渲染) | 插件 |
| **Data Analysis** | 数据分析 (可视化、报表) | 插件 |

```
Workflow (灵活) → 验证稳定 → Scene (固化)
     ↓                            ↓
  可编辑                       一键执行
  可组合                       开箱即用
```

### 1.11 Client 与 Scene 正交

```
                    Tramber Server
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ↓                ↓                ↓
   ┌─────────┐      ┌─────────┐     ┌──────────┐
   │CLI Client│      │Web Client│     │Message   │
   │(命令行)   │      │(浏览器)   │     │Clients    │
   └─────────┘      └─────────┘     └──────────┘
                                          │
                        ┌───────────────┼───────────────┐
                        ↓               ↓               ↓
                    ┌─────────┐    ┌─────────┐    ┌─────────┐
                    │Telegram │    │Discord  │    │ Slack   │
                    └─────────┘    └─────────┘    └─────────┘

任何 Client 都可以访问任何 Scene
```

### 1.5 Routine vs Experience

| 维度 | Routine | Experience |
|------|---------|------------|
| **来源** | Skill 成功后沉淀 | Skill 执行过程记录 |
| **执行** | 直接执行（快） | 辅助参考（慢） |
| **类比** | 做菜的"固定配方" | 做菜的"心得笔记" |

---

## 二、Server/Client 架构分离

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tramber 架构图                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           客户端层                                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │   CLI    │  │   Web    │  │ Telegram │  │ Discord  │            │    │
│  │  │  客户端  │  │  客户端  │  │   客户端  │  │  客户端  │            │    │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘            │    │
│  └────────┼─────────────┼─────────────┼─────────────┼────────────────────┘    │
│           └─────────────┴─────────────┴─────────────┴──────────┐               │
│                                                            │               │
│  ┌─────────────────────────────────────────────────────────▼─────────────┐  │
│  │                     通信层 (WebSocket/HTTP)                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                            │               │
│  ┌─────────────────────────────────────────────────────────▼─────────────┐  │
│  │                        服务端层 (核心)                              │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                        Agent 系统                            │  │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │  │
│  │  │  │构建 Agent  │  │规划 Agent  │  │通用 Agent  │           │  │  │
│  │  │  │Build Agent │  │Plan Agent  │  │General     │           │  │  │
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │  │  │
│  │  │         │                │                │                    │  │  │
│  │  │         └────────────────┼────────────────┘                    │  │  │
│  │  │                          ▼                                     │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │  │  │
│  │  │  │              Agentic Loop (每个 Agent 独立执行)         │   │  │  │
│  │  │  │          收集上下文 ──► 执行动作 ──► 验证结果           │   │  │  │
│  │  │  │                          │                                │   │  │  │
│  │  │  │                          ▼                                │   │  │  │
│  │  │  │  ┌─────────────────────────────────────────────────┐    │   │  │  │
│  │  │  │  │  场景 → 工作流 → 子工作流 → 技能/常规           │    │   │  │  │
│  │  │  │  │  Scene → Workflow → Sub-Workflow → Skill/Routine │    │   │  │  │
│  │  │  │  │                                              │    │   │  │  │
│  │  │  │  │  ┌────────┐  ┌───────┐  ┌─────────┐  ┌─────┐  │    │   │  │  │
│  │  │  │  │  │ 工具   │  │ 技能  │  │ 常规    │  │ ... │  │    │   │  │  │
│  │  │  │  │  │ Tool   │  │ Skill │  │ Routine │  │     │  │    │   │  │  │
│  │  │  │  │  └────────┘  └───────┘  └─────────┘  └─────┘  │    │   │  │  │
│  │  │  │  └─────────────────────────────────────────────────┘    │   │  │  │
│  │  │  └─────────────────────────────────────────────────────────┘   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │              核心系统 (Scene/Workflow/Skill/...)             │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Agent Loop 执行流程

每个 Agent 都执行独立的 Agentic Loop:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Agentic Loop (智能体循环)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │     阶段 1:     │    │     阶段 2:     │    │     阶段 3:     │     │
│  │   Gather        │───►│    Take         │───►│    Verify       │     │
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

### 2.3 执行层次

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

## 三、代码组织架构

### 3.1 顶层目录结构

```
tramber/
├── packages/
│   │
│   # ==================== Core (Server) ====================
│   ├── core/                    # 核心服务端
│   │   ├── src/
│   │   │   ├── scene/           # Scene 系统
│   │   │   ├── workflow/        # Workflow 系统
│   │   │   ├── skill/           # Skill 系统
│   │   │   ├── routine/         # Routine 系统
│   │   │   ├── tool/            # Tool 系统
│   │   │   ├── agent/           # Agent 执行引擎
│   │   │   ├── provider/        # AI Provider
│   │   │   ├── session/         # 会话管理
│   │   │   ├── context/         # 上下文管理
│   │   │   ├── experience/      # Experience 系统
│   │   │   └── insight/         # 洞察分析
│   │   └── package.json
│   │
│   # ==================== Client ====================
│   ├── client/                  # 客户端包
│   │   ├── cli/                 # CLI 客户端
│   │   ├── web/                 # Web 客户端
│   │   └── message/             # 消息客户端
│   │       ├── telegram/
│   │       ├── discord/
│   │       └── slack/
│   │
│   # ==================== Plugin ====================
│   ├── plugin/                  # 插件系统
│   │   ├── builtin/             # 内置插件
│   │   │   ├── media/           # 媒体处理
│   │   │   ├── browser/         # 浏览器自动化
│   │   │   ├── git/             # Git 工具
│   │   │   └── lsp/             # LSP 集成
│   │   └── community/          # 社区插件
│   │
│   # ==================== Shared ====================
│   ├── shared/                  # 共享类型和工具
│   └── sdk/                     # 客户端 SDK
│
├── .tramber/                    # 配置目录
│   ├── settings.json
│   ├── scenes/                  # Scene 定义
│   ├── workflows/               # Workflow 定义
│   ├── skills/                  # Skill 定义
│   ├── routines/                # Routine 沉淀
│   ├── experiences/             # Experience 积累
│   └── plugins/                 # 插件配置
│
├── package.json
├── tsconfig.base.json
└── README.md
```

### 3.2 包职责

| 包 | 职责 |
|------|------|
| **core** | 核心服务端，所有业务逻辑 (Scene/Workflow/Skill/Routine/Tool/Agent) |
| **client/cli** | CLI 客户端 |
| **client/web** | Web 客户端 |
| **client/message/** | 消息客户端 (Telegram/Discord/Slack) |
| **plugin/builtin** | 内置插件 |
| **plugin/community** | 社区插件 |
| **shared** | 共享类型和工具 |
| **sdk** | 客户端通信 SDK |

---

## 四、Agent Loop 实现

### 4.1 核心接口

```typescript
// packages/core/src/agent/types.ts
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

### 4.2 Agentic Loop 类

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
   * - Read files
   * - Search codebase
   * - Understand patterns
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
   * - Edit files
   * - Run commands
   * - Execute tools
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
   * - Run tests
   * - Check errors
   * - Validate changes
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

### 4.3 Agent 类型

```typescript
// packages/core/src/agent/agent.ts
export type AgentType = 'build' | 'plan' | 'general';

export interface AgentConfig {
  type: AgentType;
  model: string;
  systemPrompt?: string;
  tools?: string[];
}

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
}

// General Agent - 通用执行
export class GeneralAgent extends Agent {
  async execute(task: Task): Promise<Task> {
    return this.loop.run(task);
  }
}
```

---

## 五、Coding Scene 设计

### 5.1 Scene 定义

```typescript
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

### 5.2 Coding 内置工具

```typescript
// packages/core/src/tool/tools/coding-tools.ts
export const codingTools: Tool[] = [
  // 文件操作
  {
    id: 'read_file',
    name: 'read_file',
    description: 'Read file contents',
    category: 'file',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => readFile(path, 'utf-8')
  },

  {
    id: 'write_file',
    name: 'write_file',
    description: 'Write content to file',
    category: 'file',
    inputSchema: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ path, content }) => writeFile(path, content, 'utf-8')
  },

  {
    id: 'edit_file',
    name: 'edit_file',
    description: 'Edit file with exact string replacement',
    category: 'file',
    inputSchema: z.object({
      path: z.string(),
      oldString: z.string(),
      newString: z.string()
    }),
    execute: async ({ path, oldString, newString }) => {
      const content = await readFile(path, 'utf-8');
      if (!content.includes(oldString)) {
        throw new Error('old_string not found in file');
      }
      const newContent = content.replace(oldString, newString);
      await writeFile(path, newContent, 'utf-8');
    }
  },

  // 搜索工具
  {
    id: 'glob',
    name: 'glob',
    description: 'Find files by pattern',
    category: 'search',
    inputSchema: z.object({ pattern: z.string() }),
    execute: async ({ pattern }) => glob(pattern)
  },

  {
    id: 'grep',
    name: 'grep',
    description: 'Search content in files',
    category: 'search',
    inputSchema: z.object({
      pattern: z.string(),
      glob: z.string().optional()
    }),
    execute: async ({ pattern, glob }) => grep(pattern, glob)
  },

  // 执行工具
  {
    id: 'bash',
    name: 'bash',
    description: 'Execute bash command',
    category: 'execution',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      const result = exec(command);
      return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode };
    }
  },

  // Git 工具
  {
    id: 'git_commit',
    name: 'git_commit',
    description: 'Create git commit',
    category: 'git',
    inputSchema: z.object({
      message: z.string(),
      files: z.array(z.string()).optional()
    }),
    execute: async ({ message, files }) => {
      if (files) exec(`git add ${files.join(' ')}`);
      exec(`git commit -m "${message}"`);
    }
  },

  {
    id: 'git_push',
    name: 'git_push',
    description: 'Push to remote',
    category: 'git',
    inputSchema: z.object({ remote: z.string().default('origin'), branch: z.string() }),
    execute: async ({ remote, branch }) => {
      exec(`git push ${remote} ${branch}`);
    }
  },

  // LSP 工具
  {
    id: 'lsp_definition',
    name: 'lsp_definition',
    description: 'Go to definition',
    category: 'lsp',
    inputSchema: z.object({
      path: z.string(),
      line: z.number(),
      character: z.number()
    }),
    execute: async ({ path, line, character }) => {
      const lsp = await LSPPool.getForFile(path);
      return lsp.goToDefinition(path, line, character);
    }
  },

  {
    id: 'lsp_references',
    name: 'lsp_references',
    description: 'Find references',
    category: 'lsp',
    inputSchema: z.object({
      path: z.string(),
      line: z.number(),
      character: z.number()
    }),
    execute: async ({ path, line, character }) => {
      const lsp = await LSPPool.getForFile(path);
      return lsp.findReferences(path, line, character);
    }
  },

  {
    id: 'lsp_rename',
    name: 'lsp_rename',
    description: 'Rename symbol',
    category: 'lsp',
    inputSchema: z.object({
      path: z.string(),
      line: z.number(),
      character: z.number(),
      newName: z.string()
    }),
    execute: async ({ path, line, character, newName }) => {
      const lsp = await LSPPool.getForFile(path);
      return lsp.rename(path, line, character, newName);
    }
  }
];
```

### 5.3 Coding Workflow

```json
// .tramber/workflows/coding-workflow.json
{
  "$schema": "https://tramber.dev/schema/workflow.json",
  "id": "coding-workflow",
  "name": "Coding Workflow",
  "description": "通用的软件开发工作流",
  "steps": [
    {
      "type": "routine",
      "routineId": "read-understand",
      "name": "读取并理解代码"
    },
    {
      "type": "skill",
      "skillId": "analyze-requirements",
      "name": "分析需求"
    },
    {
      "type": "skill",
      "skillId": "implement-changes",
      "name": "实现修改"
    },
    {
      "type": "routine",
      "routineId": "lint-fix",
      "name": "代码检查"
    },
    {
      "type": "tool",
      "toolId": "bash",
      "action": "test",
      "name": "运行测试"
    }
  ]
}
```

### 5.4 专用 Workflow

**Code Review Workflow:**
```json
{
  "id": "code-review-workflow",
  "name": "Code Review Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand" },
    { "type": "skill", "skillId": "analyze-code-quality" },
    { "type": "skill", "skillId": "suggest-improvements" },
    { "type": "routine", "routineId": "apply-formatting" },
    { "type": "tool", "toolId": "bash", "action": "test" }
  ]
}
```

**Bug Fix Workflow:**
```json
{
  "id": "bug-fix-workflow",
  "name": "Bug Fix Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand" },
    { "type": "skill", "skillId": "analyze-error" },
    { "type": "skill", "skillId": "fix-bug" },
    { "type": "tool", "toolId": "bash", "action": "test" },
    { "type": "routine", "routineId": "verify-fix" }
  ]
}
```

**Refactor Workflow:**
```json
{
  "id": "refactor-workflow",
  "name": "Refactor Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand" },
    { "type": "skill", "skillId": "analyze-structure" },
    { "type": "skill", "skillId": "design-refactor" },
    { "type": "skill", "skillId": "implement-refactor" },
    { "type": "tool", "toolId": "bash", "action": "test" },
    { "type": "routine", "routineId": "verify-refactor" }
  ]
}
```

**Test-Driven Development Workflow:**
```json
{
  "id": "tdd-workflow",
  "name": "TDD Workflow",
  "steps": [
    { "type": "skill", "skillId": "write-test" },
    { "type": "tool", "toolId": "bash", "action": "test" },
    { "type": "skill", "skillId": "implement-feature" },
    { "type": "tool", "toolId": "bash", "action": "test" },
    { "type": "routine", "routineId": "refactor" }
  ]
}
```

### 5.5 Coding Scene Skill 示例

```typescript
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

### 5.6 Coding Scene Routine 沉淀示例

当 `async-error-fix` Skill 成功执行 3 次以上，成功率 > 80% 时，自动沉淀为 Routine:

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
        "fixes": [
          "add-missing-await",
          "add-try-catch",
          "convert-promise-chain-to-async-await"
        ]
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

### 5.7 LSP 集成

```typescript
// packages/core/src/lsp/pool.ts
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
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio']
  },
  python: {
    command: 'pyright-langserver',
    args: ['--stdio']
  },
  rust: {
    command: 'rust-analyzer',
    args: []
  },
  go: {
    command: 'gopls',
    args: ['serve']
  }
};
```

### 5.8 Checkpoint 集成

```typescript
// packages/core/src/checkpoint/manager.ts
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

## 六、核心类型定义

### 6.1 Scene

```typescript
export interface Scene {
  id: string;
  name: string;
  description: string;
  category: 'coding' | 'drawing' | 'video' | 'writing';

  // Scene 是固化的工作流
  workflow: Workflow;

  config: SceneConfig;

  // 快速执行
  execute(input: SceneInput): Promise<SceneOutput>;
}
```

### 6.2 Workflow

```typescript
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
  | { type: 'tool'; toolId: string; action: string; parameters: Record<string, unknown>; };
```

### 6.3 Skill

```typescript
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
export interface Tool {
  id: string;
  name: string;
  description: string;

  category: 'file' | 'search' | 'execution' | 'media';

  inputSchema: ToolInputSchema;
  execute(input: unknown): Promise<ToolResult>;
}
```

### 6.6 Experience

```typescript
export interface Experience {
  id: string;
  name: string;
  description: string;

  type: 'success' | 'failure' | 'pattern' | 'anti-pattern';

  content: {
    problem: string;
    solution: string;
    codeExample?: string;
    keyPoints: string[];
    caveats?: string[];
  };

  tags: string[];
  confidence: number;

  relevance(query: string): number;
}
```

---

## 七、客户端架构

### 7.1 客户端 SDK

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
```

### 7.2 CLI 客户端

```typescript
// packages/client/cli/src/cli.ts
export class CLIClient {
  async run(): Promise<void> {
    // 1. 连接 Server
    // 2. 选择 Scene
    // 3. 交互循环
  }
}
```

### 7.3 消息客户端

```typescript
// packages/client/message/telegram/src/bot.ts
export class TelegramBot {
  private client: TramberClient;
  private bot: TelegramBotClient;

  async start(): Promise<void> {
    // 转发消息到 Tramber Server
    this.bot.on('message', async (msg) => {
      for await (const response of this.client.chat(msg.text)) {
        await this.bot.sendMessage(msg.chat.id, response.content);
      }
    });
  }
}
```

---

## 八、插件系统

### 8.1 插件接口

```typescript
// packages/plugin/builtin/media/src/index.ts
export interface TramberPlugin {
  id: string;
  name: string;
  version: string;

  tools?: Tool[];
  skills?: Skill[];
  routines?: Routine[];
  workflows?: Workflow[];

  initialize?(context: PluginContext): Promise<void>;
  cleanup?(): Promise<void>;
}
```

### 8.2 内置插件

| 插件 | 提供的功能 |
|------|-----------|
| **plugin-builtin-media** | understand_image, transcribe_audio, generate_speech |
| **plugin-builtin-browser** | browser_goto, browser_click, browser_extract |
| **plugin-builtin-git** | git_commit, git_push, git_branch |
| **plugin-builtin-lsp** | lsp_definition, lsp_references, lsp_rename |

---

## 九、配置文件

### 9.1 Scene 配置

```json
{
  "$schema": "https://tramber.dev/schema/scene.json",
  "id": "coding",
  "name": "Coding Scene",
  "category": "coding",
  "workflow": "coding-workflow",
  "config": {
    "systemPrompt": "You are an expert programming assistant...",
    "defaultProvider": "anthropic",
    "defaultModel": "claude-3-5-sonnet-20241022",
    "recommendedClients": ["cli", "web"]
  }
}
```

### 9.2 Workflow 配置

```json
{
  "$schema": "https://tramber.dev/schema/workflow.json",
  "id": "coding-workflow",
  "name": "Coding Workflow",
  "steps": [
    { "type": "routine", "routineId": "read-understand", "name": "读取并理解" },
    { "type": "skill", "skillId": "analyze-requirements", "name": "分析需求" },
    { "type": "skill", "skillId": "implement-changes", "name": "实现修改" },
    { "type": "routine", "routineId": "lint-fix", "name": "代码检查" },
    { "type": "tool", "toolId": "bash", "action": "test", "name": "运行测试" }
  ]
}
```

### 9.3 全局配置

```json
{
  "server": { "host": "localhost", "port": 3000 },
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
    "minExecutions": 3
  },
  "plugins": {
    "builtin": ["media", "browser", "git", "lsp"]
  }
}
```

---

## 十、CLI 交互示例

### 10.1 Scene 选择

```bash
$ tramber

Welcome to Tramber v1.0.0

Available Scenes:
  1. coding    - 软件开发场景
  2. drawing   - 绘图场景
  3. video     - 视频场景
  4. writing   - 写作场景

Select scene [1-4]: 1

[Scene: coding] Connected via CLI Client
```

### 10.2 执行 Workflow

```bash
[Scene: coding] You: /workflow code-review

Executing workflow: code-review

Step 1/5: [Routine: read-understand] ✓
Step 2/5: [Skill: analyze-code-quality] ✓
Step 3/5: [Skill: suggest-improvements] ✓
Step 4/5: [Routine: apply-formatting] ✓
Step 5/5: [Tool: bash:test] ✓

Workflow completed ✅
New experience recorded: 'code-review-patterns'
```

### 10.3 Routine 执行

```bash
[Scene: coding] You: 修复 async 错误

Matching routine: async-error-fix (success rate: 93%)
Executing routine: async-error-fix
  Step 1/3: read_file ✓
  Step 2/3: edit_file ✓
  Step 3/3: run_test ✓
Completed in 2.3s ✅
```

### 10.4 跨平台访问

```bash
# CLI Client
$ tramber --scene coding

# Web Client
$ http://localhost:3000

# Telegram
@tramber_bot /scene coding
@tramber_bot 修复 async 错误

# Discord
/tramber scene coding
/tramber 修复 async 错误
```

---

## 十一、实现路线

### 11.1 Phase 1: 核心 MVP

- [ ] Core: Scene/Workflow/Skill/Routine/Tool
- [ ] Core: Agent 执行引擎
- [ ] Core: Experience 系统
- [ ] Client: CLI Client

### 11.2 Phase 2: 客户端扩展

- [ ] Client: Web Client
- [ ] Client: Telegram Bot
- [ ] Client: Discord Bot

### 11.3 Phase 3: 插件系统

- [ ] Plugin: 框架
- [ ] Plugin: Builtin (media/browser/git/lsp)
- [ ] Plugin: Community 支持

### 11.4 Phase 4: 更多 Scene

- [ ] Scene: Drawing Scene
- [ ] Scene: Video Scene
- [ ] Scene: Writing Scene

---

## 十二、总结

### 12.1 核心价值

| 维度 | 价值 |
|------|------|
| **越用越快** | Routine 直接执行，无需 AI |
| **知识沉淀** | Skill → Routine |
| **场景分离** | Coding/Drawing/Video/Writing |
| **多客户端** | CLI/Web/Message |
| **插件扩展** | Builtin/Community |

### 12.2 设计精髓

```
第一次: AI 慢速理解 → 成功 → 沉淀 Routine
以后: 直接执行 Routine → 快速完成 ✅

越用越快，越用越智能
```

---

*文档生成时间: 2026-03-23*
