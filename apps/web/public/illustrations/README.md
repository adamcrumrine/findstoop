# FindStoop marketing illustrations

The marketing site loads SVG illustrations from this folder, named to match
the `illustrationName` passed to each `<FeatureSection>` and `<Illustration>`
component. If a file is missing, the page falls back to a brand-gradient
panel with a lucide icon — so nothing breaks while assets are staging.

## Source: Storyset (storyset.com)

We're using Storyset's free illustration library. The free tier requires
**attribution back to storyset.com** (handled in [`MarketingLayout`](../../src/components/layout/MarketingLayout.tsx)
footer). Pay $30/mo for the no-attribution license if/when you want to
remove the credit link.

## Color recoloring before download

Storyset's editor has a color picker. Before clicking "Download SVG":

1. Choose the **Pastel** or **Color** style (most teal-friendly)
2. Click **Customize colors**
3. Set the dominant accent to **`#00A896`** (FindStoop brand teal)
4. Set the supporting tone to **`#00B4A2`** (lighter teal) or **`#3A3A3C`** (ink)
5. Keep skin tones / neutrals untouched

## Required slugs

Each FeatureSection on the [home page](../../src/pages/marketing/Home.tsx) wants a specific file.
Save downloads with these **exact filenames** (kebab-case, `.svg`):

| Filename | Section topic | Suggested Storyset searches |
|---|---|---|
| `listings.svg` | Listings / publishing a vacancy | `house-searching`, `real-estate`, `property-rent` |
| `screening.svg` | Applications & screening | `verified`, `background-check`, `credit-card` |
| `leases.svg` | Lease templates + e-sign | `agreement`, `signing-a-contract`, `terms-and-conditions` |
| `payments.svg` | Rent collection | `online-payment`, `wallet`, `mobile-payments` |
| `maintenance.svg` | Maintenance tracking | `fixing-a-bug`, `maintenance`, `under-construction` |
| `accounting.svg` | Reports / accounting | `personal-finance`, `revenue`, `growth-analytics` |
| `messages.svg` | Tenant messaging | `chatting`, `conversation`, `messages` |
| `hero.svg` *(optional)* | Hero illustration | `welcome`, `landlord` (or omit — current dashboard card mockup also works) |
| `renters.svg` *(optional)* | Tenants landing | `family-moving-in`, `new-home`, `renting` |

## Download workflow

1. Go to `https://storyset.com` and search the slug
2. Pick a style (Pastel / Color / Rafiki / Bro — all fine; stay consistent)
3. **Customize colors** to FindStoop teal as above
4. Click **Download → SVG**
5. Save into this folder with the matching filename above
6. Hard-refresh `localhost:5173` — the gradient placeholder swaps to the real illustration automatically

## Attribution

The Storyset free-tier attribution link is already wired into
[MarketingLayout footer](../../src/components/layout/MarketingLayout.tsx). Do not
remove it unless you upgrade to the paid no-attribution license.
