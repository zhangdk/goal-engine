/**
 * AdapterClient — Goal Engine service 的 HTTP 客户端
 *
 * 职责：
 * - 封装 fetch 调用
 * - 统一错误归一化
 * - 不包含任何业务逻辑
 */

export type AdapterError = {
  code: string;
  status: number;
  message: string;
};

export class AdapterClient {
  constructor(
    public readonly baseUrl: string,
    private fetchImpl: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async get<T>(path: string): Promise<T> {
    const res = await this.safeFetch(`${this.baseUrl}${path}`);
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.safeFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await this.safeFetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  private async safeFetch(input: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(input, init);
    } catch {
      throw createAdapterError('service_unavailable', 503);
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    let json: { data?: T; error?: { code?: string; message?: string } };
    try {
      json = await res.json() as { data?: T; error?: { code?: string; message?: string } };
    } catch {
      if (!res.ok) {
        throw createAdapterError('unknown_error', res.status);
      }
      throw createAdapterError('invalid_response', res.status, 'Service returned non-JSON response');
    }
    if (!res.ok) {
      throw createAdapterError(json.error?.code ?? 'unknown_error', res.status, json.error?.message);
    }
    return json.data as T;
  }
}

function createAdapterError(code: string, status: number, message?: string): AdapterError {
  return {
    code,
    status,
    message: message ?? defaultErrorMessage(code, status),
  };
}

function defaultErrorMessage(code: string, status: number): string {
  if (code === 'service_unavailable') {
    return 'Goal Engine service is unavailable';
  }

  if (code === 'no_active_goal') {
    return 'No active goal is available';
  }

  if (code === 'no_policy_yet') {
    return 'No guidance is available for this goal yet';
  }

  if (code === 'state_conflict') {
    return 'An active goal already exists';
  }

  if (code === 'validation_error') {
    return 'The request did not pass validation';
  }

  if (code === 'not_found') {
    return 'The requested Goal Engine resource was not found';
  }

  if (status >= 500) {
    return 'Goal Engine service returned an unexpected error';
  }

  return 'Goal Engine request failed';
}
