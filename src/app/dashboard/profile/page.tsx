import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "Profile" };

/** The operator's own profile. Only their own data is ever shown. */
export default async function ProfilePage() {
  const actor = await requireUser();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details and password.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Contact an administrator to change your name or email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium">{actor.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="truncate text-sm font-medium">{actor.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="text-sm font-medium">Operator</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>
                <Badge variant="success">{actor.status}</Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Changing your password signs you out of all devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
