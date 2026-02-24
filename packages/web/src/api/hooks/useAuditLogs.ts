import { useQuery } from '@tanstack/react-query';
import client from '../client';

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  principal_id: string;
  principal_handle?: string;
  principal_display_name?: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  meta: { request_id: string };
}

export function useAuditLogs(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['audit-logs', entityType, entityId],
    queryFn: async () => {
      const response = await client.get<AuditLogsResponse>(
        `/${entityType}s/${entityId}/audit-logs`
      );
      return response.data.data;
    },
    enabled: !!entityId,
  });
}
