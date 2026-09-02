import type { Metadata } from "next";
import { CalendarClock, Send, Smartphone, UserCog, Users } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/admin/service";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { EmptyState, PageHeader, PageSections } from "@/components/ui/page";
import { UserActionControls } from "@/components/admin/user-action-controls";

export const metadata: Metadata = { title: "Operators" };

/**
 * Operator management.
 *
 * Suspending an account revokes its sessions and cancels outstanding delivery
 * work; the transition is applied atomically in the admin service (RULES.md §8).
 */
export default async function AdminUsersPage() {
  const actor = await requireAdmin();
  const { users, total } = await listUsers({ pageSize: 50 });

  const active = users.filter((user) => user.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        icon={<Users className="size-5" />}
        title="Operators"
        description="Suspending an account signs it out and stops its running jobs."
        actions={
          <Badge variant="info">
            {active} active · {total} total
          </Badge>
        }
      />

      <PageSections>
        {users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="No accounts yet"
            description="Operator accounts will appear here once they register."
          />
        ) : (
          <Stagger className="space-y-3">
            {users.map((user) => (
              <StaggerItem key={user.id}>
                <Card hover>
                  <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
                    <div className="flex flex-wrap items-start gap-3.5">
                      <IconTile
                        tone={user.status === "ACTIVE" ? "primary" : "danger"}
                        className="mt-0.5"
                      >
                        <UserCog className="size-5" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold tracking-tight">
                          {user.name || user.email}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {user.email} · joined{" "}
                          {user.createdAt.toISOString().slice(0, 10)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={user.role === "ADMIN" ? "primary" : "info"}
                        >
                          {user.role}
                        </Badge>
                        <Badge
                          variant={
                            user.status === "ACTIVE" ? "success" : "danger"
                          }
                        >
                          {user.status}
                        </Badge>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
                      <Metric
                        label="Devices"
                        value={String(user.deviceCount)}
                        icon={
                          <Smartphone className="size-3.5 text-primary" />
                        }
                      />
                      <Metric
                        label="Live jobs"
                        value={String(user.activeJobCount)}
                        icon={<Send className="size-3.5 text-info" />}
                      />
                      <Metric
                        label="Last login"
                        value={
                          user.lastLoginAt
                            ? user.lastLoginAt.toISOString().slice(0, 10)
                            : "Never"
                        }
                        icon={
                          <CalendarClock className="size-3.5 text-warning" />
                        }
                      />
                    </dl>

                    <div className="mt-4 border-t border-border/70 pt-4">
                      {user.id === actor.id ? (
                        <p className="text-xs font-medium text-muted-foreground">
                          This is your own account.
                        </p>
                      ) : (
                        <UserActionControls
                          userId={user.id}
                          status={user.status}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </PageSections>
    </>
  );
}

/** Small labelled metric used inside operator rows. */
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold text-foreground">{value}</dd>
    </div>
  );
}
