"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Menu, Moon, Sun, X, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";

/**
 * Application shell.
 *
 * Mobile-first: navigation collapses into an overlay drawer below `lg`. All
 * animations use `transform`/`opacity` only and are skipped when the user prefers
 * reduced motion (RULES.md §18).
 */

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

function ShellBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold tracking-tight">{title}</p>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      {resolvedTheme === "dark" ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </Button>
  );
}

function ShellAccount({ name, email }: { name: string; email: string }) {
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <div className="flex items-center gap-2">
        <form action={signOutAction} className="flex-1">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </form>
        <span className="hidden lg:block">
          <ThemeToggle />
        </span>
      </div>
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

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            isActive(item.href)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span aria-hidden="true" className="shrink-0">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 lg:flex lg:flex-col">
        <ShellBrand title={title} subtitle={subtitle} />
        <div className="mt-6 flex-1">{nav}</div>
        <ShellAccount name={accountName} email={accountEmail} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span className="truncate text-sm font-semibold">{title}</span>
          <ThemeToggle />
        </header>

        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute inset-0 bg-foreground/40"
                onClick={() => setOpen(false)}
              />
              <motion.div
                className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-card p-4"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
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
                <div className="mt-6 flex-1 overflow-y-auto">{nav}</div>
                <ShellAccount name={accountName} email={accountEmail} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
