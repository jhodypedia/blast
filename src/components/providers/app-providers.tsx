"use client";

import { useState, type ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";

/**
 * Client providers.
 *
 * TanStack Query is used only for polling server-state (blast progress, device
 * status). It never caches authorization decisions — those are re-checked on the
 * server for every mutation.
 *
 * The product ships a single dark-green theme, so the theme provider is forced
 * to `dark`; no light palette is generated and no toggle is exposed.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="top-right"
          closeButton
          theme="dark"
          // Coloured semantic icons, slide-in from the top-right (RULES.md §18).
          icons={{
            success: (
              <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            ),
            error: (
              <CircleAlert
                className="size-5 text-destructive"
                aria-hidden="true"
              />
            ),
            warning: (
              <TriangleAlert
                className="size-5 text-warning"
                aria-hidden="true"
              />
            ),
            info: <Info className="size-5 text-info" aria-hidden="true" />,
          }}
          toastOptions={{
            classNames: {
              toast:
                "!bg-popover !text-popover-foreground !border-border !shadow-[var(--shadow-lift)] !rounded-xl",
              description: "!text-muted-foreground",
              actionButton:
                "!bg-primary !text-primary-foreground !rounded-md !font-semibold",
              cancelButton:
                "!bg-secondary !text-secondary-foreground !rounded-md",
              closeButton:
                "!bg-surface-strong !text-muted-foreground !border-border hover:!text-foreground",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
