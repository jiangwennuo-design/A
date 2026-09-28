import { createFileRoute } from "@tanstack/react-router";
import { WorldBooksApp } from "@/components/world-books/WorldBooksApp";

export const Route = createFileRoute("/_authenticated/world-books")({
  head: () => ({ meta: [{ title: "世界书 · K得机" }] }),
  component: WorldBooksApp,
});
