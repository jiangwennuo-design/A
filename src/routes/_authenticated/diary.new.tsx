import { createFileRoute } from "@tanstack/react-router";
import { DiaryEditPage } from "@/components/DiaryEditPage";

export const Route = createFileRoute("/_authenticated/diary/new")({
  head: () => ({
    meta: [
      { title: "写日记 · 此心一笺" },
      { name: "description", content: "写下今天发生的事和此刻的心情，只有你自己能看到。" },
      { property: "og:title", content: "写日记 · 此心一笺" },
      { property: "og:description", content: "写下今天发生的事和此刻的心情，只有你自己能看到。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <DiaryEditPage />,
});
