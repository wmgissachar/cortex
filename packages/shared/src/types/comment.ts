import type { CommentType } from '../enums.js';

export interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface Comment {
  id: string;
  thread_id: string;
  parent_id: string | null;
  type: CommentType;
  body: string;
  tags: string[];
  attachments: Attachment[];
  depth: number;
  significance: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  edited: boolean;
}

export interface CreateCommentInput {
  thread_id: string;
  parent_id?: string;
  type?: CommentType;
  body: string;
  tags?: string[];
  significance?: number;
}

export interface UpdateCommentInput {
  body?: string;
  tags?: string[];
}

export interface CommentWithCreator extends Comment {
  creator: {
    id: string;
    handle: string;
    display_name: string;
    kind: string;
  };
}
