# Inspect360 - IIS Migration Guide

## Overview

This document provides comprehensive instructions for migrating the Inspect360 application from Replit to a Windows Server running IIS (Internet Information Services).

---

## Table of Contents

1. [Server Requirements](#server-requirements)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Database Setup](#database-setup)
4. [Application Deployment](#application-deployment)
5. [IIS Configuration](#iis-configuration)
6. [Environment Variables](#environment-variables)
7. [Stripe Integration](#stripe-integration)
8. [SSL/HTTPS Configuration](#sslhttps-configuration)
9. [Post-Deployment Verification](#post-deployment-verification)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance](#maintenance)

---

## Server Requirements

### Hardware (Minimum)
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Storage**: 100 GB SSD

### Software
- **OS**: Windows Server 2019 or 2022
- **IIS**: 10.0 or higher with the following modules:
  - URL Rewrite Module 2.1+
  - Application Request Routing (ARR) 3.0+
  - iisnode (latest version from https://github.com/Azure/iisnode/releases)
- **Node.js**: 20.x LTS (64-bit)
- **PostgreSQL**: 15.x or higher (can be on separate server)

### Network
- Port 80 (HTTP) and 443 (HTTPS) open
- Outbound access to:
  - api.stripe.com (payment processing)
  - api.openai.com (AI features)
  - api.resend.com (email service)
  - storage.googleapis.com (file storage)

---

## Pre-Migration Checklist

- [ ] Windows Server provisioned and updated
- [ ] IIS installed and configured
- [ ] Node.js 20.x installed
- [ ] iisnode module installed
- [ ] URL Rewrite module installed
- [ ] PostgreSQL database server ready
- [ ] SSL certificate obtained (Let's Encrypt or commercial)
- [ ] DNS records configured
- [ ] Stripe live API keys obtained
- [ ] Resend domain verified
- [ ] Google Cloud Storage bucket created
- [ ] OpenAI API key obtained

---

## Database Setup

### 1. Create PostgreSQL Database

```sql
-- Connect as postgres superuser
CREATE DATABASE inspect360;
CREATE USER inspect360_user WITH ENCRYPTED PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE inspect360 TO inspect360_user;

-- Connect to inspect360 database
\c inspect360

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### 2. Import Schema

```bash
# Using psql
psql -h your-postgres-host -U inspect360_user -d inspect360 -f database_schema.sql

# Or using pg_restore if you have a dump
pg_restore -h your-postgres-host -U inspect360_user -d inspect360 backup.dump
```

### 3. Verify Tables

```sql
-- Should return 67 tables
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';
```

---

## Application Deployment

### 1. Build the Application

On your development machine or build server:

```bash
# Clone the repository
git clone <your-repo-url> inspect360
cd inspect360

# Install dependencies
npm install

# Build for production
npm run build
```

### 2. Prepare Deployment Package

Copy these files/folders to the server:

```
📁 C:\inetpub\wwwroot\inspect360\
├── 📁 dist/                    # Built application
│   ├── 📁 public/              # Static frontend files
│   └── index.js                # Server entry point
├── 📁 node_modules/            # Dependencies (run npm install --production)
├── 📄 package.json             # Package manifest
├── 📄 package-lock.json        # Lock file
├── 📄 web.config               # IIS configuration
└── 📁 logs/                    # Create empty folder for logs
```

### 3. Install Production Dependencies

On the Windows server:

```powershell
cd C:\inetpub\wwwroot\inspect360
npm install --production
```

---

## IIS Configuration

### 1. Create Application Pool

1. Open **IIS Manager**
2. Right-click **Application Pools** → **Add Application Pool**
3. Configure:
   - **Name**: `Inspect360Pool`
   - **.NET CLR version**: `No Managed Code`
   - **Managed pipeline mode**: `Integrated`
   - **Start application pool immediately**: ✓

4. Click the pool → **Advanced Settings**:
   - **Start Mode**: `AlwaysRunning`
   - **Idle Time-out (minutes)**: `0` (disable)
   - **Identity**: `ApplicationPoolIdentity` (or custom service account)

### 2. Create Website

1. Right-click **Sites** → **Add Website**
2. Configure:
   - **Site name**: `Inspect360`
   - **Application pool**: `Inspect360Pool`
   - **Physical path**: `C:\inetpub\wwwroot\inspect360`
   - **Binding**:
     - Type: `https`
     - IP address: `All Unassigned`
     - Port: `443`
     - Host name: `yourdomain.com`
     - SSL certificate: Select your certificate

3. Add HTTP to HTTPS redirect:
   - Add another binding for HTTP (port 80)
   - Add URL Rewrite rule to redirect to HTTPS

### 3. Configure URL Rewrite for HTTPS Redirect

Add this rule in IIS Manager → URL Rewrite → Add Rule:

```xml
<rule name="HTTP to HTTPS redirect" stopProcessing="true">
  <match url="(.*)" />
  <conditions>
    <add input="{HTTPS}" pattern="off" ignoreCase="true" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

---

## Environment Variables

### Option 1: Windows System Environment Variables (Recommended)

```powershell
# Run as Administrator
[System.Environment]::SetEnvironmentVariable("DATABASE_URL", "postgresql://...", "Machine")
[System.Environment]::SetEnvironmentVariable("SESSION_SECRET", "your-secret", "Machine")
[System.Environment]::SetEnvironmentVariable("STRIPE_SECRET_KEY", "sk_live_...", "Machine")
# ... add all variables from .env.production.template
```

### Option 2: IIS Application Pool Environment Variables

1. Open IIS Manager
2. Select Application Pool → **Advanced Settings**
3. Click **Environment Variables** → Add each variable

### Option 3: web.config appSettings (less secure, not for secrets)

```xml
<appSettings>
  <add key="NODE_ENV" value="production"/>
  <!-- DO NOT put secrets here -->
</appSettings>
```

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | 64-char random string | Generate with crypto |
| `STRIPE_SECRET_KEY` | Stripe live secret key | `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe live publishable key | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `RESEND_API_KEY` | Resend email API key | `re_...` |
| `RESEND_FROM_EMAIL` | Verified sender with display name | `Inspect360 <notifications@inspect360.ai>` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `BASE_URL` | Production URL | `https://yourdomain.com` |
| `GCS_BUCKET_NAME` | GCS bucket for files | `inspect360-files` |

---

## Stripe Integration

### 1. Switch to Live Mode

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Toggle from **Test mode** to **Live mode**
3. Go to **Developers** → **API keys**
4. Copy the **Publishable key** and **Secret key**

### 2. Configure Webhook

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Configure:
   - **Endpoint URL**: `https://yourdomain.com/api/webhooks/stripe`
   - **Events**: Select these events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`)

### 3. Migrate Stripe Products

The subscription plans need to be created in your live Stripe account:

| Plan Code | Monthly Price (GBP) | Annual Price (GBP) | Inspections/Year |
|-----------|---------------------|--------------------|--------------------|
| freelancer | £9 | £99 | 120 |
| btr | £29 | £299 | 600 |
| pbsa | £99 | £999 | 3,000 |
| housing_association | £299 | £2,999 | 10,000 |
| council | £499 | £4,999 | 25,000 |

Create these products in Stripe Dashboard → Products, then update the `stripe_price_id_*` columns in the `plans` database table.

---

## SSL/HTTPS Configuration

### Option 1: Let's Encrypt (Free)

Use [win-acme](https://www.win-acme.com/) for automatic certificate management:

```powershell
# Download and run win-acme
# Follow prompts to create certificate for your domain
```

### Option 2: Commercial Certificate

1. Purchase certificate from CA (DigiCert, Comodo, etc.)
2. Import to Windows Certificate Store
3. Bind in IIS

### Force HTTPS

Ensure all traffic is redirected to HTTPS:

```xml
<!-- Add to web.config under <rewrite><rules> -->
<rule name="HTTPS Redirect" stopProcessing="true">
  <match url="(.*)" />
  <conditions>
    <add input="{HTTPS}" pattern="off" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

---

## Post-Deployment Verification

### 1. Basic Health Checks

```powershell
# Test the application
Invoke-WebRequest -Uri "https://yourdomain.com/api/health" -UseBasicParsing

# Check IIS logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC1\*.log" -Tail 50
```

### 2. Verify Functionality

- [ ] Homepage loads correctly
- [ ] Login/registration works
- [ ] Database connection successful
- [ ] Stripe checkout redirects properly
- [ ] Email sending works (test password reset)
- [ ] AI analysis features work
- [ ] File uploads work (GCS connection)
- [ ] Tenant portal accessible

### 3. Security Checks

- [ ] HTTPS enforced on all pages
- [ ] Security headers present (check with securityheaders.com)
- [ ] No sensitive files accessible (node_modules, .env, etc.)
- [ ] Rate limiting active
- [ ] Session cookies secure

---

## Troubleshooting

### Common Issues

#### 1. "iisnode encountered an error when processing the request"

```powershell
# Check iisnode logs
Get-ChildItem "C:\inetpub\wwwroot\inspect360\logs" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
Get-Content "C:\inetpub\wwwroot\inspect360\logs\<latest-log>.txt"
```

#### 2. 500 Internal Server Error

- Check Node.js is installed correctly: `node --version`
- Verify environment variables are set
- Check database connection string
- Review Windows Event Viewer → Application logs

#### 3. Database Connection Failed

```powershell
# Test PostgreSQL connection
psql -h your-host -U inspect360_user -d inspect360 -c "SELECT 1"
```

#### 4. Static Files Not Loading

- Verify `dist/public` folder exists
- Check URL Rewrite rules in web.config
- Ensure proper MIME types configured

#### 5. WebSocket Connection Failed

- Ensure ARR proxy is enabled
- Check WebSocket protocol is enabled in IIS
- Verify firewall allows WebSocket connections

### Logging

Application logs are written to:
- `C:\inetpub\wwwroot\inspect360\logs\` (iisnode logs)
- Windows Event Viewer → Application

---

## Maintenance

### Daily
- Monitor error logs
- Check Stripe webhook deliveries

### Weekly
- Review application logs
- Check disk space
- Verify backups

### Monthly
- Update Node.js (security patches)
- Review and rotate API keys if needed
- Database maintenance (VACUUM, ANALYZE)

### Backup Strategy

```powershell
# Database backup (daily)
pg_dump -h localhost -U inspect360_user inspect360 > backup_$(date +%Y%m%d).sql

# Application files (weekly)
Compress-Archive -Path "C:\inetpub\wwwroot\inspect360" -DestinationPath "backup_app_$(Get-Date -Format yyyyMMdd).zip"
```

---

## Support

For technical support, contact:
- **Email**: support@inspect360.ai
- **Documentation**: https://docs.inspect360.ai

---

*Last Updated: December 2025*
