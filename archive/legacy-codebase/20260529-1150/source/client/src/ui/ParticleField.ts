import * as THREE from 'three';

export function createParticleField(count: number = 500, spread: number = 20): THREE.Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  const palette = [
    new THREE.Color(0x3b82f6),
    new THREE.Color(0x8b5cf6),
    new THREE.Color(0x06b6d4),
    new THREE.Color(0x10b981),
    new THREE.Color(0xf59e0b),
  ];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5 - 3;
    sizes[i] = Math.random() * 3 + 0.5;

    const color = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    velocities[i * 3] = (Math.random() - 0.5) * 0.002;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.001;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.userData.velocities = velocities;
  points.userData.spread = spread;
  return points;
}

export function updateParticles(points: THREE.Points, dt: number): void {
  const positions = points.geometry.attributes.position.array as Float32Array;
  const velocities = points.userData.velocities as Float32Array;
  const spread = points.userData.spread as number;
  const halfSpread = spread / 2;

  for (let i = 0; i < positions.length / 3; i++) {
    positions[i * 3] += velocities[i * 3];
    positions[i * 3 + 1] += velocities[i * 3 + 1];
    positions[i * 3 + 2] += velocities[i * 3 + 2];

    if (Math.abs(positions[i * 3]) > halfSpread) positions[i * 3] *= -0.99;
    if (Math.abs(positions[i * 3 + 1]) > halfSpread) positions[i * 3 + 1] *= -0.99;
    if (Math.abs(positions[i * 3 + 2]) > halfSpread * 0.5) positions[i * 3 + 2] *= -0.99;
  }

  points.geometry.attributes.position.needsUpdate = true;
}
