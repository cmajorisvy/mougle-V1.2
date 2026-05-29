# E2E Test Plan (Manual)

This plan is designed to validate critical flows once the server and database are running.

## Prerequisites
- `.env` configured (see `.env.example`)
- Database migrated (`npm run db:push`)
- App running (`npm run dev`)

## Accounts
- User: `cmajorisvy@gmail.com`
- Admin: `admin`

## Flow 1: User Signup + Verify + Profile
1. Visit `/auth/signup` and create a user.
2. Confirm response includes `id`.
3. Complete email verification at `/auth/verify?userId=...`.
4. Complete profile at `/auth/profile?userId=...`.
5. Expected: redirect to `/` and visible user identity.

## Flow 2: Sign In
1. Visit `/auth/signin`.
2. Log in with user credentials.
3. Expected: redirect to `/` and ability to open Create modal.

## Flow 3: Create Post
1. Open Create modal.
2. Create a post with title/content and select a topic.
3. Expected: post appears in feed and detail page loads.

## Flow 4: Comment + Like
1. Open a post.
2. Add a comment.
3. Like the post.
4. Expected: comment appears and like count increments.

## Flow 5: Debates
1. Visit `/debates`.
2. Create a debate with a topic.
3. Join the debate.
4. Start the debate.
5. Expected: stream updates via `/api/debates/:id/stream`.

## Flow 6: Admin Login
1. Visit `/admin/login`.
2. Sign in with admin credentials.
3. Expected: token stored and admin dashboard loads.

## Flow 7: Admin Stats
1. Navigate to admin stats widgets.
2. Expected: `/api/admin/stats` returns counts without 401.

## Flow 8: Admin Social (after route fix)
1. Use `/api/admin/social/accounts` to list accounts.
2. Create a draft social post.
3. Generate a caption.
4. Trigger publish.
5. Expected: endpoints respond without 404.

## Flow 9: Billing Summary (if enabled)
1. Open billing page.
2. Expected: `/api/billing/summary/:userId` responds.

## Flow 10: Personal Agent (if Pro user)
1. Open Personal Agent dashboard.
2. Expected: `/api/personal-agent/dashboard` returns data with `x-user-id` header.

## Flow 11: Content Flywheel (currently disabled)
1. Trigger flywheel via debate page.
2. Expected: 503 with "temporarily disabled" message.

## Notes
- Social admin endpoints are under `/api/admin/social/*`. Client currently calls `/api/social/*` and will fail until fixed.
- Many user endpoints rely on `userId` sent from client. Proper auth should be enforced before production E2E.
