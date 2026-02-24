import type { CircuitState } from '@cortex/shared';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  initialTimeoutMs: number;
  maxTimeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  initialTimeoutMs: 60_000,
  maxTimeoutMs: 900_000,
};

export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: Date | null;
  nextRetryAt: Date | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private lastFailureAt: Date | null = null;
  private currentTimeoutMs: number;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentTimeoutMs = this.config.initialTimeoutMs;
  }

  canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open': {
        const now = Date.now();
        const retryAt = (this.lastFailureAt?.getTime() ?? 0) + this.currentTimeoutMs;
        if (now >= retryAt) {
          this.state = 'half_open';
          return true;
        }
        return false;
      }

      case 'half_open':
        return true;

      default:
        return false;
    }
  }

  recordSuccess(): void {
    this.totalSuccesses++;
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.currentTimeoutMs = this.config.initialTimeoutMs;
  }

  recordFailure(): void {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureAt = new Date();

    if (this.state === 'half_open') {
      // Failed during half-open probe — back to open with doubled timeout
      this.state = 'open';
      this.currentTimeoutMs = Math.min(
        this.currentTimeoutMs * 2,
        this.config.maxTimeoutMs,
      );
    } else if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    // Check if we should transition from open to half_open
    if (this.state === 'open') {
      const now = Date.now();
      const retryAt = (this.lastFailureAt?.getTime() ?? 0) + this.currentTimeoutMs;
      if (now >= retryAt) {
        this.state = 'half_open';
      }
    }
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    const state = this.getState();
    let nextRetryAt: Date | null = null;

    if (state === 'open' && this.lastFailureAt) {
      nextRetryAt = new Date(this.lastFailureAt.getTime() + this.currentTimeoutMs);
    }

    return {
      state,
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureAt: this.lastFailureAt,
      nextRetryAt,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.currentTimeoutMs = this.config.initialTimeoutMs;
    this.lastFailureAt = null;
  }
}
