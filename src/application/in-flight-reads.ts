export class InFlightReads<T> {
  private readonly pending = new Map<string, Promise<T>>();

  run(key: string, read: () => Promise<T>): Promise<T> {
    const current = this.pending.get(key);
    if (current) return current;

    const started = read().finally(() => {
      // A write can invalidate this read and a later request can start a new one.
      if (this.pending.get(key) === started) this.pending.delete(key);
    });
    this.pending.set(key, started);
    return started;
  }

  invalidate(key: string): void {
    this.pending.delete(key);
  }
}
