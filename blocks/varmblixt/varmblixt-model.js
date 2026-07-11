/**
 * Builds an original, procedural interpretation of a low-profile glass ring lamp.
 * Dimensions are expressed in decimetres so the finished model is 3 × 3 × 1.2.
 */

function createGlassGeometry(THREE, {
  angularSegments = 192,
  profileSegments = 72,
  majorRadius = 0.965,
  radialRadius = 0.535,
  verticalRadius = 0.535,
  centerHeight = 0.59,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let ring = 0; ring <= angularSegments; ring += 1) {
    const u = ring / angularSegments;
    const angle = u * Math.PI * 2;
    const blownGlassVariation = 1
      + Math.sin(angle * 3 + 0.35) * 0.0045
      + Math.sin(angle * 7 - 0.8) * 0.0025;

    for (let profile = 0; profile <= profileSegments; profile += 1) {
      const v = profile / profileSegments;
      const profileAngle = v * Math.PI * 2;
      const radial = (majorRadius + radialRadius * Math.cos(profileAngle))
        * blownGlassVariation;
      const upperBias = Math.max(0, Math.sin(profileAngle)) * 0.018;
      const y = centerHeight + verticalRadius * Math.sin(profileAngle) + upperBias;

      positions.push(
        Math.cos(angle) * radial,
        Math.max(0.055, y),
        Math.sin(angle) * radial,
      );
      uvs.push(u, v);
    }
  }

  const stride = profileSegments + 1;
  for (let ring = 0; ring < angularSegments; ring += 1) {
    for (let profile = 0; profile < profileSegments; profile += 1) {
      const a = ring * stride + profile;
      const b = (ring + 1) * stride + profile;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCable(THREE, material) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.29, 0.12, 0.22),
    new THREE.Vector3(1.48, 0.095, 0.28),
    new THREE.Vector3(1.78, 0.075, 0.36),
    new THREE.Vector3(2.25, 0.07, 0.42),
  ]);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 72, 0.024, 10, false),
    material,
  );
  cable.name = 'Braided power cord';
  cable.castShadow = true;
  return cable;
}

/**
 * Creates the complete procedural lamp model.
 * @param {object} THREE the project's Three.js module
 * @returns {THREE.Group} a model containing only generated Three.js geometry
 */
export default function createVarmblixtModel(THREE) {
  const model = new THREE.Group();
  model.name = 'Procedural glass ring lamp';

  const materials = {
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xfffdf8,
      emissive: 0xfff4e4,
      emissiveIntensity: 0.035,
      metalness: 0,
      roughness: 0.27,
      transmission: 0.28,
      thickness: 0.82,
      ior: 1.46,
      attenuationColor: 0xfff4e7,
      attenuationDistance: 1.4,
      clearcoat: 0.18,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    }),
    glow: new THREE.MeshBasicMaterial({
      color: 0xffead2,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    }),
    base: new THREE.MeshStandardMaterial({
      color: 0xe9e7e1,
      metalness: 0.02,
      roughness: 0.38,
    }),
    clearRim: new THREE.MeshPhysicalMaterial({
      color: 0xf8f7f2,
      metalness: 0,
      roughness: 0.12,
      transmission: 0.68,
      thickness: 0.08,
      ior: 1.45,
      transparent: true,
      opacity: 0.78,
    }),
    cable: new THREE.MeshStandardMaterial({
      color: 0xbebdb8,
      metalness: 0.04,
      roughness: 0.72,
    }),
    foot: new THREE.MeshStandardMaterial({
      color: 0x9b9a95,
      metalness: 0.12,
      roughness: 0.48,
    }),
  };

  const glassGeometry = createGlassGeometry(THREE);
  const glass = new THREE.Mesh(glassGeometry, materials.glass);
  glass.name = 'Frosted glass body';
  glass.castShadow = true;
  glass.receiveShadow = true;
  model.add(glass);

  const glow = new THREE.Mesh(glassGeometry, materials.glow);
  glow.name = 'Internal diffused light';
  glow.scale.set(0.955, 0.955, 0.955);
  glow.position.y = 0.018;
  glow.renderOrder = -1;
  model.add(glow);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.37, 1.4, 0.13, 128, 2),
    materials.base,
  );
  base.name = 'Powder-coated base';
  base.position.y = 0.066;
  base.castShadow = true;
  base.receiveShadow = true;
  model.add(base);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.405, 1.405, 0.035, 128, 1, true),
    materials.clearRim,
  );
  rim.name = 'Clear lower rim';
  rim.position.y = 0.035;
  model.add(rim);

  const strainRelief = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.1, 0.32, 3, 2, 3),
    materials.foot,
  );
  strainRelief.name = 'Cord strain relief';
  strainRelief.position.set(1.3, 0.095, 0.22);
  strainRelief.rotation.y = -0.16;
  strainRelief.castShadow = true;
  model.add(strainRelief, createCable(THREE, materials.cable));

  const warmCore = new THREE.PointLight(0xffdfbd, 2.6, 5.2, 2);
  warmCore.name = 'Internal light source';
  warmCore.position.set(-0.2, 0.5, -0.1);
  model.add(warmCore);

  model.userData.materials = materials;
  model.userData.setLightIntensity = (value) => {
    const level = THREE.MathUtils.clamp(value, 0, 1);
    materials.glass.emissiveIntensity = 0.01 + level * 0.075;
    materials.glow.opacity = 0.03 + level * 0.12;
    warmCore.intensity = level * 3.6;
  };
  model.userData.setLightIntensity(0.72);

  return model;
}
