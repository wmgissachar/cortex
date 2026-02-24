import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const STATE_FILE = join(tmpdir(), 'cortex-active-thread.json');

let _activeThreadId: string | null = null;

export function setActiveThreadId(threadId: string): void {
  _activeThreadId = threadId;
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ threadId }), 'utf-8');
  } catch {
    // Disk write failure is non-fatal
  }
}

export function getActiveThreadId(): string | null {
  if (_activeThreadId) return _activeThreadId;

  // Try disk persistence (survives process restart)
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (data.threadId) {
      _activeThreadId = data.threadId;
      return _activeThreadId;
    }
  } catch {
    // File doesn't exist or is corrupt — not an error
  }

  // Fall back to env var (set by checkpoint tool)
  return process.env.CORTEX_CHECKPOINT_THREAD_ID || null;
}

export function appendActiveThreadFooter(output: string): string {
  const threadId = getActiveThreadId();
  if (!threadId) return output;
  return `${output}\n\n---\n> Active thread: \`${threadId}\``;
}
