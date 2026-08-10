# Backups

Automatic snapshots of the Supabase database, run by `pg_cron` inside the database itself.

> **Why this exists:** the Supabase org is on the **Free plan**, which has no managed
> backups and no point-in-time recovery. Without this, there is nothing to restore from.

## Schedule

All cron expressions are **UTC**; IST is UTC+5:30.

| Job | Cron (UTC) | Runs (IST) | Kind |
|---|---|---|---|
| `tfps_backup_evening_start` | `30 11 * * *` | 5:00 pm | rolling |
| `tfps_backup_evening` | `0,30 12-20 * * *` | 5:30 pm → 2:00 am, every 30 min | rolling |
| `tfps_backup_daytime` | `30 6 * * *` | 12:00 pm | daily |

## Retention

Enforced by `backups.prune()`, which runs immediately after every snapshot.

- **rolling** — only the **2 most recent** are kept
- **daily** — kept for **7 days**
- **manual** — never auto-deleted; delete by hand when you don't need it

The daily anchor is what protects you from a mistake noticed late. The two rolling
copies only cover roughly the last hour of the evening session.

## Everyday use

```sql
-- what backups exist right now
select * from backups.catalog;

-- take one by hand before something risky (bulk import, mass delete)
select backups.take_snapshot('manual', 'before re-importing the spreadsheet');

-- look inside a snapshot without changing anything
select jsonb_pretty(backups.peek('<snapshot-id>', 'public.members'));
```

## Restoring

`restore_table` **deletes every current row** in the target table and replaces it with
the snapshot copy. It refuses to run unless you pass `p_confirm => true`. It is atomic —
if the insert fails, the delete rolls back with it.

```sql
-- 1. find the snapshot you want
select id, taken_at_ist, kind, row_counts from backups.catalog;

-- 2. check it actually holds what you expect
select jsonb_array_length(backups.peek('<snapshot-id>', 'public.members'));

-- 3. restore
select backups.restore_table('<snapshot-id>', 'public.members', p_confirm => true);
```

**Restore order matters.** Children reference parents, so restore parents first:

```
members ─┐
         ├─> panelists (also needs panels)
panels ──┘
candidates ──> queue_entries, interviews, evaluations, task_submissions
interviews ──> interview_feedback
```

Restoring a child before its parent will fail the foreign key check and roll back
harmlessly — but you'll save time by going in the right order.

## What is and isn't covered

**Covered:** every table in `public` — members, panels, panelists, candidates,
queue_entries, interviews, interview_feedback, evaluations, task_submissions, access_keys.

**Reference only:** `auth.users` is stored as id/email/created_at/last_sign_in_at.
Password hashes and refresh tokens are deliberately excluded — copying them into another
schema widens the blast radius of a leak for no recovery benefit. `restore_table` blocks
`auth.*` on purpose. Users log in by email OTP and can simply sign in again.

**Not covered:**

- **Loss of the whole project.** Snapshots live in the same database they back up. If the
  project is deleted or the database is lost, the backups go with it. This protects against
  accidental deletes and bad edits — the realistic risk — not against disaster.
- **Free-tier pausing.** Free projects pause after ~7 days of inactivity, and `pg_cron`
  does not run while paused. Snapshots resume when the project wakes.
- Schema/DDL changes, Storage objects, and Edge Functions (there are currently none of
  the latter two).

For off-site safety before a high-stakes session, take a manual snapshot and export it:

```sql
select tables from backups.snapshots where id = '<snapshot-id>';
```

Save the JSON somewhere outside Supabase.

## Admin

```sql
-- confirm the jobs are registered and active
select jobname, schedule, active from cron.job where jobname like 'tfps_backup%';

-- recent run history (did it actually fire?)
select j.jobname, d.start_time, d.status, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname like 'tfps_backup%'
order by d.start_time desc limit 20;

-- pause / resume
update cron.job set active = false where jobname like 'tfps_backup%';
```

Everything lives in the `backups` schema, which is not exposed through the API and has all
privileges revoked from `anon` and `authenticated`.
