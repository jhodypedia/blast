import type { Metadata } from "next";
import { BadgeCheck, KeyRound, Mail, ShieldCheck, User } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import {
  DetailRow,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "Profile" };

/** The operator's own profile. Only their own data is ever shown. */
export default async function ProfilePage() {
  const actor = await requireUser();

  return (
    <>
      <PageHeader
        icon={<User className="size-5" />}
        title="Profile"
        description="Your account details and password."
      />

      <PageSections>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Account"
            description="Contact an administrator to change your name or email."
            icon={<BadgeCheck className="size-5" />}
            tone="info"
          >
            <dl>
              <DetailRow
                label="Name"
                icon={<User className="size-4 text-primary" />}
                value={actor.name || "—"}
              />
              <DetailRow
                label="Email"
                icon={<Mail className="size-4 text-info" />}
                value={<span className="break-all">{actor.email}</span>}
              />
              <DetailRow
                label="Role"
                icon={<ShieldCheck className="size-4 text-primary" />}
                value="Operator"
              />
              <DetailRow
                label="Status"
                icon={<BadgeCheck className="size-4 text-success" />}
                value={<Badge variant="success">{actor.status}</Badge>}
              />
            </dl>
          </SectionCard>

          <SectionCard
            title="Change password"
            description="Changing your password signs you out of all devices."
            icon={<KeyRound className="size-5" />}
            tone="warning"
          >
            <ChangePasswordForm />
          </SectionCard>
        </div>
      </PageSections>
    </>
  );
}
