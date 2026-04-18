---
page: Video Player
path: /tv
type: custom
fidelity: full
---

# Intent

The video player is the Yunost-402 Soviet TV as a functional web video player. Same feed mechanic as the audio player – vertical swipe between videos, the device stays, the room changes. The screen of the Yunost plays actual video content. For launch, this page is a concept piece with placeholder content; music videos are in production.

# Audience

- Same as audio player – listeners and design tourists
- Secondary: people who want to watch the AI Confessions Hörspiel as a visual experience
- Mindset: lean-back, cinematic

# Key Messages

1. The TV IS the player. The CRT screen plays video. The knobs are controls.
2. Same feed-and-room mechanic as the audio player – swipe between channels.
3. The Yunost is a real Soviet TV from 1983. We put the internet inside it.

# Calls to Action

- Primary: Watch (implicit – the screen is playing)
- Secondary: Swipe to next channel
- Tertiary: View programme info

# Tone

Even less copy than the audio player. The TV has two knobs – channels and volume. The metadata is a «channel card» in the scan-line CRT style: channel number, programme title, brief.

# Copy

## Channel Card Overlay

- Displayed as a CRT on-screen display – blocky, phosphor-green or warm cream text with scan-line effect:
- CH 01
- Programme Title
- Artist / Series name
- Duration

## Empty State / Snow

- When no video is loaded, the Yunost displays static (TV snow)
- «Настройка...» (Tuning...) in CRT font, flickering

## Placeholder Content (Pre-Launch)

- CH 01: AI Confessions (Hörspiel) – static image or waveform visualisation with audio from the Hörspiel episodes
- CH 02–09: One channel per artist – album art or abstract visuals synced to a featured track
- This is the minimum viable content before music videos are produced

# Technical Requirements

## 3D Model
- Source: `/trrrrdt/2315123.5c1515b78b497/` – Yunost-402 FBX and .max files
- The CRT screen must display video content (texture-mapped to the screen surface in the 3D model)
- The two knobs must be interactive:
  - Left knob: channel selection (swipe equivalent – rotates to change programme)
  - Right knob: volume control
- The TV antenna can be decorative (no interaction needed)
- Camera: front-facing, slightly below centre – looking up at the TV as you would from a sofa
- **The device sits on a table or shelf surface.** The surface is visible in the lower portion of the viewport. Material changes per channel – but generally darker and heavier than the audio player's table (old wood, dark laminate). The table grounds the TV in a living room.

## Environment / Room
- Same mechanic as audio player – room changes per channel, consisting of:
  - **Wallpaper** (upper ~2/3): dark, moody background wall
  - **Table/shelf surface** (lower portion): the horizontal plane the Yunost sits on
- Environments lean more cinematic/atmospheric than the audio player:
  - Darker, moodier – you're watching TV in a room, not standing at a turntable
  - Vignette heavier, ambient light from the TV screen casting glow onto the table and wall
  - The CRT glow on the environment should react to the video content colour
  - The table surface catches the screen glow – reflections visible on polished surfaces

## Feed Mechanic
- Same vertical swipe as audio player
- Alternative: knob rotation on the 3D model to change channels (feels more native to the TV metaphor)
- Channel number visible as CRT overlay during transition
- Static/snow during transition (200ms)

## Video
- Source: MP3 audio from `/suno/songs/` for pre-launch; video files TBD
- Pre-launch: audio with visualisation (waveform, album art, or abstract shader synced to audio)
- Post-launch: actual music video files

# Imagery

## The Device
- Subject: Yunost-402 3D model, centred in viewport
- That candy-red shell is the hero – it should look warm, tactile, slightly worn
- Lighting: warmer than the PS-F9 – the TV is a living room object, not a hi-fi component

## Environments
- Subject: Living room vignettes – darker, more intimate than the audio player rooms
- Style: Generated via CSS/WebGL
- The key difference from audio player: the TV screen casts light into the environment
- Default: dark room with warm glow from the screen, visible only as edge lighting on nearby surfaces
- Per-channel variations follow the same artist colour palette as the audio player, but darker and more diffused
