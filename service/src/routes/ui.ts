import { Hono } from 'hono';
import * as runtimeModule from '../../../shared/runtime.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { ReflectionRepo } from '../repos/reflection.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { RetryHistoryRepo } from '../repos/retry-history.repo.js';
import type { RecoveryEventRepo } from '../repos/recovery-event.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import type { RecoveryService } from '../services/recovery.service.js';
import { buildAgentGallery } from '../ui/agent-gallery.js';
import { buildAgentDetail } from '../ui/agent-detail.js';

const runtime = 'default' in runtimeModule ? runtimeModule.default : runtimeModule;
const { FAILURE_TYPES } = runtime;

type UiRouterOptions = {
  projectionDir?: string;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

type UiDependencies = {
  goalRepo: GoalRepo;
  attemptRepo: AttemptRepo;
  reflectionRepo: ReflectionRepo;
  policyRepo: PolicyRepo;
  retryHistoryRepo: RetryHistoryRepo;
  recoveryEventRepo: RecoveryEventRepo;
  goalAgentAssignmentRepo: GoalAgentAssignmentRepo;
  goalAgentHistoryService: GoalAgentHistoryService;
  recoveryService: RecoveryService;
  projectionDir?: string;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

export function uiApiRouter(
  goalRepo: GoalRepo,
  attemptRepo: AttemptRepo,
  reflectionRepo: ReflectionRepo,
  policyRepo: PolicyRepo,
  retryHistoryRepo: RetryHistoryRepo,
  recoveryEventRepo: RecoveryEventRepo,
  goalAgentAssignmentRepo: GoalAgentAssignmentRepo,
  goalAgentHistoryService: GoalAgentHistoryService,
  recoveryService: RecoveryService,
  options?: UiRouterOptions
): Hono {
  const router = new Hono();
  const deps: UiDependencies = {
    goalRepo,
    attemptRepo,
    reflectionRepo,
    policyRepo,
    retryHistoryRepo,
    recoveryEventRepo,
    goalAgentAssignmentRepo,
    goalAgentHistoryService,
    recoveryService,
    projectionDir: options?.projectionDir,
    workspaceStatePath: options?.workspaceStatePath,
    runtimeStatePath: options?.runtimeStatePath,
  };

  router.get('/agents', (c) => {
    deps.goalAgentHistoryService.syncActiveGoalAttachment(new Date().toISOString());
    const gallery = buildAgentGallery(deps);
    return c.json({ data: toSnakeCaseGallery(gallery) });
  });

  router.get('/agents/:agentId', (c) => {
    deps.goalAgentHistoryService.syncActiveGoalAttachment(new Date().toISOString());
    const detail = buildAgentDetail(c.req.param('agentId'), deps);
    if (!detail) {
      return c.json({ error: { code: 'not_found', message: 'Agent not found' } }, 404);
    }
    return c.json({ data: toSnakeCaseDetail(detail) });
  });

  return router;
}

export function uiPageRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => c.html(renderGalleryPage()));
  router.get('/agents/:agentId', (c) => c.html(renderDetailPage(c.req.param('agentId'))));

  return router;
}

function toSnakeCaseGallery(view: ReturnType<typeof buildAgentGallery>) {
  return {
    agents: view.agents.map((agent) => ({
      agent_id: agent.agentId,
      name: agent.name,
      current_goal: agent.currentGoal,
      workspace: agent.workspace,
      session: agent.session,
      managed: agent.managed,
      learning_verdict: {
        level: agent.learningVerdict.level,
        label: agent.learningVerdict.label,
        reason: agent.learningVerdict.reason,
      },
      last_active_at: agent.lastActiveAt,
      recent_change_summary: agent.recentChangeSummary,
    })),
  };
}

function toSnakeCaseDetail(view: NonNullable<ReturnType<typeof buildAgentDetail>>) {
  return {
    header: {
      agent_id: view.header.agentId,
      name: view.header.name,
      current_goal: view.header.currentGoal,
      current_goal_id: view.header.currentGoalId,
      status: view.header.status,
      last_active_at: view.header.lastActiveAt,
      workspace: view.header.workspace,
      session: view.header.session,
    },
    managed_status: {
      managed: view.managedStatus.managed,
      reason: view.managedStatus.reason,
    },
    learning_verdict: {
      overall: {
        level: view.learningVerdict.overall.level,
        label: view.learningVerdict.overall.label,
        reason: view.learningVerdict.overall.reason,
        evidence_event_ids: view.learningVerdict.overall.evidenceEventIds,
      },
      behavior_changed: {
        status: view.learningVerdict.behaviorChanged.status,
        reason: view.learningVerdict.behaviorChanged.reason,
        evidence_event_ids: view.learningVerdict.behaviorChanged.evidenceEventIds,
      },
      repeat_errors_reduced: {
        status: view.learningVerdict.repeatErrorsReduced.status,
        reason: view.learningVerdict.repeatErrorsReduced.reason,
        evidence_event_ids: view.learningVerdict.repeatErrorsReduced.evidenceEventIds,
      },
      memory_preserved: {
        status: view.learningVerdict.memoryPreserved.status,
        reason: view.learningVerdict.memoryPreserved.reason,
        evidence_event_ids: view.learningVerdict.memoryPreserved.evidenceEventIds,
      },
    },
    current_state: {
      goal_title: view.currentState.goalTitle,
      current_stage: view.currentState.currentStage,
      current_guidance: view.currentState.currentGuidance,
      avoid_strategies: view.currentState.avoidStrategies,
      recommended_next_step: view.currentState.recommendedNextStep,
      current_risk: view.currentState.currentRisk,
      last_path: view.currentState.lastPath,
      next_path: view.currentState.nextPath,
      why_different: view.currentState.whyDifferent,
      forbidden_paths: view.currentState.forbiddenPaths,
    },
    goal_history: view.goalHistory.map((item) => ({
      goal_id: item.goalId,
      goal_title: item.goalTitle,
      status: item.status,
      current_stage: item.currentStage,
      workspace: item.workspace,
      session: item.session,
      first_seen_at: item.firstSeenAt,
      last_seen_at: item.lastSeenAt,
      last_event: item.lastEvent,
    })),
    reflection_history: view.reflectionHistory.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      summary: item.summary,
      root_cause: item.rootCause,
      must_change: item.mustChange,
    })),
    operation_log: view.operationLog.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      type: item.type,
      title: item.title,
      detail: item.detail,
    })),
    timeline: view.timeline.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      title: event.title,
      summary: event.summary,
      impact: event.impact,
      linked_ids: event.linkedIds,
    })),
    system_gaps: view.systemGaps.map((gap) => ({
      key: gap.key,
      label: gap.label,
      status: gap.status,
      detail: gap.detail,
    })),
  };
}

function renderGalleryPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Goal Engine Agent 观察台</title>
    <style>
      :root {
        --bg: #f7f1e8;
        --panel: rgba(255, 251, 245, 0.94);
        --ink: #231a11;
        --muted: #6f6253;
        --line: #dbcab4;
        --accent: #173c62;
        --accent-soft: #0f5c5c;
        --positive: #236a4b;
        --warning: #996000;
        --danger: #a6372e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        font-size: 13px;
        background:
          radial-gradient(circle at top left, rgba(23, 60, 98, 0.12), transparent 26%),
          radial-gradient(circle at bottom right, rgba(15, 92, 92, 0.12), transparent 28%),
          linear-gradient(180deg, #f8f3ec 0%, #efe4d4 100%);
      }
      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      h1, h2, h3, p { margin: 0; }
      .hero, .panel {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 80px rgba(50, 40, 24, 0.08);
      }
      .hero { padding: 28px; }
      .hero p {
        color: var(--muted);
        max-width: 62ch;
        margin-top: 10px;
        line-height: 1.5;
      }
      .layout {
        display: grid;
        gap: 18px;
        grid-template-columns: 1.4fr 0.9fr;
        margin-top: 18px;
      }
      .panel { padding: 20px; }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent-soft);
        margin-bottom: 10px;
      }
      .muted { color: var(--muted); }
      .cards {
        display: grid;
        gap: 16px;
        margin-top: 14px;
      }
      .agent-card {
        display: block;
        text-decoration: none;
        color: inherit;
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.72);
      }
      .agent-card:hover { border-color: var(--accent); }
      .chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        margin-top: 12px;
      }
      .chip.none { color: var(--muted); background: rgba(111, 98, 83, 0.12); }
      .chip.partial { color: var(--warning); background: rgba(153, 96, 0, 0.12); }
      .chip.clear { color: var(--positive); background: rgba(35, 106, 75, 0.12); }
      .chip.stalled { color: var(--danger); background: rgba(166, 55, 46, 0.12); }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .meta div {
        padding: 12px;
        border-radius: 16px;
        background: rgba(241, 232, 219, 0.8);
      }
      form {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
      }
      input, textarea, select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        font: inherit;
        background: #fff;
      }
      textarea {
        min-height: 96px;
        resize: vertical;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 16px;
        font: inherit;
        font-weight: 700;
        color: #fff;
        background: var(--accent);
        cursor: pointer;
      }
      .message {
        min-height: 22px;
        margin-top: 12px;
        color: var(--muted);
      }
      .message.error { color: var(--danger); }
      .empty {
        padding: 18px;
        border-radius: 18px;
        border: 1px dashed var(--line);
        color: var(--muted);
      }
      .conflict-panel {
        display: none;
        margin-top: 16px;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid rgba(179, 58, 58, 0.24);
        background: rgba(179, 58, 58, 0.08);
      }
      .conflict-panel.visible { display: block; }
      .conflict-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .ghost-button {
        background: transparent;
        color: var(--accent);
        border: 1px solid var(--line);
      }
      @media (max-width: 900px) {
        .layout, .meta { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Goal Engine</div>
        <h1>Goal Engine Agent 观察台</h1>
        <p>
          先选一个 Agent，再看它当前在做什么、最近发生了什么变化，以及为什么系统认为它有进步、停滞，或者还没有足够证据。
        </p>
        <div id="message" class="message" aria-live="polite"></div>
      </section>

      <div class="layout">
        <section class="panel">
          <div class="eyebrow">Agent 列表</div>
          <h2>可观察 Agent</h2>
          <p class="muted" style="margin-top: 10px;">这里只展示当前由 Goal Engine 托管的真实 OpenClaw Agent。</p>
          <div id="agents" class="cards"></div>
        </section>

        <section class="panel">
          <div class="eyebrow">开始</div>
          <h2>开始一个目标</h2>
          <p class="muted" style="margin-top: 10px;">
            如果当前还没有 active goal，可以先在这里开始，然后直接进入这个 Agent 的详情页。
          </p>
          <form id="start-goal-form">
            <label>标题 <input name="title" required /></label>
            <label>成功标准 <textarea name="success_criteria" required></textarea></label>
            <label>当前阶段 <input name="current_stage" value="integration" required /></label>
            <button type="submit">开始目标</button>
          </form>
          <div id="goal-conflict" class="conflict-panel" aria-live="polite">
            <strong>当前已有 active goal</strong>
            <p id="goal-conflict-summary" class="muted" style="margin-top: 10px;"></p>
            <div class="conflict-actions">
              <button id="goal-conflict-continue" type="button" class="ghost-button">继续当前目标</button>
              <button id="goal-conflict-replace" type="button">替换当前目标并开始</button>
            </div>
          </div>
        </section>
      </div>
    </main>

    <script>
      const messageEl = document.getElementById('message');
      const agentsEl = document.getElementById('agents');
      const goalConflictEl = document.getElementById('goal-conflict');
      const goalConflictSummaryEl = document.getElementById('goal-conflict-summary');
      const startGoalFormEl = document.getElementById('start-goal-form');
      const goalConflictContinueEl = document.getElementById('goal-conflict-continue');
      const goalConflictReplaceEl = document.getElementById('goal-conflict-replace');
      let latestAgents = [];
      let pendingConflict = null;

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function splitLines(value) {
        return value.split('\\n').map((part) => part.trim()).filter(Boolean);
      }

      function setMessage(text, isError = false) {
        messageEl.textContent = text;
        messageEl.className = isError ? 'message error' : 'message';
      }

      function hideGoalConflict() {
        pendingConflict = null;
        goalConflictEl.classList.remove('visible');
        goalConflictSummaryEl.textContent = '';
      }

      function showGoalConflict(activeGoal) {
        pendingConflict = activeGoal;
        const stageText = activeGoal?.current_stage ? '当前阶段：' + activeGoal.current_stage + '。' : '';
        goalConflictSummaryEl.textContent = stageText + '你可以继续跟进这个目标，或显式替换后开始新目标。';
        goalConflictEl.classList.add('visible');
      }

      function findAgentIdForGoalTitle(goalTitle) {
        const matchedAgent = latestAgents.find((agent) => agent.current_goal === goalTitle);
        return matchedAgent?.agent_id || null;
      }

      function renderStatus(status) {
        if (status === 'yes') return '是';
        if (status === 'no') return '否';
        if (status === 'partial') return '部分';
        if (status === 'active') return '进行中';
        if (status === 'blocked') return '受阻';
        if (status === 'completed') return '已完成';
        if (status === 'abandoned') return '已放弃';
        return status;
      }

      function renderRetryReason(reason) {
        if (reason === 'allowed') return '允许继续，这次变化足够明确';
        if (reason === 'policy_not_acknowledged') return '还没有确认阅读当前指导';
        if (reason === 'blocked_strategy_overlap') return '这次计划与已禁止策略重叠过高';
        if (reason === 'no_meaningful_change') return '这次重试没有体现出足够明确的新变化';
        if (reason === 'repeated_failure_without_downgrade') return '连续失败后仍未体现降维或换路';
        return reason;
      }

      function renderAgents(agents) {
        if (!agents.length) {
          agentsEl.innerHTML = '<div class="empty">当前还没有被 Goal Engine 托管且有活动目标的 OpenClaw Agent。</div>';
          return;
        }

        agentsEl.innerHTML = agents.map((agent) => \`
          <a class="agent-card" href="/ui/agents/\${escapeHtml(agent.agent_id)}">
            <div class="eyebrow">\${escapeHtml(agent.name)}</div>
            <h3>\${escapeHtml(agent.current_goal)}</h3>
            <span class="chip \${escapeHtml(agent.learning_verdict.level)}">\${escapeHtml(agent.learning_verdict.label)}</span>
            <p class="muted" style="margin-top: 12px; line-height: 1.5;">\${escapeHtml(agent.learning_verdict.reason)}</p>
            <div class="meta">
              <div><strong>工作区 / 会话</strong><br />\${escapeHtml(agent.workspace)} / \${escapeHtml(agent.session)}</div>
              <div><strong>托管状态</strong><br />\${agent.managed ? '已托管' : '未托管'}</div>
              <div><strong>最近活跃</strong><br />\${escapeHtml(agent.last_active_at)}</div>
              <div><strong>最近变化</strong><br />\${escapeHtml(agent.recent_change_summary)}</div>
            </div>
          </a>
        \`).join('');
      }

      async function loadGallery() {
        const res = await fetch('/api/v1/ui/agents');
        if (!res.ok) {
          throw new Error('加载 /api/v1/ui/agents 失败');
        }
        const body = await res.json();
        latestAgents = Array.isArray(body?.data?.agents) ? body.data.agents : [];
        renderAgents(latestAgents);
      }

      async function submitStartGoal(replaceActive = false) {
        const form = new FormData(startGoalFormEl);
        try {
          const res = await fetch('/api/v1/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.get('title'),
              success_criteria: splitLines(String(form.get('success_criteria') || '')),
              stop_conditions: [],
              current_stage: form.get('current_stage'),
              replace_active: replaceActive,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (body?.error?.code === 'state_conflict' && body?.error?.active_goal) {
              showGoalConflict(body.error.active_goal);
              setMessage('检测到目标冲突，请先决定继续还是显式替换。', true);
              return;
            }
            throw new Error(body?.error?.message || '开始目标失败');
          }
          hideGoalConflict();
          const galleryRes = await fetch('/api/v1/ui/agents');
          const galleryBody = await galleryRes.json().catch(() => ({}));
          const nextAgentId = galleryBody?.data?.agents?.[0]?.agent_id;
          if (!nextAgentId) {
            throw new Error('目标已创建，但没有找到对应的托管 Agent。');
          }
          window.location.href = '/ui/agents/' + nextAgentId;
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error), true);
        }
      }

      startGoalFormEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitStartGoal(false);
      });

      goalConflictContinueEl.addEventListener('click', () => {
        if (!pendingConflict?.title) {
          setMessage('当前冲突目标缺少标题，无法继续定位。', true);
          return;
        }
        const agentId = findAgentIdForGoalTitle(pendingConflict.title);
        if (!agentId) {
          setMessage('找到了 active goal，但当前没有对应的托管 Agent 卡片。', true);
          return;
        }
        window.location.href = '/ui/agents/' + agentId;
      });

      goalConflictReplaceEl.addEventListener('click', async () => {
        await submitStartGoal(true);
      });

      loadGallery()
        .then(() => setMessage('已加载 Agent 列表'))
        .catch((error) => setMessage(error instanceof Error ? error.message : String(error), true));
    </script>
  </body>
</html>`;
}

function renderDetailPage(agentId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent 学习详情</title>
    <style>
      :root {
        --bg: #f7f1e8;
        --panel: rgba(255, 251, 245, 0.94);
        --ink: #231a11;
        --muted: #6f6253;
        --line: #dbcab4;
        --accent: #173c62;
        --accent-soft: #0f5c5c;
        --positive: #236a4b;
        --warning: #996000;
        --danger: #a6372e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(23, 60, 98, 0.14), transparent 25%),
          radial-gradient(circle at bottom right, rgba(15, 92, 92, 0.12), transparent 25%),
          linear-gradient(180deg, #f8f3ec 0%, #efe4d4 100%);
      }
      main {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 48px;
      }
      h1, h2, h3, p { margin: 0; }
      a { color: inherit; }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 18px;
      }
      .topbar a {
        text-decoration: none;
        color: var(--accent);
        font-weight: 700;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 80px rgba(50, 40, 24, 0.08);
        padding: 14px;
      }
      .overview {
        display: grid;
        gap: 8px;
        margin-bottom: 14px;
      }
      .eyebrow {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent-soft);
        margin-bottom: 8px;
      }
      .muted { color: var(--muted); }
      .overview-line {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .overview-line.secondary {
        align-items: start;
        border-top: 1px solid rgba(219, 202, 180, 0.7);
        padding-top: 8px;
      }
      .overview-primary {
        font-size: 21px;
        font-weight: 700;
        line-height: 1.15;
      }
      .overview-primary span {
        font-weight: 500;
        color: var(--muted);
      }
      .overview-secondary {
        font-size: 13px;
        color: var(--ink);
        line-height: 1.35;
        font-weight: 500;
        max-width: 62ch;
      }
      .overview-risk {
        font-size: 12px;
        color: var(--muted);
        max-width: 48ch;
        line-height: 1.35;
      }
      .overview-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .toolbar-button {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.72);
        color: var(--accent);
        font-weight: 700;
        text-decoration: none;
        font-size: 12px;
      }
      .ghost-button {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 5px 9px;
        background: transparent;
        color: var(--muted);
        font-weight: 700;
        font-size: 11px;
      }
      .grid {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr);
      }
      .metric, .fact, .event, .gap {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.72);
      }
      .metric strong, .fact strong, .event strong, .gap strong {
        font-size: 12px;
      }
      .fact-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .fact-section {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.72);
      }
      .fact-section ul {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        display: grid;
        gap: 8px;
      }
      .fact-section li {
        display: grid;
        gap: 4px;
      }
      .fact-label {
        color: var(--muted);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .badge.yes, .badge.clear { color: var(--positive); background: rgba(35, 106, 75, 0.12); }
      .badge.partial { color: var(--warning); background: rgba(153, 96, 0, 0.12); }
      .badge.no, .badge.none, .badge.stalled, .badge.missing { color: var(--danger); background: rgba(166, 55, 46, 0.12); }
      .badge.covered { color: var(--positive); background: rgba(35, 106, 75, 0.12); }
      .facts, .timeline, .gaps, .actions, .goal-history { display: grid; gap: 12px; margin-top: 14px; }
      .timeline-panel {
        display: grid;
        gap: 10px;
      }
      .section-head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .timeline-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .timeline-summary {
        color: var(--muted);
        font-size: 12px;
      }
      .timeline-list {
        display: grid;
        gap: 8px;
      }
      .timeline-item {
        display: grid;
        grid-template-columns: 104px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.72);
      }
      .timeline-meta {
        display: grid;
        gap: 4px;
      }
      .timeline-time {
        color: var(--muted);
        font-size: 10px;
      }
      .timeline-body {
        display: grid;
        gap: 4px;
      }
      .timeline-body strong {
        font-size: 12px;
        line-height: 1.3;
      }
      .timeline-impact {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.35;
      }
      .timeline-outcome {
        justify-self: end;
        white-space: nowrap;
      }
      .timeline-type {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 3px 7px;
        font-size: 10px;
        font-weight: 700;
        width: fit-content;
      }
      .timeline-type.failure { color: var(--danger); background: rgba(166, 55, 46, 0.12); }
      .timeline-type.reflection { color: var(--warning); background: rgba(153, 96, 0, 0.12); }
      .timeline-type.policy_update { color: var(--accent); background: rgba(23, 60, 98, 0.12); }
      .timeline-type.retry_check { color: #8b5e00; background: rgba(139, 94, 0, 0.12); }
      .timeline-type.recovery, .timeline-type.progress { color: var(--positive); background: rgba(35, 106, 75, 0.12); }
      .timeline-type.projection_notice { color: #6f4b16; background: rgba(180, 129, 38, 0.14); }
      .timeline-filters {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .filter-chip {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 5px 9px;
        font: inherit;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.72);
        font-size: 11px;
      }
      .filter-chip.active {
        color: #fff;
        background: var(--accent);
        border-color: var(--accent);
      }
      details.timeline-panorama {
        border-top: 1px solid var(--line);
        padding-top: 10px;
      }
      details.timeline-panorama summary {
        cursor: pointer;
        font-weight: 700;
        list-style: none;
      }
      details.timeline-panorama summary::-webkit-details-marker {
        display: none;
      }
      .history-summary {
        color: var(--muted);
        margin-top: 8px;
      }
      .record-layout {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .record-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }
      .record-item {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 9px 10px;
        background: rgba(255, 255, 255, 0.72);
      }
      .record-item strong {
        font-size: 12px;
        line-height: 1.3;
      }
      .record-item p {
        margin-top: 4px;
        color: var(--muted);
        line-height: 1.35;
        font-size: 11px;
      }
      .subtabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 10px 0 12px;
      }
      .subtab {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 5px 9px;
        font: inherit;
        color: var(--muted);
        background: rgba(255,255,255,0.72);
        font-size: 11px;
      }
      .subtab.active {
        color: #fff;
        background: var(--accent);
        border-color: var(--accent);
      }
      .tab-panel[hidden] {
        display: none !important;
      }
      .action-panels {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }
      dialog.help-modal {
        width: min(680px, calc(100vw - 24px));
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 0;
        background: rgba(255, 251, 245, 0.98);
        color: var(--ink);
        box-shadow: 0 30px 90px rgba(50, 40, 24, 0.2);
      }
      dialog.help-modal::backdrop {
        background: rgba(35, 26, 17, 0.28);
      }
      .help-shell {
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .help-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }
      .help-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .help-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,255,255,0.72);
      }
      .help-card p {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.4;
      }
      .help-list {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      details.action-panel summary {
        cursor: pointer;
        font-weight: 700;
        list-style: none;
      }
      details.action-panel summary::-webkit-details-marker {
        display: none;
      }
      details.more-info {
        margin-top: 14px;
      }
      details.more-info summary {
        cursor: pointer;
        font-weight: 700;
        list-style: none;
      }
      details.more-info summary::-webkit-details-marker {
        display: none;
      }
      form {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }
      label {
        display: grid;
        gap: 5px;
        font-size: 12px;
      }
      input, textarea, select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 10px;
        font: inherit;
        background: #fff;
      }
      textarea {
        min-height: 80px;
        resize: vertical;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 700;
        color: #fff;
        background: var(--accent);
        cursor: pointer;
      }
      .secondary { background: var(--accent-soft); }
      .message {
        min-height: 22px;
        color: var(--muted);
      }
      .message.error { color: var(--danger); }
      @media (max-width: 980px) {
        .grid, .fact-grid, .timeline-item, .record-layout { grid-template-columns: 1fr; }
        .help-grid { grid-template-columns: 1fr; }
        .timeline-outcome {
          justify-self: start;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="topbar">
        <a href="/ui">← 返回 Agent 列表</a>
        <div id="message" class="message" aria-live="polite"></div>
      </div>
      <div id="detail-endpoint" data-endpoint="/api/v1/ui/agents/${escapeHtmlAttribute(agentId)}" hidden></div>

      <section class="panel overview">
        <div class="eyebrow">Agent 概览</div>
        <div class="overview-line">
          <div id="overview-primary" class="overview-primary">Agent 学习详情</div>
          <div class="overview-actions">
            <button id="open-help" type="button" class="ghost-button">查看帮助</button>
            <button id="overview-record-failure" type="button" class="toolbar-button">记录失败</button>
            <button id="overview-retry-check" type="button" class="toolbar-button">检查重试</button>
            <button id="overview-recover" type="button" class="toolbar-button">恢复</button>
          </div>
        </div>
        <div class="overview-line secondary">
          <div>
            <div id="overview-secondary" class="overview-secondary"></div>
            <div id="overview-evidence" class="overview-risk" style="margin-top: 6px;"></div>
          </div>
          <div id="overview-risk" class="overview-risk"></div>
        </div>
      </section>

      <div class="grid">
        <div>
          <section class="panel">
            <div class="eyebrow">进化列表</div>
            <div class="section-head">
              <h2>关键进化</h2>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <div id="current-state-inline" class="timeline-summary"></div>
                <button id="open-help-inline" type="button" class="ghost-button">怎么看</button>
              </div>
            </div>
            <div class="timeline-panel">
              <p id="timeline-summary" class="timeline-summary"></p>
              <div id="timeline-filters" class="timeline-filters"></div>
              <div id="key-evolution" class="timeline-list"></div>
              <details class="timeline-panorama" id="timeline-panorama">
                <summary>查看进化全景</summary>
                <div class="timeline-toolbar" style="margin-top: 14px;">
                  <p class="timeline-summary">这里保留完整事件流回放，顶部筛选会同步作用到这里。</p>
                </div>
                <div id="timeline" class="timeline-list" style="margin-top: 14px;"></div>
              </details>
            </div>
          </section>

          <details class="panel more-info">
            <summary>更多信息</summary>
            <div id="more-info-tabs" class="subtabs">
              <button type="button" class="subtab active" data-tab="records">记录</button>
              <button type="button" class="subtab" data-tab="history">历史</button>
              <button type="button" class="subtab" data-tab="system">系统</button>
            </div>

            <section id="tab-records" class="tab-panel" style="margin-top: 18px;">
              <div class="eyebrow">历史记录</div>
              <h2>思考记录与运行日志</h2>
              <div class="record-layout">
                <section>
                  <p class="timeline-summary">这里展示可持久化的反思、根因和必须改变的内容。当前系统还没有真正的聊天 transcript，所以先用思考记录替代。</p>
                  <div id="reflection-history" class="record-list"></div>
                </section>
                <section>
                  <p class="timeline-summary">按时间展示可回放的操作日志，包括失败、重试检查、策略更新和恢复。</p>
                  <div id="operation-log" class="record-list"></div>
                </section>
              </div>
            </section>

            <section id="tab-history" class="tab-panel" style="margin-top: 18px;" hidden>
              <div class="eyebrow">归属历史</div>
              <h2>Goal 历史</h2>
              <p id="goal-history-summary" class="history-summary"></p>
              <div id="goal-history" class="goal-history"></div>
            </section>

            <section id="tab-system" class="tab-panel" style="margin-top: 18px;" hidden>
              <div class="eyebrow">缺口</div>
              <h2>系统缺口</h2>
              <div id="gaps" class="gaps"></div>
            </section>
          </details>
          <div class="action-panels">
            <details class="panel action-panel" id="record-failure-panel">
              <summary>记录失败</summary>
              <div class="eyebrow" style="margin-top: 14px;">失败</div>
              <form id="record-failure-form">
                <label>阶段 <input name="stage" value="integration" required /></label>
                <label>采取动作 <textarea name="action_taken" required></textarea></label>
                <label>策略标签 <input name="strategy_tags" value="repeat" /></label>
                <label>失败类型
                  <select name="failure_type" required>
                    ${FAILURE_TYPES.map((failureType) => `<option value="${escapeHtmlAttribute(failureType)}"${failureType === 'stuck_loop' ? ' selected' : ''}>${escapeHtmlAttribute(failureType)}</option>`).join('')}
                  </select>
                </label>
                <label>反思摘要 <textarea name="summary" required></textarea></label>
                <label>根因 <textarea name="root_cause" required></textarea></label>
                <label>必须改变 <textarea name="must_change" required></textarea></label>
                <label>避免策略 <input name="avoid_strategy" value="repeat" /></label>
                <button type="submit">记录失败</button>
              </form>
            </details>

            <details class="panel action-panel" id="retry-check-panel">
              <summary>检查重试</summary>
              <div class="eyebrow" style="margin-top: 14px;">重试</div>
              <form id="retry-check-form">
                <label>计划动作 <textarea name="planned_action" required></textarea></label>
                <label>这次改变了什么 <textarea name="what_changed"></textarea></label>
                <label>策略标签 <input name="strategy_tags" value="repeat" /></label>
                <label style="display: flex; gap: 10px; align-items: center;">
                  <input name="policy_acknowledged" type="checkbox" value="true" />
                  我已经阅读当前指导
                </label>
                <button type="submit" class="secondary">检查重试</button>
              </form>
              <div id="retry-result" class="message"></div>
            </details>

            <details class="panel action-panel" id="recover-panel">
              <summary>恢复</summary>
              <div class="eyebrow" style="margin-top: 14px;">恢复</div>
              <p class="muted">从持久化事实重新构建当前恢复快照。</p>
              <button id="recover-button" type="button" style="margin-top: 12px;">恢复当前目标</button>
            </details>
          </div>
        </div>
      </div>
      <dialog id="help-modal" class="help-modal">
        <div class="help-shell">
          <div class="help-head">
            <div>
              <div class="eyebrow">帮助</div>
              <h2>怎么看这个 Agent 详情页</h2>
            </div>
            <button id="close-help" type="button" class="ghost-button">关闭</button>
          </div>
          <section class="help-card">
            <strong>先看什么</strong>
            <ol class="help-list">
              <li>先看顶部两行概览，确认当前目标、状态和一句结论。</li>
              <li>再看进化列表里最近的失败、策略更新、恢复或重试检查。</li>
              <li>如果最近只有失败，没有反思和策略更新，说明 Agent 还没真正学到东西。</li>
            </ol>
          </section>
          <div class="help-grid">
            <section class="help-card">
              <strong>什么时候记录失败</strong>
              <p>一次尝试已经明确失败，需要正式进入反思和策略更新时使用。它是把失败入账，不是让 Agent 再试一次。</p>
            </section>
            <section class="help-card">
              <strong>什么时候检查重试</strong>
              <p>准备再次尝试之前使用。它会检查这次计划是否真的换了路径，还是仍在重复旧方法。</p>
            </section>
            <section class="help-card">
              <strong>什么时候恢复</strong>
              <p>当你怀疑当前状态不完整、切 session 后上下文丢失，或页面展示和事实不一致时使用。它是修状态，不是推进任务。</p>
            </section>
            <section class="help-card">
              <strong>怎么读进化列表</strong>
              <p>优先看最近事件，再看有没有对应的反思、策略更新和重试检查。筛选标签可以帮助你只看失败、恢复或策略变化。</p>
            </section>
          </div>
        </div>
      </dialog>
    </main>

    <script>
      const agentId = ${JSON.stringify(agentId)};
      const detailEndpoint = '/api/v1/ui/agents/${escapeJsString(agentId)}';
      const AUTO_REFRESH_INTERVAL_MS = 5000;
      const messageEl = document.getElementById('message');
      const retryResultEl = document.getElementById('retry-result');
      let viewState = null;
      let timelineFilter = 'all';
      let moreInfoTab = 'records';
      const TIMELINE_FILTERS = [
        { key: 'all', label: '全部' },
        { key: 'failure', label: '失败' },
        { key: 'reflection', label: '反思' },
        { key: 'policy_update', label: '策略更新' },
        { key: 'retry_check', label: '重试检查' },
        { key: 'recovery', label: '恢复' },
        { key: 'progress', label: '进展' },
        { key: 'projection_notice', label: '投影观察' },
      ];

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function splitLines(value) {
        return value.split('\\n').map((part) => part.trim()).filter(Boolean);
      }

      function setMessage(text, isError = false) {
        messageEl.textContent = text;
        messageEl.className = isError ? 'message error' : 'message';
      }

      function renderStatus(status) {
        if (status === 'yes') return '是';
        if (status === 'no') return '否';
        if (status === 'partial') return '部分';
        if (status === 'active') return '进行中';
        if (status === 'blocked') return '受阻';
        if (status === 'completed') return '已完成';
        if (status === 'abandoned') return '已放弃';
        return status;
      }

      function renderRetryReason(reason) {
        if (reason === 'allowed') return '允许继续，这次变化足够明确';
        if (reason === 'policy_not_acknowledged') return '还没有确认阅读当前指导';
        if (reason === 'blocked_strategy_overlap') return '这次计划与已禁止策略重叠过高';
        if (reason === 'no_meaningful_change') return '这次重试没有体现出足够明确的新变化';
        if (reason === 'repeated_failure_without_downgrade') return '连续失败后仍未体现降维或换路';
        return reason;
      }

      function formatValidationError(error) {
        const details = error?.details;
        if (!Array.isArray(details) || details.length === 0) {
          return error?.message || null;
        }

        const firstIssue = details[0];
        if (firstIssue?.path?.[0] === 'failure_type' && firstIssue?.code === 'invalid_enum_value') {
          return '失败类型无效，请从预设选项中选择：' + firstIssue.options.join(', ');
        }

        return firstIssue?.message || error?.message || null;
      }

      function formatRelativeTime(value) {
        const target = Date.parse(value);
        if (Number.isNaN(target)) return value;
        const diffMinutes = Math.max(0, Math.round((Date.now() - target) / 60000));
        if (diffMinutes < 1) return '刚刚';
        if (diffMinutes < 60) return diffMinutes + ' 分钟前';
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return diffHours + ' 小时前';
        const diffDays = Math.round(diffHours / 24);
        return diffDays + ' 天前';
      }

      function formatTimelineType(type) {
        if (type === 'policy_update') return '策略更新';
        if (type === 'retry_check') return '重试检查';
        if (type === 'failure') return '失败';
        if (type === 'reflection') return '反思';
        if (type === 'recovery') return '恢复';
        if (type === 'progress') return '进展';
        if (type === 'projection_notice') return '投影观察';
        return type;
      }

      function summarizeImpact(type) {
        if (type === 'failure') return '问题暴露';
        if (type === 'reflection') return '定位根因';
        if (type === 'policy_update') return '改写指导';
        if (type === 'retry_check') return '防止重复';
        if (type === 'recovery') return '恢复上下文';
        if (type === 'progress') return '产生正向结果';
        if (type === 'projection_notice') return '发现偏差';
        return '记录变化';
      }

      function buildTimelineCounts(timeline) {
        return timeline.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {});
      }

      function buildTimelineSummary(timeline) {
        if (timeline.length === 0) {
          return {
            hero: '暂无变化',
            paragraph: '还没有形成可阅读的进化事件，先从上面的当前状态判断 Agent 现在卡在哪里。',
          };
        }

        const counts = buildTimelineCounts(timeline);
        const parts = [
          counts.failure ? counts.failure + ' 次失败' : null,
          counts.policy_update ? counts.policy_update + ' 次策略修正' : null,
          counts.retry_check ? counts.retry_check + ' 次重试检查' : null,
          counts.recovery ? counts.recovery + ' 次恢复' : null,
          counts.progress ? counts.progress + ' 次进展' : null,
          counts.projection_notice ? counts.projection_notice + ' 次投影观察' : null,
        ].filter(Boolean);

        return {
          hero: parts.slice(0, 2).join('，') || '已记录变化',
          paragraph: '共记录 ' + timeline.length + ' 条进化事件，最近变化集中在' + (parts.join('，') || '当前历史') + '。',
        };
      }

      function pickKeyEvolutionEvents(timeline) {
        if (timeline.length <= 6) return timeline;
        const priority = ['projection_notice', 'failure', 'policy_update', 'retry_check', 'recovery', 'progress', 'reflection'];
        const selected = [];
        for (const type of priority) {
          for (const event of timeline) {
            if (event.type === type && !selected.some((item) => item.id === event.id)) {
              selected.push(event);
            }
            if (selected.length >= 6) {
              return selected.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
            }
          }
        }
        return selected.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
      }

      function renderTimelineItem(event, compact = false) {
        return \`
          <article class="timeline-item">
            <div class="timeline-meta">
              <span class="timeline-type \${escapeHtml(event.type)}">\${escapeHtml(formatTimelineType(event.type))}</span>
              <div class="timeline-time">\${escapeHtml(formatRelativeTime(event.timestamp))} · \${escapeHtml(event.timestamp)}</div>
            </div>
            <div class="timeline-body">
              <strong>\${escapeHtml(event.summary)}</strong>
              <div class="timeline-impact">\${escapeHtml(event.impact || '这次变化已进入 Agent 的演化记录。')}</div>
            </div>
            <div class="timeline-outcome">
              <span class="badge \${escapeHtml(event.type === 'failure' ? 'no' : event.type === 'retry_check' || event.type === 'projection_notice' ? 'partial' : 'clear')}">\${escapeHtml(summarizeImpact(event.type))}</span>
            </div>
          </article>
        \`;
      }

      function renderRecordItem(title, timestamp, detail, badge) {
        const badgeHtml = badge
          ? '<span class="badge ' +
            escapeHtml(badge) +
            '">' +
            escapeHtml(badge === 'clear' ? '日志' : badge === 'partial' ? '思考' : badge) +
            '</span>'
          : '';
        return \`
          <article class="record-item">
            \${badgeHtml}
            <strong>\${escapeHtml(title)}</strong>
            <div class="timeline-time" style="margin-top: 6px;">\${escapeHtml(formatRelativeTime(timestamp))} · \${escapeHtml(timestamp)}</div>
            <p>\${escapeHtml(detail)}</p>
          </article>
        \`;
      }

      function renderTimelineFilters() {
        document.getElementById('timeline-filters').innerHTML = TIMELINE_FILTERS.map((filter) => \`
          <button
            type="button"
            class="filter-chip \${filter.key === timelineFilter ? 'active' : ''}"
            data-filter="\${escapeHtml(filter.key)}"
          >\${escapeHtml(filter.label)}</button>
        \`).join('');
      }

      function renderMoreInfoTabs() {
        document.querySelectorAll('#more-info-tabs [data-tab]').forEach((button) => {
          const active = button.getAttribute('data-tab') === moreInfoTab;
          button.classList.toggle('active', active);
        });
        document.getElementById('tab-records').hidden = moreInfoTab !== 'records';
        document.getElementById('tab-history').hidden = moreInfoTab !== 'history';
        document.getElementById('tab-system').hidden = moreInfoTab !== 'system';
      }

      function openHelpModal() {
        document.getElementById('help-modal').showModal();
      }

      function renderTimelineViews(view) {
        const timeline = Array.isArray(view.timeline) ? view.timeline : [];
        const summary = buildTimelineSummary(timeline);
        document.getElementById('overview-evidence').textContent = timeline.length
          ? '关键判断建立在 ' + view.learning_verdict.overall.evidence_event_ids.length + ' 条证据事件之上。'
          : '还没有形成可供结论使用的事件证据。';
        document.getElementById('timeline-summary').textContent = summary.paragraph;

        renderTimelineFilters();
        const filteredTimeline = timelineFilter === 'all'
          ? timeline
          : timeline.filter((event) => event.type === timelineFilter);
        const mainTimeline = filteredTimeline.slice(0, 12);
        document.getElementById('key-evolution').innerHTML = mainTimeline.length
          ? mainTimeline.map((event) => renderTimelineItem(event)).join('')
          : '<div class="muted">这个筛选条件下还没有进化事件。</div>';
        document.getElementById('timeline').innerHTML = filteredTimeline.length
          ? filteredTimeline.map((event) => renderTimelineItem(event)).join('')
          : '<div class="muted">这个筛选条件下还没有事件。</div>';
      }

      function renderDetail(view) {
        viewState = view;
        document.getElementById('overview-primary').innerHTML =
          escapeHtml(view.header.name) +
          ' <span>· ' +
          escapeHtml(renderStatus(view.header.status)) +
          ' · ' +
          escapeHtml(view.current_state.goal_title) +
          ' / ' +
          escapeHtml(view.current_state.current_stage) +
          '</span>';
        document.getElementById('overview-secondary').textContent =
          view.learning_verdict.overall.label + '：' + view.learning_verdict.overall.reason;
        document.getElementById('overview-risk').textContent =
          (view.current_state.current_risk || '当前无明显风险') +
          ' · 下一步：' +
          (view.current_state.recommended_next_step || '等待更多行为证据');
        document.getElementById('current-state-inline').textContent =
          '当前指导：' +
          (view.current_state.current_guidance || '还没有指导') +
          ' · 避免策略：' +
          (view.current_state.avoid_strategies.join(', ') || '暂无') +
          ' · 上一轮路径：' +
          (view.current_state.last_path || '暂无') +
          ' · 下一轮路径：' +
          (view.current_state.next_path || '待定') +
          ' · 为什么不同：' +
          (view.current_state.why_different || '还没有明确行为差异说明') +
          ' · 最近活跃 ' +
          view.header.last_active_at;

        renderTimelineViews(view);

        document.getElementById('reflection-history').innerHTML = view.reflection_history.length
          ? view.reflection_history.map((item) => renderRecordItem(
            item.summary,
            item.timestamp,
            '根因：' + item.root_cause + '。必须改变：' + item.must_change,
            'partial'
          )).join('')
          : '<div class="muted">当前还没有可展示的思考记录。</div>';

        document.getElementById('operation-log').innerHTML = view.operation_log.length
          ? view.operation_log.map((item) => renderRecordItem(
            item.title,
            item.timestamp,
            item.detail,
            'clear'
          )).join('')
          : '<div class="muted">当前还没有可展示的运行日志。</div>';

        document.getElementById('goal-history').innerHTML = view.goal_history.length
          ? view.goal_history.map((item) => \`
          <article class="event">
            <div class="eyebrow">\${escapeHtml(item.session)}</div>
            <strong>\${escapeHtml(item.goal_title)}</strong>
            <div style="margin-top: 6px;">\${escapeHtml(renderStatus(item.status))} · \${escapeHtml(item.current_stage)}</div>
            <div class="muted" style="margin-top: 6px;">\${escapeHtml(item.workspace)} / \${escapeHtml(item.session)} · 最近事件 \${escapeHtml(item.last_event)}</div>
            <div class="muted" style="margin-top: 8px;">\${escapeHtml(item.last_seen_at)}</div>
          </article>
        \`).join('')
          : '<div class="muted">这个 Agent 还没有可显示的 goal history。</div>';
        document.getElementById('goal-history-summary').textContent = view.goal_history.length
          ? '这个 Agent 一共参与过 ' + view.goal_history.length + ' 个 goal，默认按最近活动倒序展示。'
          : '当前还没有形成可用的 goal 归属历史。';

        document.getElementById('gaps').innerHTML = view.system_gaps.map((gap) => \`
          <article class="gap">
            <span class="badge \${escapeHtml(gap.status)}">\${escapeHtml(gap.status)}</span>
            <strong>\${escapeHtml(gap.label)}</strong>
            <div class="muted" style="margin-top: 8px;">\${escapeHtml(gap.detail)}</div>
          </article>
        \`).join('');
        renderMoreInfoTabs();

        const hasGoal = Boolean(view.header.current_goal_id);
        Array.from(document.querySelectorAll('#record-failure-form textarea, #record-failure-form input, #record-failure-form button, #retry-check-form textarea, #retry-check-form input, #retry-check-form button')).forEach((element) => {
          element.disabled = !hasGoal;
        });
        document.getElementById('recover-button').disabled = !hasGoal;
        if (!hasGoal) {
          retryResultEl.textContent = '当前没有活动 goal，不能记录失败或执行重试检查。';
        }
      }

      function getCurrentGoalId() {
        const goalId = viewState?.header?.current_goal_id;
        if (!goalId) {
          throw new Error('当前托管 Agent 还没有活动 goal。');
        }
        return goalId;
      }

      async function loadDetail() {
        const res = await fetch(detailEndpoint);
        if (!res.ok) {
          throw new Error('加载详情失败：' + detailEndpoint);
        }
        const body = await res.json();
        renderDetail(body.data);
      }

      async function refreshAfter(action, successMessage) {
        try {
          await action();
          await loadDetail();
          setMessage(successMessage);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error), true);
        }
      }

      function isUserEditingActionForms() {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
          return false;
        }

        return Boolean(activeElement.closest('#record-failure-form, #retry-check-form'));
      }

      async function autoRefreshDetail() {
        if (document.visibilityState !== 'visible' || isUserEditingActionForms()) {
          return;
        }

        try {
          await loadDetail();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error), true);
        }
      }

      document.getElementById('record-failure-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        await refreshAfter(async () => {
          const attemptRes = await fetch('/api/v1/attempts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal_id: getCurrentGoalId(),
              stage: form.get('stage'),
              action_taken: form.get('action_taken'),
              strategy_tags: splitLines(String(form.get('strategy_tags') || '').replaceAll(',', '\\n')),
              result: 'failure',
              failure_type: form.get('failure_type'),
            }),
          });
          const attemptBody = await attemptRes.json().catch(() => ({}));
          if (!attemptRes.ok) {
            throw new Error(formatValidationError(attemptBody?.error) || '记录失败 attempt 失败');
          }

          const reflectionRes = await fetch('/api/v1/reflections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal_id: getCurrentGoalId(),
              attempt_id: attemptBody.data.id,
              summary: form.get('summary'),
              root_cause: form.get('root_cause'),
              must_change: form.get('must_change'),
              avoid_strategy: form.get('avoid_strategy') || undefined,
            }),
          });
          const reflectionBody = await reflectionRes.json().catch(() => ({}));
          if (!reflectionRes.ok) {
            throw new Error(reflectionBody?.error?.message || 'attempt 已记录，但 reflection 写回失败');
          }
        }, '已记录失败，并更新当前指导。');
      });

      document.getElementById('retry-check-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        try {
          const res = await fetch('/api/v1/retry-guard/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal_id: getCurrentGoalId(),
              planned_action: form.get('planned_action'),
              what_changed: form.get('what_changed'),
              strategy_tags: splitLines(String(form.get('strategy_tags') || '').replaceAll(',', '\\n')),
              policy_acknowledged: Boolean(form.get('policy_acknowledged')),
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(body?.error?.message || '执行重试检查失败');
          }
          retryResultEl.textContent =
            '允许重试：' +
            body.data.allowed +
            ' · 解释：' +
            renderRetryReason(body.data.reason) +
            ' · 原因码：' +
            body.data.reason;
          setMessage('已执行一次实时重试检查。');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error), true);
        }
      });

      document.getElementById('timeline-filters').addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest('[data-filter]') : null;
        if (!target) {
          return;
        }
        timelineFilter = target.getAttribute('data-filter') || 'all';
        if (viewState) {
          renderTimelineViews(viewState);
        }
      });

      document.getElementById('more-info-tabs').addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest('[data-tab]') : null;
        if (!target) {
          return;
        }
        moreInfoTab = target.getAttribute('data-tab') || 'records';
        renderMoreInfoTabs();
      });

      document.getElementById('overview-record-failure').addEventListener('click', () => {
        const panel = document.getElementById('record-failure-panel');
        panel.open = true;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      document.getElementById('overview-retry-check').addEventListener('click', () => {
        const panel = document.getElementById('retry-check-panel');
        panel.open = true;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      document.getElementById('overview-recover').addEventListener('click', () => {
        const panel = document.getElementById('recover-panel');
        panel.open = true;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      document.getElementById('open-help').addEventListener('click', openHelpModal);
      document.getElementById('open-help-inline').addEventListener('click', openHelpModal);
      document.getElementById('close-help').addEventListener('click', () => {
        document.getElementById('help-modal').close();
      });

      document.getElementById('recover-button').addEventListener('click', () => {
        refreshAfter(async () => {
          const goalId = getCurrentGoalId();
          const res = await fetch('/api/v1/recovery-packet?goal_id=' + encodeURIComponent(goalId));
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(body?.error?.message || '重新计算恢复快照失败');
          }
        }, '已重新计算当前恢复快照。');
      });

      loadDetail()
        .then(() => setMessage('已加载 Agent 详情'))
        .catch((error) => setMessage(error instanceof Error ? error.message : String(error), true));

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void autoRefreshDetail();
        }
      });

      setInterval(async () => {
        await autoRefreshDetail();
      }, AUTO_REFRESH_INTERVAL_MS);
    </script>
  </body>
</html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeJsString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
