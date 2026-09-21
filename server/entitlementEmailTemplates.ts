import {
  formatCreditExpiryLabel,
  formatTrialExpiryLabel,
  type ExpiryNotificationIntent,
} from "@shared/entitlementNotifications";

export type ExpiryEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type ExpiryEmailContext = {
  productName: string;
  recipientName: string;
  organizationName: string;
  loginUrl: string;
  logoUrl?: string | null;
  intent: ExpiryNotificationIntent;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(productName: string, bodyHtml: string, loginUrl: string, logoUrl?: string | null): string {
  const safeProduct = escapeHtml(productName);
  const safeUrl = escapeHtml(loginUrl);
  const logo = logoUrl && /^https:\/\//i.test(logoUrl)
    ? `<img src="${escapeHtml(logoUrl)}" alt="" width="120" style="display:block; margin:0 0 16px 0; max-width:120px; height:auto;" />`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px;">
    ${logo}
    <p style="margin: 0 0 8px 0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #3B7A8C;">${safeProduct}</p>
    ${bodyHtml}
    <p style="margin: 28px 0 0 0;">
      <a href="${safeUrl}" style="display: inline-block; background: #04C6BD; color: #021F36; text-decoration: none; font-weight: 600; padding: 12px 18px; border-radius: 6px;">Open ${safeProduct}</a>
    </p>
    <p style="margin: 24px 0 0 0; font-size: 13px; color: #5c6b76;">Please contact your administrator to add credits or extend your access.</p>
  </div>
</body>
</html>`;
}

export function buildExpiryEmail(context: ExpiryEmailContext): ExpiryEmailContent {
  const product = context.productName.trim() || "Inspect360";
  const name = context.recipientName.trim() || "there";
  const org = context.organizationName.trim() || "your organization";
  const { intent } = context;
  const trialWhen = formatTrialExpiryLabel(intent.expiresAt);
  const creditWhen = formatCreditExpiryLabel(intent.expiresAt);

  let subject = "";
  let paragraph = "";

  if (intent.type === "trial_warning_3d") {
    subject = `Your ${product} trial expires in 3 days`;
    paragraph = intent.accessContinues
      ? `Your free trial for ${org} will expire on ${trialWhen}. You have 3 days remaining. Credits already assigned to this account can keep restricted features available after the trial ends. Contact your administrator if you need the trial or those credits extended.`
      : `Your free trial for ${org} will expire on ${trialWhen}. You have 3 days remaining. After your trial expires, access to restricted platform features will be limited unless your administrator has assigned valid credits to your account. Please contact your administrator to arrange continued access.`;
  } else if (intent.type === "credit_warning_3d") {
    subject = "Your credits expire in 3 days";
    paragraph = `Your assigned credits for ${org} will expire on ${creditWhen}. You have 3 days remaining. Please contact your administrator if you require continued access to the platform.`;
  } else if (intent.type === "trial_expired") {
    subject = `Your ${product} trial has expired`;
    paragraph = `Your free trial for ${org} ended on ${trialWhen}. This account does not currently have valid credits providing access to restricted platform features. Please contact your administrator to add credits or extend your access.`;
  } else {
    subject = "Your credits have expired";
    paragraph = `Your assigned credits for ${org} expired on ${creditWhen}. This account does not currently have another valid credit allocation. Access to restricted platform features is therefore limited. Please contact your administrator to add new credits and restore full access.`;
  }

  const html = layout(
    product,
    `<p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${escapeHtml(name)},</p>
     <p style="margin: 0; font-size: 16px;">${escapeHtml(paragraph)}</p>`,
    context.loginUrl,
    context.logoUrl,
  );

  const text = `Hi ${name},\n\n${paragraph}\n\nOpen ${product}: ${context.loginUrl}\n\nPlease contact your administrator to add credits or extend your access.`;

  return { subject, html, text };
}
