import crypto from 'crypto';

export function generateRequestId(): string {
  return crypto.randomUUID();
}
