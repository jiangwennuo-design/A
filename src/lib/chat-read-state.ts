// Read status is local to this browser and account; no database schema changes.
export function lastReadAt(userId: string, sessionId: string): number {
  try {
    return Number(localStorage.getItem(`chat-read:${userId}:${sessionId}`) || 0);
  } catch {
    return 0;
  }
}

export function markChatRead(userId: string, sessionId: string, createdAt: string) {
  try {
    localStorage.setItem(`chat-read:${userId}:${sessionId}`, String(new Date(createdAt).getTime()));
  } catch {
    /* Reading and messaging still work when browser storage is unavailable. */
  }
}
