const running = new Map<string, Promise<unknown>>();

export function inSeries<T>(key: string, run: () => Promise<T>): Promise<T> {
  const queued = (running.get(key) ?? Promise.resolve()).then(run, run);

  running.set(key, queued);

  void queued
    .catch(() => undefined)
    .finally(() => {
      if (running.get(key) === queued) {
        running.delete(key);
      }
    });

  return queued;
}
