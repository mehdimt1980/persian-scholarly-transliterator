export class OperationQueue {
  private currentPromise: Promise<unknown> = Promise.resolve();

  enqueue<R>(op: () => Promise<R>): Promise<R> {
    const nextPromise = this.currentPromise.then(
      () => op(),
      () => op()
    );
    this.currentPromise = nextPromise.catch(() => {});
    return nextPromise;
  }

  settle(): Promise<void> {
    return this.currentPromise.then(
      () => {},
      () => {}
    );
  }
}
