# Goal Engine 产品需求文档

> 状态：详细需求版  
> 日期：2026-04-01  
> 目标：先完整定义问题空间、产品边界、系统要求和后续分期，再从中圈定 MVP

---

## 1. 这份文档的目的

这不是 `Protocol30` 主产品的扩展章节，也不是一个实验性功能说明。

这份文档定义的是一个**独立子项目**：

**Goal Engine**

它要解决的问题不是“Agent 能不能协作”，而是：

**本地运行的 OpenClaw Agent，能否围绕一个长期目标持续推进，而不是在失败、上下文切换或 session 重启后漂移、遗忘或直接放弃。**

这份文档的作用有三件：

1. 把产品问题定义清楚
2. 把系统需求定义清楚
3. 在完整需求基础上，再决定 MVP 应该收窄到哪里

---

## 2. 一句话定义

**Goal Engine 是 OpenClaw Agent 的长期目标控制层。**

它不是 Agent 本身，不替 Agent 执行，不替 Agent 思考全部内容。

它负责：

- 让目标不丢
- 让失败不直接变成放弃
- 让每次尝试可记录、可复盘、可再利用
- 让下一轮动作建立在上一轮经验之上

---

## 3. 我们真正要验证的问题

当前行业里已经有很多：

- 会回答的模型
- 会调工具的 Agent
- 会跑 workflow 的 agent runtime
- 会做短期任务的 automation agent

但还缺一类能力：

**Agent 在长期目标上持续推进的能力。**

具体缺口表现为：

1. 同一个目标在多次 session 后容易丢失
2. 一次失败后容易停止推进
3. 失败信息即使被记录，也不会自然转成下一轮策略
4. 不会显著减少重复错误
5. 缺少一套结构化机制来判断“应该继续试什么”

因此，Goal Engine 要验证的不是“AI 是否聪明”，而是：

**AI Agent 是否能在明确边界内持续推进长期目标。**

---

## 4. 为什么这是一个独立产品，而不是 Protocol30 功能

`Protocol30` 当前主产品验证的是：

- 可信远程能力补全
- 结构化协作请求
- 上下文裁剪
- 验收闭环

而 Goal Engine 验证的是：

- 长期目标保持
- 失败后继续尝试
- 结构化复盘
- 重复错误减少

两者有关，但不是同一个验证题。

如果把 Goal Engine 直接混入 `Protocol30` 主线，会带来三个问题：

1. 无法区分失败原因  
   无法判断到底是协作机制不成立，还是长期目标控制不成立。

2. 产品叙事再次混杂  
   协作网络、世界观、生存机制和持续进化会被混成一个大故事。

3. 验证路径失焦  
   团队会不断在“市场”“记忆”“Agent 社会”“自我进化”之间跳转。

因此，Goal Engine 必须作为独立子项目存在。

---

## 5. 用户与使用场景

### 5.1 第一批目标用户

第一批用户不是泛 AI 用户，也不是普通企业员工。

第一批用户是：

**已经在使用 OpenClaw 的 Agent builder / power users**

他们具备：

- 本地 Agent 运行环境
- 对 skill / soul / plugin / heartbeat 有基础理解
- 愿意运行早期工程版本
- 有真实意愿观察 Agent 的长期行为

### 5.2 第二阶段潜在用户

在第一批用户验证有效后，才考虑：

- 团队内部做 Agent 实验的工程团队
- 需要长运行 Agent 的自动化团队
- 希望为本地 Agent 提供长期控制能力的产品团队

### 5.3 典型使用场景

#### 场景 A：长期资料搜集任务

Agent 需要连续多轮完成资料搜集、筛选、归纳和结构化整理。

要求：

- 多次 session 后目标仍保持一致
- 每轮失败后能继续推进
- 不重复做低质量检索

#### 场景 B：小型自动化目标推进

Agent 需要围绕一个明确目标连续做若干步，例如：

- 搜集信息
- 整理候选项
- 更新检查结果
- 推进下一步行动

要求：

- 当前目标不会被临时上下文覆盖
- 当前卡点会被记住
- 下一轮会优先处理阻塞点

#### 场景 C：能力不足时的“继续推进”

Agent 遇到不会做的环节时，不应简单停止，而应：

- 分类失败原因
- 选择更小的下一步
- 在边界内继续推进

---

## 6. 核心价值主张

Goal Engine 对用户的核心价值不是“让 AI 更像生命”，而是：

**让本地 Agent 在长期目标上更稳定、更可控、更少半途而废。**

具体价值包括：

1. 目标连续性  
   Agent 不再每次 session 都像重新开始。

2. 失败可积累  
   失败不只是日志，而是下一轮策略输入。

3. 可计算的长期状态  
   历史尝试、失败类型、推荐动作可以被结构化处理。

4. 降低重复错误  
   同类问题不会一遍遍用几乎相同的方法撞墙。

5. 更适合长运行和周期唤醒场景  
   特别适合 OpenClaw 这种本地、异步、心跳式运行环境。

6. 控制长期运行成本  
   让 Agent 在长期目标推进中尽量保持方向连续，而不是靠无限堆上下文来维持“记住”。

---

## 7. 我们不做什么

Goal Engine 当前明确不做：

- 不做开放式 Agent 市场
- 不做多 Agent 社会实验
- 不做自治文明叙事
- 不做“完全自动进化成专家”的承诺
- 不做高风险自治执行系统
- 不做取代 OpenClaw 本身的 agent runtime
- 不做完整协作网络产品

它不是：

- 新的聊天机器人
- 新的 workflow builder
- 新的向量数据库包装层
- 新的“数字生命”概念产品

---

## 8. 产品原则

### 8.1 目标优先于单次失败

一次失败不等于目标失效。

### 8.2 失败必须结构化

失败不能只存自然语言感想，必须可分类、可查询、可比较。

### 8.3 禁止低质量重复

若新一轮尝试与上一轮高度重复，系统必须能识别并提示。

### 8.4 本地主体不变

Agent 仍然是本地主体，服务端是长期控制层，不是远程大脑。

### 8.5 边界优先

持续推进不等于不择手段。权限、风险、人工边界必须保留。

### 8.6 先验证持续性，再验证“进化”

在证明目标保持、失败重试和错误减少之前，不宣称“进化成专家”。

---

## 9. 产品结构

Goal Engine 采用独立顶层目录：

```text
goal-engine/
  README.md
  docs/
  agent-adapter/
  service/
  examples/
```

### 9.1 `service`

服务端最小控制层，负责：

- 当前目标状态
- 历史 attempts
- 结构化 reflection
- 推荐下一步
- 长期评估数据

### 9.2 `agent-adapter`

给 OpenClaw Agent 用的最小接入协议。

负责定义：

- Agent 如何读取当前目标
- Agent 如何写回本轮尝试
- Agent 如何获取下一轮建议
- Agent 如何在本地工作区投影必要摘要

### 9.3 `examples`

提供最小演示：

- 单 Agent
- 单用户
- 单目标
- 多轮推进

### 9.4 `docs`

保存：

- 产品需求
- 系统需求
- API 契约
- OpenClaw 集成说明
- 实验方法与指标

---

## 10. OpenClaw 集成原则

Goal Engine 必须基于 OpenClaw 已验证机制设计，而不是自造运行模型。

### 10.0 为什么必须是“本地 + 服务端”

这不是一个实现偏好问题，而是产品成立条件的一部分。

Goal Engine 之所以不能只做 OpenClaw 本地侧，是因为本地侧和服务端解决的是不同问题。

#### 本地侧负责什么

OpenClaw 本地侧负责：

- Agent 主体运行
- 当前一轮判断
- 当前一轮工具调用
- 当前一轮执行与输出
- 面向模型的工作区上下文

也就是说，本地侧负责：

**让 Agent 在这一轮“活着并行动”。**

#### 服务端负责什么

服务端负责：

- 长期目标状态持久化
- 历史 attempt 结构化存储
- failure type 分类与检索
- reflection 与 next-step suggestion
- 长期评估指标
- 多次 session 之间的一致性

也就是说，服务端负责：

**让 Agent 在多轮运行之间“持续围绕同一目标推进”。**

#### 为什么不能只做 OpenClaw 本地侧

如果只做本地侧，会出现五个根本问题：

1. 本地记忆更适合给模型阅读，不适合做可计算的长期状态  
   `AGENTS.md`、`SOUL.md`、`MEMORY.md` 很重要，但它们更像上下文材料，而不是长期控制数据库。

2. 失败很容易停留在“日志”层  
   本地可以记录失败，但难以稳定完成结构化分类、历史检索、相似失败比较和重复错误识别。

3. session 容易碎片化  
   单次运行结束后，下一轮很容易丢失“我为什么还在做这件事”的强约束。

4. 很难形成真正的评估机制  
   如果没有统一的长期状态层，就很难稳定计算 `Goal Continuity`、`Retry Persistence`、`Error Novelty` 这类指标。

5. 产品价值会被误解成“更复杂的本地 prompt / skill 包”  
   如果没有服务端，用户会自然认为这只是一个更厚的本地记忆和规则模板，而不是长期目标控制产品。

#### 为什么又不能只做服务端

如果只做服务端，也会偏离产品目标。

因为这会导致：

- Agent 主体性被削弱
- OpenClaw 退化成输入输出壳
- 本地运行的价值被抽空
- 产品变成“远程大脑”而不是“本地主体 + 长期控制层”

这和 Goal Engine 的定位不一致。

#### 正确分工

Goal Engine 的正确结构必须是：

- **本地 OpenClaw Agent**：负责当前一轮行为
- **服务端 Goal Engine**：负责长期目标控制

最准确的表达是：

**OpenClaw 负责让 Agent 活着和行动。**  
**Goal Engine 负责让 Agent 围绕长期目标持续推进。**

这不是双份重复，而是两层分工。

#### 对外口径

以后面对用户时，必须清楚说明：

- 我们不是要把 Agent 搬到云端
- 我们不是要替代 OpenClaw
- 我们是在补 OpenClaw 本地运行模式下最缺的一层：长期目标控制

一句话口径：

**只做 OpenClaw 侧，你能得到“更会工作的 Agent”；加上服务端长期控制层，你才能得到“不会轻易偏离长期目标的 Agent”。**

### 10.1 本地 Agent 是执行主体

Goal Engine 不取代本地 Agent。

Agent 仍负责：

- 当前一轮判断
- 工具调用
- 具体执行
- 局部计划调整

### 10.2 服务端负责长期控制状态

服务端负责：

- 保存长期目标
- 保存 attempts
- 保存 reflections
- 保存失败分类
- 生成下一轮建议
- 保存评估历史

### 10.3 本地只保留面向模型的摘要投影

并不是所有长期状态都要写进本地文件。

本地只应保留：

- 当前主目标摘要
- 最近失败摘要
- 当前避免重复的提醒
- 当前推荐下一步

### 10.4 不依赖“Agent 自己忽然想起来”

OpenClaw Agent 是否读取长期状态，不能只靠模型自觉。

必须通过以下机制保障：

- `AGENTS.md`：写清总规则
- `SKILL`：写清流程顺序
- plugin tools：提供读取和写回能力
- hooks：在关键节点自动注入摘要
- heartbeat / cron：周期性触发目标对齐和复盘

---

## 11. 核心对象模型

### 11.1 Goal

表示一个长期目标。

字段至少包含：

- `id`
- `title`
- `status`
- `success_criteria`
- `stop_conditions`
- `priority`
- `created_at`
- `updated_at`

### 11.2 Attempt

表示一次真实尝试。

字段至少包含：

- `id`
- `goal_id`
- `strategy`
- `result`
- `failure_type`
- `notes`
- `next_hypothesis`
- `created_at`

### 11.3 Reflection

表示对若干次尝试的结构化复盘。

字段至少包含：

- `goal_id`
- `summary`
- `last_failure_type`
- `avoid`
- `recommended_next_step`
- `confidence`
- `created_at`

### 11.4 Strategy Snapshot

表示当前阶段允许尝试的策略摘要。

字段至少包含：

- `goal_id`
- `active_strategy`
- `disallowed_repetitions`
- `fallback_strategy`
- `updated_at`

### 11.5 Evaluation Record

表示系统对目标推进质量的判断。

字段至少包含：

- `goal_id`
- `goal_continuity_score`
- `retry_persistence_score`
- `error_novelty_score`
- `notes`
- `measured_at`

---

## 12. 核心流程

### 12.1 创建目标

用户或系统创建长期目标。

输出：

- Goal record
- 初始 success criteria
- 初始 stop conditions

### 12.2 本地 Agent 开始一轮执行

在一轮执行前，Agent 必须先对齐：

- 当前主目标
- 最近失败摘要
- 当前禁止重复的方法
- 当前推荐下一步

### 12.3 执行尝试

Agent 执行本轮策略。

### 12.4 写回 Attempt

无论成功失败，都应写回本轮记录。

### 12.5 生成 Reflection

失败后或若干轮后，生成结构化复盘。

### 12.6 获取下一步建议

基于 Goal + Attempt + Reflection，生成下一轮建议动作。

### 12.7 周期检查

通过 heartbeat 或 cron，检查：

- 当前目标是否仍活跃
- 是否长时间无推进
- 是否出现重复错误
- 是否需要降维、学习、求助或停止

---

## 13. 触发机制要求

### 13.1 强制触发

以下节点必须读取长期状态：

- 每轮任务开始前
- 每次失败后
- 每次重试前
- 每次 heartbeat 唤醒后

### 13.2 条件触发

以下信号出现时应强制检查：

- 连续失败超过阈值
- 长时间无推进
- 即将重复使用相同策略
- 当前目标与最近行为不一致

### 13.3 主动触发

Agent 允许在这些情况下主动读取：

- 不确定当前主目标
- 不确定该不该继续
- 需要查看最近失败历史
- 需要查看可选下一步

---

## 14. 服务端职责

服务端不是用来“替 Agent 记一份聊天记录”的。

服务端职责是：

1. 长期状态持久化
2. 结构化 attempt 存储
3. 失败分类和检索
4. 反思与建议生成
5. 进展评估
6. 跨 session 一致性保证

### 14.1 服务端存在的意义

如果只在本地文件里保存：

- 能保存
- 但很难优化

服务端的价值在于：

- 能统计
- 能比较
- 能检索
- 能生成推荐
- 能评估是否真的进步

---

## 15. 本地工作区职责

本地工作区负责：

- 提供给模型可直接看到的目标摘要
- 保存必要的运行投影
- 在 session 启动时把关键规则注入上下文

本地工作区不是长期控制中心。

它更像：

**面向模型的当前工作面**

---

## 16. 系统需求

### 16.1 可恢复性

目标状态、attempt 历史和 reflection 必须在 session 重启后仍可恢复。

### 16.2 可查询性

系统必须支持按：

- goal
- failure_type
- time
- recent attempts
- repeated strategy

进行查询。

### 16.3 可追踪性

每次 attempt 都必须能追溯：

- 试了什么
- 为什么这么试
- 结果如何
- 下一轮准备改什么

### 16.4 可评估性

系统必须能回答：

- 目标有没有连续推进
- 失败后有没有继续
- 是否减少重复错误
- 当前策略是否比之前更有效

### 16.5 最小可集成性

第一阶段集成方式必须尽量简单：

- CLI / HTTP 即可验证
- 不强依赖复杂部署
- 不强依赖大规模云环境

---

## 17. 风险与反模式

### 17.1 把“记忆多”误当成“进化”

如果只是积累日志，而没有生成更好的下一步策略，就不算成立。

### 17.2 把“继续尝试”误当成“持续进步”

重复撞墙不叫进化。

### 17.3 把服务端做成远程大脑

如果服务端替 Agent 做掉关键判断，就破坏了本地主体原则。

### 17.4 把产品做成市场故事

这个项目当前不是：

- 协作网络
- Agent 社会
- 自治文明

### 17.5 过早承诺“专家化”

在没有明确数据证明前，不能把“减少重复错误”直接宣传成“进化成专家”。

---

## 18. Token 与上下文预算问题

Token 成本不是附属优化项，而是 Goal Engine 成立的前提条件之一。

如果长期目标控制依赖于：

- 无限制延长单次 session
- 无限制扩展 prompt 上下文
- 无限制增大记忆文件

那么系统即使在行为上“更坚持”，也会在成本和可持续性上失败。

### 18.1 核心问题

在 OpenClaw 的实际使用中，用户会持续遇到这些问题：

1. 不知道什么时候该结束当前 session 并开启新会话
2. 上下文会随着运行时间持续膨胀
3. 记忆文件会越来越长，反过来提高每轮运行成本
4. Agent 缺少“当前是否值得继续这轮”的成本判断
5. 用户很难知道哪些信息必须常驻，哪些应摘要，哪些应外置

这些问题叠加后会导致：

- 成本失控
- 运行变慢
- 目标连续性依赖大上下文硬撑
- 长期运行不可持续

### 18.2 产品立场

Goal Engine 必须明确坚持以下立场：

**长期目标连续，不等于长期堆积上下文。**

正确目标不是：

- 让 Agent 永远背着所有历史继续跑

而是：

- 让 Agent 永远知道自己为什么在跑
- 同时尽量只携带当前最小必要上下文

### 18.3 为什么这是产品核心问题

如果不解决 token 和上下文预算问题，Goal Engine 会出现根本矛盾：

- 一方面要求 Agent 长期坚持目标
- 另一方面它坚持得越久，上下文越大，token 越贵
- 最后系统不是因为目标失败，而是因为上下文成本拖死

因此，Goal Engine 除了要解决：

- 目标不丢
- 失败不放弃
- 复盘可复用

还必须解决：

**在不丢方向的前提下，如何降低长期运行的上下文成本。**

### 18.4 必须具备的能力方向

后续系统设计中，Goal Engine 必须具备一层明确的：

**Context and Token Control Layer**

这一层至少要回答：

1. 当前 session 什么时候应该结束
2. 哪些信息该常驻
3. 哪些信息该摘要替代原文
4. 哪些信息该只保存在服务端而不进入 prompt
5. 下一轮重新启动时，最小恢复包应该是什么

### 18.5 正反判断标准

正确方向：

- 长期目标连续
- 短期上下文轻量
- 历史信息可压缩、可投影、可按需读取

错误方向：

- 继续运行就不断把更多文本塞进 prompt
- 用越来越长的 `MEMORY.md` 硬撑目标连续性
- 不区分“当前任务上下文”和“长期控制状态”

### 18.6 对后续设计的约束

后续所有实现设计都必须接受这个约束：

**Goal Engine 不是“更多记忆”，而是“在有限上下文预算内维持长期目标控制”。**

这意味着后续设计不能只讨论：

- 如何保存更多历史

还必须同时讨论：

- 如何压缩
- 如何切会话
- 如何做最小恢复
- 如何区分常驻信息与按需信息

---

## 19. 经过头部厂商验证的基础原则

Goal Engine 后续所有上下文、session、memory 与 token 设计，必须建立在已经被头部厂商和主流 agent runtime 明确验证的基础知识之上，而不是凭内部直觉设计。

### 19.1 Context window 是“工作记忆”，不是长期记忆

Anthropic 官方明确把 context window 定义为模型的“working memory”，并强调多轮对话会持续累积在 context 中。  
OpenAI 也明确说明，随着会话消息增长，系统需要做 truncation 或显式状态管理。  
LangGraph 也把 thread-scoped state 定义为 short-term memory。

这意味着：

- context window 本质上是短期工作记忆
- 它不适合承担长期目标控制
- 长期目标不能依赖无限延长上下文来维持

### 19.2 短期状态与长期记忆必须分层

Google Vertex AI Agent Engine 官方将：

- `Session`
- `Event`
- `State`
- `Memory`

明确分层，其中 memory 用于跨 session 连续性。  
LangGraph 也明确区分：

- short-term memory（thread-scoped）
- long-term memory（cross-session namespaces）

这意味着：

- 当前会话状态不等于长期记忆
- 历史 attempt、reflection、goal status 不应全部塞进单个 session
- Goal Engine 必须明确区分短期上下文与跨 session 控制状态

### 19.3 长会话一定会带来上下文膨胀问题

Anthropic 官方说明，多轮对话采用 progressive token accumulation；长对话会不断侵蚀 context budget。  
LangChain 官方也明确指出，长对话会超出 context window，并建议使用：

- trim messages
- delete messages
- summarize messages

这意味着：

- 长期运行时，消息裁剪和摘要替换不是可选项
- Goal Engine 不能默认“继续同一 session 总是更好”

### 19.4 Prompt caching 只能解决重复前缀成本，不能替代记忆架构

OpenAI 官方指出，prompt caching 依赖 exact prefix match，并建议把静态内容放前面、动态内容放后面。  
Anthropic 官方也说明 prompt caching 针对 prompt prefix，并有明确生命周期限制。

这意味着：

- prompt caching 对静态 instruction 很有价值
- 但它不能替代长期状态管理
- 不能把“缓存命中”误当成“长期记忆架构”

### 19.5 长运行任务需要持久状态与异步恢复机制

OpenAI 的 background mode、Google 的 sessions/memory、LangGraph 的 persistence/checkpoints 都说明了一个共识：

**长运行 agent 不能只依赖单次同步请求。**

需要：

- 可恢复状态
- 可轮询或可回放执行结果
- checkpoint / session / response state

这意味着：

- Goal Engine 后续必须考虑 session rollover 与 state resume
- 长期目标推进不是单轮 prompt 设计问题，而是状态机问题

### 19.6 TTL 与生命周期管理是必要能力，不是后期优化

LangGraph 官方明确提供 checkpoint TTL 与 store TTL，目的是防止数据无限积累。  
Google 也把 sessions 和 memory bank 分成独立受控资源。

这意味着：

- 历史状态不能无限保留在热路径
- Goal Engine 必须定义：
  - 什么是热数据
  - 什么是冷数据
  - 什么可以压缩
  - 什么应该过期

### 19.7 行业共同结论

综合 OpenAI、Anthropic、Google、LangChain/LangGraph 的官方文档，可以得出以下经过验证的共识：

1. context window 是短期工作记忆，不是长期控制层
2. 短期状态与长期记忆必须分层
3. 长会话会自然导致 token 成本膨胀
4. 摘要、裁剪、TTL、session rollover 都是必要机制
5. 长运行 agent 需要持久状态、可恢复执行与明确生命周期管理

因此，Goal Engine 的后续实现必须被约束为：

**在有限上下文预算下，维持长期目标连续性。**

### 19.8 参考来源

- OpenAI Prompt Caching: https://platform.openai.com/docs/guides/prompt-caching/prompt-caching
- OpenAI Background Mode: https://platform.openai.com/docs/guides/background
- OpenAI Responses vs Chat Completions: https://platform.openai.com/docs/guides/responses-vs-chat-completions
- OpenAI Conversations API: https://platform.openai.com/docs/api-reference/conversations/create-item
- OpenAI Assistants context window management: https://platform.openai.com/docs/assistants/deep-dive/context-window-management
- Anthropic Context Windows: https://docs.anthropic.com/en/docs/build-with-claude/context-windows
- Anthropic Prompt Caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic Long Context Tips: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips
- Google Vertex AI Agent Engine Sessions overview: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/sessions/overview
- Google Vertex AI Memory Bank announcement: https://cloud.google.com/blog/products/ai-machine-learning/vertex-ai-memory-bank-in-public-preview/
- LangGraph overview: https://docs.langchain.com/langgraph
- LangGraph Memory overview: https://docs.langchain.com/oss/javascript/langgraph/memory
- LangChain Short-term memory: https://docs.langchain.com/oss/python/langchain/short-term-memory
- LangGraph Persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph TTL configuration: https://docs.langchain.com/langgraph-platform/configure-ttl

---

## 20. Context and Token Control 需求展开

这一章不是实现方案，而是后续所有技术设计都必须满足的正式需求约束。

它要回答的问题不是“如何把更多历史放进模型”，而是：

**在有限 token 预算内，如何让 Agent 在跨 session 的长期目标上保持连续性。**

### 20.1 设计目标

Goal Engine 在上下文与 session 控制上，必须同时满足以下四个目标：

1. 长期目标连续  
   即使切换 session，Agent 也不会失去主目标、当前阶段和关键约束。

2. 热路径上下文轻量  
   每一轮运行尽量只携带完成当前动作所需的最小上下文。

3. 历史状态可外置、可压缩、可恢复  
   长期状态不能全部常驻 prompt，但必须能在需要时稳定恢复。

4. 成本与可靠性同时可控  
   系统不能靠无限延长会话来维持行为连续性。

### 20.2 基本原则

后续设计必须遵守以下原则：

#### 20.2.1 长期目标连续，不等于长会话连续

保持长期目标推进，不要求一直沿用同一个 session。

正确目标是：

- 目标状态连续
- 策略状态连续
- 关键约束连续

而不是：

- 原始对话历史无限连续

#### 20.2.2 热上下文与冷状态必须分离

热上下文只服务当前轮次。

冷状态服务：

- 跨 session 恢复
- 历史对比
- 长期复盘
- 失败模式归档

两者不能混成一个持续膨胀的文本堆。

#### 20.2.3 默认压缩，而不是默认累积

当信息已不再直接服务当前步骤时，系统默认应考虑：

- 摘要替换
- 结构化抽取
- 外置存储
- 降级为按需读取

而不是继续让原文常驻。

#### 20.2.4 任何切会话动作都必须可恢复

如果系统决定结束当前 session，那么下一轮必须能够通过最小恢复包重新启动，而不是依赖人工重新解释目标。

### 20.3 Session 生命周期要求

Goal Engine 必须把 session 视为可管理资源，而不是自然延长的聊天容器。

#### 20.3.1 系统必须显式支持 session rollover

系统必须支持：

- 结束当前活跃 session
- 生成恢复摘要
- 在新 session 中恢复当前目标推进状态

#### 20.3.2 系统必须定义“继续当前 session”的适用条件

只有在以下条件同时成立时，继续当前 session 才是合理默认：

- 当前任务仍处于同一阶段
- 当前上下文仍有明显短期价值
- 当前 token 成本仍在预算内
- 当前 session 没有出现明显漂移

#### 20.3.3 系统必须定义“开启新 session”的触发条件

以下任一情况出现时，系统应倾向于开启新 session：

1. 历史消息已明显大于当前动作所需信息
2. 当前阶段已经完成，进入新的子阶段
3. 当前轮失败后需要基于复盘重启策略
4. session 已出现目标漂移或上下文污染
5. 预计继续当前 session 的成本高于重建最小恢复包
6. 当前会话已长到不适合作为热路径继续运行

### 20.4 上下文分层要求

后续设计必须至少把系统信息分成四层。

#### 20.4.1 第一层：稳定常驻层

这一层变化最少，可以长期复用，适合放：

- 核心操作原则
- 长期边界
- 基础人格与风格
- 静态工具使用规则

这层信息应尽量稳定，并尽量有利于缓存。

#### 20.4.2 第二层：当前目标控制层

这一层用于告诉 Agent：

- 当前唯一主目标是什么
- 当前阶段是什么
- 当前成功条件是什么
- 当前禁止重复的方法是什么
- 当前最优先处理的阻塞点是什么

这层信息必须精简，且优先于历史原文。

#### 20.4.3 第三层：当前任务工作层

这一层只服务当前轮次的具体动作，例如：

- 正在执行的子任务
- 当前输入材料
- 当前工具结果
- 当前一步的局部推理材料

这层信息允许短期膨胀，但必须在阶段完成后及时压缩。

#### 20.4.4 第四层：历史与归档层

这一层用于保存：

- attempts
- failures
- reflections
- strategy versions
- 历史证据和原始材料

这层默认不进入 prompt，只能按需读取或被压缩后投影。

### 20.5 记忆投影要求

Goal Engine 必须明确区分：

- 完整长期状态
- 面向模型的上下文投影

两者不能等同。

#### 20.5.1 本地工作区中的记忆文件只能是投影，不是完整事实库

本地文件的职责应是：

- 让模型在当前轮看见必要摘要
- 给 OpenClaw 提供可见的运行上下文

而不是承载全部历史真相。

#### 20.5.2 投影必须可重建

如果本地摘要丢失、切换或更新，系统必须能从长期状态重新生成投影。

#### 20.5.3 投影应优先结构化摘要，而非原始对话复制

能用下面这些表达的，就不应保留整段原文：

- 当前目标
- 当前阶段
- 最近失败原因
- 禁止重复策略
- 下一轮建议方向

### 20.6 最小恢复包要求

Goal Engine 必须定义统一的最小恢复包，用于新 session 重启时恢复方向连续性。

#### 20.6.1 最小恢复包必须至少包含

1. 当前主目标
2. 当前阶段/子目标
3. 成功条件
4. 最近一次有效进展
5. 最近一次关键失败及其分类
6. 当前禁止重复的方法
7. 下一轮优先尝试方向

#### 20.6.2 最小恢复包必须小于完整历史

它不是历史档案副本，而是“让下一轮能继续跑”的启动包。

#### 20.6.3 最小恢复包必须支持多次迭代更新

每次 session rollover 后，恢复包都应被重新生成或刷新，而不是长期沿用旧摘要。

### 20.7 成本感知要求

Goal Engine 不能只做状态连续性，还必须具备成本感知能力。

#### 20.7.1 系统必须能判断热路径是否过重

至少要能识别这些风险信号：

- 当前 prompt 里历史比例过高
- 当前轮加载的记忆摘要过长
- 当前 session 中无关消息积累过多
- 为维持连续性而反复重复注入大段背景

#### 20.7.2 系统必须支持“继续”与“重启”的成本比较

后续实现不一定第一版就精确量化，但产品需求上必须要求系统具备这类判断：

- 继续当前 session 的代价
- 开新 session + 恢复包的代价

并允许系统偏向成本更优且连续性不丢失的方案。

#### 20.7.3 成本控制不能破坏目标连续性

任何压缩、裁剪和切会话动作都不能以丢失主目标、阶段状态或关键失败经验为代价。

### 20.8 触发机制要求

Context and Token Control 不能依赖 Agent“自己想起来”。

后续系统必须至少存在三类触发：

#### 20.8.1 固定节点触发

在这些节点，系统必须检查是否需要同步状态或切换 session：

- 每轮开始前
- 每轮失败后
- 每次准备重试前
- 每次阶段切换前
- 每次 heartbeat 唤醒时

#### 20.8.2 条件信号触发

当出现以下信号时，系统应触发压缩、恢复或重启判断：

- 连续失败
- 明显重复策略
- 长时间无进展
- 上下文明显膨胀
- 当前任务阶段变化
- 当前会话出现目标漂移

#### 20.8.3 主动请求触发

Agent 可主动请求读取更完整的长期状态，但这一层只能补充，不应替代前两层强制机制。

### 20.9 非目标与反模式

这套机制明确不应走向以下方向：

#### 20.9.1 用超长 `MEMORY.md` 充当长期控制层

这是把投影当事实库，会同时破坏成本和清晰度。

#### 20.9.2 用单个超长 session 硬撑目标连续性

这会让系统把“会话不断增长”误当成“状态管理成立”。

#### 20.9.3 只讨论压缩，不讨论恢复

如果无法稳定恢复，压缩只会演变成信息丢失。

#### 20.9.4 只讨论 token 节省，不讨论行为可靠性

便宜但容易丢目标的系统，不符合 Goal Engine 的产品目标。

### 20.10 对后续实现文档的强制约束

后续任何技术设计，如果涉及：

- session 管理
- 记忆分层
- 本地文件投影
- 服务端长期状态
- prompt 注入
- heartbeat / cron

都必须回答以下问题：

1. 热上下文与冷状态如何分层
2. 什么时候结束当前 session
3. 什么时候生成或刷新恢复包
4. 哪些信息常驻，哪些按需读取
5. 如何保证成本下降时，目标连续性不下降

在这些问题没有回答清楚之前，不应宣称 Goal Engine 已具备长期运行能力。

---

## 21. 需求可靠性结论

这一章用于明确区分：

- 哪些需求已经被主流厂商机制和 OpenClaw 官方架构支持
- 哪些需求在工程上合理，但仍需产品实验验证
- 哪些说法目前不能作为对外承诺

### 21.1 已被官方机制明确支持的需求

以下判断已经有较强技术依据，可以作为 Goal Engine 的正式需求基础：

#### 21.1.1 不能把 context window 当长期记忆

这一点已经被 Anthropic、Google、LangGraph/OpenAI 相关文档共同支持：

- context window 本质是工作记忆
- 长对话会自然推高 token 占用
- 超过窗口后要么报错、要么截断、要么依赖显式管理

因此：

- Goal Engine 把长期目标控制放在 session 之外，是可靠方向
- “长期目标连续”不能等同于“永远续同一个会话”

#### 21.1.2 短期状态与长期状态必须分层

Google Vertex AI Sessions/Memory Bank、LangGraph 的 short-term memory / cross-thread memory，以及 OpenClaw 的 workspace memory + session store，都明确体现了分层设计。

因此：

- Goal Engine 区分热上下文、历史归档、最小恢复包，是可靠方向
- “本地投影 + 服务端长期状态”不是拍脑袋，而是符合主流 agent runtime 共识

#### 21.1.3 Prompt caching 不能替代长期控制层

OpenAI 和 Anthropic 官方都明确把 prompt caching 设计成前缀复用与成本优化机制，而不是 memory architecture。

因此：

- 把缓存当降本工具是可靠的
- 把缓存当“Agent 已经记住了长期目标”是不可靠的

#### 21.1.4 session rollover、恢复包、TTL 都是正当需求

Google 的 sessions/memory，LangGraph 的 persistence/checkpoints/TTL，以及 OpenClaw 的 compaction、context engine、memory flush，都说明：

- 长运行 agent 必须支持恢复
- 历史状态不能无限保留在热路径
- 生命周期管理不是后期优化

因此：

- Goal Engine 要求最小恢复包、session rollover、冷热分层，是可靠需求

#### 21.1.5 OpenClaw 确实支持实现这类控制层

OpenClaw 官方文档明确支持：

- workspace files 注入
- `AGENTS.md` / `SOUL.md` / `HEARTBEAT.md`
- memory files
- plugin tools
- lifecycle hooks
- context engine slot
- heartbeat / cron

因此：

- Goal Engine 作为 OpenClaw 之上的控制层，在技术路径上是可落地的
- 它不是与 OpenClaw 架构冲突的方向

### 21.2 工程上合理，但仍需实验验证的需求

以下方向有合理技术基础，但还不能直接当成“已经被证明有效”的结论。

#### 21.2.1 何时切 session 的具体阈值

“需要 session rollover”是可靠的。

但这些具体问题仍要靠实验：

- 多长对话该切
- 多大恢复包最优
- 哪种 token/阶段/失败信号组合最稳
- 继续当前 session 与开新 session 的收益分界线在哪里

这意味着：

- 我们可以先写触发原则
- 但不能先写死精确阈值并宣称通用有效

#### 21.2.2 最小恢复包的最佳结构

恢复包必须存在，这点可靠。

但恢复包最优字段组合、长度、表达形式，仍然需要在真实任务中比较：

- 过短会丢方向
- 过长会重新拖高成本

#### 21.2.3 结构化复盘是否稳定减少重复错误

这是 Goal Engine 的核心假设之一，但目前只能算“值得验证”，还不能算“已被证明”。

技术上合理的原因是：

- 结构化 attempt / failure / next strategy 确实比纯聊天历史更可计算

但仍需实验回答：

- 是否真的减少重复错误
- 减少幅度有多大
- 对哪些任务域有效

#### 21.2.4 成本控制是否真的优于单纯上下文压缩

我们现在的设计判断是：

- “长期状态外置 + 最小恢复包 + 按需投影”应优于“长 prompt 硬撑”

这是强推论，但还需要真实比较：

- 成本是否显著下降
- 行为质量是否保持
- 哪些模型、哪些场景下收益最大

### 21.3 目前不能对外宣称成立的说法

以下说法现在都不应写进对外承诺、营销口径或产品主张：

#### 21.3.1 “Goal Engine 可以让 Agent 自动进化成专家”

目前没有足够证据支持这一点。

更稳妥的说法只能是：

- Goal Engine 试图提高长期目标连续性
- 试图让失败变成下一轮策略输入

而不是承诺专家化结果。

#### 21.3.2 “Goal Engine 一定会显著降低成本”

方向是合理的，但在没有真实数据前，不能承诺幅度。

最多只能说：

- 它以 token 与上下文预算控制为核心约束
- 设计目标包含长期运行成本控制

#### 21.3.3 “Goal Engine 能普遍提升所有 Agent 场景”

这同样没有证据。

更合理的边界是：

- 先在长任务、分阶段、可复盘的任务域里验证
- 不要泛化到所有自治 agent 场景

### 21.4 当前最稳的产品口径

基于现有验证，Goal Engine 当前最稳的表述应该是：

**一个面向 OpenClaw Agent 的长期目标控制层。**

它试图解决的是：

- 目标跨 session 漂移
- 失败后直接停住
- 历史经验无法转成下一轮策略
- 长运行时 token 成本失控

它当前已经有较强技术依据的部分是：

- 分层状态管理
- session rollover
- 最小恢复包
- 本地投影 + 服务端长期状态
- token/context budget control

它仍然需要通过产品实验来证明的部分是：

- 最佳切会话策略
- 最优恢复包结构
- 重复错误下降幅度
- 长期成功率是否真正提升

### 21.5 对团队的约束

从现在开始，团队内部必须区分三种表述：

1. `已验证机制`
   指已有官方架构与文档支持的部分。

2. `待实验假设`
   指工程上合理，但还没有真实效果数据的部分。

3. `禁止宣称`
   指目前没有证据支撑、只能作为远期愿景的部分。

如果不做这个区分，Goal Engine 很容易再次滑回：

- 大叙事
- 强承诺
- 弱验证

这是当前必须避免的。

---

## 22. 成功指标

完整项目最终关注的指标包括：

1. `Goal Continuity`
2. `Retry Persistence`
3. `Error Novelty`
4. `Strategy Improvement`
5. `Task Completion Improvement`
6. `Reuse Intent`

其中第一阶段最优先的是前四项。

---

## 23. 分期建议

### Phase 0：详细需求与机制验证

输出：

- 需求文档
- 系统边界
- 对 OpenClaw 官方机制的集成原则

### Phase 1：最小长期目标控制闭环

验证：

- 单 Agent
- 单目标
- 单任务域
- 多轮尝试

### Phase 2：更强的复盘与策略控制

增加：

- 更细失败分类
- 重复策略检测
- 更稳定的 suggestion 机制

### Phase 3：更完整的 OpenClaw 集成

增加：

- 更正式的 plugin 工具
- 更稳定的 hooks/heartbeat 接入
- 更成熟的 workspace projection

### Phase 4：更复杂场景验证

再考虑：

- 多目标
- 多 Agent
- 更多任务域

---

## 24. MVP 收口原则

MVP 不应先于完整需求定义。

MVP 收口必须满足两个条件：

1. 完整问题空间已经定义清楚
2. 已明确知道第一阶段只验证哪个最小动作

对 Goal Engine 来说，MVP 收口原则应是：

**先验证长期目标能否持续推进，再验证是否出现真正的“进化”。**

---

## 25. 当前结论

Goal Engine 应被定义为：

**一个面向 OpenClaw power users 的长期目标控制层。**

它的核心不是“更聪明”，而是：

- 目标不丢
- 失败不退
- 记录可复盘
- 下一轮更有依据

它应继续作为独立子项目演化，而不是挂回 `Protocol30` 主线。

---

## 26. 后续待办

以下事项已经明确，但尚未展开到实现或实验阶段。

### 26.1 需求与实验设计

1. 写一份“待实验假设验证方案”
2. 明确 `session rollover` 的实验触发条件与比较口径
3. 定义“最小恢复包”候选结构，并设计对比实验
4. 定义 `Goal Continuity / Retry Persistence / Error Novelty / Strategy Improvement` 的采集方式
5. 设计“长上下文硬撑”与“外置长期状态 + 恢复包”之间的对照实验

### 26.2 OpenClaw 集成约束

1. 单独写“OpenClaw 集成下的 Context and Token Control 实现约束”
2. 明确 `AGENTS.md`、`SOUL.md`、`HEARTBEAT.md`、memory files 各自职责
3. 明确 plugin tools、hooks、heartbeat、cron 在 Goal Engine 里的分工
4. 明确哪些信息应本地投影，哪些信息只保存在服务端
5. 明确如何保证“触发读取长期状态”不依赖 Agent 自发想起

### 26.3 服务端与数据结构

1. 写最小服务端对象模型
2. 明确 `goal / attempt / reflection / strategy / recovery packet` 的边界
3. 明确冷热数据划分、TTL、归档与重建规则
4. 明确哪些数据进入热路径，哪些只用于评估与回放

### 26.4 成本与上下文控制

1. 单独写“Context and Token Control 实现需求”
2. 明确何时继续当前 session，何时开启新 session
3. 明确压缩、摘要替换、按需读取、外置存储的判定顺序
4. 定义热路径过重的识别信号
5. 定义“成本下降但目标连续性不下降”的评估口径

### 26.5 产品边界与对外口径

1. 固定对外表述，只使用“长期目标控制层”口径
2. 禁止对外承诺“自动进化成专家”
3. 禁止在没有数据前承诺显著降本
4. 保持“已验证机制 / 待实验假设 / 禁止宣称”三层区分

### 26.6 下一次沟通建议顺序

下次继续时，建议按这个顺序推进：

1. 先写“待实验假设验证方案”
2. 再写“OpenClaw 集成下的 Context and Token Control 实现约束”
3. 然后再收口第一版 MVP

---

## 27. 竞争边界与避让原则

这一章用于明确 Goal Engine 不应进入哪些竞争区，以及应该坚持什么产品边界，避免与大厂和通用框架做正面竞争。

### 27.1 不应进入的正面竞争区

以下方向已经被大厂平台或强势框架占据，不适合作为 Goal Engine 的主产品定义。

#### 27.1.1 通用托管 agent 平台

这类平台通常提供：

- 托管运行
- 通用会话管理
- 持久状态
- 通用工具编排

OpenAI Agents SDK、Google Vertex AI Agent Engine 都在这个方向上持续加强。

因此 Goal Engine 不应定义为：

- 新的 hosted agent platform
- 新的通用 agent cloud

#### 27.1.2 通用 persistence / checkpoint runtime

LangGraph 这类框架已经把：

- threads
- checkpoints
- persistence
- TTL

做成核心卖点。

因此 Goal Engine 不应定义为：

- 新的通用 persistence runtime
- 新的 long-running workflow engine

#### 27.1.3 通用 memory layer / memory API

Letta、CrewAI 以及其他 memory-centric 产品，已经把“记忆层”本身做成主类目。

因此 Goal Engine 不应定义为：

- 新的 memory cloud
- 新的 agent memory SDK
- 新的长期记忆 API

#### 27.1.4 纯 token 降本工具

OpenAI、Anthropic 都已经把 prompt caching、长上下文优化讲得很清楚。

因此 Goal Engine 不应把自己定义为：

- 省 token 工具
- prompt 压缩工具

降本可以是结果，但不能是核心类别。

### 27.2 Goal Engine 应坚持的竞争边界

Goal Engine 更适合坚持以下定位：

#### 27.2.1 面向已有 OpenClaw Agent 的增强层

Goal Engine 应优先增强用户已有 Agent，而不是要求用户重建一个全新的 agent stack。

它的核心价值是：

- 给现有 Agent 增加长期目标连续性
- 给现有 Agent 增加失败后恢复机制
- 给现有 Agent 增加 session rollover 与恢复包能力

#### 27.2.2 面向本地 Agent 的长期目标控制层

Goal Engine 的主体不是托管执行，而是：

- 本地 Agent 继续做行动主体
- Goal Engine 提供长期控制、恢复与评估

这与通用托管 agent 平台应明确区分。

#### 27.2.3 面向长任务、分阶段、易漂移场景

Goal Engine 应聚焦最容易暴露真实价值的场景：

- 长时间目标推进
- 多次 session 切换
- 阶段式任务
- 易失败、易漂移、易烧 token 的任务

而不是泛化到所有 agent 场景。

#### 27.2.4 面向“失败后继续”，而不是“更聪明”

Goal Engine 的差异化不应来自：

- 模型更强
- 记忆更多
- 功能更全

而应来自：

- 失败后不直接停住
- 新 session 后不丢主目标
- 在有限上下文预算下继续推进

### 27.3 应避免的产品表述

以下表述容易把 Goal Engine 带回错误竞争区，后续应避免使用：

- stateful agent platform
- hosted agent runtime
- memory cloud
- persistent memory API
- self-evolving general agent system

### 27.4 当前更稳的产品表述

目前更稳、更不容易撞上大厂主战场的表述是：

- OpenClaw Agent 的长期目标控制层
- 面向已有本地 Agent 的 session rollover 与 recovery packet 增强层
- 面向长任务的目标连续性、失败恢复与上下文预算控制系统

### 27.5 对后续路线的约束

从现在开始，后续设计与对外表达必须接受以下约束：

1. 不把 Goal Engine 做成通用 agent platform
2. 不把 Goal Engine 做成通用 memory API
3. 不把 Goal Engine 做成纯降本工具
4. 差异化必须建立在 OpenClaw-native、本地 Agent 增强、长任务连续性这三点上
