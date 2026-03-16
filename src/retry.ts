function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetries<T>(
  task: () => Promise<T>,
  retries: number,
  baseDelayMs = 300,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}
