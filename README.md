# TFPS Selections Portal

Recruitment & selection web app for the Technology Filmmaking and Photography Society, IIT Kharagpur.
Next.js 14 + Tailwind + Supabase (Postgres, Realtime).

## Pages

| Route | Who | What |
|---|---|---|
| `/` | Public | Landing page |
| `/register` | Public | Fresher onboarding form (roll no = primary key) |
| `/submit` | Public | Post-interview task submission (links, keyed by roll no) |
| `/login` | Internal | Crew login (shared password per role) |
| `/panels` | Admin | Create/pause/close panels, assign & bench panelists |
| `/distribute` | Crew | Enter roll no → panels ranked by domain match → queue / shift / remove |
| `/panel/[id]` | Crew | Interview workspace: candidate details, live feedback, score, R/Y/G tag, task assignment |
| `/review` | Crew | Review board: card & sheet modes, profile modal, multi-evaluator scoring, final R/Y/G tag, CSV export + Green shortlist export |

Panels, queues and panel status sync in real time across devices.

## Passwords (change these!)

Stored in the `access_keys` table in Supabase (Dashboard → Table Editor → access_keys):
- admin: `tfps-admin-2026`
- panelist: `tfps-panel-2026`

## Run locally

```bash
npm install
npm run dev
```

`.env.local` is already configured with the Supabase URL + anon key.

## Deploy (free)

1. Push this folder to a GitHub repo.
2. Import it at vercel.com → add the two env vars from `.env.local`.
3. Done — share the URL with freshers.

## Security note

Internal pages are gated by a shared password checked server-side (RPC), but the
database policies are permissive for simplicity (like your old shared Google Sheet).
Change the passwords each year and don't share the Supabase keys publicly.

Supabase project: `tfps-selections` (ap-south-1) — https://supabase.com/dashboard/project/miljcxteepuqbphjzfug

## Email OTP login (setup once)

Login flow: member enters roll number → OTP is emailed to their address on file (password remains as fallback).
Two things to configure in the Supabase dashboard (https://supabase.com/dashboard/project/miljcxteepuqbphjzfug):

1. **Auth → Emails → Magic Link template**: replace the link with the code — set the body to include `{{ .Token }}` (e.g. "Your TFPS login code: {{ .Token }}").
2. **Auth → SMTP settings**: the built-in mailer only sends ~2 emails/hour — far too few for selection day. Connect a free SMTP provider (e.g. Brevo, free 300 emails/day): create a Brevo account, get SMTP credentials, paste them here.

Members without an email on file (87 of them right now) can still use the shared password; admins can add emails on the Members page.
