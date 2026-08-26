import { createFileRoute } from "@tanstack/react-router";
import SinaisPage from "@/components/sections/SinaisSection";

export const Route = createFileRoute("/sinais")({
  head: () => ({
    meta: [
      { title: "Sinais — Freitas da Blaze" },
      { name: "description", content: "Gerencie sua lista de sinais e estratégias automáticas." },
    ],
  }),
  component: SinaisPage,
});
