# Tramber CLI 架构图

> 本文档包含 Tramber CLI 的 Mermaid 架构图，用于更清晰地展示系统结构

---

## 1. 系统全栈架构图

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px'}}}%%
flowchart TB
    %% Styling with classes %%
    classDef cliLayer fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef interactionLayer fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#4a148c
    classDef ioLayer fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#1b5e20
    classDef sdkLayer fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#e65100
    classDef agentLayer fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#880e4f
    classDef providerLayer fill:#f9fbe7,stroke:#33691e,stroke-width:2px,color:#33691e
    classDef toolLayer fill:#fafafa,stroke:#424242,stroke-width:2px,color:#424242
    classDef fileTools fill:#e0e0e0,stroke:#616161,stroke-width:1px
    classDef execTools fill:#e0e0e0,stroke:#616161,stroke-width:1px

    subgraph CLI_Layer["🖥️ CLI Layer (命令行界面)"]
        REPL["📝 repl.ts<br/>REPL入口/欢迎消息/历史管理"]
        CMD["⚙️ command-handler.ts<br/>/help /scene /skills"]
        SINGLE["🚀 single-command-executor.ts<br/>单次命令执行"]
        class REPL,CMD,SINGLE cliLayer
    end

    subgraph Interaction_Layer["🔄 Interaction Layer (交互层)"]
        IM["⚡ interaction-manager.ts<br/>状态机:IDLE<->EXECUTING<->WAITING_INPUT"]
        class IM interactionLayer
    end

    subgraph IO_Layer["📥 IO Layer (IO层)"]
        IOM["📖 io-manager.ts<br/>readline管理/line事件监听"]
        OUT["📤 output-manager.ts<br/>统一输出/stdout-stderr分离"]
        class IOM,OUT ioLayer
    end

    subgraph SDK_Layer["📦 SDK Layer (SDK层)"]
        SDK["🔧 sdk-client.ts<br/>TramberClient.execute封装AgentLoop"]
        class SDK sdkLayer
    end

    subgraph Agent_Layer["🤖 Agent Layer (Agent层)"]
        AL["🔄 agent-loop.ts<br/>迭代循环/调用Provider/执行Tools"]
        class AL agentLayer
    end

    subgraph Provider_Layer["☁️ Provider Layer (Provider层)"]
        PROV["🔮 provider-anthropic.ts<br/>Claude API调用/工具解析"]
        class PROV providerLayer
    end

    subgraph Tool_Layer["🛠️ Tool Layer (工具层)"]
        REG["📋 tool-registry.ts<br/>工具注册表/工具执行"]
        FT["📄 file-tools<br/>read_file/write"]
        ET["⚙️ exec-tools<br/>bash/npm"]
        class REG toolLayer
        class FT fileTools
        class ET execTools
    end

    %% Connections %%
    REPL --> IM
    CMD --> IM
    SINGLE --> IM
    IM --> IOM
    IM --> OUT
    IOM --> SDK
    SDK --> AL
    AL --> PROV
    PROV --> REG
    REG --> FT
    REG --> ET

    %% Link styles %%
    style CLI_Layer fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    style Interaction_Layer fill:#f3e5f5,stroke:#4a148c,stroke-width:3px
    style IO_Layer fill:#e8f5e9,stroke:#1b5e20,stroke-width:3px
    style SDK_Layer fill:#fff3e0,stroke:#e65100,stroke-width:3px
    style Agent_Layer fill:#fce4ec,stroke:#880e4f,stroke-width:3px
    style Provider_Layer fill:#f9fbe7,stroke:#33691e,stroke-width:3px
    style Tool_Layer fill:#fafafa,stroke:#424242,stroke-width:3px
```

---

## 2. 完整数据流图（发现问题点）

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '12px'}}}%%
sequenceDiagram
    participant User as 👤 用户
    participant REPL as 📝 REPL
    participant IM as ⚡ InteractionMgr
    participant TE as 📋 TaskExec
    participant SDK as 🔧 SDK
    participant AL as 🤖 AgentLoop
    participant PROV as ☁️ Provider
    participant OUT as 📤 OutputMgr

    User->>REPL: 输入"读取package.json"
    REPL->>IM: handleIdle()
    IM->>TE: startTask()+executeTask()

    Note over TE,OUT:color:#ff6b6b **任务执行阶段**
    TE->>SDK: client.execute()
    SDK->>AL: 创建AgentLoop执行

    loop 🔄 迭代循环
        AL->>PROV: chat()获取AI响应

        alt ✅ AI调用工具
            AL->>SDK: onStep tool_call
            SDK->>TE: onProgress
            TE->>OUT: writeToolCall()
            OUT-->>User: 显示工具调用

            AL->>SDK: onStep tool_result
            SDK->>TE: onProgress
            TE->>OUT: writeToolResult()
            OUT-->>User: 显示工具结果

        else ❌ AI直接回复(问题!)
            AL->>SDK: onStep content
            SDK->>TE: onProgress
            TE->>OUT: writeProgress() 显示①
            AL-->>SDK: return finalAnswer
            SDK-->>TE: return result
            TE->>OUT: writeResult() 显示②
        end
    end

    Note over TE,OUT: color:#ff0000 **问题: 同样文本显示了两次!**
```

---

## 3. 问题分析：onStep 与 finalAnswer 的语义冲突

### 3.1 当前数据流

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '13px'}}}%%
flowchart LR
    subgraph A["Agent Loop 发送"]
        A1["📤 onStep({type:'step',content})<br/>发送到 steps 数组"]
        A2["📋 finalAnswer = content<br/>也包含同样内容"]
    end

    subgraph B["CLI 接收"]
        B1["📝 writeProgress(content)<br/>显示 steps 中的 content"]
        B2["📝 writeResult(finalAnswer)<br/>显示 finalAnswer"]
    end

    A1 --> B1
    A2 --> B2

    style A fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    style A1 fill:#fff3e0,stroke:#ff9800
    style A2 fill:#fff3e0,stroke:#ff9800
    style B fill:#ffebee,stroke:#f44336,stroke-width:2px
    style B1 fill:#ffcdd2,stroke:#d32f2f,stroke-width:2px
    style B2 fill:#ffcdd2,stroke:#d32f2f,stroke-width:2px
```

### 3.2 问题代码

```typescript
// packages/agent/src/loop.ts:260-267
return {
  success: true,
  finalAnswer: content,     // → 放入 finalAnswer
  steps: [...this.steps],  // → this.steps 也包含同样内容
};

// 同时通过 onStep 也发送了
onProgress({ type: 'step', content });
```

### 3.3 修复方案

| 方案 | 改动位置 | 修复方式 | 推荐度 |
|-----|---------|---------|--------|
| **A** | SDK | `finalAnswer` 只包含结构化数据，不包含 AI 文本 | ⭐⭐ |
| **B** | Agent Loop | AI 文本只通过 onStep 发送，**不**放入 `finalAnswer` | ⭐⭐⭐ |

> **推荐方案 B**：AI 的文本响应本质上是"进度"，不是"最终结果"。

---

## 4. CLI 三层架构图（简化版）

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px'}}}%%
flowchart TB
    subgraph REPL["🖥️ REPL Layer (应用层)"]
        R1["📝 repl.ts<br/>REPL入口/欢迎消息"]
        R2["⚙️ command-handler.ts<br/>/help /scene"]
        R3["🚀 single-command-executor.ts<br/>单次命令"]
    end

    subgraph Interaction["🔄 Interaction Layer (交互层)"]
        I1["⚡ interaction-manager.ts<br/>状态机:IDLE<->EXECUTING<->WAITING"]
    end

    subgraph IO["📥 IO Layer (IO层)"]
        O1["📖 io-manager.ts<br/>readline管理"]
        O2["📤 output-manager.ts<br/>统一输出"]
    end

    REPL -->|用户输入| Interaction
    Interaction -->|showPrompt| IO
    Interaction -->|writeOutput| O2
    Interaction -->|状态更新| IO

    style REPL fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    style Interaction fill:#f3e5f5,stroke:#4a148c,stroke-width:3px
    style IO fill:#e8f5e9,stroke:#1b5e20,stroke-width:3px
    style R1 fill:#e1f5fe
    style R2 fill:#e1f5fe
    style R3 fill:#e1f5fe
    style I1 fill:#f3e5f5
    style O1 fill:#e8f5e9
    style O2 fill:#e8f5e9
```

---

## 5. 状态机图

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px'}}}%%
stateDiagram-v2
    [*] --> IDLE : 启动
    IDLE --> EXECUTING : startTask()
    EXECUTING --> WAITING_INPUT : requestInput()
    WAITING_INPUT --> EXECUTING : 收到输入
    EXECUTING --> IDLE : 任务完成
    IDLE --> [*] : close()

    note right of IDLE : 空闲状态<br/>可接受新任务
    note right of EXECUTING : 执行中<br/>等待完成或权限确认
    note right of WAITING_INPUT : 等待用户<br/>输入确认
```
