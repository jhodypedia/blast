import type { Metadata, Viewport } from "next";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = {
  title: {
    default: "WhatsApp Blast Platform",
    template: "%s · WhatsApp Blast Platform",
  },
  description:
    "Consent-based WhatsApp campaign delivery platform with operator payouts.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Brutalist palette: the browser chrome matches --background (stark white).
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-dvh bg-background font-mono text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:border-4 focus:border-black focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:uppercase focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
