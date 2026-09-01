import { z } from "zod";

import {
  emailSchema,
  nameSchema,
  passwordSchema,
  turnstileTokenSchema,
} from "@/lib/validation/common";

/** Login. Role is never accepted from the client; it comes from the database. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
  turnstileToken: turnstileTokenSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    acceptTerms: z.literal(true, {
      message: "You must accept the consent and usage terms",
    }),
    turnstileToken: turnstileTokenSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
