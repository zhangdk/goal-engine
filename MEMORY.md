# MEMORY.md

## Goal Engine Product Notes

- Goal Engine 的体验验证必须以真实结果目标为主，不能退化成功能验收单。
- OpenClaw 观测必须同时看两面：浏览器对话执行面，以及 Goal Engine `/ui` 证据面。
- 外部目标的学习闭环不应只停在网页路径；当 web/direct-site 失败后，Agent 还应检查本机原生软件路径。
- 如果 OpenClaw 会话中的新行为只写进 projection fallback、没有写回 service，那么 `/ui` 会和真实执行脱节。

## OpenClaw Integration Learnings

- Goal Engine 插件 shell 的命令调用必须走 `pnpm openclaw ...`，不能错误地拼成 `pnpm bootstrap` 或 `pnpm entrypoint ...`。
- `goal_engine_bootstrap`、`record_failed_attempt`、`check_retry` 这些工具如果命令拼错，会被误判成“service 不可达”。
- `self-improvement` 应该成为失败后的默认动作之一，而不是只靠人工补记。
- 外部目标开始前，Agent 应优先尝试查找合适 skill，包括本地已有 skill 和技能市场/发现能力。
