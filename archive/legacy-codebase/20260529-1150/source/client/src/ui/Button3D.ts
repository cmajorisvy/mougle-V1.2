import * as THREE from 'three';
import { Text } from 'troika-three-text';
import gsap from 'gsap';

export interface ButtonOptions {
  text: string;
  width?: number;
  height?: number;
  color?: number;
  hoverColor?: number;
  textColor?: string;
  fontSize?: number;
  onClick?: () => void;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  glow?: boolean;
}

const VARIANT_COLORS = {
  primary: { bg: 0x3b82f6, hover: 0x2563eb, border: 0x60a5fa },
  secondary: { bg: 0x374151, hover: 0x4b5563, border: 0x6b7280 },
  ghost: { bg: 0x1f2937, hover: 0x374151, border: 0x4b5563 },
  danger: { bg: 0xef4444, hover: 0xdc2626, border: 0xf87171 },
};

export function createButton(options: ButtonOptions): THREE.Group {
  const {
    text,
    width = 1.2,
    height = 0.35,
    textColor = '#ffffff',
    fontSize = 0.11,
    onClick,
    variant = 'primary',
    glow = false,
  } = options;

  const colors = VARIANT_COLORS[variant];
  const group = new THREE.Group();

  const shape = new THREE.Shape();
  const r = 0.06;
  const x = -width / 2, y = -height / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  geometry.center();

  const material = new THREE.MeshPhysicalMaterial({
    color: colors.bg,
    metalness: 0.2,
    roughness: 0.4,
    clearcoat: 0.5,
    transparent: true,
    opacity: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const label = new Text();
  label.text = text;
  label.fontSize = fontSize;
  label.color = textColor;
  label.anchorX = 'center';
  label.anchorY = 'middle';
  label.position.z = 0.02;
  label.sync();
  group.add(label);

  if (glow) {
    const glowGeom = new THREE.PlaneGeometry(width + 0.15, height + 0.15);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colors.border,
      transparent: true,
      opacity: 0.12,
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.position.z = -0.01;
    group.add(glowMesh);
  }

  group.userData = {
    interactive: true,
    type: 'button',
    onClick,
    defaultColor: colors.bg,
    hoverColor: colors.hover,
    material,
    mesh,
    isHovered: false,
  };

  return group;
}

export function handleButtonHover(button: THREE.Group, hovering: boolean): void {
  const { material, defaultColor, hoverColor, isHovered } = button.userData;
  if (hovering === isHovered) return;
  button.userData.isHovered = hovering;

  if (hovering) {
    gsap.to(button.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.2, ease: 'power2.out' });
    material.color.setHex(hoverColor);
    document.body.style.cursor = 'pointer';
  } else {
    gsap.to(button.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'power2.out' });
    material.color.setHex(defaultColor);
    document.body.style.cursor = 'default';
  }
}
