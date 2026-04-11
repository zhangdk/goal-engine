# ERRORS

## [ERR-20260408-001] goal_engine_tools_fail_on_service_unavailable

**Logged**: 2026-04-08T09:15:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Goal Engine 工具调用失败 - 服务不可达时所有工具都报错

### Error
```
Command failed: pnpm entrypoint xxx --service-url http://localhost:3100 ...
```

### Context
- 调用了 `goal_engine_bootstrap`, `goal_engine_recover_current_goal`, `goal_engine_record_failed_attempt`, `goal_engine_check_retry` 等工具
- Goal Engine 服务未运行 (localhost:3100 不可达)
- 所有工具均报错，但 CLI 内部 fallback 到 projection 时可输出状态

### Suggested Fix
1. 在 OpenClaw 中为 Goal Engine 工具添加更智能的错误处理：当服务不可达时自动 fallback 到读取 projection 文件
2. 或确保 Goal Engine 服务在需要时已启动
3. 或提供更清晰的工具层面错误信息，说明 "服务不可达，已 fallback 到本地 projection"

### Metadata
- Reproducible: yes
- Related Files: examples/workspace/goal-engine/current-goal.md, .openclaw/workspace-state.json
- See Also: LRN-20260408-001

---

## [ERR-20260408-002] goal_engine_plugin_invokes_wrong_pnpm_command

**Logged**: 2026-04-08T09:16:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Goal Engine OpenClaw 插件把 adapter CLI 调成 `pnpm bootstrap` / `pnpm entrypoint`，而不是 `pnpm openclaw bootstrap` / `pnpm openclaw entrypoint`。

### Error
```text
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "bootstrap" not found
```

### Context
- 触发位置：OpenClaw 浏览器会话中的 `goal_engine_bootstrap`
- session 中因此误报“service 不可达”并退回 projection fallback
- 宿主机上 `http://localhost:3100/api/v1/health` 实际可用

### Suggested Fix
在插件入口统一把命令拼成 `pnpm openclaw <subcommand>`，并用插件壳测试锁定。

### Metadata
- Reproducible: yes
- Related Files: index.ts, agent-adapter/test/openclaw-plugin-shell.test.ts
- See Also: LRN-20260408-002

---

## [ERR-20260408-003] peekaboo_wechat_window_capture_misidentifies_host

**Logged**: 2026-04-08T07:14:22Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Peekaboo 控制微信时，使用 `--app WeChat` 会误落到 `WeChatAppEx Helper (Renderer)`，导致窗口捕获失败。

### Error
```text
Found 0 windows for WeChatAppEx Helper (Renderer) (minimized: 0, offScreen: 0, windows: 0)
Error: Window not found
Process exited with signal SIGTERM.
```

### Context
- 在微信原生软件路径验证中，OpenClaw 先尝试：
- `peekaboo list windows --app WeChat`
- `peekaboo see --app WeChat`
- 后续才通过 `peekaboo list apps | grep -i wechat` 发现真实主应用是 `微信 (com.tencent.xinWeChat)`，并且有 2 个窗口
- 对 `peekaboo see --app 微信 --window-title "微信"` 的进一步尝试也出现长时间运行后 `SIGTERM`

### Suggested Fix
1. 微信控制前先做 `peekaboo list apps`，绑定到 `com.tencent.xinWeChat` 或明确 PID
2. 不要直接用 `WeChat` 作为 app 名
3. 将“主应用可见但窗口捕获失败”与“微信未启动”分开归类

### Metadata
- Reproducible: yes
- Related Files: .learnings/LEARNINGS.md
- See Also: LRN-20260408-005
