# Goal Engine Product Validation Round Prep - 2026-04-10

**日期：** 2026-04-10
**目的：** 基于 2026-04-10 final validation 和当前 learnings，准备下一轮更有效的产品验证

## 1. 当前判断

下一轮可以继续做产品验证，但不应该再按“必须 PASS”来设计。

更准确的目标是：

1. 验证主链是否稳定：
   OpenClaw 新任务 -> goal alignment gate -> 尝试 -> failure/retry -> `/ui` 观察
2. 验证 `/ui` 是否已经比 2026-04-10 更接近执行面
3. 明确区分：
   - 主链失败
   - observer 摘要失败
   - 环境拿号失败

## 2. 从 final validation 和 learnings 收敛出的结论

### 2.1 已经成立的事实

- OpenClaw 是唯一主交互面，`/ui` 只是 observer
- 新外部任务必须先做 `goal_engine_show_goal_status(expectedGoalTitle=...)`
- 判断重点是“先对齐再执行”，不是“强拦 web_search”
- failure / retry / recovery 已经是产品闭环的一部分，不再只是聊天口头说明

### 2.2 仍然存在的边界

- `/ui` verdict 级别目前仍是 `none | partial | clear | stalled`
- 文档中期待的 `claimed_change_only | real_change | goal_progress` 还没有真正落地
- `/ui` 的 `last_path / next_path / why_different` 主要仍依赖 attempts / retry / policy 折叠
- runtime event 目前更像“运行证据”，还不是完整的“聊天行为摘要层”

### 2.3 这意味着什么

下一轮验证里，如果聊天里出现了 `new_path` 和 `why_better_than_last_round`，但没有对应沉淀成 attempt / retry / policy 证据，`/ui` 仍可能讲不清。

所以这轮更合理的通过线应是：

- 主链稳定成立
- `/ui` 至少能给出和这轮行为一致的部分摘要
- 电话结果拿不到时，判 `PARTIAL`，不判 `FAIL`

## 3. 下一轮不要再犯的错

- 不要把“没拿到电话”直接等同于产品失败
- 不要再把 `web_search` 是否被硬拦截当成核心验收项
- 不要再只看 `/ui` 页面文案，不看 OpenClaw 真实执行顺序
- 不要再设计强依赖地图、点评、登录、扫码、反爬严重平台的任务

## 4. 建议的验收任务类型

优先选这种任务：

- 目标是找到“官网或直链页面明确展示的联系电话”
- 候选来源更可能来自独立官网、垂直目录或单一平台详情页
- 能减少对通用搜索摘要的依赖

建议任务方向：

- 张江周边培训教室 / 小型会议室 / 路演空间
- 创业园区活动场地 / 联合办公会议室
- 录音棚 / 摄影棚 / 直播间，但优先选已有独立站的候选

不建议：

- 高度依赖大众点评 / 地图聚合 / 登录后查看联系方式的平台
- 明显需要扫码、App 登录、商家私信才能拿联系方式的场景

## 5. 建议的这轮验证标准

### `PASS`

- 先经过 alignment gate
- 失败后明确换路
- `/ui` 能解释这轮为何不同
- 最终拿到页面明确展示的联系电话

### `PARTIAL`

- 先经过 alignment gate
- 失败后明确换路
- `/ui` 至少同步到 goal、风险、路径变化中的大部分事实
- 但受环境限制，未拿到最终电话号码

### `FAIL`

- 新任务没先过 alignment gate
- 或继续重复旧路径
- 或 `/ui` 连这轮基本执行事实都无法对应

## 6. 建议的操作剧本

### 6.1 发送给 OpenClaw 的任务模板

```text
帮我在上海浦东张江找一个适合 8-15 人做培训、演示或小型直播的场地，预算半天 2000-5000 元。最终必须给我至少一个页面明确展示的联系电话，并附上场地名称、地址、来源链接。不要用搜索摘要里的号码。如果当前 Goal Engine active goal 和这个任务不一致，先处理对齐，不要直接搜索。如果某条路径失败，明确说明 do_not_repeat、new_path、why_better_than_last_round，然后只执行这一条新路径。
```

### 6.2 只盯前 3-5 个动作

期望顺序：

1. `goal_engine_show_goal_status`
2. `goal_engine_start_goal` 或恢复当前 goal
3. 执行一个具体路径
4. 若失败，写回 `goal_engine_record_failed_attempt`
5. 再做 `goal_engine_check_retry`

### 6.3 如果失败，检查三句话是否真的出现

- `do_not_repeat=...`
- `new_path=...`
- `why_better_than_last_round=...`

### 6.4 然后立刻看 `/ui`

至少核对：

- 当前 goal 是否已经切到这轮任务
- `current_risk` 是否合理
- `last_path` 是否能对应这轮实际路径
- `next_path` 是否能对应 retry / guidance
- `why_different` 是否不是旧值或空白
- timeline 里是否出现 failure / retry / recovery / runtime evidence

## 7. 当前最现实的结论

这轮验证应该按“证明系统正在形成完整闭环”来跑，而不是按“必须一次拿到电话”来跑。

如果主链稳定、换路真实、`/ui` 基本跟上，但最终电话没拿到，这仍然是有效的 `PARTIAL` 结果，不是失败。
