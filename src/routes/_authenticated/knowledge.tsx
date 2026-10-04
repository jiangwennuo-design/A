import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { KnowledgeApp } from "@/components/knowledge/KnowledgeApp";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "知识库 · K得机" }] }),
  validateSearch: z.object({
    view: z
      .enum(["home", "search", "archive", "me", "tags", "unconnected", "detail", "graph"])
      .optional()
      .catch(undefined),
    id: z.string().optional().catch(undefined),
    tag: z.string().optional().catch(undefined),
  }),
  component: KnowledgePage,
});
function KnowledgePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  return (
    <KnowledgeApp
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      view={search.view || "home"}
      selectedId={search.id}
      tag={search.tag}
      onNavigate={(view, id, tag) => void navigate({ to: "/knowledge", search: { view, id, tag } })}
      onHome={() => void closeSystemApp("knowledge", () => navigate({ to: "/" }))}
      onSource={(card) => {
        if (card.sourceType === "diary")
          void navigate({ to: "/diary/$id", params: { id: card.sourceId } });
        else if (card.sourceType === "chat")
          void navigate({ to: "/chat", search: { char: card.sourceContextId || undefined } });
      }}
    />
  );
}
