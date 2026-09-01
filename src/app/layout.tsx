import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={plusJakarta.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
