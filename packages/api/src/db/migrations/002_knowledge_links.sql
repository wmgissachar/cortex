-- Migration 002: Knowledge links for artifact relationships
-- Supports: supersedes, supports, contradicts, depends_on, related_to

CREATE TYPE knowledge_link_type AS ENUM (
  'supersedes', 'supports', 'contradicts', 'depends_on', 'related_to'
);

CREATE TABLE knowledge_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  link_type knowledge_link_type NOT NULL,
  created_by UUID NOT NULL REFERENCES principals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (source_id != target_id),
  UNIQUE (source_id, target_id, link_type)
);

CREATE INDEX idx_knowledge_links_source ON knowledge_links(source_id);
CREATE INDEX idx_knowledge_links_target ON knowledge_links(target_id);
CREATE INDEX idx_knowledge_links_type ON knowledge_links(link_type);
