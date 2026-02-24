import db from '../db/index.js';

export interface KnowledgeLinkRow {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  created_by: string;
  created_at: Date;
}

export interface KnowledgeLinkWithDetails extends KnowledgeLinkRow {
  source_title: string;
  source_status: string;
  target_title: string;
  target_status: string;
  creator_handle: string;
  creator_display_name: string;
}

export const knowledgeLinkRepository = {
  async create(
    sourceId: string, targetId: string, linkType: string, createdBy: string
  ): Promise<KnowledgeLinkRow> {
    const { rows } = await db.query<KnowledgeLinkRow>(
      `INSERT INTO knowledge_links (source_id, target_id, link_type, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sourceId, targetId, linkType, createdBy]
    );
    return rows[0];
  },

  async findByArtifact(artifactId: string): Promise<KnowledgeLinkWithDetails[]> {
    const { rows } = await db.query<KnowledgeLinkWithDetails>(
      `SELECT kl.*,
              src.title AS source_title, src.status AS source_status,
              tgt.title AS target_title, tgt.status AS target_status,
              p.handle AS creator_handle, p.display_name AS creator_display_name
       FROM knowledge_links kl
       JOIN artifacts src ON kl.source_id = src.id
       JOIN artifacts tgt ON kl.target_id = tgt.id
       JOIN principals p ON kl.created_by = p.id
       WHERE kl.source_id = $1 OR kl.target_id = $1
       ORDER BY kl.created_at DESC`,
      [artifactId]
    );
    return rows;
  },

  async findSuperseder(artifactId: string): Promise<KnowledgeLinkWithDetails | null> {
    const { rows } = await db.query<KnowledgeLinkWithDetails>(
      `SELECT kl.*,
              src.title AS source_title, src.status AS source_status,
              tgt.title AS target_title, tgt.status AS target_status,
              p.handle AS creator_handle, p.display_name AS creator_display_name
       FROM knowledge_links kl
       JOIN artifacts src ON kl.source_id = src.id
       JOIN artifacts tgt ON kl.target_id = tgt.id
       JOIN principals p ON kl.created_by = p.id
       WHERE kl.target_id = $1 AND kl.link_type = 'supersedes'
       ORDER BY kl.created_at DESC
       LIMIT 1`,
      [artifactId]
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM knowledge_links WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
