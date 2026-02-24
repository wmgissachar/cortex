import db from '../db/index.js';

export interface AuditLogRow {
  id: string;
  workspace_id: string;
  principal_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export const auditLogRepository = {
  async create(
    workspaceId: string,
    principalId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> },
    metadata?: Record<string, unknown>
  ): Promise<AuditLogRow> {
    const { rows } = await db.query<AuditLogRow>(
      `INSERT INTO audit_logs (workspace_id, principal_id, action, entity_type, entity_id, changes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        workspaceId, principalId, action, entityType, entityId,
        changes ? JSON.stringify(changes) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return rows[0];
  },

  async findByEntity(entityType: string, entityId: string, limit = 20): Promise<AuditLogRow[]> {
    const { rows } = await db.query<AuditLogRow>(
      `SELECT al.*, p.handle AS principal_handle, p.display_name AS principal_display_name
       FROM audit_logs al
       LEFT JOIN principals p ON al.principal_id = p.id
       WHERE al.entity_type = $1 AND al.entity_id = $2
       ORDER BY al.created_at DESC
       LIMIT $3`,
      [entityType, entityId, limit]
    );
    return rows;
  },
};
