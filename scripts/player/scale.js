/*
 * Physical scale for a 3D player scene. Models are imported at arbitrary sizes
 * and fit-scaled into the scene, so "one scene unit" means nothing on its own.
 * Anchor the scene to a single real, known measurement — the LP disc on the
 * turntable, the cabinet on the TV — and these converters give real millimetres
 * both ways, so props can be authored at true size (an A4 sheet, a 12" jacket).
 */

export const A4_MM = { w: 210, h: 297 }; // ISO 216 A4 sheet
export const LP12_MM = 302; // 12-inch vinyl record, actual disc diameter
export const LP12_JACKET_MM = 314; // its cardboard jacket (disc + ~6mm margin)

/*
 * Build converters from one anchor: `refSceneUnits` of scene geometry is known
 * to be `refMm` millimetres in the real world.
 */
export function physicalScale(refSceneUnits, refMm) {
  const unitsPerMm = refSceneUnits / refMm;
  return {
    unitsPerMm,
    mmToUnits: (mm) => mm * unitsPerMm,
    unitsToMm: (units) => units / unitsPerMm,
  };
}
