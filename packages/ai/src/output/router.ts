/**
 * Output router interface — directs AI output to the appropriate destination.
 * Phase A placeholder. Concrete implementations arrive in Phases B-D.
 */
export interface OutputRouter {
  /** Route the output of an AI job to the correct destination */
  route(params: {
    jobId: string;
    persona: string;
    feature: string;
    targetId: string;
    content: string;
    workspaceId: string;
  }): Promise<void>;
}
