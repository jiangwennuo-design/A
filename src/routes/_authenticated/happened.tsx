import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { HappenedApp } from "@/components/happened/HappenedApp";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";
import { calendarDay } from "@/lib/goals";

export const Route = createFileRoute("/_authenticated/happened")({
  head: () => ({ meta: [{ title: "发生过 · K得机" }] }),
  validateSearch: z.object({
    view: z
      .enum([
        "home",
        "calendar",
        "memories",
        "tags",
        "day",
        "entry",
        "timeline",
        "stats",
        "search",
        "sources",
        "hidden",
      ])
      .optional()
      .catch(undefined),
    date: z
      .string()
      .refine((date) => calendarDay(date) !== null)
      .optional()
      .catch(undefined),
    id: z.string().optional().catch(undefined),
    tag: z.string().optional().catch(undefined),
  }),
  component: HappenedPage,
});
function HappenedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  return (
    <HappenedApp
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      view={search.view || "home"}
      selectedDate={search.date}
      selectedId={search.id}
      selectedTag={search.tag}
      onNavigate={(view, date, id, tag) =>
        void navigate({ to: "/happened", search: { view, date, id, tag } })
      }
      onHome={() => void closeSystemApp("happened", () => navigate({ to: "/" }))}
      onSource={(app, id) => {
        if (app === "goal") void navigate({ to: "/goal", search: { id } });
        else if (app === "knowledge")
          void navigate({ to: "/knowledge", search: { view: "detail", id } });
        else void navigate({ to: "/diary/$id", params: { id } });
      }}
    />
  );
}
