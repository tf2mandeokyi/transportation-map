export class ErrorChain extends Error {
  static thrower<T>(message: string): (cause: Error) => T {
    return (cause: Error) => {
      throw new ErrorChain(message, cause);
    };
  }

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ErrorChain';
    if (cause) {
      (this as any).cause = cause; // TypeScript doesn't yet support the cause property
      this.stack += 'Caused by: ' + cause.message + '\n' + cause.stack;
    }
  }
}