export class Timer {
  private timer;

  constructor(fn: Function, delay: number) {
    if (delay <= 0) {
      return fn();
    }

    this.timer = setTimeout(fn, delay);
  }

  /**
   * Cancel the timer
   */
  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
