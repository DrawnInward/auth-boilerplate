import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, type RenderOptions } from "@testing-library/react";

// Retries and caching are the app's production behaviour but noise in tests: a
// retry turns an asserted error state into a timeout, and a shared cache leaks
// one test's data into the next. Each render gets a fresh client.
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

type Options = Omit<RenderOptions, "wrapper"> & {
  /** Initial history entries, for components that read route params. */
  route?: string;
  queryClient?: QueryClient;
};

export const renderWithProviders = (
  ui: ReactElement,
  {
    route = "/",
    queryClient = createTestQueryClient(),
    ...options
  }: Options = {},
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
};
