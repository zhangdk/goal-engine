# Goal Engine Observability UI Implementation Plan

> Status: reviewed implementation plan
> Source spec: `docs/superpowers/specs/2026-04-06-goal-engine-observability-ui-design.md`

**Goal:** 在不引入新事实源、不重做前端工程的前提下，为 Goal Engine 增加一个本地 UI，让用户能同时看到原始产品意图、当前 MVP 意图、当前实现状态，以及明确的实现差距。

## Step 0: Scope Challenge

### What already exists

现有代码已经覆盖了这次工作的绝大多数事实读取能力：

- `GET /api/v1/goals/current`
  - 当前 active goal
- `GET /api/v1/policies/current?goal_id=...`
  - 当前 guidance
- `GET /api/v1/recovery-packet?goal_id=...`
  - 当前 recovery summary
- `POST /api/v1/goals`
  - 创建 goal
- `POST /api/v1/attempts`
  - 记录 attempt
- `POST /api/v1/reflections`
  - 写 reflection 并更新 policy
- `POST /api/v1/retry-guard/check`
  - 判断是否 blocked
- repo 层已经有：
  - `AttemptRepo.getLatestFailure()`
  - `ReflectionRepo.getLatest()`
  - `PolicyRepo.getByGoal()`

现有测试也已经覆盖了关键行为闭环：

- `service/e2e/openclaw-user-experience.spec.ts`
- `service/test/routes.recovery.test.ts`

### Minimum change set

实现这层 UI 的最小改动集应该是：

1. 一个新的 UI 聚合模块
2. 一个新的 UI 路由模块
3. `service/src/app.ts` 挂载新路由
4. 一个新的 API 集成测试文件
5. 一个新的浏览器 E2E 文件
6. 文档同步

不应该做的事：

- 不新起一个 Vite/Next 前端
- 不新增数据库表
- 不新增“UI service”这类抽象层
- 不解析 markdown 文档作为运行时输入

### Complexity decision

原始想法如果落成“独立前端 + 聚合接口 + 动作编排层 + 审计模型层”，会明显过度。

**结论：收 scope。**

采用下面这条最小方案：

- 页面直接挂在 `service`
- 使用 Hono 原生 HTML 返回能力
- 不引入 JSX 配置改造
- 动作尽量复用现有 API
- 只新增一个轻量聚合接口

### Search check

基于 Hono 官方文档：

- Hono 官方支持直接返回 HTML
- Node 适配器支持本地静态文件或直接 HTML 响应

推荐方案：

- **[Layer 1]** 用 `hono/html` 直接返回页面
- 不为了这一页切换到 JSX / 单独前端工程

原因：

- diff 更小
- 不需要改 `tsconfig` 和 dev 脚本
- 这页本质是观测台，不值得花一个“创新 token”去搭单独前端栈

### TODO cross-reference

- 当前仓库没有 `TODOS.md`
- 本次计划不依赖既有 deferred items

### Completeness check

第一版不该偷懒成“只有页面能渲染”。

完整版本应当同时包含：

- 原始需求映射
- 当前 MVP 映射
- 当前实现状态
- covered / partial / missing 审计
- 浏览器 E2E

这些都属于“lake”，不是“ocean”。

---

## Architecture Recommendation

### Opinionated recommendation

采用**单服务托管 + 单聚合接口 + 前端直接调现有动作接口**。

```text
Browser
  |
  +--> GET /ui
  |      |
  |      +--> inline HTML/CSS/JS
  |
  +--> GET /api/v1/ui/observability
  |      |
  |      +--> current goal
  |      +--> current policy
  |      +--> recovery packet
  |      +--> latest failure/reflection
  |      +--> projection readiness
  |      +--> gap audit
  |
  +--> Existing action routes
         |
         +--> POST /api/v1/goals
         +--> POST /api/v1/attempts
         +--> POST /api/v1/reflections
         +--> POST /api/v1/retry-guard/check
         +--> GET  /api/v1/recovery-packet
```

### Why this is the right level

- 复用现有 service 事实源
- 避免新前端基础设施
- 避免新动作编排后端
- 明确保留当前实现差距，而不是替产品补新语义

### Files to change

**Create**

- `service/src/ui/requirements.ts`
- `service/src/ui/observability.ts`
- `service/src/routes/ui.ts`
- `service/test/routes.ui-observability.test.ts`
- `service/e2e/observability-ui.spec.ts`

**Modify**

- `service/src/app.ts`
- `README.md`
- `docs/README.md`

总计 8 个文件，压在可接受范围内。

---

## Route And Module Design

### 1. `service/src/ui/requirements.ts`

职责：

- 以显式常量形式保存两层需求映射
  - original intent
  - current MVP intent

不要做的事：

- 不在运行时解析 PRD markdown
- 不把 docs 读盘变成页面依赖

### 2. `service/src/ui/observability.ts`

职责：

- 从现有 repo / service 能力构造 UI 首页 payload
- 生成 covered / partial / missing 审计结果

建议导出：

- `buildObservabilityView(...)`

输出结构建议：

```ts
type ObservabilityView = {
  originalIntent: RequirementCard[]
  currentMvpIntent: RequirementCard[]
  implementationStatus: {
    activeGoal: GoalSummary | null
    currentGuidance: PolicySummary | null
    latestFailure: FailureSummary | null
    latestReflection: ReflectionSummary | null
    currentRecovery: RecoverySummary | null
    projectionReady: boolean
  }
  gapAudit: AuditItem[]
}
```

### 3. `service/src/routes/ui.ts`

职责：

- `GET /ui`
  - 返回页面 HTML
- `GET /api/v1/ui/observability`
  - 返回 UI 聚合 payload

页面推荐使用：

- `hono/html`
- 少量内联 CSS
- 少量内联 JS

原因：

- 最小 diff
- 最低启动成本
- 不需要引入静态构建步骤

### 4. Frontend action strategy

页面动作直接调用现有 API：

- `Start Goal` -> `POST /api/v1/goals`
- `Show Status` -> refresh `GET /api/v1/ui/observability`
- `Record Failure` -> sequential:
  1. `POST /api/v1/attempts`
  2. `POST /api/v1/reflections`
- `Check Retry` -> `POST /api/v1/retry-guard/check`
- `Recover` -> refetch `GET /api/v1/ui/observability`

**关键建议：不要新增 UI 动作编排接口。**

原因：

- 当前 service 已有足够 mutation surface
- 新增 orchestration route 只会复制已有语义
- 第一版 UI 是观测台，不是最终用户产品

代价：

- `Record Failure` 表单必须显式收集 reflection 所需字段

这是可接受的，因为它忠实暴露了当前实现，而不是伪装成“已经自动化”。

---

## Critical Product Truths The UI Must Not Hide

这两点必须在计划中明确，不能被页面视觉掩盖：

### 1. Retry evidence is not persisted

当前实现里：

- `retry-guard/check` 只返回当前检查结果
- 没有数据库表记录“最近一次 retry check 事件”

因此：

- UI 可以显示“本次 check 的结果”
- 不能诚实地声称“系统保存了最近 retry check 历史”

计划处理方式：

- 在 Gap Audit 中把“retry check evidence history”标记为 `missing`
- 在当前实现状态中显示“last live retry result”而不是“persisted latest retry event”

### 2. Recovery is recomputed, not replayed

当前实现里：

- recovery summary 是按当前事实实时生成的
- 不是一个独立持久化事件流

因此：

- UI 可以显示“当前 recovery snapshot”
- 不能声称“系统保存了 recover 历史事件”

计划处理方式：

- 将“recovery available now”标记为 `covered`
- 将“recovery history / replay trail”标记为 `missing`

---

## Gap Audit Rules

第一版只做这些审计项：

```text
1. Long-term goal state exists
2. Failure can become updated guidance
3. Repeat path can be blocked
4. Current recovery snapshot is available
5. Projection readiness is observable
6. Retry-check history is persisted
7. Recovery event history is persisted
8. OpenClaw-specific UI surface exists
```

建议判定：

- 1: `covered`
- 2: `covered`
- 3: `partial`
  - current live result available
  - no persisted history
- 4: `covered`
- 5: `covered`
- 6: `missing`
- 7: `missing`
- 8: `missing`

这正是这层 UI 的价值：

- 不是给系统涂脂抹粉
- 而是把“做到哪里”和“没做到哪里”同时展示出来

---

## Test Diagram

```text
                     +----------------------+
                     |  GET /ui             |
                     |  render shell        |
                     +----------+-----------+
                                |
                                v
                  +-------------+--------------+
                  | GET /api/v1/ui/observability |
                  +------+------+------+------+
                         |      |      |      |
                         v      v      v      v
                  current goal policy recovery latest failure
                         |
                         v
                     gap audit


User actions
-----------

Start Goal
  POST /api/v1/goals
    -> refetch observability

Record Failure
  POST /api/v1/attempts
    -> POST /api/v1/reflections
      -> refetch observability

Check Retry
  POST /api/v1/retry-guard/check
    -> update live retry result

Recover
  refetch observability
    -> verify recovery snapshot
```

### New codepaths to test

1. `/ui` shell renders
2. `/api/v1/ui/observability` with active goal
3. `/api/v1/ui/observability` with no active goal
4. gap audit returns correct statuses
5. `Record Failure` client flow updates page state
6. `Check Retry` blocked result is visible
7. `Recover` re-renders current recovery snapshot

---

## Test Plan

### Unit / integration

New test file:

- `service/test/routes.ui-observability.test.ts`

Cover:

- active goal + policy + recovery -> expected payload
- no active goal -> empty state + correct audit statuses
- missing policy -> partial/missing audit states
- projection files missing -> projectionReady false
- retry history unavailable -> audit remains `missing`

### Browser E2E

New test file:

- `service/e2e/observability-ui.spec.ts`

Flow:

1. Open `/ui`
2. See original intent section
3. See current MVP intent section
4. Start goal
5. Record failure
6. See guidance update
7. Run retry check with repeated path
8. See blocked result
9. Recover
10. See updated implementation status and gap audit

### Required assertions

- page contains both “covered” and “missing” states
- page shows that retry history is not persisted
- page shows current recovery snapshot, not fake history

---

## Failure Modes

| Codepath | Realistic failure | Test? | Error handling? | Silent? |
|---|---|---:|---:|---:|
| `/ui` render | HTML shell loads but JS bootstrapping fails | E2E yes | page-level error state required | currently yes |
| `/api/v1/ui/observability` | no active goal | yes | yes | no |
| `/api/v1/ui/observability` | policy missing | yes | yes | no |
| projection readiness | expected files missing | yes | yes | no |
| record failure flow | attempt created but reflection call fails | must add | must add | currently would be silent in naive client |
| retry check flow | goal exists but no policy | must add | existing API yes | no |
| recover display | recovery loads but UI still shows stale status | must add | client refresh logic required | currently possible |

### Critical gaps

必须显式补上的两个 failure protections：

1. `Record Failure` 两段式提交如果第二步失败，页面必须显示“attempt 已写入但 reflection 未完成”
2. 页面首次加载失败时必须显示可见错误，而不是空白页

---

## Implementation Tasks

### Task 1: Build requirement mapping constants

- [ ] Add `service/src/ui/requirements.ts`
- [ ] Define typed `originalIntent`
- [ ] Define typed `currentMvpIntent`

### Task 2: Build observability aggregation

- [ ] Add `service/src/ui/observability.ts`
- [ ] Read current goal, policy, recovery, latest failure, latest reflection
- [ ] Compute projection readiness from local files
- [ ] Compute gap audit statuses

### Task 3: Build UI route

- [ ] Add `service/src/routes/ui.ts`
- [ ] Serve `/ui`
- [ ] Serve `/api/v1/ui/observability`
- [ ] Add inline CSS/JS shell

### Task 4: Wire action panel

- [ ] Start Goal form
- [ ] Record Failure form with explicit reflection fields
- [ ] Retry Check form
- [ ] Recover button
- [ ] Refetch and rerender after each action

### Task 5: Add tests

- [ ] Add `service/test/routes.ui-observability.test.ts`
- [ ] Add `service/e2e/observability-ui.spec.ts`
- [ ] Ensure first test is failing before implementation

### Task 6: Update docs

- [ ] Add `/ui` usage to `README.md`
- [ ] Update `docs/README.md`

---

## NOT in scope

- Standalone frontend app
  - not needed for a single observability screen
- Persisted retry-check history
  - would require new model/schema and changes the product truth
- Persisted recovery-event history
  - same reason; out of scope for this UI slice
- OpenClaw embedded canvas page
  - second-phase integration, not first proof
- Automatic reflection generation in service
  - current service contract does not own that behavior

---

## R&D Hand-off Recommendation

如果按最小、可验证、可回滚的方式实施，研发应按下面顺序执行：

1. 先写 `routes.ui-observability.test.ts`
2. 再实现 `requirements.ts` 和 `observability.ts`
3. 再挂 `/api/v1/ui/observability`
4. 再做 `/ui` 页面壳
5. 再做 action panel
6. 最后补浏览器 E2E

这是“make the change easy, then make the easy change”的顺序：

- 先把聚合数据稳定下来
- 再让 UI 只做展示和轻交互

## Review Outcome

**Recommended mode:** implement as scoped here, without separate frontend or extra orchestration routes.

**Reason:** 这是最小 diff、最高可验证性、最低架构风险的版本，同时能忠实暴露当前产品差距。
