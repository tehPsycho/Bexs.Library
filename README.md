# Bex's Library

A private, Supabase-backed reading tracker with a library-card login, review catalogue, and CSS 3D shelf. This repository replaces the original public landing page and Little Free Library map.

## Features

- **Library-card sign in:** members authenticate with the full email address and password attached to their Supabase account.
- **Private collections:** every book belongs to its authenticated user. The title and author are searchable columns; flexible details (status, rating, ISBN, cover, and review) live in `metadata` as JSONB. The owner's username is stored alongside each record.
- **Review cards and 3D room:** saved reviews appear in the main collection and every title becomes a clickable book spine in the CSS-perspective library.
- **Row Level Security:** members can only read and change their own profile and books. The publishable browser key is intentionally public; never use a service-role key in this site.

## Supabase setup

The project URL and publishable key are already in `config.js`. Install and link the CLI, then apply the included schema:

```bash
npm install --global supabase
supabase login
supabase link --project-ref dsrafdzgjsogopracizc
supabase db push --include-all
```

You can paste `supabase/schema.sql` into **Supabase Dashboard → SQL Editor → New query → Run**. The schema is rerunnable: it drops and recreates its named RLS policies, avoiding “policy already exists” errors after a partial or previous run. For a CLI migration instead:

```bash
supabase init
supabase migration new library_schema
cp supabase/schema.sql supabase/migrations/*_library_schema.sql
supabase db push
```

In **Authentication → Providers → Email**, enable email/password. Create a member with their full email address from the dashboard (**Authentication → Users → Add user**) and select **Auto Confirm User**, or use the Management API/service key from a trusted terminal:

```bash
export SUPABASE_URL='https://dsrafdzgjsogopracizc.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='copy-only-to-your-private-shell'
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"bex@example.com","password":"choose-a-strong-password","email_confirm":true,"user_metadata":{"display_name":"Bex","avatar_url":"https://example.com/bex.jpg"}}'
unset SUPABASE_SERVICE_ROLE_KEY
```

The database trigger keeps using the portion before `@` as the internal `profiles.username`; members nevertheless sign in with their complete email address. The service-role key bypasses RLS, so it must never be committed, sent to the browser, or placed in `config.js`.

### Updating an existing database

Authentication already stores full emails in `auth.users`, so no account or data rewrite is required. Run the included update once to remove the obsolete anonymous member-name lookup function:

```bash
psql "$DATABASE_URL" --file supabase/full-email-login.sql
```

The complete SQL update is also safe to paste into **Supabase Dashboard → SQL Editor**. Removing this function ensures the deployed database matches the new direct email/password login flow.

## Local development

The app has no build step. Serve it over HTTP so browser modules and Supabase requests behave consistently:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The hosted Supabase project must have `http://localhost:8080` and the production URL in **Authentication → URL Configuration → Redirect URLs**.

## `books.metadata` contract

`books.title` and `books.author` remain top-level columns so catalogue queries can
search and sort them without inspecting JSON. `author` is the predictable display
value made by joining the ordered `metadata.authors` array with `, `; the array is
the canonical representation and preserves multiple authors.

The application treats the following JSONB shape as a stable contract. Writers
emit every key, including empty values, and readers apply the shown defaults when
loading older or incomplete rows.

```json
{
  "user_id": "authenticated-user-uuid",
  "username": "bex",
  "title": "The Left Hand of Darkness",
  "author": "Ursula K. Le Guin",
  "metadata": {
    "subtitle": "",
    "authors": ["Ursula K. Le Guin"],
    "isbns": ["9780441478125"],
    "publishers": ["Ace Books"],
    "publishedDate": "1987-03-15",
    "pageCount": 304,
    "subjects": ["Science fiction"],
    "synopsis": "An envoy visits the planet Gethen.",
    "cover_url": "https://example.com/cover.jpg",
    "coverOptions": ["https://example.com/cover.jpg"],
    "source": "Open Library",
    "isRead": true,
    "startedDate": "2026-01-02",
    "finishedDate": "2026-01-12",
    "rating": 5,
    "review": "A lasting favorite.",
    "shelfSlot": 3,
    "addedAt": "2026-01-01T12:00:00.000Z",
    "translatedSynopsis": false,
    "render": {
      "spineColor": "#7b2e3b",
      "pageColor": "#f5ead7",
      "sizeCategory": "medium",
      "thicknessCategory": "regular"
    }
  }
}
```

| Key | Type | Safe default |
| --- | --- | --- |
| `subtitle`, `publishedDate`, `synopsis`, `cover_url`, `source`, `startedDate`, `finishedDate`, `review` | string | `""` |
| `authors`, `isbns`, `publishers`, `subjects`, `coverOptions` | array of strings | `[]` |
| `pageCount` | number or null | `null` |
| `isRead` | boolean | `false` |
| `rating` | number from 0 through 5 | `0` |
| `shelfSlot` | non-negative integer or null | `null` |
| `render` | object | `{}` |
| `addedAt` | ISO-8601 timestamp string | `""` (database rows fall back to `created_at`) |
| `translatedSynopsis` | boolean | `false` |

Reading dates use ISO-8601 date strings (`YYYY-MM-DD`) when known. `render` is an
extensible object owned by the 3D renderer and currently holds dimensions,
spine/page colors, and size/thickness categories. The browser maps database
`cover_url` to the renderer's `coverUrl` property and derives its primary `isbn`
from the first member of `isbns`.

### Legacy row normalization

Rows written by the original root `script.js` may contain only `status`,
`rating`, `isbn`, `cover_url`, and `review`. On read, the application wraps the
legacy `isbn` in `isbns`, obtains `authors` from the top-level `author`, supplies
all defaults above, and translates a case-insensitive `status` value of `Read`
to `isRead: true`. Other legacy status strings remain unread (`false`). New saves
always use `isRead`, `isbns`, and the complete contract rather than rewriting the
legacy aliases.

## Deployment

This remains a static site and can be published with GitHub Pages. Apply the database schema first, add the deployed origin to Supabase's URL configuration, then deploy the repository root. `CNAME` retains the custom-domain configuration.

## Clean setup and blank-page recovery

The root page is the deployable application. Do not publish `library render/` as the
site root; that directory only redirects back to the repository root. The startup
sequence is `index.html` → Supabase/configuration → `script.js` → `app.js` →
`room.js`. If a dependency cannot load, the sign-in card now remains visible and
shows a useful error instead of leaving the `auth-loading` screen blank.

### 1. Create or reset Supabase

1. Create a Supabase project and save its **Project URL** and **Publishable key**
   from **Project Settings → API**. A legacy `anon` key also works, but never use
   the `service_role`/secret key in this repository.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. The script
   creates `profiles` and `books`, enables RLS, installs owner-only policies, and
   adds the trigger that creates a profile for each new Auth user.
3. In **Authentication → Providers → Email**, enable Email/Password. For a private
   library you can disable public sign-ups; accounts created by an administrator
   still work.
4. In **Authentication → URL Configuration**, set the Site URL to
   `https://bexslibrary.com` and add both `https://bexslibrary.com/**` and
   `http://localhost:8080/**` as redirect URLs.
5. In **Authentication → Users**, choose **Add user**, provide a full email and a
   strong password, and auto-confirm the user. Create users only after running the
   schema so the trigger creates their `profiles` row.
6. Confirm the new user has one matching row in **Table Editor → profiles**. If it
   does not, delete and recreate the Auth user after applying the schema, or run:

   ```sql
   insert into public.profiles (id, username, display_name)
   select id, lower(split_part(email, '@', 1)), split_part(email, '@', 1)
   from auth.users
   on conflict (id) do nothing;
   ```

   Usernames must be unique. If two email addresses share the same text before
   `@`, edit one profile username before creating the second account.

### 2. Point the site at the project

Update `config.js` with the values from the new project:

```js
window.BEXS_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
};
```

The publishable key belongs in browser code; database security comes from the RLS
policies. Search the repository for `service_role` before committing and make sure
no real secret key is present.

### 3. Verify locally

From the repository root, run:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in a private browser window. The member card should
appear immediately. Sign in, add or scan a book, refresh, and confirm it remains;
then open **3D Library**. In DevTools, verify the Console has no red errors and the
Network requests to `/auth/v1/`, `/rest/v1/profiles`, and `/rest/v1/books` do not
return 401/403 errors.

Common failures:

- **Supabase client could not be loaded:** a blocker, firewall, or CSP blocked
  `cdn.jsdelivr.net`; allow that host and reload.
- **Invalid API key / Failed to fetch:** copy the URL and publishable key again,
  and check that the Supabase project is active.
- **Profile missing / 406 from `profiles`:** apply the schema and recreate the
  user, or use the repair SQL above.
- **401 from Auth:** enable Email/Password, auto-confirm the user, and use the full
  email address to sign in.
- **403 from `books`:** rerun the complete schema as the project owner so all RLS
  policies exist.
- **Only the background appears:** hard-refresh, clear the site's cached files,
  and inspect the first Console error. The checked-in root HTML and JavaScript
  must be deployed together; stale mixed versions have incompatible element IDs.

### 4. Deploy with GitHub Pages and the custom domain

1. Push the committed branch to GitHub and merge it into the branch selected in
   **Repository Settings → Pages**.
2. Choose **Deploy from a branch**, select the repository root (`/`), and save.
3. Keep `CNAME` containing `bexslibrary.com`. At the DNS provider, configure the
   apex records exactly as GitHub Pages documents, and remove conflicting A/AAAA
   records. If using Cloudflare proxying, temporarily select **DNS only** while
   GitHub verifies the domain and provisions the certificate.
4. In GitHub Pages settings, wait for the domain check and TLS certificate, then
   enable **Enforce HTTPS**. Re-enable any proxy only after HTTPS works directly.
5. Recheck the production URL in a private window and repeat the sign-in,
   add/refresh, and 3D-room smoke test. Do not use the HTTP version shown in an old
   bookmark; redirect it to HTTPS once the certificate is active.
