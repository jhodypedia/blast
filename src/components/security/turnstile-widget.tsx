"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { clientEnv } from "@/lib/env";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders the challenge and writes its token into a hidden input so it reaches
 * the server action. The token is only ever *verified* server-side (RULES.md §7).
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          theme?: "light" | "dark" | "auto";
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export function TurnstileWidget({ action }: { action: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);

  const siteKey = clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!scriptReady || !siteKey || !containerRef.current) {
      return;
    }
    if (widgetIdRef.current) {
      return;
    }

    widgetIdRef.current =
      window.turnstile?.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        callback: (value) => setToken(value),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      }) ?? null;
  }, [action, scriptReady, siteKey]);

  if (!siteKey) {
    // Development convenience only: the server refuses to skip verification in
    // production, so a missing key cannot silently disable protection.
    return (
      <input type="hidden" name="turnstileToken" value="development-placeholder" />
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px]" />
      <input type="hidden" name="turnstileToken" value={token} />
    </>
  );
}
