# Authentication And SMS Provider Handoff

Last reviewed: 2026-08-11

## Current State

- Accounts use a unique username, phone number and password.
- Registration currently validates managed beta invites stored in D1. The
  seeded compatibility code `ABCD123` can be disabled from `/admin`.
- The SMS fields are deliberately disabled placeholders.
- Password changes exist for signed-in users.
- Password recovery by phone is not implemented.

Managed invites must remain server-side and must not be replaced by a
source-code constant in a public release. This document defines the SMS
integration contract for the deployment or authentication agent after the
owner supplies provider credentials.

## Target Registration Policy

Make registration policy server-configurable:

```text
REGISTRATION_INVITE_MODE=required|optional|off
```

- `required`: private beta. A valid server-side invite and a verified phone are
  both required.
- `optional`: a verified phone is required; an invite may attach attribution or
  beta access but does not block registration.
- `off`: a verified phone is sufficient. This is the expected public setting.

Do not replace managed invites with another literal in application code. The
existing D1 invite table already tracks usage limits, expiration, creator,
enable state and claims. During SMS cutover, preserve that management UI and
make its requirement depend on the registration policy.

If the owner chooses to launch without SMS during a private beta, use
`required` mode with a secret stored in the platform secret manager. This is a
temporary beta arrangement, not the final public design.

## Provider Boundary

Keep the provider behind one server-only adapter:

```ts
type SmsPurpose = "register" | "password_reset";

type SmsProvider = {
  sendCode(input: {
    phone: string;
    code: string;
    purpose: SmsPurpose;
    requestId: string;
  }): Promise<{ providerMessageId: string }>;
};
```

Provider SDKs, access keys, signatures and template IDs must stay inside this
adapter. API routes and the browser must not depend on a provider-specific
response shape.

Suggested generic secret names are:

```text
SMS_PROVIDER
SMS_ACCESS_KEY_ID
SMS_ACCESS_KEY_SECRET
SMS_SIGN_NAME
SMS_TEMPLATE_REGISTER
SMS_TEMPLATE_PASSWORD_RESET
SMS_REGION
```

The actual agent may map these to the selected provider. Never expose any of
them through `VITE_` variables, client JSON, logs or health responses.

## Verification Flow

### Request A Code

`POST /api/auth/sms/request`

Input: phone and purpose. The server normalizes the phone, applies shared D1
rate limits by IP and phone, creates a random code, stores only a keyed hash and
sends the clear code through the provider.

The response returns a `challengeId`, expiry and resend delay. It never returns
the code or provider credentials. Use the same outward response for existing
and unknown phone numbers during password recovery.

### Verify A Code

`POST /api/auth/sms/verify`

Input: challenge ID and code. Verification increments the attempt counter in an
atomic D1 update. On success, issue a short-lived, one-use verification ticket
whose hash is stored in D1.

### Consume The Ticket

Registration and password-reset routes accept the one-use ticket. In one
transactional operation they verify purpose/phone/expiry, mark it consumed and
perform the account change. A raw SMS code must not be accepted by the final
registration route.

## Required Data

Add versioned migrations for:

- `sms_challenges`: challenge ID, normalized phone, purpose, code hash, expiry,
  attempt count, resend time, provider message ID, consumed time and request
  metadata.
- `phone_verification_tickets`: token hash, phone, purpose, expiry and consumed
  time.
- Preserve and extend the existing `beta_invites` and `beta_invite_claims`
  tables rather than creating a second invitation system.
- `user_phone_verifications`: user, phone, verified time and provider label.

Keep phone numbers out of application logs and moderation exports.

## Abuse And Failure Rules

- Enforce resend cooldown, hourly phone limits, IP limits and a maximum number
  of code attempts.
- Codes expire quickly and cannot be reused across purposes.
- A provider timeout must not create an apparently successful challenge.
- Return a retryable neutral message for provider outages.
- Record request IDs and provider message IDs, never codes or keys.
- Prevent one verified phone from creating unlimited accounts unless the owner
  explicitly changes that policy.

## UI Changes At Cutover

1. Enable the SMS input and resend countdown.
2. Keep validation errors inside the authentication dialog.
3. Hide the invite input when mode is `off`.
4. Mark it optional when mode is `optional`.
5. Add a password-recovery path using `password_reset` verification.
6. Provide clear expired-code, too-many-attempts and provider-unavailable states.

## Agent Acceptance Checklist

- SMS secrets exist only in the production secret store.
- The shared source-code invite is removed.
- All three invite modes have API and UI tests.
- Registration consumes a verified one-use ticket.
- Duplicate username and phone rules still work.
- Password recovery does not reveal whether a phone exists.
- Request, verify and consume operations are rate-limited and replay-safe.
- Provider errors are redacted from browser responses and logs.
- A real phone completes registration and password recovery in production.
- The deployment report states the selected invite mode.
