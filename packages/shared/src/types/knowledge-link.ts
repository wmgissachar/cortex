export type LinkType = 'supersedes' | 'supports' | 'contradicts' | 'depends_on' | 'related_to';

export interface KnowledgeLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: LinkType;
  created_by: string;
  created_at: Date;
}

export interface KnowledgeLinkWithDetails extends KnowledgeLink {
  source_title: string;
  source_status: string;
  target_title: string;
  target_status: string;
  creator_handle: string;
  creator_display_name: string;
}

export interface CreateKnowledgeLinkInput {
  source_id: string;
  target_id: string;
  link_type: LinkType;
}
