import { formatDistanceToNow } from 'date-fns';

export function relativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
