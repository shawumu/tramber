# Stage 9: 实体结构重构方案

## 1. 背景

当前实体系统存在结构性问题，实体未能发挥预期作用：

| 问题 | 现状 | 影响 |
|------|------|------|
| `decision` 实体无实际用途 | 仅记录"做了什么决策"，但决策内容与任务描述重复 | 实体冗余，无追溯价值 |
| `task` 实体粒度不当 | 每轮生成一个 task，但同一领域的多轮对话应属于同一任务主题 | 缺少任务主题聚合 |
| `constraint` 命名误导 | 实际上是规则/规范，而非阻塞约束 | 命名不匹配语义 |
| `event` 实体冗余 | Session 已追踪交互轨迹，event 实体重复记录 | 数据冗余 |

## 2. 重构目标

**核心思路**：实体图谱应形成 **领域任务 → 子任务 → 分析** 的层次结构，守护意识每轮生成/更新任务图谱。

| 重构项 | 原实体 | 新实体 | 说明 |
|--------|--------|--------|------|
| 任务主题聚合 | `task`（每轮一个） | `domain_task` + `subtask` | domain_task 聚合同一领域的多个 subtask |
| 决策实体语义 | `decision` | `analysis` | 记录分析结论而非"决策" |
| 规则实体 | `constraint` | `rule` | 分为 user_rule 和 analysis_rule |
| 移除冗余 | `event` | 删除 | Session 已追踪，无需重复 |

## 3. 新实体类型定义

### 3.1 EntityType 重构

```typescript
// packages/shared/src/types/consciousness.ts

type EntityType =
  | 'user_request'   // 保留：用户需求起点
  | 'domain_task'    // 新增：领域任务（任务主题）
  | 'subtask'        // 重命名：原 task → subtask
  | 'analysis'       // 重命名：原 decision → analysis
  | 'rule'           // 重命名：原 constraint → rule
  | 'resource';      // 保留：资源实体

// 删除：'event'、'constraint'、'decision'、'task'
```

### 3.2 DomainTaskEntity（新增）

领域任务实体，聚合同一任务主题下的多个子任务：

```typescript
interface DomainTaskEntity extends BaseEntity {
  type: 'domain_task';
  title: string;            // 任务标题，如 "探索 demos 目录下的 3D 页面"
  domain: string;           // 所属领域，如 "编码"
  status: 'active' | 'completed' | 'paused';
  subtaskIds: string[];     // 关联的子任务 ID 列表 [s:xxx, s:yyy]
  startedAt: string;        // 任务开始时间
  updatedAt: string;        // 最后更新时间
  summary: string;          // 任务进度摘要（守护意识每轮更新）
}
```

**特点**：
- 守护意识判断是否需要新建 domain_task（语义相关度）
- 每轮 analyze_turn 时更新 domain_task 的 subtaskIds 和 summary
- 一个会话可以有多个 domain_task（不同领域）

### 3.3 SubtaskEntity（原 TaskEntity）

子任务实体，每轮执行的具体任务：

```typescript
interface SubtaskEntity extends BaseEntity {
  type: 'subtask';
  domainTaskId: string;     // 所属领域任务 [dt:xxx]
  description: string;      // 本轮具体任务描述
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  analysisIds: string[];    // 关联的分析 [a:xxx, a:yyy]
  ruleIds: string[];        // 关联的规则 [r:xxx]
  resourceIds: string[];    // 发现的资源 [r:xxx]
  requires?: string[];      // 跨轮依赖的资源 ID（用于 context 自组装）
  result?: string;          // 执行结果摘要
}
```

**特点**：
- 一个 domain_task 下可以有多个 subtask
- 每个 subtask 关联具体的分析、规则、资源
- 跨轮依赖通过 `requires` 字段链接到上一轮发现的资源

### 3.4 AnalysisEntity（原 DecisionEntity）

分析实体，记录本轮的分析结论：

```typescript
interface AnalysisEntity extends BaseEntity {
  type: 'analysis';
  subtaskId: string;        // 所属子任务 [s:xxx]
  content: string;          // 分析内容：发现、结论、洞察
  category: 'discovery' | 'conclusion' | 'insight' | 'action_plan';
  // discovery: 发现了什么
  // conclusion: 得出什么结论
  // insight: 获得什么洞察
  // action_plan: 后续行动计划
}
```

**与 decision 的区别**：
- decision 记录"做了什么决策"（与任务描述重复）
- analysis 记录"分析得出什么"（实际的分析内容）

### 3.5 RuleEntity（原 ConstraintEntity）

规则实体，分为用户规则和分析规则：

```typescript
interface RuleEntity extends BaseEntity {
  type: 'rule';
  subtaskId: string;        // 所属子任务 [s:xxx]
  content: string;          // 规则内容
  source: 'user' | 'analysis';  // 来源
  // user: 用户明确提出的约束/规范
  // analysis: 从分析中推导出的隐式规则
  scope: 'local' | 'global';    // 作用范围
  // local: 仅当前子任务适用
  // global: 整个会话适用
}
```

**示例**：
- user rule: "不要删除文件"、"使用 TypeScript"
- analysis rule: "demos 目录下已有 earth-3d.html，新增文件应遵循相同命名风格"

### 3.6 RelationType 重构

```typescript
type RelationType =
  | 'initiates'       // user_request → domain_task
  | 'contains'        // domain_task → subtask
  | 'analyzes'        // subtask → analysis
  | 'constrained_by'  // subtask → rule
  | 'requires'        // subtask → resource（跨轮依赖）
  | 'produces'        // subtask → resource（本轮产出）
  | 'leads_to';       // subtask → subtask（子任务衍生）

// 删除：'triggers'、'blocked_by'、'discovered_in'、'produced_by'、'required_by'
```

## 4. 实体图谱结构示例

```
用户输入 "查看 demos 目录"
  │
  ▼
[u:mnxvvea7] 用户需求：查看 demos 目录
  │
  └─ initiates → [dt:mnxvv001] 领域任务：探索 demos 目录下的 3D 页面
                   │ domain: 编码
                   │ status: active
                   │
                   ├─ contains → [s:mnxvv002] 子任务1：查看目录结构
                   │              │
                   │              ├─ analyzes → [a:mnxvv003] 发现：demos 目录包含 3 个 HTML 文件
                   │              │              category: discovery
                   │              │
                   │              ├─ produces → [r:mnxwf001] 资源：demos/earth-3d.html
                   │              │              uri: file://demos/earth-3d.html
                   │              │
                   │              └─ produces → [r:mnxwf002] 资源：demos/moon-3d.html
                   │
                   ├─ contains → [s:mnxwh001] 子任务2：查看 earth-3d.html 内容
                   │              │
                   │              ├─ requires → [r:mnxwf001]（依赖上一轮发现的资源）
                   │              │
                   │              ├─ analyzes → [a:mnxwh002] 分析：使用 Three.js ES Module
                   │              │              category: conclusion
                   │              │
                   │              └─ constrained_by → [r:mnxwh003] 分析规则：新增文件应使用 Three.js ES Module
                   │                                 source: analysis
                   │                                 scope: global
                   │
                   └─ contains → [s:mnxwi001] 子任务3：添加 3D Moon 页面
                                  │
                                  ├─ requires → [r:mnxwf001]（跨轮依赖）
                                  ├─ requires → [r:mnxwf002]
                                  │
                                  ├─ constrained_by → [r:mnxwh003]（继承分析规则）
                                  │
                                  └─ constrained_by → [r:mnxwi002] 用户规则：不删除现有文件
                                  │                    source: user
                                  │
                                  └─ analyzes → [a:mnxwi003] 行动计划：创建 moon-3d-improved.html
                                                     category: action_plan
```

## 5. 守护意识逻辑重构

### 5.1 analyze_turn 工具重构

守护意识每轮调用 analyze_turn，生成/更新任务图谱：

```typescript
{
  id: 'analyze_turn',
  description: '分析本轮交互，生成/更新领域任务图谱。dispatch_task 返回后必须调用。',
  inputSchema: {
    type: 'object',
    properties: {
      userRequest: { type: 'string', description: '用户本轮原始输入' },
      domain: { type: 'string', description: '所属领域' },
      // 领域任务判断
      isNewDomainTask: { type: 'boolean', description: '是否新建领域任务（语义不相关时新建）' },
      domainTaskId: { type: 'string', description: '已有领域任务 ID（不新建时填入）' },
      domainTaskTitle: { type: 'string', description: '领域任务标题（新建时填入）' },
      // 子任务
      subtaskDescription: { type: 'string', description: '本轮子任务描述' },
      subtaskStatus: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] },
      requires: { type: 'array', items: { type: 'string' }, description: '依赖的已有资源 ID' },
      // 分析
      analyses: { type: 'array', items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          category: { type: 'string', enum: ['discovery', 'conclusion', 'insight', 'action_plan'] }
        }
      }},
      // 规则
      rules: { type: 'array', items: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          source: { type: 'string', enum: ['user', 'analysis'] },
          scope: { type: 'string', enum: ['local', 'global'] }
        }
      }},
      summary: { type: 'string', description: '本轮分析总结（一行）' }
    },
    required: ['userRequest', 'domain', 'subtaskDescription', 'summary']
  }
}
```

### 5.2 analyze_turn 执行逻辑

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const params = input as AnalyzeTurnInput;

  // 1. 生成用户需求实体
  const userRequestEntity = memoryStore.storeEntity(taskId, {
    type: 'user_request',
    domain: params.domain,
    content: params.userRequest,
    relations: []
  });

  // 2. 处理领域任务
  let domainTaskEntity: DomainTaskEntity;
  if (params.isNewDomainTask) {
    // 新建领域任务
    domainTaskEntity = memoryStore.storeEntity(taskId, {
      type: 'domain_task',
      domain: params.domain,
      title: params.domainTaskTitle,
      status: 'active',
      subtaskIds: [],
      relations: [{ type: 'initiates', target: userRequestEntity.id }]
    });
  } else {
    // 更新已有领域任务
    domainTaskEntity = memoryStore.updateEntity(taskId, params.domainTaskId, {
      updatedAt: new Date().toISOString()
    });
  }

  // 3. 生成子任务
  const subtaskRelations: Relation[] = [
    { type: 'contains', target: domainTaskEntity.id }
  ];
  // 跨轮依赖
  if (params.requires) {
    for (const resourceId of params.requires) {
      subtaskRelations.push({ type: 'requires', target: resourceId });
    }
  }
  const subtaskEntity = memoryStore.storeEntity(taskId, {
    type: 'subtask',
    domain: params.domain,
    description: params.subtaskDescription,
    status: params.subtaskStatus || 'completed',
    relations: subtaskRelations
  });

  // 4. 更新领域任务的 subtaskIds
  domainTaskEntity.subtaskIds.push(subtaskEntity.id);
  memoryStore.updateEntity(taskId, domainTaskEntity.id, {
    subtaskIds: domainTaskEntity.subtaskIds,
    summary: params.summary
  });

  // 5. 生成分析实体
  for (const analysis of params.analyses || []) {
    memoryStore.storeEntity(taskId, {
      type: 'analysis',
      domain: params.domain,
      content: analysis.content,
      category: analysis.category,
      relations: [{ type: 'analyzes', target: subtaskEntity.id }]
    });
  }

  // 6. 生成规则实体
  for (const rule of params.rules || []) {
    memoryStore.storeEntity(taskId, {
      type: 'rule',
      domain: params.domain,
      content: rule.content,
      source: rule.source,
      scope: rule.scope,
      relations: [{ type: 'constrained_by', target: subtaskEntity.id }]
    });
  }

  return { success: true, data: { entities: [...] } };
}
```

### 5.3 守护意识 Prompt 更新

```typescript
// packages/agent/src/consciousness-prompts.ts

export function buildSelfAwarenessPrompt(...): string {
  return `你是 Tramber 的守护意识体，负责意识调度、任务图谱管理。

## 你的工作模式
1. 理解用户意图，判断所属领域
2. 判断是否需要新建领域任务（语义不相关时新建）
3. 通过 dispatch_task 路由到领域子意识
4. dispatch_task 返回后，调用 analyze_turn：
   - 生成/更新领域任务（domain_task）
   - 生成子任务（subtask）
   - 记录分析结论（analysis）
   - 记录规则（rule）

## 领域任务判断原则
- **延续已有任务**：新请求与当前领域任务的上下文相关
  - 例：用户看了 demos 目录后问"earth-3d.html 用了什么技术" → 延续同一领域任务
- **新建领域任务**：用户明确切换到不相关的话题
  - 例：用户在编码过程中说"帮我写个周报" → 新建"文档"领域任务

## analyze_turn 参数填写
- isNewDomainTask: true/false（是否新建领域任务）
- domainTaskId: 已有领域任务 ID（延续时填入）
- domainTaskTitle: 新领域任务标题（新建时填入）
- subtaskDescription: 本轮具体任务
- requires: 依赖的已有资源 ID（跨轮关联）
- analyses: 本轮分析结论（discovery/conclusion/insight/action_plan）
- rules: 本轮发现的规则（user: 用户明确提出 / analysis: 从分析推导）

## 工具
- dispatch_task: 路由用户请求到领域子意识
- analyze_turn: 生成任务图谱（domain_task/subtask/analysis/rule）
- recall_memory: 检索历史实体（查询已有领域任务和资源）
`;
}
```

## 6. Context 自组装重构

### 6.1 assembleExecutionContext 重构

执行纲领从任务图谱自组装：

```typescript
assembleExecutionContext(taskId: string, domain: string): ExecutionContext {
  // 1. 查找本领域的活跃领域任务
  const domainTasks = memoryStore.queryEntities({
    taskId, type: 'domain_task', domain
  });
  const activeDomainTask = domainTasks.find(dt => dt.status === 'active');

  if (!activeDomainTask) return { 纲领: '', 资源索引: [] };

  // 2. 查找关联的子任务（按 order 倒序）
  const subtasks = activeDomainTask.subtaskIds
    .map(id => memoryStore.getEntity(taskId, id))
    .filter(e => e?.type === 'subtask')
    .reverse();  // 最近优先

  // 3. 查找关联的分析和规则
  const analyses: AnalysisEntity[] = [];
  const rules: RuleEntity[] = [];
  const resources: ResourceEntity[] = [];

  for (const subtask of subtasks) {
    // 子任务的分析
    for (const rel of subtask.relations.filter(r => r.type === 'analyzes')) {
      const entity = memoryStore.getEntity(taskId, rel.target);
      if (entity?.type === 'analysis') analyses.push(entity as AnalysisEntity);
    }
    // 子任务的规则
    for (const rel of subtask.relations.filter(r => r.type === 'constrained_by')) {
      const entity = memoryStore.getEntity(taskId, rel.target);
      if (entity?.type === 'rule') rules.push(entity as RuleEntity);
    }
    // 子任务依赖/产出的资源
    for (const rel of subtask.relations.filter(r => r.type === 'requires' || r.type === 'produces')) {
      const entity = memoryStore.getEntity(taskId, rel.target);
      if (entity?.type === 'resource') resources.push(entity as ResourceEntity);
    }
  }

  // 4. 组装执行纲领
  const 纲领 = `
## 领域任务：${activeDomainTask.title}
状态：${activeDomainTask.status}
进度摘要：${activeDomainTask.summary}

## 已完成子任务
${subtasks.filter(s => s.status === 'completed').map(s => `- [${s.id}] ${s.description}`).join('\n') || '无'}

## 关键分析
${analyses.map(a => `- [${a.id}] (${a.category}) ${a.content}`).join('\n') || '无'}

## 适用规则
${rules.filter(r => r.scope === 'global').map(r => `- [${r.id}] (${r.source}) ${r.content}`).join('\n') || '无'}

## 可用资源
${resources.map(r => `- [${r.id}] ${r.uri}`).join('\n') || '无'}
`;

  // 5. 资源索引
  const 资源索引 = resources.map(r => ({
    id: r.id,
    uri: r.uri,
    summary: r.summary
  }));

  return { 纲领, 资源索引 };
}
```

## 7. 实施步骤

### Phase 1: 类型定义重构（0.5 天）

| 任务 | 文件 |
|------|------|
| 修改 EntityType 定义 | `packages/shared/src/types/consciousness.ts` |
| 新增 DomainTaskEntity 类型 | 同上 |
| 重命名 TaskEntity → SubtaskEntity | 同上 |
| 重命名 DecisionEntity → AnalysisEntity | 同上 |
| 重命名 ConstraintEntity → RuleEntity | 同上 |
| 删除 EventEntity 类型 | 同上 |
| 重构 RelationType | 同上 |

### Phase 2: MemoryStore 重构（0.5 天）

| 任务 | 文件 |
|------|------|
| 修改 storeEntity 支持新类型 | `packages/agent/src/memory-store.ts` |
| 新增 queryByDomainTask 方法 | 同上 |
| 修改 getTypePrefix（dt/s/a/r） | 同上 |
| 删除 event 相关存储逻辑 | 同上 |

### Phase 3: analyze_turn 重构（1 天）

| 任务 | 文件 |
|------|------|
| 重构 analyze_turn 参数 schema | `packages/agent/src/virtual-tools/analyze-turn.ts` |
| 实现领域任务生成/更新逻辑 | 同上 |
| 实现子任务生成逻辑 | 同上 |
| 实现分析实体生成逻辑 | 同上 |
| 实现规则实体生成逻辑 | 同上 |

### Phase 4: 守护意识 Prompt 重构（0.5 天）

| 任务 | 文件 |
|------|------|
| 更新守护意识系统提示词 | `packages/agent/src/consciousness-prompts.ts` |
| 添加领域任务判断原则 | 同上 |
| 添加 analyze_turn 参数填写指南 | 同上 |

### Phase 5: Context 自组装重构（0.5 天）

| 任务 | 文件 |
|------|------|
| 重构 assembleExecutionContext | `packages/agent/src/consciousness-manager.ts` |
| 支持从任务图谱组装纲领 | 同上 |

### Phase 6: 清理与迁移（0.5 天）

| 任务 | 文件 |
|------|------|
| 删除 event 实体生成逻辑 | `packages/agent/src/virtual-tools/*.ts` |
| 删除旧的 decision/constraint/task 逻辑 | `packages/shared/src/types/consciousness.ts` |
| 更新 record_discovery（只生成 resource） | `packages/agent/src/virtual-tools/record-discovery.ts` |

### Phase 7: 测试验证（0.5 天）

| 测试项 | 验证方法 |
|--------|---------|
| 领域任务生成 | 查看实体索引，验证 dt:xxx 实体 |
| 跨轮依赖 | 第二轮 requires 链接到第一轮资源 |
| Context 自组装 | 触发 rebuild_context，验证纲领质量 |
| 规则继承 | 子任务继承全局规则 |

## 8. 文件变更清单

### 8.1 修改文件

| 文件 | 变更内容 |
|------|---------|
| `packages/shared/src/types/consciousness.ts` | EntityType、RelationType、实体类型定义重构 |
| `packages/agent/src/memory-store.ts` | storeEntity 支持新类型、新增查询方法 |
| `packages/agent/src/virtual-tools/analyze-turn.ts` | 参数 schema、执行逻辑重构 |
| `packages/agent/src/consciousness-prompts.ts` | 守护意识提示词更新 |
| `packages/agent/src/consciousness-manager.ts` | assembleExecutionContext 重构 |
| `packages/agent/src/virtual-tools/record-discovery.ts` | 移除 event 生成逻辑 |

### 8.2 数据迁移

现有实体数据（如有）需要迁移：
- `task` → `subtask`（ID 前缀 t → s）
- `decision` → `analysis`（ID 前缀 d → a）
- `constraint` → `rule`（ID 前缀 c → r）
- `event` → 删除

## 9. 重构收益

| 收益 | 说明 |
|------|------|
| 任务主题聚合 | domain_task 聚合相关子任务，便于追溯任务全貌 |
| 分析实体语义化 | analysis 记录实际分析内容而非决策描述 |
| 规则分类 | user_rule 和 analysis_rule 区分来源，便于继承 |
| 数据去冗余 | 删除 event，减少存储和索引负担 |
| Context 恒定质量 | 从任务图谱自组装，无压缩失真 |