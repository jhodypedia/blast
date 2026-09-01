import { redirect } from "next/navigation";

import { currentActor } from "@/lib/auth/session";

/**
 * Root entry point.
 *
 * Signed-in visitors are routed to the correct area for their role; everyone
 * else goes to the sign-in page. Role comes from the verified session, never
 * from a cookie or query string.
 */
export default async function HomePage() {
  const actor = await currentActor();

  if (!actor || actor.status !== "ACTIVE") {
    redirect("/login");
  }

  redirect(actor.role === "ADMIN" ? "/admin" : "/dashboard");
}
