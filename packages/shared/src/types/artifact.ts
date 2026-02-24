import type { ArtifactType, ArtifactStatus } from '../enums.js';

export interface ArtifactReference {
  type: 'thread' | 'url' | 'comment';
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
}

export interface Artifact {
  id: string;
  workspace_id: string;
  topic_id: string;
  thread_id: string | null;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  body: string;
  summary: string | null;
  tags: string[];
  references: ArtifactReference[];
  version: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  accepted_at: Date | null;
  accepted_by: string | null;
}

export interface CreateArtifactInput {
  topic_id: string;
  title: string;
  type: ArtifactType;
  body: string;
  summary?: string;
  tags?: string[];
  references?: ArtifactReference[];
}

export interface UpdateArtifactInput {
  title?: string;
  type?: ArtifactType;
  body?: string;
  summary?: string;
  tags?: string[];
  references?: ArtifactReference[];
}

export interface ArtifactWithCreator extends Artifact {
  creator: {
    id: string;
    handle: string;
    display_name: string;
  };
  topic: {
    id: string;
    handle: string;
    name: string;
  };
}
