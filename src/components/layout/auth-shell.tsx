import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, IconTile } from "@/components/ui/card";
import { PageTransition, Reveal, AmbientBackground } from "@/components/ui/motion";

/**
 * Shell for the unauthenticated pages (sign in, register).
 *
 * Brutalist treatment: stark white ground with a hard structural grid behind
 * opaque blocks framed in 4px black rules. The marketing column is hidden below
 * `lg` so mobile lands straight on the form.
 */
export function AuthShell({
  title,
  subtitle,
  highlights,
  children,
}: {
  title: string;
  subtitle: string;
  highlights: { icon: ReactNode; title: string; description: string }[];
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <AmbientBackground />

      <PageTransition className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-14">
        {/* Marketing column — desktop only. */}
        <section className="hidden lg:block">
          <span className="inline-flex items-center gap-2 border-4 border-black bg-accent px-3 py-1.5 text-xs font-black uppercase tracking-widest text-accent-foreground">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Consent-based delivery only
          </span>
          <h2 className="mt-5 max-w-xl text-balance text-5xl leading-[0.92]">
            Run WhatsApp campaigns with auditable, queue-backed delivery.
          </h2>
          <p className="mt-5 max-w-lg border-l-4 border-black pl-4 text-base font-bold leading-snug text-foreground">
            Campaigns, target lists and payout policy stay under admin control.
            Operators connect their own devices and run only the work assigned to
            them.
          </p>

          <ul className="mt-8 space-y-3">
            {highlights.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.04}>
                <li className="flex items-start gap-3.5 border-4 border-black bg-card p-4 shadow-panel">
                  <IconTile tone={index === 0 ? "primary" : index === 1 ? "success" : "info"}>
                    {item.icon}
                  </IconTile>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-wide text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Form column. */}
        <section className="mx-auto w-full max-w-md">
          <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <IconTile tone="primary" className="size-12">
              <ShieldCheck className="size-6" />
            </IconTile>
            <div>
              <h1>{title}</h1>
              <p className="mt-2 text-sm font-bold leading-snug text-foreground">
                {subtitle}
              </p>
            </div>
          </div>

          <Card className="mt-6 shadow-lift">
            <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">{children}</CardContent>
          </Card>
        </section>
      </PageTransition>
    </main>
  );
}
