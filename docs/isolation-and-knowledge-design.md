# Goal Engine 数据隔离与认知架构设计方案

> 状态：待评审  
> 日期：2026-04-11  
> 来源：Claude Code + Gemini + Codex 三方协作分析  
> 版本：v0.1-draft

---

## 背景问题

Goal Engine v0 存在两个深层问题：

1. **数据污染**：所有表（goals/attempts/reflections/policies）没有 `agent_id` 字段，Agent A 的经验可能被 Agent B 读取
2. **禁令陷阱**：当前 design 把"学到了什么"等同于"不许做什么"，导致 Agent 行动空间随时间收缩，而非扩展

---

## 核心决策：从禁令系统转向认知系统

### 问题本质

| 维度 | 禁令系统（当前） | 认知系统（目标） |
|------|-----------------|-----------------|
| 失败后产出 | `avoid_strategy: "baidu_search"` | `knowledge: "在目标X的阶段Y，因为Z原因，效果差"` |
| 携带方式 | 禁止列表，硬阻断 | 认知条目，上下文注入 |
| 下轮行为 | 系统不让做 | Agent 自己判断，但有更丰富信息 |
| 长期效果 | 行动空间越来越小 | 认知越来越丰富，行动空间可能扩大 |
| 系统角色 | 看门人（阻止坏决策） | 顾问（提供信息让 Agent 做更好决策） |
| 污染风险 | 共享=污染（强制约束别人） | 共享≠污染（只是信息，不强制） |

### 为什么这样解决污染

在禁令系统里，污染无解——旧经验要么保留（强制约束别人），要么删除（丢失经验）。

在认知系统里，污染的矛盾消失：

- 旧经验作为知识保留，不丢失
- 但不阻断任何动作，不造成约束
- Agent 带着更丰富的理解进入新会话，自己判断哪些旧认知仍适用

---

## 数据模型设计

### 核心原则（三层）

```
Level 1（数据层）：靠 agent_id + composite FK 防止跨 Agent 读取
Level 2（策略层）：靠 scope 分级控制什么可以共享
Level 3（认知层）：靠 knowledge 替代 avoid_strategy，让污染定义消失
```

### 表结构

#### `agents` 表（新增）

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `goals` 表（修改）

```sql
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'completed', 'abandoned')),
  current_stage TEXT NOT NULL,
  success_criteria TEXT[] NOT NULL DEFAULT '{}',
  stop_conditions TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, id)
);
```

#### `attempts` 表（修改）

```sql
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,

  stage TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  strategy_tags TEXT[] NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('success', 'partial', 'failure')),
  failure_type TEXT,
  confidence NUMERIC(4,3),
  next_hypothesis TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, id),
  FOREIGN KEY (agent_id, goal_id)
    REFERENCES goals(agent_id, id)
    ON DELETE CASCADE
);
```

#### `reflections` 表（修改）

```sql
CREATE TABLE reflections (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  attempt_id TEXT,

  summary TEXT NOT NULL,
  root_cause TEXT,
  must_change TEXT,
  avoid_strategy TEXT,  -- 保留但标记为 deprecated，未来逐步迁移到 knowledge

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (agent_id, goal_id)
    REFERENCES goals(agent_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (agent_id, attempt_id)
    REFERENCES attempts(agent_id, id)
    ON DELETE SET NULL
);
```

#### `knowledge` 表（新增，核心新表）

```sql
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  source_attempt_id TEXT,

  -- 认知条目核心字段（descriptive，非 prescriptive）
  context TEXT NOT NULL,       -- 什么阶段、什么条件下
  observation TEXT NOT NULL,   -- 观察到了什么
  hypothesis TEXT NOT NULL,    -- 为什么会这样
  implication TEXT NOT NULL,  -- 对未来行动意味着什么

  -- 可选字段
  related_strategy_tags TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (agent_id, goal_id)
    REFERENCES goals(agent_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (agent_id, source_attempt_id)
    REFERENCES attempts(agent_id, id)
    ON DELETE SET NULL
);
```

#### `policies` 表（修改）

```sql
CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,

  preferred_next_step TEXT,
  -- deprecated: avoid_strategies TEXT[] -- 迁移到 knowledge
  must_check_before_retry TEXT[] NOT NULL DEFAULT '{}',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, goal_id),
  FOREIGN KEY (agent_id, goal_id)
    REFERENCES goals(agent_id, id)
    ON DELETE CASCADE
);
```

#### `knowledge_promotions` 表（新增，分级共享）

```sql
CREATE TYPE knowledge_visibility AS ENUM (
  'private',    -- 只属于当前 goal
  'agent',     -- 同一 agent 跨 goal 共享
  'global'     -- 全局共享（需审核晋升）
);

CREATE TABLE knowledge_promotions (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL,

  visibility knowledge_visibility NOT NULL DEFAULT 'private',

  -- private: agent_id = 所属 agent
  -- agent: agent_id = 所属 agent
  -- global: agent_id IS NULL（全局规则）
  agent_id TEXT,

  -- 脱敏后的知识（从原始 knowledge 提取，不包含 agent/goal 身份信息）
  subject TEXT NOT NULL,           -- 主题标签（如 "baidu_search", "web_navigation"）
  condition JSONB NOT NULL DEFAULT '{}',  -- 条件描述
  summary TEXT NOT NULL,          -- 简明结论
  recommendation TEXT NOT NULL,    -- 建议

  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  support_count INTEGER NOT NULL DEFAULT 1,  -- 被多少原始 knowledge 支持

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_promotions_visibility_agent_check CHECK (
    (visibility = 'global' AND agent_id IS NULL)
    OR
    (visibility IN ('private', 'agent') AND agent_id IS NOT NULL)
  )
);
```

### 索引

```sql
CREATE INDEX idx_goals_agent_status ON goals(agent_id, status, updated_at DESC);
CREATE INDEX idx_attempts_agent_goal_created ON attempts(agent_id, goal_id, created_at DESC);
CREATE INDEX idx_reflections_agent_goal_created ON reflections(agent_id, goal_id, created_at DESC);
CREATE INDEX idx_knowledge_agent_goal_created ON knowledge(agent_id, goal_id, created_at DESC);
CREATE INDEX idx_policies_agent_goal ON policies(agent_id, goal_id);
CREATE INDEX idx_knowledge_promotions_visibility_subject ON knowledge_promotions(visibility, subject);
CREATE INDEX idx_knowledge_promotions_agent ON knowledge_promotions(agent_id, visibility);
```

---

## API 设计

### 认证要求

所有 API 必须通过 header 传递 agent_id：

```http
X-Agent-Id: openclaw-main
```

**禁止**在 request body 中传递 agent_id（可被伪造）。

### 端点

```
# Goal
POST   /api/goals                    -- 创建 goal（agent_id 从 header 注入）
GET    /api/goals                    -- 列表（自动按 agent_id 过滤）
GET    /api/goals/:goal_id           -- 详情（自动按 agent_id 过滤）

# Attempt
POST   /api/goals/:goal_id/attempts  -- 创建 attempt
GET    /api/goals/:goal_id/attempts  -- 列表（自动按 agent_id 过滤）

# Reflection & Knowledge
POST   /api/goals/:goal_id/reflections       -- 创建 reflection
POST   /api/goals/:goal_id/knowledge          -- 创建 knowledge（新）
GET    /api/goals/:goal_id/knowledge          -- 列表（自动按 agent_id 过滤）

# Policy
GET    /api/goals/:goal_id/policy
PUT    /api/goals/:goal_id/policy

# Recovery Packet（核心读取端点）
GET    /api/goals/:goal_id/recovery-packet   -- 合并返回
```

### Recovery Packet 结构（认知版本）

```json
{
  "agent_id": "openclaw-main",
  "goal": {
    "id": "goal_123",
    "title": "Find an AI event in Shanghai",
    "status": "active",
    "current_stage": "search"
  },
  "current_policy": {
    "preferred_next_step": "...",
    "must_check_before_retry": ["..."]
  },
  "recent_attempts": [
    {
      "id": "attempt_1",
      "stage": "search",
      "action_taken": "tried baidu",
      "result": "failure",
      "failure_type": "site_unresponsive"
    }
  ],
  "relevant_knowledge": [
    {
      "id": "know_1",
      "context": "在 search 阶段用 baidu 搜索上海 AI 活动",
      "observation": "baidu 返回的结果相关性低，且详情页在自动化环境下响应慢",
      "hypothesis": "baidu 搜索对此类垂直活动效果差，可能需要直接访问活动平台",
      "implication": "可以尝试直接访问 huodongxing 或 eventbrite 的上海 AI 活动页面"
    }
  ],
  "shared_wisdom": [
    {
      "visibility": "global",
      "subject": "event_search",
      "summary": "聚合网站在自动化环境下可靠性低于官方站点",
      "recommendation": "优先访问官方活动页面而非第三方聚合"
    }
  ],
  "open_questions": [
    "上海四月有哪些值得参加的 AI 活动？",
    "哪些平台在上海 AI 活动信息覆盖最全？"
  ]
}
```

---

## Retry Guard：从阻断门到认知注入点

### 当前设计（阻断）

```
Attempt 失败
  → Reflection 生成
  → Policy 更新 avoid_strategies
  → Retry Guard 检查：if action in avoid_strategies → BLOCK
```

### 新设计（注入）

```
Attempt 失败
  → Reflection 生成
  → Knowledge 条目生成（descriptive）
  → 可选：晋升到 agent/global 层（需审核）
  → Retry Guard 检查：
      if 相关 knowledge 存在 → 注入到上下文中
      → Agent 自己决定是否采纳
      → 记录 Agent 是否参考（可追溯，不强制）
```

### 注入示意

```
[系统提示]
你正在执行 goal: "Find an AI event in Shanghai"
当前 stage: search

[历史认知注入]
观察到：在 search 阶段使用 baidu 搜索时，返回结果相关性低。
可能原因：baidu 对垂直活动搜索效果差。
建议考虑：直接访问活动平台（huodongxing/eventbrite）或用 Google 搜索。

[Agent 决策]
Agent 可以：
- 采纳建议：尝试 huodongxing
- 不采纳并说明原因："用户要求中文结果，huodongxing 可能更合适"
- 提出新方案："先问用户更倾向哪个平台"
```

---

## 迁移路径

### v0.1：止血 + 基础设施

- [ ] 给所有表加 `agent_id` 字段
- [ ] 加 composite FK 约束
- [ ] 实现 `X-Agent-Id` header 验证
- [ ] 现有 `avoid_strategies` 保留，向后兼容

### v0.2：认知系统上线

- [ ] 新增 `knowledge` 表
- [ ] 新增 `knowledge_promotions` 表
- [ ] 实现 knowledge 创建 API
- [ ] Recovery Packet 包含 `relevant_knowledge`
- [ ] Retry Guard 从阻断改为注入

### v0.3：共享与晋升

- [ ] 实现 knowledge promotion 流程（agent 级自动晋升）
- [ ] 实现 global 晋升审核端点
- [ ] 实现 `shared_wisdom` 读取
- [ ] 逐步废弃 `avoid_strategies`（向后兼容过渡期）

### v1.0：完整认知系统

- [ ] 移除 `avoid_strategies` 字段
- [ ] 全部替换为 `knowledge` + `knowledge_promotions`
- [ ] 支持 workspace_id（多租户隔离）

---

## 关键设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 避免 raw reflection 共享 | 直接共享原始 reflection 会导致上下文污染 | 提炼后的 knowledge 更安全 |
| promotion 需要审核 | 自动晋升只是"另一种污染"（Codex 观点） | 人工或半自动审核确保质量 |
| knowledge 是 descriptive 而非 prescriptive | avoid_strategy 是规定性，会收缩行动空间 | knowledge 是描述性，让 Agent 自己判断 |
| agent_id 加到每张表 | 避免 join 泄露；让 FK 约束可验证 | 比只加 goals.agent_id 更安全 |
| X-Agent-Id 来自 header | body 里的 agent_id 可被伪造 | 从认证上下文注入更安全 |
| 预留 workspace_id | 为未来多租户留空间 | agent_id 不应该是全局永久标识 |

---

## 未解决问题（待讨论）

1. **global 晋升的审核机制**：谁来审？机器还是人？审核标准是什么？
2. **knowledge 的质量标准**：不是所有 reflection 都值得转成 knowledge，标准是什么？
3. **knowledge 的 TTL**：知识会过时吗？需要衰减机制吗？
4. **Agent 如何"承认"参考了历史知识**：记录但不强制，具体实现方式？

---

## 参考

- Codex 分析：数据隔离 + 完整 SQL 实现方案
- Gemini 分析：scope 分层 + 共享 vs 隔离边界定义
- Claude Code 分析：禁令系统 vs 认知系统哲学重构
