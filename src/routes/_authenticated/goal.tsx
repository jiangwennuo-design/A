import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { GoalApp } from "@/components/goals/GoalApp";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";

export const Route = createFileRoute("/_authenticated/goal")({
  head: () => ({ meta: [{ title: "规划 · K得机" }] }),
  validateSearch: z.object({ id: z.string().optional().catch(undefined) }),
  component: GoalPage,
});

function GoalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  return (
    <GoalApp
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      selectedId={id}
      onOpen={(goalId) => void navigate({ to: "/goal", search: goalId ? { id: goalId } : {} })}
      onHome={() => void closeSystemApp("goal", () => navigate({ to: "/" }))}
    />
  );
}
