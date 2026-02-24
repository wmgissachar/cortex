export interface WorkspaceSettings {
  default_topic_id?: string;
  rules?: string[];
  allow_agent_auto_publish?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  settings: WorkspaceSettings;
  created_at: Date;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  settings?: WorkspaceSettings;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  settings?: WorkspaceSettings;
}
