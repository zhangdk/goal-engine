# Goal Engine Observer Execution Run - 2026-04-10 Final Validation

**日期：** 2026-04-10  
**执行方式：** 全程浏览器实跑，主交互面只使用 OpenClaw；`/ui` 只作为 observer  
**执行人：** Codex  
**目标：** 终结本轮沟通验证，判断 Goal Engine 是否已经从“零散能力集合”推进到“可验证的目标驱动 Agent 学习系统”

## 1. 本轮验收边界

本轮不再把 `/ui` 当成控制台，也不再以接口返回为成功依据。

唯一有效主链是：

1. 用户在 OpenClaw 下达真实外部任务
2. Agent 先做 Goal alignment gate
3. Agent 执行一轮路径
4. 失败或进展写回 Goal Engine
5. `/ui` 观察这轮行为为何不同

本轮只接受两类证据：

- OpenClaw 聊天窗口中的真实执行顺序
- Goal Engine `/ui` 中的真实观察结果

## 2. 本轮前的核心改进

在这轮终局验收前，系统已经完成了几类关键修复。

### 2.1 主交互面纠偏

- 明确收敛：**OpenClaw 是唯一主交互面**
- `/ui` 只做观察和分析，不再作为产品主链的任务入口

### 2.2 Goal alignment gate

- 新外部任务进入时，Agent 已开始先调用 `goal_engine_show_goal_status(expectedGoalTitle=...)`
- `blocked` 结果能写回 runtime-state，并被 `/ui` 观察到

### 2.3 Runtime writeback

- OpenClaw live 聊天中的 Goal Engine 工具调用，已经能稳定写回根目录 `.openclaw/runtime-state.json`
- `/ui` 不再只依赖旧 projection 或人工刷新后的 service 结果

### 2.4 Failure / retry learning chain

- `goal_engine_record_failed_attempt`
- `goal_engine_check_retry`
- `reflection`
- `policy_update`
- `recovery`

这些已经可以形成持久化证据链，而不只是聊天里“口头承认失败”。

### 2.5 Observer/orchestrator slice

`/ui` 当前状态已补出这组字段：

- `last_path`
- `next_path`
- `why_different`
- `forbidden_paths`

并且 verdict 已不再只会机械停在 `partial`；当路径真实变化时，能够进入更强的“明显改善”判定。

## 3. 本轮最终验收任务

在 OpenClaw 聊天里下达的新任务是：

```text
帮我在上海浦东张江找一个适合 5-8 人做产品直播或线上课程录制的小型拍摄空间，预算半天 1500-4000 元。最终必须给我至少一个页面明确展示的联系电话，并附上场地名称、地址、来源链接。不要用搜索摘要里的号码。如果当前 Goal Engine active goal 和这个任务不一致，先处理对齐，不要直接搜索。如果某条路径失败，明确说明 do_not_repeat、new_path、why_better_than_last_round，然后只执行这一条新路径。
```

这个任务和前面的“办公室电话”“播客录音间”不同，但路径相似，适合验证：

- 目标对齐是否已内化
- 失败后换路是否已内化
- `/ui` 是否能观察到“为什么这轮不同”

## 4. OpenClaw 执行面结果

### 4.1 顺序是否正确

本轮 OpenClaw 浏览器实跑中，Agent 的前几步顺序为：

1. `goal_engine_show_goal_status`
2. `goal_engine_start_goal`
3. `exec` 路径执行
4. `goal_engine_record_failed_attempt`
5. `goal_engine_check_retry`

这点是本轮最重要的正向结果。

它说明系统已经不再回到早期那种：

- 新任务一来直接 `web_search`
- 或旧 goal 未清就直接沿旧路径继续跑

当前顺序已经开始服从：

**先对齐，再启动当前 goal，再执行具体路径。**

执行面截图：

- [final-validation-openclaw-live.png](/Users/gushuai/dev/Protocol30/goal-engine/final-validation-openclaw-live.png)

### 4.2 是否出现了真实换路

有。

聊天中出现了明确的路径说明：

- `new_path: 尝试访问场地租赁垂直平台`
- `why_better_than_last_round: 之前尝试的 Avoid 路径均为通用搜索/地图/专业平台，本轮尝试垂直领域的场地租赁网站，这些平台更可能直接展示联系电话而非搜索摘要`

这说明 Agent 已经不只是“继续试试”，而是开始满足以下要求：

- 明确说出 `new_path`
- 明确说出 `why_better_than_last_round`
- 按这条路径推进

### 4.3 最终结果是否达成

**未达成。**

本轮没有拿到一个页面明确展示、且可交付验收的联系电话。

所以本轮最终结果不能判定为 `PASS`。

## 5. `/ui` 观察面结果

### 5.1 已同步到的事实

`/ui` 的 detail 页已经同步到了：

- 当前 goal 已切到本轮新任务
- 当前 stage 为 `initial`
- 当前活跃时间已刷新
- 页面没有继续停在旧任务

观察面截图：

- [final-validation-ui-live.png](/Users/gushuai/dev/Protocol30/goal-engine/final-validation-ui-live.png)

### 5.2 未同步完整的事实

本轮 `/ui` 仍存在一个核心缺口：

- OpenClaw 聊天里已经出现新的 `new_path / why_better_than_last_round`
- 也已经出现新的失败写回和 retry check
- 但 detail 页当前状态里仍然停留在：
  - `上一轮路径：web_search`
  - `下一轮路径：待定`
  - `为什么不同：还没有明确行为差异说明`

也就是说：

**聊天执行面的“本轮具体路径变化”还没有稳定折叠进 `/ui current_state`。**

它并不是完全没有证据，而是：

- 目标切换同步了
- 基础 runtime 事件同步了
- 但“这轮为什么不同”的摘要层同步还不完整

## 6. 本轮最终判定

本轮判定为：

**`PARTIAL`**

### 6.1 通过点

- Goal alignment gate 已进入默认顺序
- 新任务会先 `show_goal_status`
- 新任务会切换到新的 active goal
- 失败后会调用 `record_failed_attempt`
- 失败后会调用 `check_retry`
- Agent 已能明确输出 `new_path` 和 `why_better_than_last_round`
- `/ui` 已不再完全看不见真实运行

### 6.2 未通过点

- 最终未拿到页面明确展示的联系电话
- `/ui` 还不能稳定把“本轮路径变化摘要”从聊天执行面折叠到 current state
- 所以系统还没有达到“执行面和证据面完全一致”

## 7. 这轮暴露出的核心问题

### 7.1 问题一：observer 摘要层仍落后于执行层

现在已经不是“完全没写回”，而是“写回到了 timeline/runtime 层，但 current-state 摘要没有完全跟上”。

影响：

- 观察者在 `/ui` 里能看到新任务
- 也能看到部分事件
- 但还无法一眼准确回答：
  - 这轮到底走了什么新路径
  - 为什么它比上一轮更好

这会削弱产品的核心价值：**让进化可验证。**

### 7.2 问题二：最终结果闭环仍受限于环境

当前外部环境限制仍然严重，包括：

- 默认 `web_search` 能力不可用
- `web_fetch` 存在安全限制
- 聚合平台、地图平台、点评平台有反爬或登录阻塞
- 本机原生 App 路径不一定可用

这意味着系统目前更擅长：

- 对齐
- 换路
- 学习
- 写回

但还不擅长在当前环境里稳定拿到真实电话号码。

### 7.3 问题三：最终 verdict 仍偏保守

虽然 observer 已支持 `last_path/next_path/why_different`，但本轮真实页面仍未正确吸收这轮新行为。

结果就是：

- 聊天里已表现出更强的行为变化
- `/ui` verdict 仍然只给出 `部分改善`

这不利于下一轮产品验收，因为它会低估系统真实的学习进步。

## 8. 本轮相比早期验证的进步点

和 2026-04-09 早期“办公室电话”验证相比，本轮进步非常明显。

### 8.1 目标对齐进步

早期：

- 新任务会被旧 active goal 污染
- Agent 会在错 goal 上努力

现在：

- 新任务先做 alignment gate
- 任务切换顺序已经开始稳定

### 8.2 行为学习进步

早期：

- 失败后常常重复同一类网页搜索
- 只能靠人工逼问才承认路径没变

现在：

- Agent 能主动声明 `new_path`
- 能主动说明 `why_better_than_last_round`
- 能在多轮里避免回到被列入 `avoid_strategies` 的老路径

### 8.3 证据链进步

早期：

- OpenClaw 发生了动作，`/ui` 还显示“暂无证据”

现在：

- Goal 切换
- runtime events
- failures
- retry checks
- recovery

已经大体能进入 observer 视野。

这意味着项目已经从“像 demo”推进到“像一个正在形成中的系统”。

## 9. 下一轮产品验收前必须等待的事项

下一轮不要立即继续做“再发一个任务试试”。先等待并完成以下 3 件事。

### 9.1 等待事项一：聊天行为摘要稳定折叠进 `/ui current_state`

必须补上这条同步：

- OpenClaw 聊天中的本轮 `new_path`
- 本轮 `why_better_than_last_round`
- 本轮最新失败写回 / retry 结果

稳定映射到 `/ui` 的：

- `last_path`
- `next_path`
- `why_different`
- `current_risk`

如果这件事没做完，下一轮验收仍然会出现：

- 聊天里看起来很聪明
- `/ui` 看起来还没跟上

### 9.2 等待事项二：observer verdict 升级

需要让 `/ui` 的 verdict 从“事件存在”升级到“行为真的变了”。

最少要支持：

- 同一路径重复 = `no_change` / `stalled`
- 路径变了但无证据 = `claimed_change_only`
- 路径变了且有写回 = `real_change`
- 路径变了且更接近目标 = `goal_progress`

否则验收时仍然会出现“系统实际变好了，但 verdict 说不清”。

### 9.3 等待事项三：设计一个更适合当前环境的结果任务

如果下轮还要继续验“最终结果达成”，任务设计需要更贴近当前环境能力边界。

建议不要继续强依赖：

- 容易触发反爬的通用地图/点评/聚合搜索
- 需要登录或扫码的平台

更适合的下一轮任务应满足：

- 有较高概率在直链页面看到明确电话
- 更少依赖聚合搜索
- 更容易用一个垂直站点或独立官网完成验证

## 10. 建议的下一轮产品验收剧本

下一个验收人建议直接按下面这条剧本跑。

### 10.1 验收任务设计原则

- 新任务必须不同于“办公室电话”“播客录音间”“直播录制空间”
- 但路径仍然应与联系方式获取、路径切换、失败写回有关
- 任务不要过度依赖通用搜索平台

### 10.2 下一轮验收步骤

1. 在 OpenClaw 发一个全新外部任务
2. 只看前 3-5 个动作：
   - `goal_engine_show_goal_status`
   - `goal_engine_start_goal` 或 `recover`
   - 再进入路径执行
3. 若失败，要求：
   - `do_not_repeat`
   - `new_path`
   - `why_better_than_last_round`
4. 立刻切到 `/ui`
5. 核对：
   - 新 goal
   - last path
   - next path
   - why different
   - retry/failure/recovery timeline
6. 最后再判断是否拿到真实电话号码

### 10.3 下一轮验收通过线

`PASS`

- 先 alignment gate
- 失败后明确换路
- `/ui` 正确显示这轮为何不同
- 最终拿到页面明确展示的联系电话

`PARTIAL`

- 先 alignment gate
- 失败后明确换路
- `/ui` 正确显示这轮为何不同
- 但环境限制下没拿到电话

`FAIL`

- 没先过 alignment gate
- 或继续重复旧路径
- 或 `/ui` 无法解释这轮为何不同

## 11. 本轮结论

这轮沟通验证应该正式收束为一句话：

**Goal Engine 已经基本证明“Agent 会学习并改变行为”，但还没有完全证明“observer 能稳定把这种变化用当前状态一眼讲清楚”，更没有稳定证明“在受限环境里最终拿到真实号码”。**

所以本轮结束时，项目状态应定义为：

**主链已形成，学习已显现，observer 摘要未完全闭环，结果闭环仍待突破。**

## 12. 附件证据

OpenClaw 执行面：

- [final-validation-openclaw-live.png](/Users/gushuai/dev/Protocol30/goal-engine/final-validation-openclaw-live.png)

Goal Engine observer 面：

- [final-validation-ui-live.png](/Users/gushuai/dev/Protocol30/goal-engine/final-validation-ui-live.png)

本轮中间状态截图：

- [goal-engine-ui-path-state-verify-live.png](/Users/gushuai/dev/Protocol30/goal-engine/goal-engine-ui-path-state-verify-live.png)

