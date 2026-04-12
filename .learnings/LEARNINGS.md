# LEARNINGS

## [LRN-20260408-001] bootstrap_fallback_behavior

**Logged**: 2026-04-08T09:14:00Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Goal Engine bootstrap 失败时 fallback 到本地 projection 文件作为唯一状态来源

### Details
- 调用 `goal_engine_bootstrap` 时服务不可达 (localhost:3100)
- 工具直接报错，但 CLI 输出显示 fallback 到 `show goal status`
- 输出显示 "Session bootstrap used local projection first"
- 本地 projection 文件: `examples/workspace/goal-engine/current-goal.md` 和 `recovery-packet.md`

### Suggested Action
在 BOOT.md 中记录：当 bootstrap 失败但 projection 文件存在时，Goal Engine 会自动使用本地 projection 作为 fallback，此时入口是 `show goal status` 而非失败

### Metadata
- Source: session
- Related Files: examples/workspace/goal-engine/current-goal.md, examples/workspace/goal-engine/recovery-packet.md
- Tags: goal-engine, bootstrap, fallback

---

## [LRN-20260408-002] tool_error_vs_cli_output_mismatch

**Logged**: 2026-04-08T09:15:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Goal Engine 工具报错并不代表完全失败 - CLI 内部 fallback 成功但工具层面返回 error

### Details
- 调用 `goal_engine_bootstrap` 后，工具返回 `{"status": "error", "error": "Command failed..."}`
- 但 CLI raw output 显示: "Session bootstrap used local projection first" 和完整的 goal status
- 关键洞察: 工具层面的 error 是因为 exit code 非 0，但实际业务逻辑已通过 fallback 成功
- 这导致在 OpenClaw session 中误以为 Goal Engine 完全不可用

### Suggested Action
在 TOOLS.md 中记录: 当 Goal Engine 工具返回 error 时，检查 raw output 是否包含有效状态信息，有时 fallback 已成功

### Metadata
- Source: conversation
- Related Files: .learnings/ERRORS.md
- Tags: goal-engine, tool-error, fallback

---

## [LRN-20260408-003] external_goal_skill_must_include_discovery_and_memory

**Logged**: 2026-04-08T09:16:00Z
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
外部目标 skill 不应只约束网页重试，还必须显式纳入 skill discovery、self-improvement、本机原生软件 fallback 和长期记忆。

### Details
- 用户指出，OpenClaw 在失败后不能只请求 cookies/扫码或直接 handoff
- Agent 应先检查本地已安装软件，例如 `WeChat.app`
- Agent 失败后应主动调用或遵循 `self-improvement`
- Agent 在外部目标开始前应优先查找本地 skill，必要时查技能市场或 `find-skill`
- Durable lesson 应写入 `MEMORY.md`，而不是只留在短期 projection 或聊天历史

### Suggested Action
- 扩展 `.agents/skills/external-goal-learning-loop/SKILL.md`
- 在 `BOOT.md` 和 `openclaw/workspace/goal-engine/SKILLS.md` 中加入 skill discovery、自我改进、长期记忆规则
- 创建 `MEMORY.md` 作为长期记忆入口

### Metadata
- Source: user_feedback
- Related Files: .agents/skills/external-goal-learning-loop/SKILL.md, BOOT.md, openclaw/workspace/goal-engine/SKILLS.md, MEMORY.md
- Tags: openclaw, self-improvement, find-skill, memory, native-path

---

## [LRN-20260408-004] openclaw_skill_discovery_must_use_registry_not_fs_listing

**Logged**: 2026-04-08T07:14:22Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
OpenClaw 做 skill 发现时不能用 `ls ~/.openclaw/skills` 代替技能注册表查询，否则会误判“没有现成 skill”。

### Details
- 在微信原生路径验证中，agent 先用 `ls ~/.openclaw/skills/ | grep ...` 查找微信相关 skill
- 结果得出错误结论：“没有现成的微信 skill”
- 但实际通过 `openclaw skills search wechat` 能查到 `wechat-automation` 等 skill
- 同样，`openclaw skills search "macos desktop control"` 能查到 `macos-desktop-control`、`desktop-control`、`peekaboo`
- 用户因此明确纠正：不要再把文件系统枚举当成唯一依据

### Suggested Action
- 在 OpenClaw 相关工作流里，把 `openclaw skills search ...` 作为首选能力发现方式
- 仅在需要调试本地安装状态时，才补充 `ls ~/.openclaw/skills`
- 将这个规则写入原生软件/外部目标相关 skill 文档

### Metadata
- Source: user_feedback
- Related Files: .agents/skills/external-goal-learning-loop/SKILL.md, .learnings/ERRORS.md
- Tags: openclaw, skill-discovery, correction, native-path

---

## [LRN-20260408-005] wechat_desktop_control_requires_real_app_identity

**Logged**: 2026-04-08T07:14:22Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
控制微信桌面端时，必须针对真实主应用 `微信 (com.tencent.xinWeChat)` 或其 PID，而不能把 `WeChatAppEx Helper` 当成可操作窗口宿主。

### Details
- 在原生软件路径验证中，agent 先用 `peekaboo list windows --app WeChat`
- 返回的其实是 `WeChatAppEx Helper (Renderer)`，窗口数为 0，导致错误判断“没有 WeChat 窗口”
- 后续通过 `peekaboo list apps | grep -i wechat` 才发现：
- `微信 (com.tencent.xinWeChat) - PID: 446 - Windows: 2`
- `微信 (com.tencent.flue.WeChatAppEx) - PID: 678 - Windows: 0`
- 这说明微信控制链的第一步必须是识别正确宿主进程和可见窗口，再做聚焦、截图和 UI 读取

### Suggested Action
- 在微信自动化相关流程中，先执行应用枚举，再绑定到 `com.tencent.xinWeChat`
- 如果只看到 helper 进程，不应直接得出“微信不可控”
- 将这条 gotcha 写入 `TOOLS.md` 或相关自动化 skill

### Metadata
- Source: session
- Related Files: .learnings/ERRORS.md
- Tags: wechat, peekaboo, desktop-control, best_practice

---

## [LRN-20260409-001] ui_is_observer_not_primary_interaction_surface

**Logged**: 2026-04-09T05:21:12Z
**Priority**: critical
**Status**: pending
**Area**: frontend

### Summary
本项目的主交互面始终是 OpenClaw，`/ui` 的初衷是观察 Agent 进化与分析，不应被当成用户主操作台。

### Details
- 在最近一轮分析中，我把 `/ui` 的 start/replace goal 路径当成了产品主链路来优化
- 用户明确纠正：真实用户交互始终发生在 OpenClaw 聊天中，`/ui` 只负责旁路观察
- 这意味着项目需求必须围绕“OpenClaw 执行面 -> Goal Engine 状态沉淀 -> `/ui` 观察证据”这条主链来判断
- 因此，`/ui` 中的 goal 创建和替换能力最多是测试夹具或调试入口，不能主导需求分析
- 后续验证的成功标准也必须调整为：用户在 OpenClaw 下达任务后，`/ui` 是否正确观察到目标对齐、失败学习、换路与恢复

### Suggested Action
- 重新收敛项目需求文档，明确 OpenClaw 是唯一主交互面，`/ui` 是 observer
- 后续功能优先级应转向 OpenClaw 执行事实如何自动沉淀成 `/ui` 可见证据
- 任何 `/ui` 侧交互改动，都应标记为调试/测试辅助，而不是核心产品能力

### Metadata
- Source: user_feedback
- Related Files: service/src/routes/ui.ts, service/src/ui/agent-detail.ts, docs/goal-engine-observer-execution-run-2026-04-09-office-phone.md
- Tags: correction, product-boundary, openclaw, observer-ui

---

## [LRN-20260409-002] runtime_state_path_must_be_absolute_across_openclaw_boundaries

**Logged**: 2026-04-09T05:56:38Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
当通过 `pnpm --dir agent-adapter` 调用 OpenClaw adapter CLI 时，`--runtime-state` 不能传相对路径，否则会写到 `agent-adapter/.openclaw/` 而不是工作区根目录 `.openclaw/`。

### Details
- 浏览器验证时，`goal_engine_show_goal_status(expectedGoalTitle=...)` 已经返回了正确的 `Goal alignment: blocked`
- 但 `/ui` 没有看到新事件，根因不是 UI 逻辑，而是 runtime snapshot 被写到了错误位置
- `pnpm --dir agent-adapter openclaw ... --runtime-state .openclaw/runtime-state.json` 会相对 `agent-adapter/` 解析
- 结果：
  - `agent-adapter/.openclaw/runtime-state.json` 被写成了最新 `blocked` snapshot
  - 工作区根目录 `.openclaw/runtime-state.json` 仍保留旧的 `aligned` snapshot
  - `/ui` 读取的是根目录 runtime-state，所以继续显示旧事实
- 改成绝对路径 `/Users/gushuai/dev/Protocol30/goal-engine/.openclaw/runtime-state.json` 后，`/ui` 立即能观察到“任务未对齐”事件

### Suggested Action
- OpenClaw 插件和命令模板里，`workspaceStatePath` / `runtimeStatePath` 应优先使用绝对路径
- 在 `TOOLS.md` 或 OpenClaw 集成文档中记录：通过 `pnpm --dir ...` 调 CLI 时，状态文件路径不要用相对路径
- 后续浏览器回归应显式核对写入的是工作区根目录 `.openclaw/runtime-state.json`

### Metadata
- Source: conversation
- Related Files: agent-adapter/src/openclaw/cli.ts, agent-adapter/src/openclaw/runtime-state.ts, openclaw/commands.json, .openclaw/runtime-state.json
- Tags: openclaw, runtime-state, path-resolution, best_practice

---

## [LRN-20260409-003] service_ui_tests_must_isolate_real_runtime_state

**Logged**: 2026-04-09T05:56:38Z
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
`service` 的 UI 路由测试如果默认读取真实 `.openclaw/runtime-state.json`，会被本机 OpenClaw 会话残留污染，导致断言失真。

### Details
- 在补 `goal alignment gate` 后，`routes.ui-agents.test.ts` 开始出现看似随机的失败
- 表现包括：
  - 本应是“暂无证据”的新 goal，用例却读到了真实环境里的 `goalAlignmentSnapshots`
  - stale projection 用例被本机 `blocked` alignment snapshot 抢先命中
- 根因是测试默认透传了仓库里的真实 `.openclaw/runtime-state.json`
- 只要开发机刚跑过浏览器验证，测试就会吃到真实 `goal-engine-demo` 的 snapshot
- 解决方式是：
  - `beforeEach` 为测试创建临时空的 `runtime-state.json`
  - 所有专门构造的 `createApp(...)` 变体也显式传入该隔离文件

### Suggested Action
- 把“UI 测试不得依赖真实 `.openclaw/runtime-state.json`”作为固定测试约束
- 以后任何读取 managed OpenClaw runtime 的 service 测试，都要自己构造临时 runtime-state
- 考虑把这条规则提升到测试 helper 或 `AGENTS.md`

### Metadata
- Source: error
- Related Files: service/test/routes.ui-agents.test.ts, service/src/ui/managed-openclaw-agents.ts
- Tags: tests, runtime-state, isolation, openclaw

---

## [LRN-20260409-004] bootstrap_identity_flow_can_hijack_first_real_task

**Logged**: 2026-04-09T06:20:00Z
**Priority**: critical
**Status**: pending
**Area**: product

### Summary
如果工作区级 `BOOTSTRAP.md` 仍要求 fresh session 先做身份寒暄，它会抢占 OpenClaw 的第一条真实任务，导致 Goal Engine 主链还没开始就已经跑偏。

### Details
- 浏览器复验时，新 session 在收到明确外部任务后，先进入了 “Who am I / Who are you” 这一类身份引导
- 这让首条真实任务没有直接进入 `goal_engine_bootstrap -> goal_engine_show_goal_status(expectedGoalTitle)` 的主链
- 项目的真实需求是：OpenClaw 是唯一主交互面，用户在聊天中下达的外部目标必须优先于人格 onboarding
- 因此，启动提示不能再默认把身份建立当成首要动作

### Suggested Action
- 将 `BOOTSTRAP.md` 改为 task-first 约束：若首条消息已经是具体任务，则直接执行 `BOOT.md`
- 只有在用户显式要求重设 identity/persona 时，才允许进入身份引导
- 后续所有 fresh-session 验证都要检查：首条任务有没有先经过 goal alignment gate

### Metadata
- Source: browser_validation
- Related Files: BOOTSTRAP.md, BOOT.md, memory/2026-04-08-boot-check.md
- Tags: bootstrap, openclaw, goal-alignment, product-boundary

---

## [LRN-20260409-005] openclaw_web_search_is_not_stably_guardable_via_before_tool_call

**Logged**: 2026-04-09T08:35:00Z
**Priority**: critical
**Status**: pending
**Area**: platform-boundary

### Summary
在当前 OpenClaw 版本里，`goal-engine` 插件级 `before_tool_call` hook 已成功注册，但内置 `web_search` 仍可能绕过这层拦截；而 provider API 也不提供稳定的“包装当前 active provider”能力。

### Details
- 浏览器实测中，`externalToolGuards.goal-engine-demo.status = needs_status_check` 已经写入根目录 `.openclaw/runtime-state.json`
- `openclaw plugins inspect goal-engine` 也确认 `before_tool_call (priority 100)` 已加载
- 但在 OpenClaw 聊天中强制要求“直接调用 `web_search`，不要先 `goal_engine_show_goal_status`”时，`web_search` 仍然成功执行
- OpenClaw 安装目录源码显示：
  - `web_search` / `web_fetch` 确实走 `registerWebSearchProvider` / `registerWebFetchProvider`
  - provider id 在 loader 中是全局唯一，插件不能用同名 provider 覆盖内置 provider
  - 当前网关配置没有显式 `tools.web.search.provider`，因此运行时会自动选择已有 provider
- 这意味着如果要在 provider 层做 guard，只能：
  - 新增一个 wrapper provider，并把配置显式切到它
  - 或者依赖不稳定的内部 hashed runtime 模块去代理当前 provider
- 这两条都不是稳定的产品级集成点

### Suggested Action
- 不要再继续假设 `before_tool_call` 一定能拦住内置 `web_search`
- 把这件事视为平台边界：当前 Goal Engine 只能稳定做到“先暴露 blocked 状态并要求 Agent 停止”，不能强制拦截所有内置 web tool
- 如果未来必须做 provider 层 guard，优先要求：
  - OpenClaw 暴露稳定的 provider wrapping / delegation API
  - 或允许插件在不依赖 hashed internal imports 的情况下接管 `web_search`

### Metadata
- Source: browser_validation + local_source_inspection
- Related Files: index.ts, .openclaw/runtime-state.json, /Users/gushuai/.nvm/versions/node/v22.22.1/lib/node_modules/openclaw/dist/runtime-Cz50qJef.js, /Users/gushuai/.nvm/versions/node/v22.22.1/lib/node_modules/openclaw/dist/loader-BSIqIOsD.js
- Tags: openclaw, web_search, hook, provider, platform-boundary

---

## [LRN-20260409-006] goal_alignment_order_matters_more_than_web_search_interception

**Logged**: 2026-04-09T10:08:00Z
**Priority**: critical
**Status**: pending
**Area**: product

### Summary
不要把“拦截 `web_search`”误当成产品目标。真正要约束的是 Agent 的执行顺序：新任务先做 goal alignment gate，blocked 时停住，对齐后再执行外部动作。

### Details
- 在连续几轮修复里，注意力一度落到了 `before_tool_call` 和 provider 层能否强拦内置 `web_search`
- 用户明确指出：`web_search` 不是问题本身，问题是为什么 Agent 会在 goal 未对齐时已经开始外部执行
- 这次纠偏后，目标重新收敛为：
  - 新任务进入
  - 先 `goal_engine_show_goal_status(expectedGoalTitle=...)`
  - 如果 blocked，就明确停住并写成观察证据
  - 对齐后，再继续搜索或浏览
- 因此，tool-level 拦截只是可选手段，不应主导产品判断和实现优先级

### Suggested Action
- 后续验证和实现都以“先对齐再执行”的主链为验收标准
- 不再把“强拦 `web_search`”作为必须完成项，除非平台稳定支持
- 任何新的修复都先问一句：这是在改善决策顺序，还是在错误层面上继续打补丁？

### Metadata
- Source: user_feedback
- Related Files: index.ts, BOOT.md, BOOTSTRAP.md, service/src/ui/agent-detail.ts
- Tags: correction, goal-alignment, execution-order, product-boundary
- See Also: LRN-20260409-005

---

## [LRN-20260410-001] stop_fixing_the_external_goal_loop_piece_by_piece

**Logged**: 2026-04-10T02:30:21Z
**Priority**: critical
**Status**: pending
**Area**: product

### Summary
外部目标学习闭环不能再用“修一处、验一处”的方式推进。用户明确要求深度思考整体解决方案，后续必须以完整闭环为单位设计、实现和验收。

### Details
- 虽然这几轮已经逐步打通了 `alignment -> fallback -> failure writeback -> /ui`，但推进方式仍然过于局部
- 用户明确指出：需要的是深度方案，而不是挤牙膏式地一点点补
- 对当前项目而言，真正需要一次性思考的是：
  - 新任务进入后的统一调度顺序
  - fallback 与失败分类的统一状态机
  - failure/reflection/policy/retry/recovery 的完整闭环
  - `/ui` 如何证明“下一轮行为真的变了”
- 如果继续按局部断点修补，虽然每次都能改善一点，但很难形成可信的系统感，也会持续消耗用户信心

### Suggested Action
- 后续不再以单点修复为主叙事，而是围绕“完整外部目标学习闭环”给出一次性方案
- 实现上应聚合为少数几个工作包：
  - 编排层：尝试状态机 / 轮次编排
  - 证据层：统一 runtime + persisted evidence
  - 观察层：明确判断行为变化是否成立
- 验收必须以完整主链为单位：
  - 新任务
  - 对齐
  - 尝试
  - 失败学习
  - 下一轮换路
  - `/ui` 观察

### Metadata
- Source: user_feedback
- Related Files: BOOT.md, openclaw/README.md, service/src/ui/agent-detail.ts, .learnings/LEARNINGS.md
- Tags: correction, execution-strategy, product, external-goal-loop
- See Also: LRN-20260409-006

---

## [LRN-20260410-002] avoid_incremental_patchwork_when_user_expects_closed_loops

**Logged**: 2026-04-10T03:40:00Z
**Priority**: critical
**Status**: pending
**Area**: product

### Summary
当用户明确要求“避免挤牙膏”时，后续工作必须按完整链路成组推进，而不是只修刚暴露出的单一表象问题。

### Details
- 本轮浏览器验证后，我先补了 `/ui` detail 页自动刷新，这是有效修复，但仍然偏向单点补洞
- 用户明确再次强调：不要挤牙膏式方案，尽量每次都全面
- 对当前项目，这意味着每次修正都应优先按一个完整链路打包思考：
  - OpenClaw 执行面可读性
  - Goal Engine 持久化证据链
  - `/ui` API 摘要一致性
  - `/ui` 页面实时呈现一致性
- 如果只修其中一层，很容易在下一轮验证立刻暴露同链路的下一个缺口，削弱系统感

### Suggested Action
- 后续验证相关改动按“执行面 + 证据面 + 观察面”一起检查和修正
- 提出修复方案时，优先给出同链路的完整收口项，而不是只解决单点现象
- 下一轮应统一排查：
  - OpenClaw 每轮是否显式输出 `do_not_repeat/new_path/why_better_than_last_round`
  - runtime-state / persisted facts / `/ui` API / `/ui` 页面是否同轮一致
  - observer 是否能解释行为变化，而不只是被动显示事件

### Metadata
- Source: user_feedback
- Related Files: .learnings/LEARNINGS.md, BOOT.md, openclaw/workspace/goal-engine/AGENTS.md, service/src/routes/ui.ts
- Tags: correction, execution-strategy, closed-loop, validation
- See Also: LRN-20260410-001

---

## [LRN-20260411-001] plan_whole_task_and_execute_without_drip_feeding

**Logged**: 2026-04-11T13:01:55Z
**Priority**: critical
**Status**: pending
**Area**: product

### Summary
执行已有实施计划时，不要靠用户反复追问来发现剩余任务；必须先完整读取计划、列出收尾清单，并一次性推进到验证完成。

### Details
- 用户明确纠正：“不要挤牙膏，一次规划完任务并实施。”
- 本轮知识系统实现虽然最终完成，但过程中仍暴露出收尾阶段不够主动：
  - Task 12 的文档、schema probe、API probe、最终 diff hygiene 和 finishing workflow 应在进入收尾时一次性拉出完整 checklist
  - E2E 暴露旧断言和 runtime-state 污染后，应扩大检查同类残留，而不是只盯单个失败点
  - 回答“还有未完成任务吗”前，应主动对照计划逐项确认，而不是只依据当前 git/test 状态
- 后续执行计划时，必须把“计划读取 -> 任务分解 -> 实施 -> 验证 -> 文档 -> 提交 -> finishing option”作为一个完整闭环。

### Suggested Action
- 接到“按计划执行”时，先读完整计划并形成一次性 checklist，尤其标记 verification/docs/commit/cleanup 收尾项
- 实施中每完成一个阶段就更新 checklist，避免遗漏隐性任务
- 出现一个旧语义断言失败时，用 `rg` 扫同类断言并批量修正
- 最终答复前对照原计划 acceptance criteria，而不只看测试是否通过

### Metadata
- Source: user_feedback
- Related Files: docs/superpowers/plans/2026-04-11-goal-engine-knowledge-system.md, .learnings/LEARNINGS.md
- Tags: correction, execution-strategy, planning, closed-loop, verification
- See Also: LRN-20260410-001, LRN-20260410-002
