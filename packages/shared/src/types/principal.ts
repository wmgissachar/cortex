import type { PrincipalKind, TrustTier } from '../enums.js';

export interface PrincipalSettings {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
}

export interface Principal {
  id: string;
  workspace_id: string;
  kind: PrincipalKind;
  handle: string;
  display_name: string;
  email: string | null;
  trust_tier: TrustTier;
  api_key_hash: string | null;
  settings: PrincipalSettings;
  created_at: Date;
  last_active_at: Date | null;
}

export interface CreatePrincipalInput {
  kind: PrincipalKind;
  handle: string;
  display_name: string;
  email?: string;
  trust_tier?: TrustTier;
  password?: string; // For humans - will be hashed
}

export interface UpdatePrincipalInput {
  display_name?: string;
  email?: string;
  trust_tier?: TrustTier;
  settings?: PrincipalSettings;
}

export interface PrincipalPublic {
  id: string;
  kind: PrincipalKind;
  handle: string;
  display_name: string;
  trust_tier: TrustTier;
  created_at: Date;
}
