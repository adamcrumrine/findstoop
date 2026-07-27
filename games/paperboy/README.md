# Paperboy 64

A Three.js paper route rendered like a late-era Nintendo 64 game, built to ship
as a single self-contained HTML file.

## Running it

```bash
cd games/paperboy
npm install
npm run build
```

That writes two files:

| File | Purpose |
| --- | --- |
| `dist/paperboy.html` | The artifact payload — no `<html>`/`<head>`/`<body>` wrapper, since the host supplies those. |
| `dist/preview.html` | The same content in a full document, for opening straight off disk. |

Both are fully self-contained: three.js is bundled in, the two typefaces are
subset and inlined as base64 `woff2`, every texture is drawn on a canvas at
startup, and all audio is synthesised with the Web Audio API. The page makes
zero network requests once loaded, which is what lets it run under a strict
content-security policy.

## Playing it

| Input | Action |
| --- | --- |
| `A` / `D` or arrows | Steer |
| `W` / `S` | Speed up / brake |
| `Q` | Throw left |
| `E` | Throw right |
| `Space` | Throw at the nearest target on either side |
| Click | Throw toward the half of the screen you clicked |
| `P` / `Esc` | Pause |
| `M` | Mute |

Subscribers are the addresses with a lit porch, a raised mailbox flag, and a
chevron floating above the roof. Land a paper on the doormat for the base
payout. Riding up onto that side's sidewalk before you throw switches your lock
to the curbside box itself, worth roughly double — the reticle turns amber to
tell you the harder shot is live. Consecutive deliveries build a multiplier; a
paper on the grass, a wipeout, or a soaking from a sprinkler resets it.

Non-subscribers are fair game. Their windows pay out, and a subscriber's window
does not: break one and they cancel.

What an address is worth depends on what kind of building it is:

| Building | Doormat | Curbside box | Window |
| --- | --- | --- | --- |
| Row house | 200 | 400 | 125 |
| House | 250 | 500 | 150 |
| Apartments | 300 | 450 | 100 |
| Mansion | 450 | 750 | 300 |

The numbers follow the geometry rather than being assigned arbitrarily. A
mansion sits far back behind a narrow stone box, so both of its throws are hard
and both pay. An apartment block has a fat bank of cluster mailboxes that is
difficult to miss, so its bullseye is worth less than a single-family house's —
but its lobby entrance is deep enough that the doormat throw pays more. Row
houses arrive as a terrace of two or three at a time, which turns a whole block
into one fast burst of short, cheap throws.

Miss a subscriber's address entirely and you lose them. Run out of bikes and the
route gets reassigned to somebody else.

The camera pans to follow each paper through its arc and holds on the impact
long enough to see where it landed, then returns. If you would rather it stayed
locked behind the bike, switch Camera to Fixed on the deck.

## How the N64 look is done

The point of reference is the console's actual output path, not a generic
"retro" filter. Three things carry most of it:

**The framebuffer is small and the upscale is soft.** The scene renders into a
480×270 half-float target which is then stretched to the canvas with linear
filtering plus a three-tap horizontal smear, approximating the N64's video
interface filter. Crunchy nearest-neighbour pixels are a PlayStation/Saturn
signature; the N64 was famously *blurry*, and getting that distinction right is
most of the impression.

**Colour is quantised to 16 bits with an ordered dither.** After the linear
buffer is converted to display space, `post.js` snaps each channel to 5-6-5
with a 4×4 Bayer pattern evaluated on the low-resolution pixel grid — so the
dither scales up with the image, the way a real framebuffer's would. This is
what produces the banded, stippled sky.

**Distance is hidden by fog, not by draw distance.** Exponential-squared fog in
a warm sunrise haze swallows everything past about 150 units, so the world
streamer never needs to have more than a few blocks resident.

The rest follows from the budget: flat-shaded Lambert materials with a single
key light and a hemisphere bounce, no shadow maps (entities get blob shadow
cards instead), 64-pixel canvas textures with mipmaps, and alpha-tested
foliage cards.

## Code layout

| File | Contents |
| --- | --- |
| `src/textures.js` | Every texture, drawn on a 2D canvas at 32–128px. |
| `src/models.js` | Low-poly builders — houses, cars, dogs, the rider and bike — all assembled from a handful of shared primitive geometries. |
| `src/world.js` | Route generation plus the streamer that recycles pooled meshes as you ride. |
| `src/post.js` | The render target and the composite shader described above. |
| `src/game.js` | Simulation: bike physics, ballistic throws, scoring, camera. |
| `src/audio.js` | Synthesised sound effects and the four-bar music loop. |
| `src/main.js` | Input, HUD, and the generated front page. |
| `src/shell.html` | Page markup and styles. |
| `build.mjs` | Bundles and inlines everything. |

Nothing is allocated during play. Houses, props, cars, dogs, papers and blob
shadows all come from pools that are filled at startup; the route itself is
generated once per day as a flat, z-sorted list of records, and the streamer
just moves pooled meshes onto them.

## Design notes

The two typefaces are Anton and IBM Plex Mono, subset down to about 14 KB total.
Anton is a newspaper headline face that happens to read as chunky 90s game
lettering, which is why it carries both the wordmark and the HUD numerals; Plex
Mono handles labels and anything with digits that need to line up.

The end-of-route screen is a printed front page whose headline is generated from
what actually happened on the route — smash six windows and the paper says so.
