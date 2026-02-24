import { EventEmitter } from 'node:events';

export interface CortexEvents {
  'thread.resolved': {
    threadId: string;
    workspaceId: string;
    resolvedBy: string;
  };
  'artifact.created': {
    artifactId: string;
    workspaceId: string;
    creatorKind: string;
    topicId: string;
  };
}

type EventName = keyof CortexEvents;

class CortexEventBus {
  private emitter = new EventEmitter();

  on<K extends EventName>(event: K, listener: (data: CortexEvents[K]) => void): void {
    this.emitter.on(event, listener);
  }

  off<K extends EventName>(event: K, listener: (data: CortexEvents[K]) => void): void {
    this.emitter.off(event, listener);
  }

  emitEvent<K extends EventName>(event: K, data: CortexEvents[K]): void {
    this.emitter.emit(event, data);
  }
}

export const eventBus = new CortexEventBus();
