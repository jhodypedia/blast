import type { Metadata } from "next";
import { Users } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/admin/service";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Operators</h1>
        <p className="text-sm text-muted-foreground">
          {total} account{total === 1 ? "" : "s"}. Suspending an account signs it
          out and stops its running jobs.
        </p>
      </header>

      {users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <Users
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      {user.name || user.email}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {user.email} · joined{" "}
                      {user.createdAt.toISOString().slice(0, 10)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.role === "ADMIN" ? "primary" : "info"}>
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
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Devices</dt>
                    <dd className="font-semibold">{user.deviceCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Live jobs</dt>
                    <dd className="font-semibold">{user.activeJobCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last login</dt>
                    <dd className="font-medium">
                      {user.lastLoginAt
                        ? user.lastLoginAt.toISOString().slice(0, 10)
                        : "Never"}
                    </dd>
                  </div>
                </dl>

                {user.id === actor.id ? (
                  <p className="text-xs text-muted-foreground">
                    This is your own account.
                  </p>
                ) : (
                  <UserActionControls
                    userId={user.id}
                    status={user.status}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
