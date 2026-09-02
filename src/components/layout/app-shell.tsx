"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogOut, Menu, MoreHorizontal, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";

/**
 * Application shell.
 *
 * Layout: persistent sidebar from `lg` up, sticky top bar plus a bottom tab bar
 * below it, and an overlay drawer for the overflow items. Every nav target is at
 * least 44x44px and pairs a coloured icon with its label (RULES.md §18).
 *
 * Motion: the drawer slides, the active-nav indicator animates as a shared
 * layout element, and route content fades/slides in keyed on the pathname so
 * client-side navigation feels like an SPA. Only `transform`/`opacity` animate,
 * and all of it is skipped under `prefers-reduced-motion`.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

/** Items shown directly in the mobile tab bar; the rest move into the drawer. */
const MOBILE_TABS = 4;

function ShellBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/30"
      >
        <ShieldCheck className="size-5 text-primary" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold tracking-tight text-foreground">
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function NavLinks({
  items,
  onNavigate,
  isActive,
  layoutId,
}: {
  items: NavItem[];
  onNavigate: () => void;
  isActive: (href: string) => boolean;
  layoutId: string;
}) {
  const reduce = useReducedMotion();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
              "transition-[color,background-color,transform] duration-200 ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {active ? (
              <motion.span
                aria-hidden="true"
                layoutId={reduce ? undefined : layoutId}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 -z-10 rounded-lg border border-primary/30 bg-primary/12 shadow-[var(--shadow-glow-sm)]"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="shrink-0 transition-transform duration-200 group-hover:scale-110"
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ShellAccount({ name, email }: { name: string; email: string }) {
  return (
    <div className="mt-6 space-y-3 border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-primary ring-1 ring-border"
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </div>
  );
}

export function AppShell({
  items,
  title,
  subtitle,
  accountName,
  accountEmail,
  children,
}: {
  items: NavItem[];
  title: string;
  subtitle: string;
  accountName: string;
  accountEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes so back/forward never leaves it
  // hanging open over new content.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer overlays the page.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  const tabs = items.slice(0, MOBILE_TABS);
  const activeItem = items.find((item) => isActive(item.href));

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row">
      <AmbientBackground />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex xl:w-72">
        <ShellBrand title={title} subtitle={subtitle} />
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavLinks
            items={items}
            onNavigate={() => setOpen(false)}
            isActive={isActive}
            layoutId="sidebar-active"
          />
        </div>
        <ShellAccount name={accountName} email={accountEmail} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet top bar */}
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="shell-drawer"
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" className="text-primary" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight">
              {activeItem?.label ?? title}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{title}</p>
          </div>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
            >
              <LogOut aria-hidden="true" className="text-destructive" />
            </Button>
          </form>
        </header>

        {/* Overlay drawer */}
        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-0 z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute inset-0 overlay-forest backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />
              <motion.div
                id="shell-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col border-r border-sidebar-border bg-sidebar p-4 shadow-lift"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start justify-between gap-2">
                  <ShellBrand title={title} subtitle={subtitle} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close navigation"
                    onClick={() => setOpen(false)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-6 flex-1 overflow-y-auto">
                  <NavLinks
                    items={items}
                    onNavigate={() => setOpen(false)}
                    isActive={isActive}
                    layoutId="drawer-active"
                  />
                </div>
                <ShellAccount name={accountName} email={accountEmail} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Route content. The key restarts the entrance animation per route. */}
        <main
          id="main-content"
          className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8"
        >
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-7xl"
          >
            {children}
          </motion.div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="mx-auto flex max-w-2xl items-stretch">
            {tabs.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold",
                      "transition-[color,background-color] duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "text-primary"
                        : "text-muted-foreground active:bg-accent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "transition-transform duration-200",
                        active && "-translate-y-0.5 scale-110",
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="More navigation"
                aria-expanded={open}
                aria-controls="shell-drawer"
                className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-muted-foreground transition-colors duration-200 active:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
                More
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
