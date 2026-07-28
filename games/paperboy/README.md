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
| `1` `2` `3` | Pick a shift on the select screen |
| `H` | Route briefing |
| `P` | Pause &middot; `Esc` backs out of a menu |
| `M` | Mute |

## Screens

Title → shift select → day card → the route → the front page, and back round. `H`
opens a route briefing from the title with the controls, a legend for what the
coloured reticles mean, and the payout table. Best score per shift is kept in
`localStorage` where the browser allows it, shown on the title, on the shift
cards and on the front page; a sandbox that refuses storage just means no
record is kept, which is not worth taking the page down for.

The shift select screen also carries the route picker, and scrolls when the
screen is too short to hold both.

## Routes

The street is identical everywhere — same houses, same traffic, same throws.
What a route changes is the sky gradient, the fog colour and density, the
lighting, the grass and whatever sits on the horizon:

| Route | What is out there |
| --- | --- |
| Open Country | Ridge lines, red barns with silos, hedgerows and hay bales |
| High Country | Snow-capped peaks and pine belts running down to the road |
| Lakeside | Still water, jetties and moored boats along the near shore |
| Coast Road | Dunes, a fishing pier and open sea on both sides |
| Inner Suburb | Mid-rise blocks closing in a street or two over |
| Five Boroughs | Towers with water towers on the roofs, and a suspension bridge |
| Paris | Zinc mansards over cream stone, and the tower off the end of the block |

Backdrops live in the sky rig, which tracks the player along z, and sit between
25 and 150 units out. At that distance the exponential fog turns them into hazy
silhouettes — which is the register a cartridge-era game drew its horizons in
anyway. Each is built the first time you visit it and then kept, because
rebuilding a skyline on every route change would stall the frame.

## Shifts

Difficulty is not a single multiplier. What actually makes the street readable
is how fast things move, so that is the main thing a shift changes:

| | Cars | Dogs | Hazards | Bike | Bikes | Papers | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sunday Round | ×0.60 | ×0.65 | ×0.72 | 13.5 | 5 | 22 | ×0.8 |
| Weekday Route | ×1.00 | ×1.00 | ×1.00 | 16.0 | 3 | 16 | ×1.0 |
| Rush Hour | ×1.45 | ×1.30 | ×1.30 | 19.0 | 2 | 13 | ×1.5 |

Measured end to end, that is average traffic moving at 5.5 units/second on the
easy shift against 14.5 on the hard one, dogs chasing at 6.2 against 12.4, and
43 solid obstacles on the route against 70. Score is scaled so the three
leaderboards mean something next to each other.

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

## Traffic

The street is laid out as a sequence of recognisable patterns rather than one
car every N units, because evenly spaced obstacles read as wallpaper. A block
arrives as a convoy nose to tail with one gap you can commit to, a school bus
coasting to the kerb with its brake lights on and its stop arm out, a sedan
drifting across the centre line as you close on it, or a pickup reversing out
of a driveway across the sidewalk once you are near enough to see it happen.
The generator will not run the same pattern twice in a row.

Five body plans — sedan, taxi, pickup, van and school bus — carry their own
length, speed and collision box, so a bus genuinely takes up more of the block
than a sedan. Brake lights swap to a hot emissive material whenever a vehicle
is actually slowing, which is the only cue you get that a bus is about to stop
in front of you.

## A note on the bike wheels

`THREE.TorusGeometry` is built in the XY plane with its hole along Z, so a torus
used as-is for a bike wheel has its axle pointing straight at a chase camera —
the wheel faces you like a coin and its spin reads as a tumble rather than a
roll. The fix is to bake a quarter turn into the geometry (`rotateY(π/2)`) so
the axle runs along X, which leaves the wheel almost edge-on from behind; the
crossed spokes are there to make the rotation legible at that angle.

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

Depth comes mostly from the street furniture rather than the buildings.
Telephone poles march down both verges just outside the play area, each
carrying a fixed-length span of wire toward where the next one will stand — so
the streamer can place them independently and the line still looks continuous.
Junctions get a painted crossing and a pair of stop signs, the kerb gets storm
drains, and the front gardens get picket fences, flowerbeds and the occasional
basketball hoop.

## Code layout

| File | Contents |
| --- | --- |
| `src/textures.js` | Every texture, drawn on a 2D canvas at 32–128px. |
| `src/models.js` | Low-poly builders — houses, cars, dogs, the rider and bike — all assembled from a handful of shared primitive geometries. |
| `src/world.js` | Route generation plus the streamer that recycles pooled meshes as you ride. |
| `src/post.js` | The render target and the composite shader described above. |
| `src/game.js` | Simulation: bike physics, ballistic throws, scoring, camera. |
| `src/audio.js` | Synthesised sound effects and the four-bar music loop. |
| `src/scenes.js` | The seven routes: palettes, fog, lighting and horizon builders. |
| `src/main.js` | Input, HUD, screens, and the generated front page. |
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
