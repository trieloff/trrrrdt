---
site: trrrrdt.records
pages: [homepage, audio-player, video-player, artist, article]
---

# Purpose

trrrrdt.records is the web presence of a fictional record label from a timeline where the 80s never died. Nine musical personas – each a philosophical experiment wearing a genre as a disguise – release music through two hardware interfaces: a Sony PS-F9 turntable (audio) and a Юность-402 TV (video). The website is the label, the player, and the catalogue in one.

# Navigation

- Primary: Home · Artists · Audio Player · Video Player
- The players are full-page immersive experiences – navigation is minimal once inside
- Artist pages are individual detail pages per persona
- Article pages are a flexible template for songs, press coverage, liner notes

# Shared Messaging

- Tagline: «Nine artists. No humans.»
- Positioning: «A record scratch that doesn't just take you to another track – it takes you into another life.»
- Never break character. The personas are artists, full stop.

# Content Hierarchy

1. **Homepage** – the storefront. Latest release as hero, roster as catalogue, playlists as depth.
2. **Audio Player** – the primary experience. A TikTok-style vertical feed with the PS-F9 as a constant, room wallpaper changing per track.
3. **Video Player** – secondary for now (music videos in production). Same feed mechanic with the Yunost TV.

# Content Reuse Map

| Fragment | Source Page | Reused On | Purpose |
|----------|------------|-----------|---------|
| now-playing-card | /player | / (hero) | Latest release featured on homepage, links into player |
| artist-card | /artists/{name} | /, /player (track info) | Artist identity shown on homepage roster and in player |
| playlist-card | / (catalogue section) | /player (queue/browse) | Browse playlists from within the player |
| song-card | /articles/{song} | /artists/{name}, / | Song metadata and link to article |
| article-card | /articles/{slug} | /artists/{name}, / | Press coverage, liner notes |
