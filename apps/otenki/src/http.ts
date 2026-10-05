const RETRY_DELAY_MS = 250;

/**
 * Without an explicit deadline a stalled TCP connection hangs the command
 * indefinitely, which is exactly what a weather lookup must never do.
 */
const TIMEOUT_MS = 10_000;

export class HttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * The public Open-Meteo endpoints fail transiently often enough to matter from a
 * shell: a dropped connection should not surface as a command failure. Retry
 * network errors, timeouts and 5xx, but never a 4xx, which will never start working.
 */
export const fetchJson = async <T>(url: URL, retries = 1): Promise<T> => {
  let lastError: unknown = new Error(
    `${url.host} へのリクエストに失敗しました`,
  );

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response | null = null;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
    }

    if (response !== null) {
      if (response.ok) return (await response.json()) as T;

      lastError = new HttpError(
        `${url.host} が HTTP ${response.status} を返しました`,
      );
      if (response.status < 500) throw lastError;
    }

    if (attempt < retries) await sleep(RETRY_DELAY_MS * (attempt + 1));
  }

  throw lastError;
};
