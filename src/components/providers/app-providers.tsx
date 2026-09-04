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
 * The product ships a single brutalist palette, so the theme provider is forced
 * to one theme; no alternate palette is generated and no toggle is exposed.
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
          theme="light"
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
                "!bg-popover !text-popover-foreground !border-4 !border-black !shadow-[var(--shadow-lift)] !font-mono",
              title: "!font-black !uppercase !tracking-wide",
              description: "!text-foreground",
              actionButton:
                "!bg-primary !text-primary-foreground !border-2 !border-black !font-black !uppercase",
              cancelButton:
                "!bg-secondary !text-secondary-foreground !border-2 !border-black !font-black !uppercase",
              closeButton:
                "!bg-surface-strong !text-foreground !border-2 !border-black",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
