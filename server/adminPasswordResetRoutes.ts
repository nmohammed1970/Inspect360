/**
 * Platform-admin self-serve password reset.
 * Registered as a dedicated module so routes stay available without relying on
 * hot-reload of the large routes.ts file.
 */
import type { Express } from "express";
import { storage } from "./storage";
import { hashPassword, consumeAuthRateLimit } from "./auth";
import {
  FORGOT_PASSWORD_GENERIC_SUCCESS,
  generateResetCode,
  hashResetToken,
  isResetTokenExpired,
  normalizeResetCode,
  normalizeResetEmail,
  resetTokenExpiryDate,
  resetTokenMatches,
} from "./passwordResetService";
import { validateNewPassword } from "@shared/passwordPolicy";

export function registerAdminPasswordResetRoutes(app: Express): void {
  app.post("/api/admin/forgot-password", async (req, res) => {
    try {
      const normalizedEmail = normalizeResetEmail(req.body?.email);
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }

      const clientKey = `admin-forgot:${String(req.ip || "unknown")}:${normalizedEmail}`;
      if (!consumeAuthRateLimit(clientKey, 5, 15 * 60 * 1000)) {
        return res.status(429).json({
          message: "Too many password reset requests. Please try again later.",
        });
      }

      // Eligibility: must exist in admin_users. Do not trust client role claims.
      const admin = await storage.getAdminByEmail(normalizedEmail);
      if (!admin) {
        return res.json(FORGOT_PASSWORD_GENERIC_SUCCESS);
      }

      const resetToken = generateResetCode();
      const expiry = resetTokenExpiryDate();
      await storage.setAdminResetToken(admin.id, hashResetToken(resetToken), expiry);

      try {
        const { sendPasswordResetEmail } = await import("./resend");
        const displayName =
          `${admin.firstName}${admin.lastName ? ` ${admin.lastName}` : ""}`.trim() || admin.email;
        await sendPasswordResetEmail(admin.email, displayName, resetToken);
      } catch (emailError) {
        console.error("Failed to send admin password reset email:", emailError);
        try {
          await storage.clearAdminResetToken(admin.id);
        } catch (clearError) {
          console.error("Failed to clear admin reset token after email error:", clearError);
        }
        return res.status(500).json({
          message: "Failed to send reset email. Please try again later.",
          emailSent: false,
        });
      }

      res.json(FORGOT_PASSWORD_GENERIC_SUCCESS);
    } catch (error) {
      console.error("Admin forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/admin/reset-password", async (req, res) => {
    try {
      const { email, token, newPassword } = req.body;
      const normalizedEmail = normalizeResetEmail(email);
      if (!normalizedEmail || token === undefined || token === null || newPassword === undefined) {
        return res.status(400).json({ message: "Email, token, and new password are required" });
      }

      const passwordCheck = validateNewPassword(newPassword);
      if (!passwordCheck.ok) {
        return res.status(400).json({ message: passwordCheck.message });
      }

      const clientKey = `admin-reset:${String(req.ip || "unknown")}:${normalizedEmail}`;
      if (!consumeAuthRateLimit(clientKey, 10, 15 * 60 * 1000)) {
        return res.status(429).json({
          message: "Too many reset attempts. Please try again later.",
        });
      }

      const normalizedToken = normalizeResetCode(token);
      if (!normalizedToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const admin = await storage.getAdminByEmail(normalizedEmail);
      if (!admin || !admin.resetToken || !admin.resetTokenExpiry) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (
        !resetTokenMatches(admin.resetToken, normalizedToken) ||
        isResetTokenExpired(admin.resetTokenExpiry)
      ) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const hashedPassword = await hashPassword(passwordCheck.password);
      await storage.updateAdminPassword(admin.id, hashedPassword);
      await storage.clearAdminResetToken(admin.id);

      const sessionAdmin = (req.session as any)?.adminUser;
      if (sessionAdmin?.id === admin.id) {
        delete (req.session as any).adminUser;
        await new Promise<void>((resolve) => {
          req.session.save(() => resolve());
        });
      }

      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}
