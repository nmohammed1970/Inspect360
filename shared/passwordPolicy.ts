import { z } from "zod";

/** Platform-wide password minimum length (signup, change, reset). */
export const MIN_PASSWORD_LENGTH = 6;

export function validateNewPassword(password: unknown): { ok: true; password: string } | { ok: false; message: string } {
  if (typeof password !== "string" || !password) {
    return { ok: false, message: "New password is required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { ok: true, password };
}

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
