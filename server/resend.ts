import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  recipientName: string,
  resetToken: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = 'Password Reset Request - Inspect360';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header with Inspect360 branding -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M12 17v-6"></path>
          <path d="M12 11h.01"></path>
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">Password Reset Request</h1>
    </div>

    <!-- Main content -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${recipientName},</p>
      <p style="margin: 0 0 24px 0; font-size: 16px;">
        We received a request to reset your password for your Inspect360 account. Use the code below to reset your password.
      </p>

      <!-- Reset Code Card -->
      <div style="background-color: #f8f9fa; border: 2px dashed #00D5CC; padding: 24px; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Reset Code</p>
        <div style="font-size: 32px; font-weight: 700; color: #00D5CC; letter-spacing: 4px; font-family: 'Courier New', monospace;">
          ${resetToken}
        </div>
        <p style="margin: 16px 0 0 0; font-size: 13px; color: #888;">
          This code will expire in 1 hour
        </p>
      </div>

      <p style="margin: 0 0 16px 0; font-size: 15px; color: #555;">
        To reset your password:
      </p>
      <ol style="margin: 0 0 24px 0; padding-left: 24px; font-size: 15px; color: #555;">
        <li style="margin-bottom: 8px;">Return to the password reset page</li>
        <li style="margin-bottom: 8px;">Enter this 6-digit code</li>
        <li style="margin-bottom: 8px;">Create a new password</li>
      </ol>

      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 4px; margin-top: 24px;">
        <p style="margin: 0; font-size: 14px; color: #856404;">
          <strong>Didn't request this?</strong><br>
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
        This email was sent from <strong style="color: #00D5CC;">Inspect360</strong> — Your AI-Powered Building Inspection Platform
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const response = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      html,
    });

    console.log('Password reset email sent:', response);
    return response;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

export async function sendInspectionCompleteEmail(
  recipientEmail: string,
  recipientName: string,
  inspectionDetails: {
    type: string;
    propertyName?: string;
    blockName?: string;
    inspectorName: string;
    completedDate: Date;
    inspectionId: string;
  }
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `Inspection Complete: ${inspectionDetails.type}`;
    const location = inspectionDetails.propertyName || inspectionDetails.blockName || 'Unknown Location';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header with Inspect360 branding -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
          <path d="M9 11h4"></path>
          <path d="M11 9v4"></path>
        </svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">Inspection Complete</h1>
    </div>

    <!-- Main content -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${recipientName},</p>
      <p style="margin: 0 0 24px 0; font-size: 16px;">
        An inspection has been completed and is ready for your review.
      </p>

      <!-- Inspection details card -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #00D5CC; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">Inspection Details</h2>
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Type:</span>
          <span style="color: #333; margin-left: 8px;">${inspectionDetails.type}</span>
        </div>
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Location:</span>
          <span style="color: #333; margin-left: 8px;">${location}</span>
        </div>
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Inspector:</span>
          <span style="color: #333; margin-left: 8px;">${inspectionDetails.inspectorName}</span>
        </div>
        
        <div>
          <span style="font-weight: 600; color: #555;">Completed:</span>
          <span style="color: #333; margin-left: 8px;">${inspectionDetails.completedDate.toLocaleString('en-US', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
          })}</span>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/inspections/${inspectionDetails.inspectionId}` : '#'}" 
           style="display: inline-block; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
          View Inspection Report
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #666;">
        You can review the full inspection report, including photos and notes, by clicking the button above.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
        This email was sent from <strong style="color: #00D5CC;">Inspect360</strong> — Your AI-Powered Building Inspection Platform
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const response = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      html,
    });

    console.log('Inspection complete email sent:', response);
    return response;
  } catch (error) {
    console.error('Failed to send inspection complete email:', error);
    throw error;
  }
}

export async function sendTeamWorkOrderNotification(
  teamEmail: string,
  teamName: string,
  workOrderDetails: {
    id: string;
    maintenanceTitle: string;
    maintenanceDescription?: string;
    priority: string;
    propertyName?: string;
    slaDue?: Date | null;
    costEstimate?: number | null;
  }
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `New Work Order Assigned: ${workOrderDetails.maintenanceTitle}`;
    
    const priorityColors: Record<string, string> = {
      low: '#6b7280',
      medium: '#3b82f6',
      high: '#f97316',
      urgent: '#ef4444',
    };
    
    const priorityColor = priorityColors[workOrderDetails.priority] || '#3b82f6';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header with Inspect360 branding -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
        </svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">New Work Order Assigned</h1>
    </div>

    <!-- Main content -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${teamName} Team,</p>
      <p style="margin: 0 0 24px 0; font-size: 16px;">
        A new work order has been assigned to your team and requires attention.
      </p>

      <!-- Work Order details card -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #00D5CC; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">Work Order Details</h2>
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Title:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.maintenanceTitle}</span>
        </div>
        
        ${workOrderDetails.maintenanceDescription ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Description:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.maintenanceDescription}</span>
        </div>
        ` : ''}
        
        ${workOrderDetails.propertyName ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Property:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.propertyName}</span>
        </div>
        ` : ''}
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Priority:</span>
          <span style="display: inline-block; background-color: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; text-transform: uppercase;">
            ${workOrderDetails.priority}
          </span>
        </div>
        
        ${workOrderDetails.slaDue ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">SLA Due:</span>
          <span style="color: #333; margin-left: 8px;">${new Date(workOrderDetails.slaDue).toLocaleString('en-US', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
          })}</span>
        </div>
        ` : ''}
        
        ${workOrderDetails.costEstimate ? `
        <div>
          <span style="font-weight: 600; color: #555;">Estimated Cost:</span>
          <span style="color: #333; margin-left: 8px;">$${(workOrderDetails.costEstimate / 100).toFixed(2)}</span>
        </div>
        ` : ''}
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/maintenance?tab=work-orders` : '#'}" 
           style="display: inline-block; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
          View Work Orders
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #666;">
        Please review the work order details and assign team members as needed.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
        This email was sent from <strong style="color: #00D5CC;">Inspect360</strong> — Your AI-Powered Building Inspection Platform
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const response = await client.emails.send({
      from: fromEmail,
      to: teamEmail,
      subject,
      html,
    });

    console.log('Team work order notification sent:', response);
    return response;
  } catch (error) {
    console.error('Failed to send team work order notification:', error);
    throw error;
  }
}

export async function sendContractorWorkOrderNotification(
  contractorEmail: string,
  contractorName: string,
  workOrderDetails: {
    id: string;
    maintenanceTitle: string;
    maintenanceDescription?: string;
    priority: string;
    propertyName?: string;
    slaDue?: Date | null;
    costEstimate?: number | null;
  }
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `New Work Order Assigned: ${workOrderDetails.maintenanceTitle}`;
    
    const priorityColors: Record<string, string> = {
      low: '#6b7280',
      medium: '#3b82f6',
      high: '#f97316',
      urgent: '#ef4444',
    };
    
    const priorityColor = priorityColors[workOrderDetails.priority] || '#3b82f6';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header with Inspect360 branding -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
        </svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">New Work Order Assigned</h1>
    </div>

    <!-- Main content -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 16px;">Hi ${contractorName},</p>
      <p style="margin: 0 0 24px 0; font-size: 16px;">
        A new work order has been assigned to you and requires your attention.
      </p>

      <!-- Work Order details card -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #00D5CC; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">Work Order Details</h2>
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Title:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.maintenanceTitle}</span>
        </div>
        
        ${workOrderDetails.maintenanceDescription ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Description:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.maintenanceDescription}</span>
        </div>
        ` : ''}
        
        ${workOrderDetails.propertyName ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Property:</span>
          <span style="color: #333; margin-left: 8px;">${workOrderDetails.propertyName}</span>
        </div>
        ` : ''}
        
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">Priority:</span>
          <span style="display: inline-block; background-color: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; text-transform: uppercase;">
            ${workOrderDetails.priority}
          </span>
        </div>
        
        ${workOrderDetails.slaDue ? `
        <div style="margin-bottom: 12px;">
          <span style="font-weight: 600; color: #555;">SLA Due:</span>
          <span style="color: #333; margin-left: 8px;">${new Date(workOrderDetails.slaDue).toLocaleString('en-US', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
          })}</span>
        </div>
        ` : ''}
        
        ${workOrderDetails.costEstimate ? `
        <div>
          <span style="font-weight: 600; color: #555;">Estimated Cost:</span>
          <span style="color: #333; margin-left: 8px;">$${(workOrderDetails.costEstimate / 100).toFixed(2)}</span>
        </div>
        ` : ''}
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/maintenance?tab=work-orders` : '#'}" 
           style="display: inline-block; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
          View Work Order
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #666;">
        Please log in to the platform to view full details and update the work order status.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
        This email was sent from <strong style="color: #00D5CC;">Inspect360</strong> — Your AI-Powered Building Inspection Platform
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const response = await client.emails.send({
      from: fromEmail,
      to: contractorEmail,
      subject,
      html,
    });

    console.log('Contractor work order notification sent:', response);
    return response;
  } catch (error) {
    console.error('Failed to send contractor work order notification:', error);
    throw error;
  }
}

export async function broadcastMessageToTenants(
  recipients: { email: string; firstName?: string; lastName?: string }[],
  templateData: {
    subject: string;
    body: string;
  },
  variables: {
    blockName?: string;
    organizationName?: string;
    [key: string]: any;
  }
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const results: any[] = [];
    const errors: any[] = [];

    // Send email to each recipient
    for (const recipient of recipients) {
      try {
        // Replace variables in subject and body
        const recipientName = recipient.firstName 
          ? `${recipient.firstName}${recipient.lastName ? ' ' + recipient.lastName : ''}` 
          : 'Tenant';
        
        // Create replacements object with recipient-specific and general variables
        const replacements: Record<string, string> = {
          tenant_name: recipientName,
          tenant_first_name: recipient.firstName || 'Tenant',
          tenant_last_name: recipient.lastName || '',
          block_name: variables.blockName || '',
          organization_name: variables.organizationName || '',
          ...Object.keys(variables).reduce((acc, key) => {
            if (key !== 'blockName' && key !== 'organizationName') {
              acc[key] = String(variables[key]);
            }
            return acc;
          }, {} as Record<string, string>),
        };

        // Replace variables in subject and body
        let personalizedSubject = templateData.subject;
        let personalizedBody = templateData.body;

        Object.keys(replacements).forEach(key => {
          const regex = new RegExp(`\\{${key}\\}`, 'g');
          personalizedSubject = personalizedSubject.replace(regex, replacements[key]);
          personalizedBody = personalizedBody.replace(regex, replacements[key]);
        });

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${personalizedSubject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header with Inspect360 branding -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #00D5CC 0%, #3B7A8C 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">${personalizedSubject}</h1>
    </div>

    <!-- Main content -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 16px; white-space: pre-wrap;">
        ${personalizedBody}
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #e5e5e5; padding-top: 20px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
        This email was sent from <strong style="color: #00D5CC;">Inspect360</strong> — Your AI-Powered Building Inspection Platform
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #aaa; text-align: center;">
        © ${new Date().getFullYear()} Inspect360. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
        `;

        const response = await client.emails.send({
          from: fromEmail,
          to: recipient.email,
          subject: personalizedSubject,
          html,
        });

        results.push({
          email: recipient.email,
          success: true,
          messageId: response.data?.id || 'sent',
        });

        console.log(`Email sent to ${recipient.email}:`, response);
      } catch (emailError) {
        console.error(`Failed to send email to ${recipient.email}:`, emailError);
        errors.push({
          email: recipient.email,
          success: false,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
        });
      }
    }

    return {
      totalSent: results.length,
      totalFailed: errors.length,
      results,
      errors,
    };
  } catch (error) {
    console.error('Failed to broadcast messages:', error);
    throw error;
  }
}
