# Bex's Library

A static GitHub Pages companion site for [@bexs.library on TikTok](https://www.tiktok.com/@bexs.library).

## What is included

- A warm, bookish landing page with cross-links for TikTok, Etsy, and Amazon referral/favorites.
- A starter book reviews section that can be edited in `script.js`.
- A Leaflet + OpenStreetMap Little Free Library map powered by `data/libraries.json`.
- A comments placeholder for a static-site-friendly service such as [Giscus](https://giscus.app/).

## Editing the site

### Update social and shop links

Edit `index.html` and replace the `#` placeholder links in the quick links section with your real Etsy shop and Amazon referral URLs.

### Add book reviews

Edit the `reviews` array in `script.js`. Each review supports:

- `title`
- `author`
- `rating`
- `summary`
- `tag`
- `link`

### Add Little Free Library pins

Edit `data/libraries.json` and add one object per library:

```json
{
  "name": "Library name",
  "status": "Visited",
  "latitude": 39.0997,
  "longitude": -94.5786,
  "note": "Short visit or review note.",
  "reviewUrl": "https://www.tiktok.com/@bexs.library"
}
```

Recommended statuses are `Wishlist`, `Visited`, and `Reviewed`.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose your main branch and the repository root folder.
5. Save and wait for GitHub to publish the site.
