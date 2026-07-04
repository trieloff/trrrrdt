---
page: Audio Player
path: /player
type: custom
fidelity: full
---

# Intent

The audio player is a full-page immersive environment where the Sony PS-F9 turntable is the UI. The visitor swipes vertically (like TikTok) to move between tracks. The device stays centred and constant; the room's wallpaper – the background environment – changes per track or per artist. The vinyl spins. The music plays. No visible chrome beyond the device itself.

# Audience

- Listeners who arrived from the homepage or a shared link
- Design tourists who want to interact with the 3D model
- Mindset: lean-back, exploratory, ambient

# Key Messages

1. The turntable IS the interface. There are no play/pause buttons outside the device.
2. Each track lives in its own environment – the room changes, the device stays.
3. The feed mechanic (vertical swipe) makes discovery feel like channel-surfing, not browsing a list.

# Calls to Action

- Primary: Play / pause (implicit – interacting with the device)
- Secondary: Swipe to next track
- Tertiary: View track info (artist, title, album) – minimal overlay

# Tone

No copy. The hardware speaks. Track metadata appears as equipment panel markings – eyebrow-style mono type, minimal. No descriptions, no artist bios, no marketing language.

# Copy

## Track Info Overlay

- Displayed as equipment-label text, positioned as if printed on the device's surface or floating nearby:
- ARTIST NAME (in Fraunces at the artist's axis settings)
- Track Title (Space Grotesk, weight 300)
- Genre · BPM · Duration (Space Mono eyebrow)
- No other copy.

## Empty State

- If no track is loaded or playback hasn't started:
- «Drop the needle.»

# Technical Requirements

## 3D Model
- Source: `/trrrrdt/7114844/` – Sony PS-F9 FBX files
- The vinyl disc must spin during playback (continuous rotation, speed proportional to playback)
- The tonearm is internal to the PS-F9 design – not visible, no animation needed
- The model should be interactive: click/tap on the device to play/pause
- Camera: slightly elevated, looking down at ~15° – the PS-F9 is a vertical-loading turntable, the disc is visible from the front
- **The device sits on a table surface.** The table is a horizontal plane visible in the lower third of the viewport. The surface material and colour change per artist/track along with the wallpaper – wood grain, brushed metal, felt, laminate. The table grounds the device in physical space.

## Environment / Room
- Each track (or artist) has a unique room environment consisting of:
  - **Wallpaper** (upper ~2/3): background wall behind the device – colour gradients, textured patterns, or shader effects
  - **Table surface** (lower ~1/3): the horizontal plane the PS-F9 sits on – material and colour change per artist
- The room is a physical space with depth: wall behind, table below, device on top
- Options for wallpaper generation:
  - Solid colour gradients derived from the artist's channel-stripe colour
  - Textured wallpaper patterns (cassette futurism aesthetic)
  - Abstract shader backgrounds (noise, scan lines, CRT glow)
- Options for table surface:
  - Wood grain (warm artists: Kevin, Ann, Cassidy)
  - Brushed metal (cold artists: Helle, Dmitri)
  - Felt or fabric (soft artists: Moss Twins, Sylvaine)
  - Laminate or plastic (punk artists: Itzik, Natsuko)
- The environment transitions smoothly when swiping between tracks (crossfade or wipe)

## Feed Mechanic
- Vertical swipe/scroll to navigate between tracks
- Snap-to-track: each track occupies one full viewport height
- Swipe gesture on mobile, scroll/arrow keys on desktop
- Pre-load adjacent tracks for instant transition
- Track order: default is the current playlist or shuffle of full catalogue

## Audio
- Source: MP3 files from `/suno/songs/{artist}/{track}.mp3`
- Playback via Web Audio API or standard `<audio>` element
- Crossfade between tracks during swipe transition (500ms)

# Imagery

## The Device
- Subject: Sony PS-F9 3D model, centred in viewport
- The model IS the imagery – no additional photos or illustrations
- Lighting: warm directional key light from upper left, matching the brand photography direction

## Environments
- Subject: Abstract backgrounds that evoke each artist's genre/mood
- Style: Generated via CSS/WebGL – not photographs
- Per-artist direction:
  - Sylvaine: lavender mist, soft CRT glow
  - Helle: cold Baltic grey, morning light
  - Natsuko: neon-lit red and black, Shinjuku at night
  - Dmitri: deep forest green fading to black, fog
  - Kevin: amber VU-meter glow, stadium warmth
  - The Moss Twins: mossy green-grey, Welsh rain
  - Itzik: electric pink and gold, Tel Aviv sunset
  - Ann: ember orange, furnace glow, volcanic
  - Cassidy: smoky blue-violet, hotel lobby at 2 AM
