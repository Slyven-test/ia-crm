type WarmupState = {
  started: boolean;
  done: boolean;
};

const state: WarmupState =
  (globalThis as { __iaCrmWarmup?: WarmupState }).__iaCrmWarmup ??
  ((globalThis as { __iaCrmWarmup?: WarmupState }).__iaCrmWarmup = {
    started: false,
    done: false,
  });

const WARMUP_URLS = [
  "http://127.0.0.1:3000/analytics",
  "http://127.0.0.1:3000/audit",
  "http://127.0.0.1:3000/exports",
  "http://127.0.0.1:3000/runs",
];

const WARMUP_TIMEOUT_MS = 1500;

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, { signal: controller.signal, cache: "no-store" });
  } catch {
    // Best-effort warmup; ignore failures/timeouts.
  } finally {
    clearTimeout(timeout);
  }
}

async function runWarmup() {
  try {
    await Promise.allSettled(
      WARMUP_URLS.map((url) => fetchWithTimeout(url, WARMUP_TIMEOUT_MS)),
    );
  } finally {
    state.done = true;
  }
}

export function triggerWarmup() {
  if (state.started || state.done) {
    return;
  }

  state.started = true;
  setTimeout(() => {
    void runWarmup();
  }, 0);
}
