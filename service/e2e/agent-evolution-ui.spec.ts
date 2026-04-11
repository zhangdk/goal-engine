import { expect, test } from '@playwright/test';

test.describe('Goal Engine agent evolution UI', () => {
  test('lets a user start from the gallery and inspect one agent journey', async ({ page, request }) => {
    const goalTitle = `Agent evolution goal ${Date.now()}`;

    const existingGoalRes = await request.get('/api/v1/goals/current');
    if (existingGoalRes.status() === 200) {
      const existingGoalBody = await existingGoalRes.json() as {
        data: { id: string };
      };
      const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
        data: { status: 'completed' },
      });
      expect(closeGoalRes.status()).toBe(200);
    }

    await page.goto('/ui');

    await expect(page.getByRole('heading', { name: 'Goal Engine Agent 观察台' })).toBeVisible();
    await expect(page.getByText('goal-engine-demo')).toBeVisible();
    await expect(page.getByText('goal-engine-research')).toBeVisible();

    await page.getByLabel('标题').fill(goalTitle);
    await page.getByLabel('成功标准').fill('让 Agent 的经历更容易理解');
    await page.getByLabel('当前阶段').fill('integration');
    await page.getByRole('button', { name: '开始目标' }).click();

    await expect(page).toHaveURL(/\/ui\/agents\//);
    await expect(page.locator('#overview-primary')).toContainText('goal-engine-demo');
    await expect(page.locator('#overview-primary')).toContainText(goalTitle);
    await expect(page.locator('#overview-primary')).toContainText('进行中');
    await expect(page.getByRole('heading', { name: '关键进化' })).toBeVisible();
    await expect(page.locator('#timeline-panorama')).toContainText('查看进化全景');

    await page.locator('#record-failure-panel summary').click();
    await page.getByLabel('阶段').fill('integration');
    await page.getByLabel('采取动作').fill('Repeated the same path again');
    await page.getByLabel('策略标签').first().fill('repeat');
    await expect(page.getByLabel('失败类型')).toHaveValue('stuck_loop');
    await expect(page.getByLabel('失败类型').locator('option')).toHaveCount(8);
    await page.getByLabel('失败类型').selectOption('stuck_loop');
    await page.getByLabel('反思摘要').fill('Repeated the same path again');
    await page.getByLabel('根因').fill('No new input before retry');
    await page.getByLabel('必须改变').fill('Take a different route');
    await page.getByLabel('避免策略').fill('repeat');
    await page.locator('#record-failure-form').getByRole('button', { name: '记录失败' }).click();

    await expect(page.getByText('已记录失败，并更新当前指导。')).toBeVisible();
    await expect(page.locator('#overview-secondary')).toContainText('部分改善');
    await expect(page.locator('#current-state-inline')).toContainText('Take a different route');
    await expect(page.locator('#current-state-inline')).toContainText('避免策略');

    await page.locator('#retry-check-panel summary').click();
    await page.getByLabel('计划动作').fill('Repeat the same path again');
    await page.getByLabel('这次改变了什么').fill('');
    await page.getByLabel('策略标签').nth(1).fill('repeat');
    await page.getByLabel('我已经阅读当前指导').check();
    await page.locator('#retry-check-form').getByRole('button', { name: '检查重试' }).click();

    await expect(page.getByText('已执行一次实时重试检查。')).toBeVisible();
    await expect(page.getByText('允许重试：false')).toBeVisible();
    await expect(page.getByText('这次重试没有体现出足够明确的新变化')).toBeVisible();
    await expect(page.getByText('原因码：no_meaningful_change')).toBeVisible();
    await expect(page.getByText('no_meaningful_change')).toBeVisible();

    await page.locator('#recover-panel summary').click();
    await page.getByRole('button', { name: '恢复当前目标' }).click();
    await expect(page.getByText('已重新计算当前恢复快照。')).toBeVisible();
    await page.getByText('查看进化全景').click();
    await expect(page.locator('#timeline')).toContainText('恢复');
    await page.getByText('更多信息').click();
    await page.getByRole('button', { name: '系统', exact: true }).click();
    await expect(page.getByText('系统缺口')).toBeVisible();
    await expect(page.locator('#gaps')).toContainText('重试检查历史尚未持久化');
  });

  test('surfaces an active-goal conflict and lets the user explicitly replace it from the gallery', async ({ page, request }) => {
    const existingGoalTitle = `Existing UI goal ${Date.now()}`;
    const replacementGoalTitle = `Replacement UI goal ${Date.now()}`;

    const existingGoalRes = await request.get('/api/v1/goals/current');
    if (existingGoalRes.status() === 200) {
      const existingGoalBody = await existingGoalRes.json() as {
        data: { id: string };
      };
      const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
        data: { status: 'completed' },
      });
      expect(closeGoalRes.status()).toBe(200);
    }

    const firstGoalRes = await request.post('/api/v1/goals', {
      data: {
        title: existingGoalTitle,
        success_criteria: ['Keep one active goal running'],
        stop_conditions: [],
        current_stage: 'candidate-validation',
      },
    });
    expect(firstGoalRes.status()).toBe(201);

    await page.goto('/ui');
    await page.getByLabel('标题').fill(replacementGoalTitle);
    await page.getByLabel('成功标准').fill('Explicitly replace the old goal');
    await page.getByLabel('当前阶段').fill('lead-search');
    await page.getByRole('button', { name: '开始目标' }).click();

    await expect(page.getByText('当前已有 active goal')).toBeVisible();
    await expect(page.getByText(existingGoalTitle)).toBeVisible();
    await expect(page.getByRole('button', { name: '继续当前目标' })).toBeVisible();
    await expect(page.getByRole('button', { name: '替换当前目标并开始' })).toBeVisible();

    await page.getByRole('button', { name: '替换当前目标并开始' }).click();

    await expect(page).toHaveURL(/\/ui\/agents\//);
    await expect(page.locator('#overview-primary')).toContainText(replacementGoalTitle);
    await expect(page.locator('#overview-primary')).toContainText('lead-search');
  });
});
