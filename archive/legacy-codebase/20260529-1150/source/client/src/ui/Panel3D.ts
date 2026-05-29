import * as THREE from 'three';
import gsap from 'gsap';

export interface PanelOptions {
  width: number;
  height: number;
  color?: number;
  opacity?: number;
  borderRadius?: number;
  borderColor?: number;
  borderWidth?: number;
  glow?: boolean;
  glowColor?: number;
  glowIntensity?: number;
  depth?: number;
}

export function createPanel(options: PanelOptions): THREE.Group {
  const {
    width, height,
    color = 0x1a1a2e,
    opacity = 0.85,
    borderRadius = 0.08,
    borderColor = 0x3b82f6,
    borderWidth = 0.01,
    glow = false,
    glowColor = 0x3b82f6,
    glowIntensity = 0.5,
    depth = 0.02,
  } = options;

  const group = new THREE.Group();

  const shape = createRoundedRectShape(width, height, borderRadius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 3,
  });
  geometry.center();

  const material = new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    metalness: 0.1,
    roughness: 0.3,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  if (borderWidth > 0) {
    const borderShape = createRoundedRectShape(width + borderWidth * 2, height + borderWidth * 2, borderRadius + borderWidth);
    const borderGeom = new THREE.ShapeGeometry(borderShape);
    borderGeom.center();
    const borderMat = new THREE.MeshBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const borderMesh = new THREE.Mesh(borderGeom, borderMat);
    borderMesh.position.z = -depth / 2 - 0.001;
    group.add(borderMesh);
  }

  if (glow) {
    const glowGeom = new THREE.PlaneGeometry(width + 0.3, height + 0.3);
    const glowMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: glowIntensity * 0.15,
      side: THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.position.z = -depth / 2 - 0.01;
    group.add(glowMesh);
    group.userData.glowMesh = glowMesh;
  }

  group.userData.panelMesh = mesh;
  group.userData.panelMaterial = material;
  group.userData.width = width;
  group.userData.height = height;

  return group;
}

export function animatePanel(panel: THREE.Group, delay: number = 0): gsap.core.Timeline {
  const tl = gsap.timeline();
  panel.scale.set(0.8, 0.8, 0.8);
  const mat = panel.userData.panelMaterial;
  if (mat) mat.opacity = 0;

  tl.to(panel.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay, ease: 'back.out(1.4)' }, 0);
  if (mat) {
    tl.to(mat, { opacity: 0.85, duration: 0.4, delay, ease: 'power2.out' }, 0);
  }
  return tl;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
