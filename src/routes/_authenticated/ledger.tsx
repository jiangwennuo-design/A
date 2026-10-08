import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LedgerApp } from "@/components/ledger/LedgerApp";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({ meta: [{ title: "账本 · K得机" }] }),
  component: LedgerPage,
});
function LedgerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <LedgerApp
      key={user?.id ?? "guest"}
      userId={user?.id ?? "guest"}
      onHome={() => void closeSystemApp("ledger", () => navigate({ to: "/" }))}
    />
  );
}
