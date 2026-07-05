# Turntable visualizer patterns

The wall behind the PS-F9 is an animated GLSL "wallpaper." Each **pattern** lives
in its own file here and is a small piece of GLSL that defines a single scalar
field. The turntable compiles one shader per pattern (they all share the same
uniforms) and swaps the wall's material per track — the style hash picks which
pattern a track gets, so adding files here automatically increases the variety.

## The contract

A pattern module default-exports `{ name, glsl }`:

```js
export default {
  name: 'my-pattern',
  glsl: /* glsl */`
    float field(vec2 p, float t) {
      // ... return a value roughly in [-1, 1]
      return sin(p.x * uScale + t);
    }
  `,
};
```

Your GLSL **must** define exactly:

```glsl
float field(vec2 p, float t)
```

and return a value in roughly **[-1, 1]** (the wrapper `smoothstep`s it, so mild
overshoot is fine). Everything else — colour mapping, the mid-driven accent band,
treble sparkle, and the vignette — is applied by the shared wrapper. You only
describe the *shape and motion*, never the colour.

### What's in scope

These uniforms are declared for you; read them, don't redeclare them:

| uniform | type | range | meaning |
|---------|------|-------|---------|
| `uTime`   | float | seconds | wall clock (already folded into `t`) |
| `uSpeed`  | float | ~0.4–1.5 | motion multiplier (already folded into `t`) |
| `uScale`  | float | ~3–9 | spatial frequency from the style hash |
| `uBass`   | float | 0–1 | low-band audio level (kick/bass) |
| `uMid`    | float | 0–1 | mid-band audio level |
| `uTreble` | float | 0–1 | high-band audio level |

Function arguments:

- `p` — the squared-up plane UV. `x ∈ [0, 2.143]`, `y ∈ [0, 1]`. Centre is
  `vec2(1.07, 0.5)`.
- `t` — `uTime * uSpeed`. Use this for motion, not `uTime`, so the hash's speed
  applies.

### Rules

- Make it **react to audio** — wire at least `uBass` into the motion, ideally
  `uMid`/`uTreble` too. A pattern that ignores the music is a wasted slot.
- Scale spatial frequency with `uScale` so the hash's density varies it.
- Keep it **cheap**: no loops over ~16 iterations, no `pow` storms. This renders
  full-screen every frame.
- Return in ~[-1, 1]. If your natural range is [0, 1], do `return v * 2.0 - 1.0`.
- Helper functions are fine — just don't collide with `field`, `main`, or the
  uniform names. Prefix helpers to be safe (e.g. `float myp_hash(...)`).
- No `precision`, no `uniform`, no `varying`, no `void main` — the wrapper owns
  those.

## Registering a pattern

Add the import and array entry in `index.js`. Order doesn't matter; the hash
picks `index % patterns.length`.

## Testing

On the dev server, open any player and append `#N` where N is the track number to
land on a specific track, or watch the wall cycle as you scroll. To force a
pattern while iterating, temporarily hard-code the index in
`wallpaperFromStyle()` in `../turntable.js`.
