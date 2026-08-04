// Minimal HTTP helper. No dependencies.
//
// Every remote read in this project goes through here so that three things are
// true everywhere and are true in one place: a real User-Agent (some providers
// 403 the default one), a hard timeout, and bounded retries with backoff.

const DEFAULT_UA =
  'solhonesty/0.1 (+https://github.com/kerne-protocol/solhonesty) open-data collector';

export class HttpError extends Error {
  constructor(url, status, body) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export async function getJson(url, opts = {}) {
  const { timeoutMs = 30_000, retries = 3, backoffMs = 800, headers = {} } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json', ...headers },
      });
      const text = await res.text();
      if (!res.ok) throw new HttpError(url, res.status, text.slice(0, 400));
      try {
        return JSON.parse(text);
      } catch {
        throw new HttpError(url, res.status, `response was not JSON: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      lastErr = err;
      // 4xx other than 429 will not become truthy on retry.
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt === retries) break;
      await sleep(backoffMs * Math.pow(2, attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function postJson(url, body, opts = {}) {
  const { timeoutMs = 30_000, retries = 3, backoffMs = 800 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ac.signal,
        headers: { 'User-Agent': DEFAULT_UA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new HttpError(url, res.status, text.slice(0, 400));
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await sleep(backoffMs * Math.pow(2, attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
