/*
 * The IKEA VARMBLIXT glass-donut lamp as a warm prop for the player scenes.
 *
 * It reuses the procedural model from the varmblixt block (a low glass ring),
 * recolored to the lamp's signature warm amber and lit from within, then sized to
 * its real ~300 mm width via the scene's physical scale — so it's correctly a
 * touch bigger than the little 205 mm TV and about as wide as a 12" LP. A
 * scene-space point light spills a diffuse amber glow across the desk and the
 * device, and can breathe gently with the music.
 *
 * The block's model builds fresh materials on every call, so recoloring this
 * instance never touches the varmblixt block's own (white) study.
 *
 * No transmission is used here (unlike the block): a transmissive material forces
 * an extra scene render every frame, which is exactly the mobile cost the players
 * can't afford — the amber reads from emissive + an additive glow shell instead.
 */
import createVarmblixtModel from '../../blocks/varmblixt/varmblixt-model.js';

const LAMP_WIDTH_MM = 300; // the donut's real diameter
const MODEL_WIDTH_UNITS = 3; // the procedural model is 3 decimetre-units wide

/*
 * Build the lamp. `mmToUnits` comes from the scene's physical scale so the lamp
 * lands at true size. Returns { group, meshes, setLevel, toggle, isOn } — add
 * `group` to the scene, position it on the desk (its base sits at y≈0), call
 * setLevel(0..1) each frame to modulate the glow, and toggle() to switch it
 * on/off (e.g. on a tap).
 */
export default function createLamp(THREE, { mmToUnits } = {}) {
  const group = new THREE.Group();
  group.name = 'VARMBLIXT lamp';
  const model = createVarmblixtModel(THREE);
  const m = model.userData.materials;

  const LIT_GLASS = 0xb56526; // warm pumpkin-amber, matching the IKEA reference
  const OFF_GLASS = 0x6e4423; // dark unlit amber glass when the LED is off
  const GLOW = 0xf5842c; // the warm amber the ring emits

  // warm amber glass, lit from within — no transmission (see file header)
  m.glass.color.set(LIT_GLASS);
  m.glass.emissive.set(GLOW);
  m.glass.emissiveIntensity = 0.5;
  m.glass.transmission = 0;
  m.glass.roughness = 0.28;
  m.glass.clearcoat = 0.5; // glossy blown-glass sheen
  m.glass.clearcoatRoughness = 0.22;
  // the additive glow shell carries the diffuse halo
  m.glow.color.set(0xffa64f);
  m.glow.opacity = 0.14;
  // muted warm-grey base + cord: the real lamp's is pale, but a bright white base
  // glares in the dark player scene, so it's toned down to just ground the lamp
  m.base.color.set(0x6a6459);
  m.foot.color.set(0x555049);
  m.clearRim.color.set(0x7a7266);
  m.clearRim.opacity = 0.55;
  m.cable.color.set(0xa79e91);

  // the model ships its own internal PointLight tuned to its decimetre space and
  // to a warm white; drop it and add one scene-space orange spill we control in
  // world units (a scaled parent doesn't scale a light's distance).
  const strays = [];
  model.traverse((o) => { if (o.isPointLight) strays.push(o); });
  strays.forEach((o) => o.parent.remove(o));

  const scale = mmToUnits ? mmToUnits(LAMP_WIDTH_MM) / MODEL_WIDTH_UNITS : 0.5;
  model.scale.setScalar(scale);
  group.add(model);

  // diffuse amber spill: soft, wide, physically decaying. Sits at the ring's
  // mid-height so the glow rakes across the desk and up onto the device.
  const reach = mmToUnits ? mmToUnits(1500) : 6;
  const spill = new THREE.PointLight(0xff8a38, 3.0, reach, 2);
  spill.position.set(0, mmToUnits ? mmToUnits(90) : 0.3, 0);
  group.add(spill);
  const SPILL_BASE = 3.0;

  let isOn = true;

  function applyLevel(level) {
    const l = Math.max(0, Math.min(1, level || 0));
    m.glass.emissiveIntensity = 0.45 + l * 0.4;
    m.glow.opacity = 0.1 + l * 0.12;
    spill.intensity = SPILL_BASE * (0.82 + l * 0.4);
  }

  function setOn(on) {
    isOn = on;
    if (on) {
      m.glass.color.set(LIT_GLASS);
      applyLevel(0);
    } else {
      // the LED off: dark unlit glass, no glow, no spill
      m.glass.color.set(OFF_GLASS);
      m.glass.emissiveIntensity = 0;
      m.glow.opacity = 0;
      spill.intensity = 0;
    }
  }

  return {
    group,
    meshes: model, // raycast target for tap-to-toggle
    /* level 0..1 (idle ≈ 0) — shimmers with the audio; ignored while off */
    setLevel(level) { if (isOn) applyLevel(level); },
    /* flip the light on/off (tap handler); returns the new state */
    toggle() { setOn(!isOn); return isOn; },
    get isOn() { return isOn; },
  };
}
