# Tramber Stage 5: Skill 系统

> **创建时间**: 2026-03-29
> **前置依赖**: Stage 4 (Ink CLI 重构)
> **预计周期**: 3-4 个工作日
> **当前状态**: 已完成 ✓

---

## 1. 背景与动机

### 1.1 Skill 是什么

Skill 是自包含的能力扩展包，结构如下（参考 OpenClaw 兼容格式）：

```
skills/md-to-pdf/
├── _meta.json          # 元数据（owner, slug, version, 发布信息）
├── SKILL.md            # Skill 描述（YAML frontmatter + Markdown，给 LLM 看）
└── scripts/
    └── md-to-pdf.py    # 可执行脚本（AI 通过 exec 工具调用）
```

**核心原理**：Skill 不需要特殊的"执行引擎"。LLM 通过阅读 SKILL.md 知道"有什么能力、怎么用"，然后通过已有的 exec 工具调用脚本。Agent Loop 的执行路径不变，只是 LLM 多了"知识"。

### 1.2 当前状态

| 能力 | 状态 | 说明 |
|------|------|------|
| Skill 包 | ❌ 空壳 | `packages/skill/src/` 为空 |
| SkillRegistry | ⚠️ 在 scene 包中 | `scene/skill-registry.ts` 有注册/执行逻辑，但使用的是硬编码的预定义 Skill（read-file, fix-bug 等），与 Agent Loop 无关 |
| Skill 加载 | ❌ 不存在 | 不会扫描 `.tramber/skills/` 目录 |
| Skill 注入提示词 | ❌ 不存在 | 系统提示词不知道用户安装了哪些 Skill |
| CLI 管理 | ❌ 不存在 | 无 `/skills install/list/enable/disable` 命令 |

### 1.3 Stage 5 目标

**聚焦一件事**：让用户安装的 Skill 真正可用。

```
Stage 5 做什么：
  1. 扫描 .tramber/skills/ 目录，发现已安装的 Skill
  2. 解析 SKILL.md，注入到系统提示词，让 LLM 知道有哪些 Skill 可用
  3. CLI 命令管理 Skill（查看、启用、禁用）
  4. 清理旧的 Skill 相关代码（scene 包中的硬编码 Skill、空 skill 包）
```

---

## 2. Skill 格式规范

### 2.1 目录结构

```
.tramber/skills/<skill-slug>/
├── _meta.json          # 必需，元数据
├── SKILL.md            # 必需，Skill 描述（LLM 消费）
├── scripts/            # 可选，可执行脚本
│   └── *.py / *.sh / *.js
├── prompts/            # 可选，自定义提示词片段
│   └── system.md       # 注入到系统提示词的额外内容
└── config.json         # 可选，Skill 配置（权限声明、环境变量等）
```

### 2.2 _meta.json

```json
{
  "owner": "araa47",
  "slug": "md-2-pdf",
  "displayName": "md-2-pdf",
  "latest": {
    "version": "1.0.0",
    "publishedAt": 1770042723076,
    "commit": "https://github.com/clawdbot/skills/commit/xxx"
  },
  "history": []
}
```

### 2.3 SKILL.md

```markdown
---
name: md-to-pdf
description: Convert markdown files to clean, formatted PDFs using reportlab
metadata: {"openclaw":{"emoji":"📄","requires":{"bins":["uv"]}}}
---

# Markdown to PDF

Convert markdown documents to professional PDFs.

## Usage
\```bash
uv run scripts/md-to-pdf.py input.md -o output.pdf
\```

## Features
- Headers, lists, code blocks, tables...
```

- YAML frontmatter：`name`（Skill 标识）、`description`（一句话描述）
- 主体：Markdown 格式的使用说明，LLM 读完就知道怎么调用
- `metadata`：扩展元数据，如依赖的命令行工具（`requires.bins`）

### 2.4 config.json（可选）

```json
{
  "permissions": {
    "allowExec": ["scripts/*.py"],
    "allowWrite": [],
    "env": {
      "PYTHONPATH": "/path/to/deps"
    }
  }
}
```

---

## 3. 实施计划

### 3.1 Step 划分

```
Step 1: 包骨架 + 类型定义       — 新建 packages/skill/ 包基础设施
Step 2: SkillLoader + Registry  — 扫描 .tramber/skills/、解析、管理
Step 3: 提示词格式化 + 注入      — SKILL.md 内容进入系统提示词
Step 4: Engine 集成             — Engine 初始化时加载 Skill，传入 Agent Loop
Step 5: CLI /skills 命令        — 列表/启用/禁用
Step 6: 清理旧代码              — 删除 scene 包硬编码 Skill、旧 SkillRegistry
```

---

### Step 1: 包骨架 + 类型定义

**新建文件**:
- `packages/skill/package.json`
  ```json
  { "name": "@tramber/skill", "type": "module", "exports": "./dist/index.js",
    "dependencies": { "@tramber/shared": "workspace:*" } }
  ```
- `packages/skill/tsup.config.ts` — 参照其他包
- `packages/skill/tsconfig.json` — 参照其他包

**新建文件**: `packages/skill/src/types.ts`
```typescript
/** 解析后的 Skill 描述 */
export interface SkillDescription {
  name: string;
  description: string;
  requires?: { bins?: string[] };
}

/** 解析后的 Skill 清单（_meta.json + SKILL.md 合并） */
export interface SkillManifest {
  slug: string;              // 目录名
  dir: string;               // Skill 目录绝对路径
  name: string;              // displayName 或 frontmatter.name 或 slug
  description: string;       // 一句话描述
  descriptionRaw: string;    // SKILL.md 原始内容
  version?: string;
  owner?: string;
  enabled: boolean;
}
```

---

### Step 2: SkillLoader + Registry

**新建文件**: `packages/skill/src/loader.ts`

`SkillLoader` 类，核心方法：
- `constructor(skillsDir: string)` — skills 目录路径（`<workspace>/.tramber/skills`）
- `async loadAll(): Promise<SkillManifest[]>` — 扫描子目录，每个目录检查 `_meta.json` + `SKILL.md`，缺失则跳过
- `async loadSkill(slug: string): Promise<SkillManifest | null>` — 加载单个
- `private extractFrontmatter(raw: string): Record<string, any>` — 解析 SKILL.md 的 `---` YAML 块
- `private parseDescription(raw: string): SkillDescription` — 提取 name + description
- 宽松解析：frontmatter 缺失时用 slug 作为 name

**新建文件**: `packages/skill/src/registry.ts`

`SkillRegistry` 类，核心方法：
- `load(manifests: SkillManifest[]): void` — 批量加载到 Map
- `list(): SkillManifest[]` — 所有
- `get(slug: string): SkillManifest | undefined`
- `getEnabled(): SkillManifest[]` — 仅启用的
- `enable(slug: string): void` / `disable(slug: string): void`
- `async loadState(path: string): Promise<void>` — 从 JSON 恢复启用状态
- `async saveState(path: string): Promise<void>` — 持久化到 JSON

状态文件格式：`<workspace>/.tramber/skills-state.json`
```json
{ "disabled": ["image-gen"] }
```

**新建文件**: `packages/skill/src/index.ts` — 导出 SkillLoader + SkillRegistry + 类型

---

### Step 3: 提示词格式化 + 注入

**新建文件**: `packages/skill/src/formatter.ts`

- `formatSkillsPrompt(manifests: SkillManifest[]): string`
- 输入：已启用的 SkillManifest 列表
- 输出：Markdown 格式的提示词片段，每个 Skill 提取 name + description + Usage 章节
- 从 `descriptionRaw`（SKILL.md 原始内容）中提取 `## Usage` 到下一个 `##` 之间的内容作为 Usage
- 控制总长度：单 Skill 描述超过 500 字符截断

输出格式：
```
## Available Skills
The user has installed the following skills. Use the `exec` tool to run the commands.

### md-to-pdf
Convert markdown files to clean, formatted PDFs using reportlab.
Usage:
  uv run scripts/md-to-pdf.py input.md
  uv run scripts/md-to-pdf.py input.md -o output.pdf
```

**修改文件**: `packages/agent/src/loop.ts`

- `AgentLoopOptions` 新增：`userSkills?: SkillManifest[]`（从 `@tramber/skill` 导入类型）
- `buildSystemPrompt()` 末尾：如果 `this.options.userSkills?.length`，调用 `formatSkillsPrompt()` 追加到提示词

---

### Step 4: Engine 集成

**修改文件**: `packages/sdk/src/engine.ts`

- 导入 `SkillLoader`, `SkillRegistry` from `@tramber/skill`，`formatSkillsPrompt` from `@tramber/skill`
- 新增属性：`private skillLoader: SkillLoader`, `private userSkillRegistry: SkillRegistry`
- 构造函数中：
  ```typescript
  const skillsDir = join(this.options.workspacePath, '.tramber', 'skills');
  this.skillLoader = new SkillLoader(skillsDir);
  this.userSkillRegistry = new SkillRegistry();
  ```
- `initialize()` 中：
  ```typescript
  try {
    const manifests = await this.skillLoader.loadAll();
    this.userSkillRegistry.load(manifests);
    await this.userSkillRegistry.loadState(join(this.options.workspacePath, '.tramber', 'skills-state.json'));
  } catch { /* skills 目录不存在时静默跳过 */ }
  ```
- 创建 AgentLoop 时，传入 `userSkills: this.userSkillRegistry.getEnabled()`
- 新增方法：`listUserSkills(): SkillManifest[]`
- 新增方法：`enableSkill(slug: string): void` / `disableSkill(slug: string): void`（代理到 userSkillRegistry + saveState）

---

### Step 5: CLI /skills 命令

**修改文件**: `packages/client/cli/src/app.tsx`

在 `handleInput` 的 `/` 命令分支中添加：

```typescript
if (cmd.startsWith('skills')) {
  const sub = cmd.slice(6).trim();
  if (sub.startsWith('enable ')) {
    const slug = sub.slice(7).trim();
    engine.enableSkill(slug);
    // 添加 system 消息确认
  } else if (sub.startsWith('disable ')) {
    const slug = sub.slice(8).trim();
    engine.disableSkill(slug);
  } else {
    // /skills — 列表
    const skills = engine.listUserSkills();
    // 格式化为 system 消息
  }
  return;
}
```

**修改文件**: `packages/client/cli/src/components/input-box.tsx`

- 确认 KNOWN_COMMANDS 包含 `/skills`（应已存在）

---

### Step 6: 清理旧代码

**修改文件**: `packages/scene/src/coding.ts`
- 删除 `CODING_SKILLS` 数组和 `getCodingSkills()` 函数
- 保留 `CODING_SCENE_CONFIG`、`createCodingScene()`、`CODING_WORKFLOW`

**删除文件**: `packages/scene/src/skill-registry.ts`

**修改文件**: `packages/scene/src/index.ts`
- 移除 `export * from './skill-registry.js'`

**修改文件**: `packages/sdk/src/engine.ts`
- 移除 `SkillRegistry` 导入 from `@tramber/scene`
- 移除 `this.skillRegistry` 属性和初始化
- 移除 `getCodingSkills()` 调用
- 移除 `listSkills()`、`executeSkill()` 旧方法（或改为代理到 userSkillRegistry）
- 清理 `(this.skillRegistry as any).options.provider` hack

**修改文件**: `packages/tool/src/builtin/search/grep.ts`
- 将 `includes` 匹配改为正则表达式支持

---

### 验证

1. `pnpm --filter @tramber/skill build` — Skill 包构建通过
2. `pnpm --filter @tramber/sdk build` — SDK 构建通过
3. `pnpm --filter @tramber/cli build` — CLI 构建通过
4. 在有 `.tramber/skills/` 的项目中启动 Tramber，日志显示加载了 Skill
5. `/skills` 显示已安装 Skill 列表
6. 对话中 LLM 知道 Skill 的用法（提示词中可见）
7. `/skills disable <slug>` 后 LLM 不再感知该 Skill
8. 无 `.tramber/skills/` 目录时正常启动

---

## 4. 文件变更清单

| 操作 | 文件 | Step |
|------|------|------|
| 新建 | `packages/skill/package.json` | 1 |
| 新建 | `packages/skill/tsup.config.ts` | 1 |
| 新建 | `packages/skill/tsconfig.json` | 1 |
| 新建 | `packages/skill/src/types.ts` | 1 |
| 新建 | `packages/skill/src/loader.ts` | 2 |
| 新建 | `packages/skill/src/registry.ts` | 2 |
| 新建 | `packages/skill/src/formatter.ts` | 3 |
| 新建 | `packages/skill/src/index.ts` | 2 |
| 修改 | `packages/agent/src/loop.ts` | 3 |
| 修改 | `packages/sdk/src/engine.ts` | 4 |
| 修改 | `packages/client/cli/src/app.tsx` | 5 |
| 修改 | `packages/scene/src/coding.ts` | 6 |
| 删除 | `packages/scene/src/skill-registry.ts` | 6 |
| 修改 | `packages/scene/src/index.ts` | 6 |
| 修改 | `packages/tool/src/builtin/search/grep.ts` | 6 |

---

## 5. 执行顺序

```
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6
（包骨架 → 加载器 → 提示词 → Engine集成 → CLI → 清理）
```

---

## 6. 数据流

```
.tramber/skills/
├── md-to-pdf/
│   ├── _meta.json
│   └── SKILL.md
└── code-review/
    ├── _meta.json
    └── SKILL.md

          │
          ▼  (Engine.initialize)
     SkillLoader.loadAll()
          │
          ▼
     SkillRegistry
          │
          ▼  (AgentLoop.buildSystemPrompt)
     SkillFormatter.toPrompt()
          │
          ▼
     系统提示词 += "## Available Skills\n..."

          │
          ▼  (LLM 推理)
     "用户要转 PDF → 调用 exec: uv run scripts/md-to-pdf.py"
          │
          ▼
     Agent Loop → exec 工具 → 脚本执行 → 返回结果
```

---

## 6. 技术风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| Skill 描述过长撑爆上下文 | 中 | 中 | 限制注入数量，超长 Skill 截断 description body |
| SKILL.md 格式不统一 | 中 | 低 | 宽松解析，frontmatter 缺失时用 slug 作为 name |
| exec 调用脚本的权限问题 | 低 | 中 | Skill config.json 声明权限，复用现有权限系统 |
| .tramber/skills/ 不存在 | 低 | 低 | 自动创建或静默跳过 |

---

## 7. 不在 Stage 5 范围内

| 功能 | 原因 | 预计 Stage |
|------|------|-----------|
| Skill Market（安装/搜索/更新） | 需要服务端支持，工作量独立 | Stage 6 |
| Skill 依赖管理（bins/pip/npm） | 当前 Skill 自行管理依赖（如 uv run） | Stage 6 |
| Routine 接入（Skill → Routine 沉淀） | 依赖 Skill 先跑通且有执行历史 | Stage 6 |
| Experience 接入 | 独立能力，与 Skill 无直接依赖 | Stage 6 |
| 多 Provider 支持 | 独立能力 | Stage 6 |
| Checkpoint 系统 | 独立能力 | Stage 6 |

---

## 8. 成功标准

Stage 5 完成后：

- [x] 用户安装的 Skill 在启动时自动加载
- [x] LLM 知道已安装的 Skill 并能正确调用（提示词注入）
- [x] `/skills` 命令可查看/启用/禁用 Skill
- [x] Skill 系统代码集中在 `packages/skill/`，无旧代码残留
- [x] 无 Skill 时正常启动，不报错
- [x] grep 工具支持正则表达式
- [x] 所有包构建通过

---

*文档创建时间: 2026-03-29*
*完成时间: 2026-03-29*
*文档版本: 2.0*

*文档创建时间: 2026-03-29*
*预计完成时间: 2026-04-03 (3-4 个工作日)*
*文档版本: 2.0*
