export class MessagingHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function httpError(message: string, status: number): MessagingHttpError {
  return new MessagingHttpError(message, status);
}

export function buildDirectKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join(":");
}
