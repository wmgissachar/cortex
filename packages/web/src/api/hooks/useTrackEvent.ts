/**
 * Event Tracking Hooks
 *
 * Fire-and-forget event tracking for measuring Cortex usage
 * against success criteria and evaluation framework.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '../client';

// --- Module-level batching queue ---

interface QueuedEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueue() {
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, eventQueue.length);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Fire-and-forget — analytics are not business-critical
  client.post('/events', { events: batch }).catch(() => {});
}

function enqueue(event_type: string, payload: Record<string, unknown> = {}) {
  eventQueue.push({ event_type, payload });

  // Flush immediately if batch is full
  if (eventQueue.length >= 10) {
    flushQueue();
    return;
  }

  // Otherwise debounce flush by 2 seconds
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 2000);
}

// Flush remaining events on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushQueue);
}

// --- Hooks ---

/**
 * Returns a stable trackEvent function for recording UI events.
 */
export function useTrackEvent() {
  const trackEvent = useCallback(
    (eventType: string, payload: Record<string, unknown> = {}) => {
      enqueue(eventType, payload);
    },
    []
  );

  return trackEvent;
}

/**
 * Fires a page.viewed event once per mount.
 * Uses useRef guard to prevent React StrictMode double-fires.
 */
export function usePageView(page: string, context: Record<string, unknown> = {}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    enqueue('page.viewed', { page, ...context });
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Hook for the events summary endpoint.
 */
export function useEventsSummary(days: number = 30) {
  return useQuery({
    queryKey: ['events-summary', days],
    queryFn: async () => {
      const response = await client.get(`/events/summary?days=${days}`);
      return response.data.data;
    },
    staleTime: 60000, // 1 minute
  });
}
