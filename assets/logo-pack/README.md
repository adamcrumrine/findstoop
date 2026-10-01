# stoop logo kit

Final logo: three rising steps in teal, a line-drawn half house, and an arched front door made from the bottom step. The wordmark is "stoop" in Nunito Regular, converted to outlines, with the "p" tail shortened by 50%.

All logo artwork is outlined vector — no fonts need to be installed to use any file.

## What's in the kit

| Folder | What it is | Use it for |
|---|---|---|
| `svg/` | Master vector files | Website, app, anything digital. Scales to any size. |
| `png/` | Transparent PNGs at several widths | Docs, slides, email, social posts |
| `print/` | Vector PDFs of the horizontal and stacked logos | Printers, sign shops, embroidery, swag |
| `app-icon/` | Full-bleed square icons (white, teal, night) | App Store, Google Play, home-screen icons. The OS rounds the corners. |
| `web/` | favicon.ico, favicon.svg, Apple and Android icons, manifest, `<head>` snippet | Drop into the site root |
| `social/` | Open Graph images, avatars, X and LinkedIn banners | Link previews and social profiles |
| `email/` | Signature-ready logo (600 px wide at 2×) | Email signatures |
| `stoop-logo-guide.pdf` | One-page usage guide | Share with designers and vendors |

## Logo versions

- **Horizontal** — the primary logo. Use it whenever there's room.
- **Stacked** — for square or tall spaces (yard signs, merch, profile cards).
- **Mark** — the symbol alone, once people know the brand (app icon, favicon, stamps).
- **Wordmark** — "stoop" alone, for tight horizontal spaces where the mark already appears nearby.

## Colorways

| File suffix | Use on |
|---|---|
| `color` | White or light backgrounds (charcoal wordmark) |
| `reversed` | Dark backgrounds (white wordmark, teal mark) |
| `white` | Photos or teal backgrounds, one-color white |
| `teal` | One-color printing in Deep teal |
| `charcoal` / `black` | One-color printing, faxes, engraving, stamps |

## Colors

| Name | Hex | RGB |
|---|---|---|
| Light teal (top step, roof) | #6CC5C0 | 108, 197, 192 |
| Teal (middle step) | #45A6A2 | 69, 166, 162 |
| Deep teal (bottom step, door, house) | #2B8783 | 43, 135, 131 |
| Charcoal (wordmark) | #3A3A3C | 58, 58, 60 |
| Night (dark background) | #1C2124 | 28, 33, 36 |

## Clear space and minimum size

- Keep at least one step-height of empty space on every side of the logo.
- Horizontal logo: no smaller than 120 px (1 in) wide.
- Mark: no smaller than 16 px (0.2 in) tall. Below 32 px, use the favicon tile in `web/`.

## Don'ts

- Don't recolor the steps, change their order, or add gradients, shadows or outlines.
- Don't stretch, rotate or rearrange the mark and wordmark.
- Don't retype the wordmark in a font. Always use the outlined files, which carry the custom "p".
- Don't place the full-color logo on busy photos. Use the white version instead.

## Typography

The wordmark is set in Nunito Regular (Google Fonts, SIL Open Font License), tracked −1%, with a custom shortened "p". Nunito pairs well for headlines if you want type that matches the logo.

## In this repo

The web app's logos and icons are copied or rendered from this kit by
`node scripts/build-brand-assets.mjs` (run from the repo root):

- UI logos: `svg/horizontal/stoop-horizontal-color.svg`, `-reversed.svg` and
  `svg/mark/stoop-mark-color.svg`, written to `apps/web/public` with clear
  space added above and below the horizontal lockups.
- Apple touch icon and PWA icons: `app-icon/stoop-app-icon-white-large.svg`.
  The `-large` app icons (white, teal, night) put the mark at 82% of the
  tile's width, up from 64%, so it holds its own beside other home-screen
  icons.
- Favicons and the Android maskable icon: from `web/`. The maskable icon
  keeps the kit's padding, since Android crops icons to circles and other
  shapes.
- Social card: `social/stoop-og-image-light-1200x630.png`.

To change the logo, replace files here (keeping their names), re-run the
script, and release `develop` → `stoop-test` → `stoop-production`.
