import { createFileRoute } from "@tanstack/react-router";
import { DiaryEditPage } from "@/components/DiaryEditPage";

export const Route = createFileRoute("/_authenticated/diary/$id/edit")({
  head: () => ({
    meta: [
      { title: "编辑日记 · K得机" },
      { name: "description", content: "修改这篇日记的日期、标题和正文。" },
      { property: "og:title", content: "编辑日记 · K得机" },
      { property: "og:description", content: "修改这篇日记的日期、标题和正文。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <DiaryEditPage id={id} />;
}
