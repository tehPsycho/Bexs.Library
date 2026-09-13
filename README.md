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
