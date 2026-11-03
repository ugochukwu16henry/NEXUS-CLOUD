export type FetchLike = typeof fetch;

export class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`upstream ${status}`);
    this.name = "UpstreamError";
  }
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "AbortError";
  }
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds * 1000, 2_000);
}

/**
 * POST JSON. Retries a 429 or 5xx once. The error never includes headers or the body, so an API
 * key in `Authorization` cannot land in a log.
 */
export async function postJson(input: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (input.signal.aborted) throw new CancelledError();
    let response: Response;
    try {
      response = await fetchImpl(input.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...input.headers },
        body: JSON.stringify(input.body),
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new CancelledError();
      }
      throw error;
    }
    if (response.ok) return response.json() as Promise<unknown>;
    const retry = (response.status === 429 || response.status >= 500) && attempt === 0;
    if (!retry) throw new UpstreamError(response.status);
    const wait = response.status === 429 ? retryAfterMs(response) : 0;
    if (wait > 0) await sleep(wait);
  }
  throw new UpstreamError(599);
}

export async function readSse(response: Response, onEvent: (data: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) onEvent(line.slice(5).trim());
      }
    }
  }
}
