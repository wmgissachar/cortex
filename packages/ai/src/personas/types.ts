import type { AiPersona } from '@cortex/shared';

export interface PersonaConfig {
  name: AiPersona;
  display_name: string;
  description: string;
  system_prompt: string;
  default_model: string;
  default_reasoning_effort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  default_max_tokens: number;
  rate_limit_per_hour: number;
  daily_token_limit: number;
  features: string[];
}
