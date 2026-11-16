# Inspect360 — Feedback & Feature Requests

**Developer specification | Version 1.0 | 14 November 2026**  
**Product:** Inspect360 portal  
**Feature name in navigation:** `Feedback`  
**Administration location:** `Eco-Admin > Feedback`  
**Scope:** MVP — simple, centralised customer feedback and feature-request management

---

## 1. Objective

Provide every signed-in Inspect360 portal user with a straightforward way to:

1. Report a problem, optionally pasting a screenshot straight into the form.
2. Suggest a new feature or improvement.
3. Ask a general support question.
4. Submit their feedback and receive confirmation that the Inspect360 team will respond.
5. View their own submissions and any replies or status updates.

Give the central **Feature Admin** team an Eco-Admin workspace to review submissions from all customer organisations, classify and assign them, reply with a resolution or guidance, and analyse feature requests to decide what should be built.

**Core principle:** This is a lightweight ticketing feature inside Inspect360, **not** a full helpdesk, project-management tool or public product roadmap.

---

## 2. Navigation and access

### Standard portal users

- Add **Feedback** as an item in the main portal navigation menu.
- Clicking it opens `Feedback` with a prominent **Submit Feedback** action and a **My Feedback** list.
- Every authenticated portal user can submit feedback, regardless of their existing organisational role, unless their account is suspended.
- Users can view only the feedback they personally submitted, plus public replies/statuses attached to it.
- Keep the form usable on desktop, tablet and mobile/PWA browsers.

### Eco-Admin users

- Add **Feedback** to the existing Eco-Admin navigation.
- This opens the **central Feedback Inbox**, available to authorised Feature Admin members and permitted Eco-Admins.
- Include two subsections or tabs:
  - **Inbox** — all feedback, cases and conversations.
  - **Feature Requests** — feature-only filtered view with summary reporting.
- Include a **Feature Admin Team** management page accessible to authorised Eco-Admins (see Section 7).

> **Important:** Standard customer administrators must **not** gain global access merely because they are an admin within their own organisation. Central feedback visibility is a separate, explicitly authorised Eco-Admin permission.

---

## 3. User-facing Feedback form

### Suggested layout

```text
Feedback
Tell us about a problem, suggest a feature or ask a question.

Type of feedback *
( ) Report an Issue   ( ) Feature Request   ( ) General Question

Subject *
[ Short description                                          ]

Description *
[ What happened? What did you expect to happen?              ]
[ For feature requests: what would you like to do, and why? ]
[                                                             ]

Screenshot / image (optional)
[ Paste a screenshot here (Ctrl+V / Cmd+V)                   ]
[ Or drag and drop an image / Choose File                    ]
[ Image preview                                      Remove ]

[ Submit Feedback ]

Your name, email and organisation are linked automatically
from your Inspect360 account.
```

### Fields

| Field | Required? | Details |
|---|---|---|
| Feedback Type | Yes | `Issue`, `Feature Request`, or `General Question`; default to no selection |
| Subject | Yes | Plain text, maximum 150 characters |
| Description | Yes | Multiline plain text, maximum 10,000 characters |
| Screenshot / image | No | Support clipboard paste, drag-and-drop and file picker; allow up to 3 images per submission |
| User ID | Automatic | Logged-in reporter; immutable association |
| User name and email | Automatic | Capture a submission-time snapshot from the authenticated profile |
| Organisation ID and name | Automatic | Capture current active organisation context; handle users with multiple organisations correctly |
| Source page URL | Automatic | Where the user clicked `Feedback` from, if available; do not include tokens or sensitive query parameters |
| Browser / device details | Automatic | Basic browser and OS information if readily available; useful for diagnosing issues |
| Date and time | Automatic | Server-generated timestamp in UTC |

**Do not ask users to re-enter name, email or organisation.**

### Screenshot interactions

1. User takes a screenshot using their device's normal screenshot tools.
2. User clicks into the screenshot drop zone and pastes with **Ctrl+V** on Windows or **Cmd+V** on macOS.
3. The portal detects an image on the clipboard and displays a preview.
4. User can remove the image, paste another, drag and drop an image, or choose a local file.
5. Submission saves images securely and attaches them to the feedback record.

**Implementation notes:**

- Use the browser's `paste` event and `ClipboardEvent.clipboardData.items` for image clipboard content. Accept pasted screenshots even if the clipboard item has no meaningful filename.
- The drop zone should be keyboard accessible, not the only route to upload.
- Restrict uploads to validated **PNG, JPEG and WebP** image content. Default maximum **10 MB per image**, maximum **3 images**. Validate server-side as well as client-side.
- Show image thumbnail, file size where known, upload progress/error and a Remove action.
- Avoid automatic capture of the user's screen. The user intentionally chooses what to paste or upload. A `Capture Screen` button is **not required** for MVP.
- Provide sensible inline errors for missing required fields, unsupported file formats, oversized images and failed uploads.
- Disable repeated submission while saving, with backend idempotency protection where feasible.

### Submission confirmation

After successful submission, show:

> **Thank you for your feedback.**  
> We've received your request and our Inspect360 team will review it and get back to you.  
> **Reference:** FB-000123
>
> You can check updates and replies in **My Feedback**.

Buttons: **View My Feedback** and **Submit Another**.

Do **not** promise a specific response time unless Inspect360 has an operationally agreed SLA.

### My Feedback

Each user sees a simple list:

| Reference | Type | Subject | Status | Last updated |
|---|---|---|---|---|
| FB-000123 | Issue | Inspection photo won't upload | In Review | 14 Nov 2026 |

- Click a row to see the original submission, attachments, public status and conversation thread.
- Allow user to add follow-up messages and additional images (within the same limits) to their own feedback item.
- Only messages explicitly marked **Public Reply** by the Feature Admin team appear to the submitting user.
- Allow status notifications by email; user also sees updates on their feedback detail page.

---

## 4. Central Eco-Admin Feedback Inbox

### Overview page

Show summary counters and a searchable table.

**Summary counters**

- New
- In Review
- Waiting on User
- Resolved / Closed
- Feature Requests (total)

**Table columns**

| Column | Details |
|---|---|
| Reference | Unique case ID, e.g. `FB-000123` |
| Submitted | Date/time |
| Type | Issue / Feature Request / General Question |
| Subject | One-line summary |
| Organisation | Customer organisation |
| Submitted by | Name and email |
| Status | Current case state |
| Assigned to | Feature Admin member, or Unassigned |
| Last activity | Latest message/update |

**Controls:** keyword search by reference, subject, description or submitter; filter by type, status, organisation, assigned person and date range; sort by newest and last activity. Default view: **open requests, newest first**.

### Feedback detail page

Selecting a case opens:

- Reference, creation date, type and current status.
- Subject and full description.
- Screenshot thumbnails; click to view full image securely.
- Submitting user and organisation.
- Original page and basic browser/device metadata (if collected).
- Assigned team member, changeable via dropdown.
- Conversation history in chronological order.
- **Public Reply** editor — visible to the user and sent as a notification.
- **Internal Note** editor — visible only to authorised Feature Admin/Eco-Admin members; **never** exposed to customers or included in customer notifications.
- Status selector and **Save / Send Reply** actions.
- Audit history of administrative changes (assignee, status, type, etc.).

### Statuses

Use this limited status set for MVP:

| Status | Meaning |
|---|---|
| New | Submitted and not yet triaged |
| In Review | Team is investigating, assessing or preparing a response |
| Waiting on User | Team has requested more information |
| Planned | Feature request approved in principle, but not necessarily scheduled |
| Resolved | Issue answered/fixed, question answered, or feature delivered |
| Closed | No further action is planned on this record |

- Every new record starts as **New**.
- An admin can move cases between appropriate statuses and should include a public explanation when a user-impacting decision is made.
- For feature requests, **Planned** is optional and must not be interpreted as a delivery commitment.
- A rejected/deferred feature request can be **Closed**, with an internal rationale and optional public explanation.
- Users can reply to closed/resolved cases; this should reopen the case as **In Review** and notify the assigned admin/team.

### Response workflow example — Issue

1. User submits: **Issue** — “Inspection report images are not appearing.”
2. Case enters the central Inbox as **New**.
3. Feature Admin member assigns themselves and changes it to **In Review**.
4. Admin investigates and sends a **Public Reply**, including troubleshooting steps or a resolution.
5. Admin marks the case **Resolved**; the user is notified.
6. User can reply if the problem persists; the case reopens.

### Response workflow example — Feature Request

1. User submits: **Feature Request** — “Allow bulk downloading of inspection PDFs.”
2. Request is stored in the Inbox and appears in the **Feature Requests** view.
3. Admin tags/assesses it, adds **Internal Notes**, and can assign it to a team member.
4. At the team review, members decide whether to investigate further, mark it **Planned**, or **Close** it.
5. Admin may send a public response acknowledging the decision without promising delivery.
6. If eventually built, admin updates the status to **Resolved** and sends a final message.

---

## 5. Feature Request reporting

In `Eco-Admin > Feedback > Feature Requests`, provide a dedicated filtered view of records whose type is `Feature Request`.

### MVP reporting widgets

- Total feature requests received.
- New feature requests this month.
- Count by status: New, In Review, Planned, Resolved, Closed.
- Count by organisation.
- List of feature requests with subject, description excerpt, date, submitter, organisation, assignee and status.
- Date range and organisation filters.
- **Export CSV** of feature requests and relevant metadata for team review.

### Team decision process

- Feature Admin members can use **Internal Notes** to record evaluation, rationale and next action.
- Team decides which features to build in its normal product planning process.
- **Do not automatically create development tasks or promise a roadmap date.**
- No customer-facing voting, prioritisation scoring, or public roadmap in MVP.

> Future enhancement, not an MVP requirement: duplicate request grouping, popularity counts, product-area tags, roadmap integrations and voting.

---

## 6. Notifications and messaging

### New submission

On successful submission:

1. Persist case and attachments first.
2. Show the in-portal confirmation.
3. Send an email notification to the central Feature Admin team (or preferably a team distribution mechanism that avoids duplicate email chains), containing:
   - Reference, type, subject, organisation and submitter.
   - Short description excerpt.
   - A secure **Open in Eco-Admin** link.
4. Optionally send the submitting user an acknowledgement email containing the reference and link to their request.

### Public admin reply

- Store the reply against the case.
- Notify the submitting user by email with a short message and a secure link to view the full conversation.
- No login-free public access to a case or screenshot.
- Support plain text guidance and safe clickable links in replies; sanitise any rich text/URLs if enabled.

### User follow-up

- Store the new message and attachments.
- Notify the assigned admin and/or central Feature Admin team.
- If a resolved/closed case receives a follow-up, reopen it as **In Review**.

### Notification reliability

- Use the platform's existing transactional email service where possible.
- Email delivery is asynchronous; a temporary email failure must **not** lose or roll back a successfully saved case.
- Record notification success/failure and support retrying failed sends.
- Respect existing email sender-domain and deliverability configuration; never spoof an admin's personal mailbox.

---

## 7. Feature Admin Team — global membership and permissions

Create a centrally managed **Feature Admin Team**. This is a product-support group, not a customer organisation.

### Initial required members

Seed the following email addresses as the default team membership:

1. **wasif.ali@deffinity.com**
2. **nadeem.mohammed@inspect360.ai**
3. **chan.mohammed@inspect360.ai**

### Membership management

In `Eco-Admin > Feedback > Feature Admin Team`:

- Show each member's name/email, access status and added date.
- Allow authorised Eco-Admins to **Add Member** by email.
- Allow authorised Eco-Admins to **Remove Member**.
- Match existing Inspect360 accounts by email. If no account exists, send an invitation through the platform's secure existing invite process; membership becomes active only after account verification/acceptance.
- On activation, grant a dedicated `feature_admin` role or equivalent explicit permission set.
- Allow Eco-Admin to grant/revoke the **Manage Feature Admin Team** permission separately from day-to-day inbox access.
- Prevent accidentally leaving the system with no authorised team manager.
- Do not grant broader Eco-Admin powers simply because someone joins this team.

### Permissions matrix

| Action | Standard portal user | Feature Admin | Authorised Eco-Admin |
|---|:---:|:---:|:---:|
| Submit Feedback | Yes | Yes | Yes |
| View own Feedback | Yes | Yes | Yes |
| View all organisations' feedback | No | Yes | Yes |
| Reply publicly / add internal notes | No | Yes | Yes |
| Update type, status and assignment | No | Yes | Yes |
| View feature-request reporting / export | No | Yes | Yes |
| Add/remove Feature Admin members | No | No* | Yes |

`*` A Feature Admin can manage team membership only if separately granted the relevant explicit permission.

**Enforce every permission on the server/API**, not just by hiding navigation items.

---

## 8. Data model (suggested)

Use existing naming conventions and ORM; the fields below express the required data rather than mandating a specific database design.

### `feedback_requests`

| Field | Purpose |
|---|---|
| `id` | Internal UUID primary key |
| `reference` | Unique human-readable value, e.g. `FB-000123` |
| `type` | `issue`, `feature_request`, `question` |
| `subject` | Title |
| `description` | Original description |
| `status` | `new`, `in_review`, `waiting_on_user`, `planned`, `resolved`, `closed` |
| `reporter_user_id` | Authenticated submitting user |
| `reporter_name_snapshot` | Name at time of submission |
| `reporter_email_snapshot` | Email at time of submission |
| `organisation_id` | Current organisation/tenant |
| `organisation_name_snapshot` | Organisation at submission |
| `source_page` | Safe relative app path, if known |
| `client_context` | Small JSON of browser/OS context, if available |
| `assigned_to_user_id` | Nullable Feature Admin user ID |
| `created_at`, `updated_at` | UTC timestamps |
| `resolved_at`, `closed_at` | Nullable UTC timestamps |

### `feedback_attachments`

- `id`, `feedback_request_id`, `message_id` (nullable for initial submission)
- `uploaded_by_user_id`
- `original_filename`, `mime_type`, `file_size_bytes`
- `private_storage_key` (never a public URL)
- `created_at`

### `feedback_messages`

- `id`, `feedback_request_id`, `author_user_id`
- `body`
- `visibility` = `public` or `internal`
- `created_at`

Original user submission can live on `feedback_requests`; additional messages and replies go in `feedback_messages`.

### `feature_admin_members`

- `id`, `user_id` (nullable until invited/activated), `email`, `membership_status`
- `can_manage_team` (Boolean)
- `invited_by_user_id`, `created_at`, `activated_at`, `removed_at`

### `feedback_audit_events`

- `id`, `feedback_request_id`, `actor_user_id`
- `event_type` (`created`, `assigned`, `status_changed`, `type_changed`, `reply_sent`, `member_changed`, etc.)
- `before_value`, `after_value` (where applicable), `created_at`

### Notifications (reuse existing infrastructure)

Store notification delivery/retry records using the existing platform notification system; do not build a new mail queue solely for Feedback.

---

## 9. Suggested endpoints / application actions

Adapt to the existing Inspect360 API conventions. The following names are illustrative.

**Portal**

- `POST /api/feedback` — create request with metadata and attachments.
- `GET /api/feedback/mine` — paginated requests for authenticated reporter.
- `GET /api/feedback/:id` — detail, only if reporter or authorised global admin.
- `POST /api/feedback/:id/messages` — add user follow-up or authorised admin reply/note.
- `POST /api/feedback/attachments` — authorised upload, validated and linked to a request or temporary upload session.

**Eco-Admin / Feature Admin**

- `GET /api/admin/feedback` — global paginated search and filters.
- `PATCH /api/admin/feedback/:id` — type, status, assignment updates.
- `GET /api/admin/feedback/feature-report` — aggregate feature-request metrics.
- `GET /api/admin/feedback/feature-report/export` — CSV export.
- `GET /api/admin/feedback/team` — member listing.
- `POST /api/admin/feedback/team` — invite/add member.
- `DELETE /api/admin/feedback/team/:memberId` — revoke membership.

**Access rule:** The backend must derive reporter identity and organisation from the authenticated session; **never trust arbitrary `reporter_user_id` or `organisation_id` submitted by the browser**.

---

## 10. Security and privacy requirements

Because screenshots may contain tenants' personal information, treat feedback as sensitive customer data.

- **Private attachments only:** store in private object storage; serve via authenticated access checks or short-lived signed URLs after authorisation.
- **No cross-tenant leakage:** standard users may access their own submissions only. The central Feature Admin team has explicit cross-organisation access.
- **Minimal emails:** avoid embedding screenshots or unnecessarily detailed personal information in email notifications; direct recipients to authenticated portal pages.
- **No automatic screenshot collection.** Pasting/uploading must be initiated by the user.
- **Safe filenames and content:** verify actual image signatures, enforce size/count limits, use generated storage keys, prevent executable content upload and escape/sanitise displayed user text.
- **Server-side RBAC:** protect every read, attachment fetch, export and write route; test direct URL manipulation.
- **Auditability:** record status, assignment, type changes and message authorship.
- **Retention:** follow Inspect360's existing data retention and deletion policy; if no policy exists, agree one before release. Ensure deletion/retention controls cover images and exports.
- **Data minimisation:** do not collect passwords, access tokens, full cookies or request headers; strip sensitive URL query parameters. Show a short hint: “Please avoid including passwords or sensitive personal information in screenshots.”
- **Availability:** core feedback submission must remain functional even if the email provider is temporarily unavailable.

---

## 11. UX states and edge cases

- Empty state: **No feedback submitted yet** + **Submit Feedback** button.
- Inbox empty state: **No requests match these filters** + reset filters.
- Missing screenshot: submission still works.
- Screenshot paste unsupported by a particular browser: file upload remains available.
- User has multiple organisations: save the active organisation at submission; do not allow cross-organisation impersonation.
- User changes or leaves an organisation later: case audit history remains intact; reporter access follows account/security policy.
- Deactivated/deleted reporter account: case should remain visible to the authorised admin team subject to retention policy; never leave public attachment URLs.
- Removed Feature Admin: immediately revoke global Feedback privileges; reassign their open cases or leave as unassigned.
- Two admins update at once: avoid silent overwrites where possible; refresh the latest case state and preserve message history.
- Failed attachment upload: show a clear error and do not claim the image was attached.
- Feature request closed without implementation: communicate clearly that **Closed** does not mean delivered.

---

## 12. Definition of Done / acceptance criteria

### Portal

- [ ] **Feedback** is visible in the standard portal menu for authenticated users.
- [ ] User can submit an Issue, Feature Request or General Question with subject and description.
- [ ] User can paste a screenshot directly into the form using Ctrl+V/Cmd+V.
- [ ] User can drag/drop or browse to attach images, preview and remove them.
- [ ] Image type/size/count validation works client- and server-side.
- [ ] User name, email, organisation, date and safe source page are recorded automatically.
- [ ] Confirmation thanks the user, states that the team will respond, and displays a reference number.
- [ ] User can view only their own requests and public replies in **My Feedback**.
- [ ] User can send a follow-up on an existing request.

### Eco-Admin / Feature Admin

- [ ] Central Inbox lists feedback across all organisations for authorised team members only.
- [ ] Search, filters, assignment and status updates work.
- [ ] Admin can review attachments and conversation history.
- [ ] Admin can send a public reply and add a separate private internal note.
- [ ] Public reply is shown to the reporter; internal notes are never shown to the reporter.
- [ ] Feature Requests view shows summary metrics, filters and CSV export.
- [ ] Team membership defaults to all three specified email addresses (via existing accounts or secure invitations).
- [ ] Authorised Eco-Admin can add/remove Feature Admin members.
- [ ] Removing team membership revokes central access immediately.
- [ ] The team can discuss and record decisions without publishing a roadmap.

### Notifications, privacy and reliability

- [ ] Team receives new submission notifications.
- [ ] Reporter receives public reply notifications.
- [ ] User follow-up alerts assigned admin/team.
- [ ] Email sending failures do not lose successfully submitted feedback.
- [ ] All access controls are enforced server-side, including attachment downloads and CSV exports.
- [ ] Cross-tenant and cross-user access denial tests pass.
- [ ] All admin actions are auditable.

---

## 13. Explicitly out of scope for the first release

Do **not** build these unless separately approved:

- AI chatbot or automatic AI answers.
- Automatically capturing the browser screen.
- Public community ideas board, comments or voting.
- Automated feature prioritisation or development estimates.
- Jira/Trello/GitHub integration.
- Full SLA management, escalations or live chat.
- Customer-visible release roadmap.
- Duplicate feature-request merging and advanced analytics.

These can be considered after actual usage demonstrates a need.

---

## 14. Suggested build order

1. **Data and access controls:** tables, role/permission model, default team seed/invites, attachment security.
2. **Portal:** Feedback menu, form, clipboard paste, upload, confirmation, My Feedback.
3. **Eco-Admin:** Inbox, request detail, filters, assignments, statuses, public replies and internal notes.
4. **Notifications:** initial submission, replies and follow-ups with retry behaviour.
5. **Feature Requests:** reporting overview, CSV export, team membership screen.
6. **QA:** clipboard on Windows/macOS, mobile upload, RBAC, cross-organisation access, email failure, attachment limits.

### Developer delivery request

Implement this feature using the **existing Inspect360 UI design system, authentication, Eco-Admin architecture, storage and email services**. Before building any separate infrastructure, reuse available platform components. Raise only genuine architectural blockers, especially those involving multi-tenant access, admin roles or attachment security.

**Expected result:** Any Inspect360 user can submit screenshot-backed feedback in under a minute, and the central Feature Admin team can manage, respond to and report on every submission without leaving the platform.
