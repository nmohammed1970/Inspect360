# Inspect360 - Quick Reference Card

## Deployment Package Contents

```
📁 deployment/
├── 📄 web.config                    # IIS configuration file
├── 📄 .env.production.template      # Environment variables template
├── 📄 database_schema.sql           # PostgreSQL database schema
├── 📄 MIGRATION_NOTES.md            # Complete migration guide
├── 📄 STRIPE_SETUP.md               # Stripe subscription setup
├── 📄 QUICK_REFERENCE.md            # This file
├── 📄 build.ps1                     # Windows build script
└── 📄 build.sh                      # Linux/Mac build script
```

---

## Quick Start Commands

### Build for Production
```bash
# On Linux/Mac
./deployment/build.sh

# On Windows (PowerShell)
.\deployment\build.ps1
```

### Database Setup
```bash
psql -h HOST -U USER -d DATABASE -f database_schema.sql
```

### Install Dependencies on Server
```bash
cd C:\inetpub\wwwroot\inspect360
npm ci --production
```

---

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 64-char random string |
| `STRIPE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe live publishable key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `RESEND_API_KEY` | Email service API key |
| `RESEND_FROM_EMAIL` | Verified sender email |
| `OPENAI_API_KEY` | AI features API key |
| `BASE_URL` | Production URL |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket |

---

## IIS Setup Checklist

> **Contabo / Caddy production:** see [CONTABO_RUNBOOK.md](./CONTABO_RUNBOOK.md), [CUTOVER_CHECKLIST.md](./CUTOVER_CHECKLIST.md).

1. [ ] Install Node.js 20.x (64-bit)
2. [ ] Install iisnode module
3. [ ] Install URL Rewrite module
4. [ ] Create Application Pool (No Managed Code)
5. [ ] Create Website pointing to app folder
6. [ ] Configure SSL certificate
7. [ ] Set environment variables
8. [ ] Configure Stripe webhook

---

## Stripe Webhook Events

Configure endpoint: `https://yourdomain.com/api/webhooks/stripe`

Required events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Test Credentials

### Stripe Test Cards
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

---

## Support Contacts

- **Sales**: sales@inspect360.ai
- **Support**: support@inspect360.ai
- **Documentation**: https://docs.inspect360.ai

---

## Version Info

- **Application**: Inspect360
- **Node.js**: 20.x LTS
- **PostgreSQL**: 15.x+
- **Build Date**: December 2025
