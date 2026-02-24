import type { ThreadType, ThreadStatus } from '../enums.js';

export interface Thread {
  id: string;
  workspace_id: string;
  topic_id: string;
  title: string;
  type: ThreadType;
  status: ThreadStatus;
  body: string | null;
  summary: string | null;
  tags: string[];
  comment_count: number;
  pinned: boolean;
  created_at: Date;
  created_by: string;
  updated_at: Date;
}

export interface CreateThreadInput {
  topic_id: string;
  title: string;
  type?: ThreadType;
  body?: string;
  summary?: string;
  tags?: string[];
}

export interface UpdateThreadInput {
  title?: string;
  type?: ThreadType;
  status?: ThreadStatus;
  body?: string;
  summary?: string | null;
  tags?: string[];
  pinned?: boolean;
}

export interface ThreadWithCreator extends Thread {
  creator: {
    id: string;
    handle: string;
    display_name: string;
  };
}
