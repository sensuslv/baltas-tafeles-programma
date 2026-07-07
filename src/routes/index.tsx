import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const Whiteboard = lazy(() => import("@/components/Whiteboard"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whiteboard Studio — Interactive Lesson Software" },
      { name: "description", content: "Bilingual (LV/EN) digital whiteboard for lesson management and presentation on interactive displays." },
      { property: "og:title", content: "Whiteboard Studio" },
      { property: "og:description", content: "Digital whiteboard for interactive classrooms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">Loading…</div>;
  }
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">Loading…</div>}>
      <Whiteboard />
    </Suspense>
  );
}
