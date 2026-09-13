# Bex's Library

A private, Supabase-backed reading tracker with a library-card login, review catalogue, and CSS 3D shelf. This repository replaces the original public landing page and Little Free Library map.

## Features

- **Library-card sign in:** entering an exact member name calls a small Supabase RPC and reveals that member's image without reloading the page. The password field appears only after the card is found.
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

For this repository's first migration, either paste `supabase/schema.sql` into **Supabase Dashboard → SQL Editor → New query → Run**, or turn it into a CLI migration:

```bash
supabase init
supabase migration new library_schema
cp supabase/schema.sql supabase/migrations/*_library_schema.sql
supabase db push
```

In **Authentication → Providers → Email**, enable email/password. Because this app intentionally signs in with friendly member names, accounts use the internal address convention `username@members.bexslibrary.app`. Create a member from the dashboard (**Authentication → Users → Add user**) and select **Auto Confirm User**, or with the Management API/service key from a trusted terminal:

```bash
export SUPABASE_URL='https://dsrafdzgjsogopracizc.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='copy-only-to-your-private-shell'
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"bex@members.bexslibrary.app","password":"choose-a-strong-password","email_confirm":true,"user_metadata":{"display_name":"Bex","avatar_url":"https://example.com/bex.jpg"}}'
unset SUPABASE_SERVICE_ROLE_KEY
```

The database trigger creates `profiles.username` from the portion before `@`. Use lowercase letters, numbers, `_`, `-`, or `.` in usernames. The service-role key bypasses RLS, so it must never be committed, sent to the browser, or placed in `config.js`.

## Local development

The app has no build step. Serve it over HTTP so browser modules and Supabase requests behave consistently:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The hosted Supabase project must have `http://localhost:8080` and the production URL in **Authentication → URL Configuration → Redirect URLs**.

## Data shape

Each `books` row resembles:

```json
{
  "user_id": "authenticated-user-uuid",
  "username": "bex",
  "title": "The Left Hand of Darkness",
  "author": "Ursula K. Le Guin",
  "metadata": {
    "status": "Read",
    "rating": 5,
    "isbn": "9780441478125",
    "cover_url": "https://example.com/cover.jpg",
    "review": "A lasting favorite."
  }
}
```

## Deployment

This remains a static site and can be published with GitHub Pages. Apply the database schema first, add the deployed origin to Supabase's URL configuration, then deploy the repository root. `CNAME` retains the custom-domain configuration.
