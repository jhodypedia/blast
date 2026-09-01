import { handlers } from "@/lib/auth";

/**
 * Auth.js route handler. Thin by design — all credential logic lives in the
 * provider configuration.
 */
export const { GET, POST } = handlers;
