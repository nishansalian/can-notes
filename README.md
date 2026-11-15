# Can Notes

A college materials space with independent classrooms, teacher accounts, private storage and link-only student access.

## What's in this foundation

- Teacher sign-in accepts username or email and password. Supabase Auth stores and checks passwords; this app never stores them.
- Teacher invitations go to the teacher's email so they can set a password. The username is used for later sign-in, while email stays available for recovery.
- One teacher dashboard lists every classroom membership across four academic years and all branches/sections.
- Each classroom owns its subjects. Subjects can contain nested folders and uploaded files.
- Classroom memberships determine teacher access and content permissions.
- College admins can create, edit and delete classrooms, invite teachers by email with upload/content permissions, create one-time teacher join codes, and rotate classroom student links.
- Students have no account. The current classroom link grants view/download access to that room. Forwarded links work for whoever receives them. Rotating the link blocks new use of the old link.
- Files live in a private Supabase Storage bucket. Teacher uploads/downloads are checked by Storage RLS; student downloads use a one-minute signed URL issued by an Edge Function.
- No service-role key is included in the frontend.

This is a functional starting point. A Supabase project must be connected and the SQL/functions deployed before real accounts and uploads work.

## 1. Install and run locally

Use Node.js 20.19+ or 22.12+ and npm 10+ (or a compatible package manager).

```sh
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and anon/publishable browser key.
npm install
npm run dev
```

`.env.local` values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

The browser key is designed to be public. Database permissions and Storage RLS are the security boundary. Do not add a `service_role`, secret, or database password to any `VITE_` variable.

## 2. Create and configure Supabase

1. Create a Supabase project and copy its Project URL and anon/publishable key into `.env.local`.
2. In **SQL Editor**, run `supabase/migrations/202611150001_team_prism.sql`, then `supabase/migrations/202611150002_teacher_classroom_full_access.sql`.
3. In **Authentication → URL Configuration**, add the local development URL (usually `http://localhost:5173`) to allowed redirect URLs. Add the final website URL before publishing.
4. Create the initial admin user from **Authentication → Users** and invite their college email.
5. After that user accepts the invitation and signs in once (so the profile trigger runs), copy their Auth user UUID and run:

```sql
update public.profiles set role = 'admin' where id = 'PASTE_AUTH_USER_UUID_HERE';
```

The first administrator is promoted manually so an anonymous visitor cannot grant themselves admin permissions. Teachers can create classrooms, invite or share join codes with colleagues, and fully manage classrooms they join. College admins retain access across all classrooms.

## 3. Deploy Edge Functions

Install and log in to the Supabase CLI, link this folder to the project, then deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy classroom-admin
supabase functions deploy teacher-login --no-verify-jwt
supabase functions deploy student-access --no-verify-jwt
```

`classroom-admin` verifies the signed-in user's session and allows classroom managers to manage only classrooms they have joined; college admins can manage all classrooms. The login and student-link endpoints are public by design; they validate credentials or a high-entropy classroom token server-side. Teacher sign-in failures are rate-limited by source address.

Set the public website's origin for invitation callbacks (for local work use `http://localhost:5173`; change it to the website URL before publishing):

```sh
supabase secrets set APP_URL=http://localhost:5173
```

Supabase supplies its project URL and service-role secret to Edge Functions. If the CLI/local setup does not provide the legacy variable names, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as function secrets using the values shown in your Supabase project. Never paste the service-role value into `.env.local` or the browser.

## 4. First use

1. Sign into the promoted admin account.
2. Create a classroom for a year, branch and section (for example, `1st Year`, `CSE`, section `1`).
3. Open it and add its subjects.
4. Choose **Manage access** to invite a teacher by email or create a one-time teacher code.
5. Choose **Manage access → Create or rotate the student link** and share it with that classroom's students.
6. A teacher accepts an email invite or enters a teacher code after signing in. They can then upload to classrooms where their membership permits it.

The student link is a bearer link: anyone it is forwarded to can view and download that classroom's materials. Rotation disables the previous link for future requests. A signed download URL already issued to a student remains valid for up to one minute.

## Data and security notes

- `profiles`, `classrooms`, `classroom_members`, `subjects`, `folders`, `materials`, invites and student links all have RLS enabled.
- Student links are stored as SHA-256 hashes; only an admin Edge Function can create or rotate one.
- Teacher invite codes are single-use, expire in 14 days and are stored as hashes.
- Student browsing is scoped to exactly one classroom by the link token. Public file access is never enabled on the Storage bucket.
- File uploads are capped at 50 MiB by the bucket configuration.
- Supabase's Auth invite and recovery emails require email delivery configuration for reliable real-world use.

## Current limits

The admin can create, edit and delete classrooms, invite teachers with upload/content permissions, create teacher join codes, and rotate student links. Teachers with content-management permission can rename/delete materials and remove nested folders from their classroom. Manage access also lets admins update each teacher's permissions or remove them from a classroom. Managing link expiry from the UI is a follow-up item.
