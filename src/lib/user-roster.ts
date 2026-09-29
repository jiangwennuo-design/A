/** Additional roster fields use existing Auth metadata; profile/Persona stay unchanged. */
export function readUserRoster(metadata: Record<string, unknown> | undefined, userId: string) {
  const raw = metadata?.["chat_profile"];
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    username: typeof value["username"] === "string" ? value["username"] : `k${userId.slice(0, 8)}`,
    bio: typeof value["bio"] === "string" ? value["bio"] : "",
  };
}
