import { storage } from "./storage";
import { sendNotificationToUser } from "./websocket";
import { formatBillingDateUtcLocale } from "@shared/billingClock";

export class NotificationService {
  /**
   * Send quota usage alert to organization owner
   */
  async sendQuotaUsageAlert(
    organizationId: string,
    usagePercent: number,
    used: number,
    total: number
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      let title: string;
      let message: string;
      let type: string;

      if (usagePercent >= 100) {
        title = "Inspection Quota Exceeded";
        message = `You've used all ${total} of your monthly inspection quota. Please purchase additional inspections to continue.`;
        type = "quota_exceeded";
      } else if (usagePercent >= 80) {
        title = "Inspection Quota Warning";
        message = `You've used ${used} of ${total} inspections (${Math.round(usagePercent)}%). Consider purchasing additional inspections.`;
        type = "quota_warning";
      } else {
        return; // Don't send alerts below 80%
      }

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type,
        title,
        message,
        data: {
          used,
          total,
          usagePercent,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type,
        title,
        message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending quota usage alert:", error);
    }
  }

  /**
   * Send module usage limit alert
   */
  async sendModuleUsageLimitAlert(
    organizationId: string,
    moduleName: string,
    used: number,
    limit: number,
    usagePercent: number
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      let title: string;
      let message: string;
      let type: string;

      if (usagePercent >= 100) {
        title = `${moduleName} Usage Limit Reached`;
        message = `You've reached your limit of ${limit} for ${moduleName}. Additional usage will incur overage charges.`;
        type = "module_limit_exceeded";
      } else if (usagePercent >= 90) {
        title = `${moduleName} Usage Warning`;
        message = `You've used ${used} of ${limit} (${Math.round(usagePercent)}%) for ${moduleName}. Approaching limit.`;
        type = "module_limit_warning";
      } else {
        return; // Don't send alerts below 90%
      }

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type,
        title,
        message,
        data: {
          moduleName,
          used,
          limit,
          usagePercent,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type,
        title,
        message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending module usage limit alert:", error);
    }
  }

  /**
   * Send subscription renewal reminder
   */
  async sendRenewalReminder(
    organizationId: string,
    renewalDate: Date,
    daysUntilRenewal: number
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "renewal_reminder",
        title: "Subscription Renewal Upcoming",
        message: `Your subscription will renew in ${daysUntilRenewal} day(s) on ${formatBillingDateUtcLocale(renewalDate)}.`,
        data: {
          renewalDate: renewalDate.toISOString(),
          daysUntilRenewal,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "renewal_reminder",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending renewal reminder:", error);
    }
  }

  /**
   * Send payment failed alert
   */
  async sendPaymentFailedAlert(
    organizationId: string,
    amount: number,
    currency: string,
    retryDate?: Date
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "payment_failed",
        title: "Payment Failed",
        message: retryDate
          ? `Your payment of ${currency} ${(amount / 100).toFixed(2)} failed. We'll retry on ${retryDate.toLocaleDateString()}. Please update your payment method.`
          : `Your payment of ${currency} ${(amount / 100).toFixed(2)} failed. Please update your payment method.`,
        data: {
          amount,
          currency,
          retryDate: retryDate?.toISOString(),
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "payment_failed",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending payment failed alert:", error);
    }
  }

  /**
   * Send admin notification about pricing override
   */
  async sendAdminPricingOverrideAlert(
    adminUserId: string,
    organizationId: string,
    overrideType: "subscription" | "module",
    details: any
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org) return;

      const notification = await storage.createNotification({
        userId: adminUserId,
        organizationId,
        type: "admin_override_applied",
        title: `Pricing Override Applied - ${org.name}`,
        message: `A ${overrideType} pricing override was applied for ${org.name}. Reason: ${details.reason || "Not specified"}`,
        data: {
          overrideType,
          organizationId,
          organizationName: org.name,
          ...details
        }
      });

      sendNotificationToUser(adminUserId, {
        id: notification.id,
        type: "admin_override_applied",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending admin pricing override alert:", error);
    }
  }

  /**
   * Send overage charges alert
   */
  async sendOverageChargesAlert(
    organizationId: string,
    moduleName: string,
    overageAmount: number,
    currency: string
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "overage_charges",
        title: "Overage Charges Incurred",
        message: `You've exceeded the usage limit for ${moduleName}. Overage charges of ${currency} ${(overageAmount / 100).toFixed(2)} have been added to your invoice.`,
        data: {
          moduleName,
          overageAmount,
          currency,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "overage_charges",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending overage charges alert:", error);
    }
  }

  /**
   * Check and send quota alerts for an organization
   */
  async checkAndSendQuotaAlerts(organizationId: string): Promise<void> {
    try {
      const balance = await storage.getCreditBalance(organizationId);
      const instanceSub = await storage.getInstanceSubscription(organizationId);
      
      if (!instanceSub) return;

      const totalAvailable = balance.total;
      const quotaIncluded = instanceSub.inspectionQuotaIncluded || 0;
      const used = quotaIncluded - totalAvailable;
      const usagePercent = quotaIncluded > 0 ? (used / quotaIncluded) * 100 : 0;

      // Send alert if above 80% threshold
      if (usagePercent >= 80) {
        await this.sendQuotaUsageAlert(organizationId, usagePercent, used, quotaIncluded);
      }
    } catch (error) {
      console.error("Error checking quota alerts:", error);
    }
  }

  /**
   * Send invoice generated notification
   */
  async sendInvoiceGeneratedNotification(
    organizationId: string,
    invoiceId: string,
    amount: number,
    currency: string,
    invoiceNumber?: string,
    dueDate?: Date
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "invoice_generated",
        title: "New Invoice Generated",
        message: `A new invoice${invoiceNumber ? ` (#${invoiceNumber})` : ''} for ${currency} ${(amount / 100).toFixed(2)} has been generated.${dueDate ? ` Due date: ${dueDate.toLocaleDateString()}.` : ''}`,
        data: {
          invoiceId,
          invoiceNumber,
          amount,
          currency,
          dueDate: dueDate?.toISOString(),
          actionUrl: "/billing/invoices"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "invoice_generated",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending invoice generated notification:", error);
    }
  }

  /**
   * Send invoice paid notification
   */
  async sendInvoicePaidNotification(
    organizationId: string,
    invoiceId: string,
    amount: number,
    currency: string,
    invoiceNumber?: string
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "invoice_paid",
        title: "Invoice Paid",
        message: `Your invoice${invoiceNumber ? ` #${invoiceNumber}` : ''} for ${currency} ${(amount / 100).toFixed(2)} has been paid successfully.`,
        data: {
          invoiceId,
          invoiceNumber,
          amount,
          currency,
          actionUrl: "/billing/invoices"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "invoice_paid",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending invoice paid notification:", error);
    }
  }

  /**
   * Send subscription renewed notification
   */
  async sendSubscriptionRenewedNotification(
    organizationId: string,
    renewalDate: Date,
    amount: number,
    currency: string,
    billingCycle: "monthly" | "annual"
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "subscription_renewed",
        title: "Subscription Renewed",
        message: `Your ${billingCycle} subscription has been renewed. Next renewal: ${renewalDate.toLocaleDateString()}. Amount charged: ${currency} ${(amount / 100).toFixed(2)}.`,
        data: {
          renewalDate: renewalDate.toISOString(),
          amount,
          currency,
          billingCycle,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "subscription_renewed",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending subscription renewed notification:", error);
    }
  }

  /**
   * Send subscription cancelled notification
   */
  async sendSubscriptionCancelledNotification(
    organizationId: string,
    cancellationDate: Date,
    endDate: Date
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "subscription_cancelled",
        title: "Subscription Cancelled",
        message: `Your subscription has been cancelled. Access will continue until ${endDate.toLocaleDateString()}.`,
        data: {
          cancellationDate: cancellationDate.toISOString(),
          endDate: endDate.toISOString(),
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "subscription_cancelled",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending subscription cancelled notification:", error);
    }
  }

  /**
   * Send payment method updated notification
   */
  async sendPaymentMethodUpdatedNotification(
    organizationId: string
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "payment_method_updated",
        title: "Payment Method Updated",
        message: "Your payment method has been successfully updated.",
        data: {
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "payment_method_updated",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending payment method updated notification:", error);
    }
  }

  /**
   * Send module purchased notification
   */
  async sendModulePurchasedNotification(
    organizationId: string,
    moduleName: string,
    amount: number,
    currency: string,
    billingCycle: "monthly" | "annual"
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "module_purchased",
        title: "Module Purchased",
        message: `${moduleName} has been successfully purchased and activated. ${billingCycle === "annual" ? "Annual" : "Monthly"} billing: ${currency} ${(amount / 100).toFixed(2)}.`,
        data: {
          moduleName,
          amount,
          currency,
          billingCycle,
          actionUrl: "/marketplace"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "module_purchased",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending module purchased notification:", error);
    }
  }

  /**
   * Send bundle purchased notification
   */
  async sendBundlePurchasedNotification(
    organizationId: string,
    bundleName: string,
    amount: number,
    currency: string,
    billingCycle: "monthly" | "annual"
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "bundle_purchased",
        title: "Bundle Purchased",
        message: `${bundleName} bundle has been successfully purchased and activated. ${billingCycle === "annual" ? "Annual" : "Monthly"} billing: ${currency} ${(amount / 100).toFixed(2)}.`,
        data: {
          bundleName,
          amount,
          currency,
          billingCycle,
          actionUrl: "/marketplace"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "bundle_purchased",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending bundle purchased notification:", error);
    }
  }

  /**
   * Send credit top-up notification
   */
  async sendCreditTopUpNotification(
    organizationId: string,
    credits: number,
    amount: number,
    currency: string
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "credit_topup",
        title: "Credits Added",
        message: `${credits} inspection credits have been added to your account for ${currency} ${(amount / 100).toFixed(2)}.`,
        data: {
          credits,
          amount,
          currency,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "credit_topup",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending credit top-up notification:", error);
    }
  }

  /**
   * Send subscription expiring soon notification (7 days before)
   */
  async sendSubscriptionExpiringNotification(
    organizationId: string,
    expirationDate: Date,
    daysRemaining: number
  ): Promise<void> {
    try {
      const org = await storage.getOrganization(organizationId);
      if (!org || !org.ownerId) return;

      const owner = await storage.getUser(org.ownerId);
      if (!owner) return;

      const notification = await storage.createNotification({
        userId: owner.id,
        organizationId,
        type: "subscription_expiring",
        title: "Subscription Expiring Soon",
        message: `Your subscription will expire in ${daysRemaining} day(s) on ${expirationDate.toLocaleDateString()}. Please renew to continue service.`,
        data: {
          expirationDate: expirationDate.toISOString(),
          daysRemaining,
          actionUrl: "/billing"
        }
      });

      sendNotificationToUser(owner.id, {
        id: notification.id,
        type: "subscription_expiring",
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt?.toISOString() || new Date().toISOString(),
        isRead: false
      });
    } catch (error) {
      console.error("Error sending subscription expiring notification:", error);
    }
  }
}

export const notificationService = new NotificationService();

