# Varmblixt

An interactive study of a low-profile glass ring lamp. The complete model is
generated at runtime from Three.js primitives and a custom parametric surface;
it does not load a GLB or other third-party model asset.

## Authoring

Add an empty `varmblixt` block. The block intentionally has no authored settings;
lighting, camera, materials, and interaction use accessible defaults. All copy
(the lab-report kicker, the headline, and the manual-style caption) is generated
by the block, so there is nothing to fill in.

## Details

The piece stays a restrained study with a few deliberate touches:

- **Lab-report kicker** — a Soviet instrument-log line (`ОБРАЗЕЦ 7 · LUMEN TEST ·
  REV …`) set in the mono stack, which falls back to a Cyrillic mono for the
  Latin/Cyrillic mix.
- **Amber bleed** — a static radial wash (`main .varmblixt::after`, `soft-light`)
  lets the lamp's amber leak into the surrounding studio. Its strength is tied to
  the intensity slider through the `--varmblixt-bleed` custom property, set in the
  same input handler that drives the model's internal light.
- **One Fraunces rupture** — a single word in the headline (`.varmblixt-wonk`)
  slips into the serif and morphs its `WONK` axis 0 → 1 on hover/focus. It is the
  only animation; under `prefers-reduced-motion` it simply rests at `WONK 1`.
