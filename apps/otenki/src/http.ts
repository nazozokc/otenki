import dns from "node:dns";

// Resolve hostnames preferring IPv4 from the start. A machine without a usable
// IPv6 route (a common NixOS default) otherwise waits out a DNS stall on the
// AAAA record at the tail of a lookup ladder — seconds per command for no gain.
dns.setDefaultResultOrder("ipv4first");

const RETRY_DELAY_MS = 250;

/**
 * Without an explicit deadline a stalled TCP connection hangs the command
 * indefinitely, which is exactly what a weather lookup must never do.
 *
 * 5 seconds rather than 10: a healthy response arrives in under 3 seconds, a
 * connection that stalls at all tends to stall all the way to the deadline,
 * and every attempt is retried anyway. Halving the deadline halves the wall
 * time a single blackholed connection costs, which on a suffix ladder of
 * seven parallel requests is the difference between a 3 second run and a
 * 12 second one.
 */
const TIMEOUT_MS = 5_000;

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
 * The public Open-Meteo endpoints fail transiently often enough to matter from
 * a shell: a dropped connection should not surface as a command failure. Retry
 * network errors, timeouts and 5xx, but never a 4xx, which will never start
 * working. Two retries rather than one so that the shorter deadline above does
 * not turn a pair of blackholed connections into a failed command: a stall
 * recovers on the very next attempt, and three stalls in a row are rare.
 */
export const fetchJson = async <T>(url: URL, retries = 2): Promise<T> => {
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
