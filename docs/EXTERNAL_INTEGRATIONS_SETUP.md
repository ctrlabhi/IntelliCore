# External integrations setup guide

## 1. Firebase Authentication Setup

IntelliCore uses Firebase strictly for user authentication and Google Sign-in. All roles, permissions, and business records reside in MySQL.

### Development Configuration (`intellicore-dev`)
1. Create a Firebase project named `intellicore-dev` in the Google Cloud Console.
2. Enable **Authentication** -> **Sign-in method** -> **Google**.
3. Generate a Service Account Private Key:
   - Navigate to **Project Settings** -> **Service accounts**.
   - Click **Generate new private key**.
   - Save the key file to `secrets/firebase-service-account.json`.
4. Configure `.env`:
   ```ini
   FIREBASE_PROJECT_ID=intellicore-dev
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@intellicore-dev.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

> [!WARNING]
> Never use production Firebase project `intellicore-229` credentials in local development or test suites.

---

## 2. Email & Notification Subsystem (SMTP)

IntelliCore incorporates a background email worker with retry management and template rendering.

### Development Mode (CAPTURE)
By default, the application runs in `CAPTURE` mode:
```ini
EMAIL_MODE=CAPTURE
```
In capture mode:
- Emails are validated and rendered into the `email_outbox` table.
- Status is immediately set to `CAPTURED`.
- Zero outbound network calls are made to external SMTP servers.

### Production SMTP Mode (LIVE)
For production deployment with approved mailbox:
```ini
EMAIL_MODE=LIVE
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@intellicore.org
SMTP_PASS=app-specific-password
SMTP_FROM="IntelliCore Platform <notifications@intellicore.org>"
```

---

## 3. Google Calendar & Google Meet Integration

### Manual Meet Links (Default & Zero-Dependency)
- Organizers can input standard Google Meet URLs (`https://meet.google.com/xxx-yyyy-zzz`) directly when scheduling meetings.
- No Google Cloud OAuth verification or calendar scopes are required for manual links.

### Automated Calendar Synchronization (Optional)
To enable automated meeting generation and synchronization:
1. Configure OAuth 2.0 Web Application client in Google Cloud Console.
2. Add authorized redirect URI: `http://localhost:3000/api/v1/integrations/google/callback`.
3. Add scopes: `https://www.googleapis.com/auth/calendar.events`.
4. Configure `.env`:
   ```ini
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/integrations/google/callback
   ```
