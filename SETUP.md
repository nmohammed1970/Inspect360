# Inspect360 Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory (copy from `.env.example`):

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

### 3. Configure Database

You have two options:

#### Option A: Use Neon (Recommended for Development)
1. Go to [https://neon.tech](https://neon.tech)
2. Sign up for a free account
3. Create a new project
4. Copy the connection string (it looks like: `postgresql://user:password@host/database?sslmode=require`)
5. Paste it into your `.env` file as `DATABASE_URL`

#### Option B: Use Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database: `createdb inspect360`
3. Set `DATABASE_URL=postgresql://localhost:5432/inspect360`

### 4. Generate Session Secret

Run this command to generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `SESSION_SECRET` in your `.env` file.

### 5. Set Up Other Environment Variables

Edit your `.env` file and configure:

- **DATABASE_URL**: Your PostgreSQL connection string (required)
- **SESSION_SECRET**: Random secret for session management (required)
- **RESEND_API_KEY**: Your Resend API key (optional, for email functionality)
- **RESEND_FROM_EMAIL**: Email address to send emails from (optional, required if using email features)
- **TEXTMAGIC_USERNAME**: TextMagic account username (optional, for tenant SMS)
- **TEXTMAGIC_API_KEY**: TextMagic API key (optional, required if enabling SMS)
- **TEXTMAGIC_FROM**: Optional TextMagic sender id / phone
- **TEXTMAGIC_ENABLED**: Set `true` to send SMS; `false` skips SMS safely
- **STRIPE_SECRET_KEY**: Your Stripe secret key (optional, for payments)
- **STRIPE_WEBHOOK_SECRET**: Your Stripe webhook secret (optional)
- **AI_INTEGRATIONS_OPENAI_BASE_URL**: OpenAI API base URL (optional, for AI features)
- **AI_INTEGRATIONS_OPENAI_API_KEY**: OpenAI API key (optional, for AI features)
- **LOCAL_STORAGE_DIR**: Directory for local file storage (optional, defaults to `./storage`)
- **PUBLIC_OBJECT_SEARCH_PATHS**: Comma-separated paths for public object search (optional, defaults to `public`)
- **PRIVATE_OBJECT_DIR**: Directory name for private objects (optional, defaults to `private`)
- **PORT**: Server port (optional, defaults to 5000)

### 6. Run Database Migrations

Push the schema to your database:
```bash
npm run db:push
```

#### Company module flags (Contabo)

Org-scoped **Rentals / Tenancies / Compliance / Maintenance** toggles live on `organizations`
(`rentals_enabled`, `tenancies_enabled`, `compliance_enabled`, `maintenance_enabled`). SQL:
`server/migrations/addCompanyModules.sql` and `server/migrations/addMaintenanceCompanyModule.sql`.

On Contabo, connect as `creativecloud` (not `inspect360`):

```bash
# Dev
docker exec -it postgres psql -U creativecloud -d inspect360_dev -f - < server/migrations/addCompanyModules.sql
docker exec -it postgres psql -U creativecloud -d inspect360_dev -f - < server/migrations/addMaintenanceCompanyModule.sql

# Prod
docker exec -it postgres psql -U creativecloud -d inspect360 -f - < server/migrations/addCompanyModules.sql
docker exec -it postgres psql -U creativecloud -d inspect360 -f - < server/migrations/addMaintenanceCompanyModule.sql
```

Or paste the SQL interactively after `docker exec -it postgres psql -U creativecloud -d <db>`.

Disabling a module never deletes data.
Tenancies OFF also disables Rentals (rent is tied to tenant assignments).
Rentals OFF alone hides finance UI/jobs; Compliance OFF hides compliance surfaces
and skips WO→compliance auto-link. Maintenance OFF hides requests, work orders,
inspection Log Maintenance, and tenant maintenance. Properties, Blocks, and Inspections stay available.

#### Property layout columns (Contabo)

Room counts + floor-plan metadata on `properties`, and
`property_room_counts_snapshot` on `inspections`. SQL:
`server/migrations/addPropertyLayout.sql`.

```bash
# Dev
docker exec -it postgres psql -U creativecloud -d inspect360_dev -f - < server/migrations/addPropertyLayout.sql

# Prod
docker exec -it postgres psql -U creativecloud -d inspect360 -f - < server/migrations/addPropertyLayout.sql
```

Existing properties default to 1 bedroom / kitchen / bathroom / living room.
New property inspections snapshot those counts at create time; historical
inspections are never rewritten.

#### Inspection gallery tables (Contabo)

Per-inspection media pool + field assignments:
`inspection_gallery_images`, `inspection_gallery_assignments`.
SQL: `server/migrations/addInspectionGallery.sql`.
Legacy entry photos are backfilled into the gallery on first `GET …/gallery`.

```bash
# Dev
docker exec -it postgres psql -U creativecloud -d inspect360_dev -f - < server/migrations/addInspectionGallery.sql

# Prod
docker exec -it postgres psql -U creativecloud -d inspect360 -f - < server/migrations/addInspectionGallery.sql
```

After creating the tables as `creativecloud`, grant the app role:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_gallery_images TO inspect360;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_gallery_assignments TO inspect360;
```

### 7. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5000` (or your configured PORT).

## Troubleshooting

### Error: "DATABASE_URL must be set"
- Make sure you've created a `.env` file in the root directory
- Verify that `DATABASE_URL` is set in the `.env` file
- Check that the connection string is valid

### Error: "Connection refused" or Database connection errors
- Verify your `DATABASE_URL` is correct
- Check that your database server is running
- For Neon: Ensure your IP is allowed (Neon allows all IPs by default)
- For local PostgreSQL: Check that the service is running

### Error: "Session secret required"
- Generate a session secret using the command above
- Add it to your `.env` file as `SESSION_SECRET`

### Error: "RESEND_API_KEY environment variable is required"
- Sign up for a Resend account at [https://resend.com](https://resend.com)
- Get your API key from the dashboard
- Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to your `.env` file

### Error: File storage issues
- Files are stored locally in the `storage` directory by default
- You can customize the storage location by setting `LOCAL_STORAGE_DIR` in your `.env` file
- Make sure the application has write permissions to the storage directory
- The storage directory structure:
  - `storage/public/` - Public files
  - `storage/private/` - Private files (with ACL metadata)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ Yes | Secret key for session encryption |
| `RESEND_API_KEY` | ❌ No | Resend API key (for email functionality) |
| `RESEND_FROM_EMAIL` | ❌ No | Email address to send emails from (required if using email features) |
| `TEXTMAGIC_USERNAME` | ❌ No | TextMagic username (tenant SMS) |
| `TEXTMAGIC_API_KEY` | ❌ No | TextMagic API key (required if SMS enabled) |
| `TEXTMAGIC_FROM` | ❌ No | Optional TextMagic sender |
| `TEXTMAGIC_ENABLED` | ❌ No | `true` to enable SMS sends |
| `STRIPE_SECRET_KEY` | ❌ No | Stripe API secret key (for payments) |
| `STRIPE_WEBHOOK_SECRET` | ❌ No | Stripe webhook secret |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | ❌ No | OpenAI API base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ❌ No | OpenAI API key |
| `AI_INSPECTION_MODEL` | ❌ No | Vision/write-up model (default `gpt-5`) |
| `AI_CHAT_MODEL` | ❌ No | Chat/maintenance model (default `gpt-4o`) |
| `AI_CHAT_MINI_MODEL` | ❌ No | Lightweight chat titles (default `gpt-4o-mini`) |
| `AI_WHISPER_MODEL` | ❌ No | Transcription model (default `whisper-1`) |
| `AI_IMAGE_MODEL` | ❌ No | Image generation model (default `dall-e-3`) |
| `LOCAL_STORAGE_DIR` | ❌ No | Directory for local file storage (default: `./storage`) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | ❌ No | Comma-separated paths for public object search (default: `public`) |
| `PRIVATE_OBJECT_DIR` | ❌ No | Directory name for private objects (default: `private`) |
| `PORT` | ❌ No | Server port (default: 5000) |
| `REAPIT_CLIENT_ID` | ❌ No | Reapit app client id |
| `REAPIT_CLIENT_SECRET` | ❌ No | Reapit app client secret |
| `REAPIT_CONNECT_URL` | ❌ No | Default `https://connect.reapit.cloud` |
| `REAPIT_API_URL` | ❌ No | Default `https://platform.reapit.cloud` |
| `REAPIT_REDIRECT_URI` | ❌ No | OAuth callback override |
| `INTEGRATION_ENCRYPTION_KEY` | ❌ No | AES-256-GCM key for Reapit tokens (32-byte hex) |
| `ENABLE_REAPIT_WORKER` | ❌ No | Set `false` to disable the Reapit job worker |

## Next Steps

After setup:
1. Register your first user account
2. Create an organization
3. Start creating properties and inspections!

For more information, see the main project documentation.

