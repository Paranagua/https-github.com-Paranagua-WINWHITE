import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 60000,
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultGcTime: 10 * 60 * 1000,
  });

  return router;
};
