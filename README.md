# Split

Split shared flat expenses: who paid, who owes, what's settled, and what changed. It's a mobile-first web app that installs to your home screen (PWA).

**Stack:** Next.js 16 (App Router), Tailwind CSS 4, Supabase (Postgres, Auth, Storage), deployed on Vercel. Free tiers cover a 5-person flat.

## Features

**v1**
- Add an expense in about 3 taps: amount → category → Save. By default you're the payer, it's split equally with everyone, and the date is today.
- Split options: equally, by exact amounts (with a live "₹X left to assign" counter), or by shares (2:1:1). Paise left over from rounding go to the payer.
- Paid / unpaid status for each person's share. Either the person who owes or the person who paid can flip it.
- Settle up: marks every share between you and a flatmate paid in one tap. The UPI button opens GPay or PhonePe with the amount filled in.
- Change history: an append-only audit log written by database triggers. It records creates, edits (old → new values), payer changes, paid/unpaid, deletes and restores. Nobody, not even the app, can edit or delete it.
- Soft delete with restore (Activity → Deleted).
- Invite link to add flatmates. Admins can reset it.

**v2**
- Visibility for each expense:
  - **Everyone**: the whole group sees it.
  - **Only involved**: the payer, the people in the split, and anyone you add.
  - **Just me**: personal spending tracking. It's private and never split.
- Personal stats by day, week, month and year:
  - Your share vs what you paid
  - Category breakdown
  - Trend chart
  - Comparison with the previous period
- Receipt photos: compressed in the browser to about 100–200 KB WebP and stored in a private bucket. They're readable only by people who can see the expense.
- Recurring expenses (rent, wifi, maid): added automatically by a daily Vercel Cron job.
- Push notifications: "Ravi added ₹1,200 · your share ₹240". Uses Web Push; free, no third-party service.
- Installable PWA with an offline fallback page. Dark mode follows the system setting.
- Multiple groups (flat, trip, office), with a group switcher on the home screen.

## Security model

- **Reads:** clients read data only through Row Level Security policies.
- **Writes:** every write goes through `SECURITY DEFINER` SQL functions that check membership and validate input. Splits must add up to the amount, and participants must be group members. Direct `INSERT`/`UPDATE`/`DELETE` on the tables is revoked.
- **Validation:** server actions validate input again with Zod.
- **Money:** stored as integer paise (`bigint`), so there are no floating-point errors.
- **Secret key:** `SUPABASE_SECRET_KEY` is used only on the server, by the cron job and the push sender.
- **Tests:** `supabase/migrations/0001_init.sql` was tested with 52 checks covering RLS, validation, history, balances, recurring and storage.

## Setup (about 15 minutes)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com). Pick the region closest to you (Mumbai for India).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and click **Run**.
3. Under **Authentication → Sign In / Providers → Email**, make sure Email is enabled.
4. Under **Authentication → Email Templates → Magic Link**, add the code to the template so people can type it on their phone:
   ```html
   <h2>Your Split sign-in code</h2>
   <p>Your code: <strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```
5. Under **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel URL.
   - Add `https://YOUR-APP.vercel.app/auth/confirm` and `http://localhost:3000/auth/confirm` to the redirect URLs.
6. **Recommended:** Supabase's built-in email sender only allows a few emails per hour. Under **Authentication → SMTP Settings**, use [Resend](https://resend.com) (free: 3,000 emails/month) or any SMTP provider.
7. Under **Project Settings → API Keys**, copy:
   - the project URL
   - the **publishable** key
   - the **secret** key

### 2. Local development

```bash
cp .env.example .env.local   # fill in the values
npx web-push generate-vapid-keys   # paste into the VAPID_* vars
npm install
npm run dev
```

### 3. Deploy to Vercel

1. Push this repository to GitHub, then go to [vercel.com/new](https://vercel.com/new) and import it.
2. Add every variable from `.env.example` under **Settings → Environment Variables**:
   - Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL.
   - Set `CRON_SECRET` to a long random string.
3. Deploy. `vercel.json` registers the daily recurring-expense job (00:30 UTC = 6:00 IST). The Hobby plan allows one run per day, which is all this needs.

### 4. Invite the flat

Sign in, create the group, then go to **Settings → Share link**. Each person opens the link, signs in with their email, and enters their name. Ask everyone to:
- add their **UPI ID** so others can pay them in one tap
- use **Add to Home screen**
- turn on **Notifications** in Settings (on iPhone this works only after adding the app to the home screen)

## Costs

| Service | Free tier | Usage for 5 people |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth | tiny |
| Supabase Free | 500 MB DB, 1 GB storage, 50k monthly users | ~5–10k receipts fit in 1 GB |
| Resend | 3,000 emails/mo | a handful of sign-ins |

Supabase pauses free projects after 7 days without activity; daily use keeps it awake. The Vercel Hobby plan is for non-commercial use, so you'd need Pro if this becomes a public product.

## Project layout

```
supabase/migrations/0001_init.sql   schema, RLS, triggers, SQL functions, storage policies
src/proxy.ts                        session refresh + auth redirect (Next 16 "proxy", formerly middleware)
src/app/(app)/                      signed-in pages: home, activity, stats, settings, recurring, expenses
src/app/actions/                    server actions (Zod-validated) → Supabase RPCs
src/components/expense-form.tsx     add/edit form (the 3-tap flow)
src/lib/money.ts                    paise formatting, split maths, debt simplification, UPI links
public/sw.js                        service worker: push + offline page
```
