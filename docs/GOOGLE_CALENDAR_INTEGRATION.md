# Optional Google Calendar integration

Manual Meet scheduling operates independently. Calendar OAuth is separate from Firebase sign-in and defaults to disabled. The integration permits one explicitly configured organizer and one designated owned development test calendar. It uses the Calendar scopes for events on owned calendars and read-only calendar list. [Google Calendar OAuth scopes](https://developers.google.com/workspace/calendar/api/auth).

## Owner setup

1. In an approved development Google Cloud project, enable Calendar API and configure OAuth consent with the allowed test account. Create a Web application OAuth client and register the exact loopback callback, typically `http://localhost:3000/api/v1/calendar/callback`. Use only an approved test calendar owned by the organizer and supporting Google Meet. [Google OAuth for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server).
2. In the ignored local environment, configure Calendar client ID and secret, the explicit calendar ID, the authorized development Firebase UID, exact redirect URI, and a random 32-byte key represented as 64 hex characters. Set `GOOGLE_CALENDAR_ENABLED=true` for consent. Keep the key separate from source and database backups. Key replacement requires reconnection.
3. Use the matching loopback browser origin and sign in again to satisfy recent authentication. Open Meetings and authorize. The callback consumes a ten-minute hashed state bound to an HttpOnly SameSite cookie and uses S256 PKCE. Refresh tokens are stored with AES-256-GCM and bound to organizer/calendar. Token values never enter frontend responses or audit events.
4. Once the owner explicitly authorizes event creation for that account/calendar, enable `GOOGLE_CALENDAR_EVENT_WRITES_AUTHORIZED=true` and supply the worker's table-scoped Calendar grant. Use a single test event without attendees. Live verification requires owner authorization. We verified the adapter with mocked Google responses.

## Synchronization and disconnect

A meeting row is the durable desired state, with a revision, worker lease and bounded retries. The event ID remains stable across retries. Conference creation uses a unique request ID, `conferenceDataVersion=1` and `hangoutsMeet`. Worker reads first, recovers ambiguous insert conflicts, and writes only when the associated provider event ID and IntelliCore private meeting marker agree. Pending conferences are polled and returned video links are format validated. No Calendar attendee lists are sent. The adapter refuses writes to events with externally added attendees or recurring instances. [Google event and conference creation](https://developers.google.com/workspace/calendar/api/guides/create-events).

Disconnect invalidates the local token and any pending consent starts. The dashboard reports whether the provider revocation succeeded. If it failed, the organizer can remove the grant in their Google Account. The dashboard keeps local meeting history. A remote synchronization failure stays visible until addressed or retried.
