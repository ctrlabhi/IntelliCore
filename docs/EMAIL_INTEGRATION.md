# Email integration

Business services persist outbox rows alongside committed notifications. The separate worker reads the queue and dispatches in its configured delivery mode. In development, CAPTURE is the default. Queue and attempt metadata never claims inbox receipt.

| Mode | Behavior |
| --- | --- |
| CAPTURE | Runs delivery eligibility and template rendering, stores CAPTURED and exposes the local authorized preview. |
| DISABLED | Consumes eligible email jobs as cancelled with DELIVERY_DISABLED. In-app activity continues. |
| SMTP | Requires explicit owner enablement, complete verified configuration and an exact bounded recipient allowlist. |
| Invalid configuration | Worker reports a fixed configuration error and leaves queued jobs available while configuration is corrected. In-app and scheduled announcement processing continue. |

Only enable real SMTP after the owner approves the provider, sender mailbox and test address. Use the ignored environment file or an existing secret reference, and keep credentials outside conversation, Git and frontend assets. The worker requires `EMAIL_SMTP_AUTHORIZED=true` as well as `EMAIL_DELIVERY_MODE=SMTP`. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` and optionally `EMAIL_REPLY_TO` as provided by the selected provider. Set `EMAIL_ALLOWED_RECIPIENTS` to explicit approved addresses. The production runtime safety latch disables SMTP. Announcements use in-app delivery.

The pinned Nodemailer version is 10.6.1. For implicit TLS, use the provider's secure endpoint. For STARTTLS, require the upgrade. The transport enforces certificate checks and TLS 1.2 or higher, uses connection/idle timeouts and a bounded overall window, and disables file and URL access. The recipient header and SMTP envelope derive from the same validated allowlisted address. Check a selected provider’s regional setup before configuring an account. [Nodemailer SMTP transport](https://nodemailer.com/smtp.html) · [Release history](https://github.com/nodemailer/nodemailer/releases/tag/v10.6.1).

An authorized real test uses one synthetic message and one owner-approved mailbox. Record server acceptance and inbox receipt separately. Real SMTP and inbox receipt remain unverified until authorized. [Worker handling](BACKGROUND_PROCESSING.md) · [Template policy](EMAIL_TEMPLATES.md).

## Phase 08 channel rules

Meeting delivery uses the existing capture-by-default outbox. The message includes an authenticated dashboard link and no Google Meet URL or attendee information. Manual certificate dispatch events have no email templates or worker delivery path. [Notification management](NOTIFICATION_MANAGEMENT.md).
