/**
 * Context assembler interface — gathers relevant context for an AI invocation.
 * Phase A placeholder. Concrete implementations arrive in Phases B-D.
 */
export interface ContextAssembler {
  /** Assemble context string for a given target entity */
  assemble(params: {
    targetId: string;
    targetType: string;
    workspaceId: string;
    maxTokens: number;
  }): Promise<string>;
}
