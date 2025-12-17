# Inspect360 - IIS Deployment Guide

This guide covers deploying the Inspect360 application to a Windows Server running IIS (Internet Information Services).

## Prerequisites

### Server Requirements
- Windows Server 2016 or later (or Windows 10/11 for development)
- IIS 10.0 or later with URL Rewrite module
- Node.js 18.x or 20.x LTS installed
- iisnode module installed
- PostgreSQL database (external or local)
- Minimum 4GB RAM, 2 CPU cores recommended

### Required Software Downloads
1. **Node.js**: https://nodejs.org/ (LTS version)
2. **iisnode**: https://github.com/Azure/iisnode/releases
3. **URL Rewrite**: https://www.iis.net/downloads/microsoft/url-rewrite
4. **PostgreSQL**: https://www.postgresql.org/download/windows/ (or use external service)

---

## Step 1: Export Code from Replit

1. In Replit, click the three dots menu (⋮) in the Files panel
2. Select "Download as zip"
3. Extract the zip file to your deployment location (e.g., `C:\inetpub\wwwroot\inspect360`)

---

## Step 2: Install Node.js and iisnode

### Install Node.js
1. Download and run the Node.js LTS installer
2. Verify installation: `node --version` and `npm --version`

### Install iisnode
1. Download iisnode from GitHub releases
2. Run the MSI installer
3. Restart IIS: `iisreset`

### Install URL Rewrite Module
1. Download from IIS downloads page
2. Run the installer
3. Restart IIS

---

## Step 3: Configure the Application

### Install Dependencies
```powershell
cd C:\inetpub\wwwroot\inspect360
npm install --production
```

### Build the Application
```powershell
npm run build
```

### Create web.config
Create `web.config` in the application root:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="dist/index.js" verb="*" modules="iisnode" />
    </handlers>
    
    <rewrite>
      <rules>
        <rule name="StaticContent">
          <action type="Rewrite" url="dist/public/{R:0}" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
          <action type="Rewrite" url="dist/index.js" />
        </rule>
      </rules>
    </rewrite>
    
    <iisnode 
      nodeProcessCommandLine="&quot;C:\Program Files\nodejs\node.exe&quot;"
      watchedFiles="web.config;*.js"
      loggingEnabled="true"
      logDirectory="iisnode"
    />
    
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="node_modules" />
          <add segment="iisnode" />
        </hiddenSegments>
      </requestFiltering>
    </security>
    
    <httpErrors existingResponse="PassThrough" />
  </system.webServer>
</configuration>
```

---

## Step 4: Configure Environment Variables

### Option A: Using IIS Application Settings
1. Open IIS Manager
2. Select your application
3. Double-click "Configuration Editor"
4. Navigate to system.webServer/iisnode
5. Set environment variables

### Option B: Using a .env file
Create `.env` in the application root (ensure it's secured):

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/inspect360

# Session
SESSION_SECRET=your-secure-random-string-here

# OpenAI Integration
AI_INTEGRATIONS_OPENAI_API_KEY=your-openai-api-key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1

# Stripe
STRIPE_SECRET_KEY=sk_live_your-stripe-key
VITE_STRIPE_PUBLIC_KEY=pk_live_your-stripe-public-key

# Email (Resend)
RESEND_API_KEY=re_your-resend-key

# Object Storage (Google Cloud)
GCS_BUCKET_NAME=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Application
NODE_ENV=production
PORT=5000
```

### Option C: Windows Environment Variables
Set system-wide via Control Panel > System > Advanced > Environment Variables

---

## Step 5: Set Up PostgreSQL Database

### Using External PostgreSQL (Recommended)
1. Create a PostgreSQL database on your preferred provider (Neon, Supabase, AWS RDS, etc.)
2. Update `DATABASE_URL` in your environment variables

### Using Local PostgreSQL
1. Install PostgreSQL for Windows
2. Create database: 
```sql
CREATE DATABASE inspect360;
CREATE USER inspect360_user WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE inspect360 TO inspect360_user;
```
3. Run migrations:
```powershell
npm run db:push
```

---

## Step 6: Configure IIS Site

### Create Application Pool
1. Open IIS Manager
2. Right-click "Application Pools" > "Add Application Pool"
3. Name: `Inspect360Pool`
4. .NET CLR version: "No Managed Code"
5. Managed pipeline mode: "Integrated"

### Configure Application Pool Identity
1. Select the pool > Advanced Settings
2. Set Identity to a service account with appropriate permissions
3. Ensure the account has read/write access to the application folder

### Create Website
1. Right-click "Sites" > "Add Website"
2. Site name: `Inspect360`
3. Application pool: `Inspect360Pool`
4. Physical path: `C:\inetpub\wwwroot\inspect360`
5. Port: 80 (or 443 for HTTPS)
6. Host name: your domain

---

## Step 7: Configure HTTPS (Recommended)

### Option A: Using Let's Encrypt with win-acme
1. Download win-acme: https://www.win-acme.com/
2. Run: `wacs.exe`
3. Follow prompts to create certificate

### Option B: Using a Purchased Certificate
1. Import certificate to Windows Certificate Store
2. In IIS, select site > Bindings
3. Add HTTPS binding with your certificate

---

## Step 8: File Permissions

Ensure the IIS application pool identity has:
- **Read** access to all application files
- **Read/Write** access to:
  - `iisnode` folder (for logs)
  - `uploads` folder (if using local file storage)
  - Any temp directories

```powershell
icacls "C:\inetpub\wwwroot\inspect360" /grant "IIS AppPool\Inspect360Pool:(OI)(CI)RX"
icacls "C:\inetpub\wwwroot\inspect360\iisnode" /grant "IIS AppPool\Inspect360Pool:(OI)(CI)F"
```

---

## Step 9: Testing

1. Start the website in IIS Manager
2. Navigate to your domain/IP in a browser
3. Check iisnode logs for errors: `C:\inetpub\wwwroot\inspect360\iisnode\`

### Common Issues

**500 Internal Server Error**
- Check iisnode logs
- Verify Node.js path in web.config
- Ensure all environment variables are set

**Module Not Found**
- Run `npm install` again
- Check that `node_modules` exists

**Database Connection Failed**
- Verify DATABASE_URL is correct
- Check firewall allows PostgreSQL port (5432)
- Test connection with psql or pgAdmin

**Static Files Not Loading**
- Verify URL Rewrite rules
- Check file permissions

---

## Production Checklist

- [ ] All environment variables configured
- [ ] DATABASE_URL points to production database
- [ ] HTTPS enabled with valid certificate
- [ ] Session secret is a strong random string
- [ ] Stripe keys are production keys (not test)
- [ ] Error logging enabled
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Firewall rules configured
- [ ] Application pool recycling schedule set

---

## Maintenance

### Updating the Application
1. Stop the application pool
2. Replace application files (keep .env and web.config)
3. Run `npm install --production`
4. Run `npm run build`
5. Start the application pool

### Viewing Logs
- iisnode logs: `C:\inetpub\wwwroot\inspect360\iisnode\`
- IIS logs: `C:\inetpub\logs\LogFiles\`
- Windows Event Viewer for system-level issues

### Database Backups
Set up regular PostgreSQL backups using pg_dump or your hosting provider's backup solution.

---

## Support

For application-specific issues, refer to the main documentation in `replit.md`.

For IIS/iisnode issues:
- iisnode GitHub: https://github.com/Azure/iisnode
- Microsoft IIS Documentation: https://docs.microsoft.com/en-us/iis/
