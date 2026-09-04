import { redirect } from "next/navigation";

/**
 * Campaign management is ADMIN-only (RULES.md §6).
 *
 * The operator campaign browser was folded into the Blast page: everything an
 * operator may see about an assigned campaign — payout, quota, allowed speeds
 * and the number allocation — is rendered there, next to the controls that start
 * a run. This route is kept only so existing links and bookmarks resolve instead
 * of 404ing; it renders no campaign data of its own.
 */
export default function UserCampaignsPage() {
  redirect("/dashboard/jobs");
}



