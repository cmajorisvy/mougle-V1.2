import * as THREE from 'three';
import gsap from 'gsap';
import { createPanel } from './Panel3D';
import { createText, createLabel } from './Text3D';

export interface CardOptions {
  width: number;
  height: number;
  title?: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: number;
  borderColor?: number;
  onClick?: () => void;
  glow?: boolean;
  glowColor?: number;
}

export function createCard(options: CardOptions): THREE.Group {
  const {
    width, height,
    title, subtitle, badge,
    badgeColor = 0x3b82f6,
    borderColor = 0x2d3748,
    onClick,
    glow = false,
    glowColor = 0x3b82f6,
  } = options;

  const panel = createPanel({
    width,
    height,
    color: 0x1e293b,
    opacity: 0.9,
    borderColor,
    borderWidth: 0.008,
    glow,
    glowColor,
  });

  const contentY = height / 2 - 0.12;
  const contentX = -width / 2 + 0.12;

  if (badge) {
    const badgeText = createLabel(badge, '#60a5fa');
    badgeText.position.set(contentX, contentY, 0.03);
    panel.add(badgeText);
  }

  if (title) {
    const titleText = createText({
      text: title,
      fontSize: 0.1,
      color: '#f1f5f9',
      fontWeight: 'bold',
      maxWidth: width - 0.3,
      anchorX: 'left',
      anchorY: 'top',
    });
    titleText.position.set(contentX, contentY - (badge ? 0.15 : 0), 0.03);
    panel.add(titleText);
  }

  if (subtitle) {
    const subText = createText({
      text: subtitle,
      fontSize: 0.07,
      color: '#94a3b8',
      maxWidth: width - 0.3,
      anchorX: 'left',
      anchorY: 'top',
    });
    subText.position.set(contentX, contentY - (badge ? 0.3 : 0.15), 0.03);
    panel.add(subText);
  }

  panel.userData.interactive = !!onClick;
  panel.userData.type = 'card';
  panel.userData.onClick = onClick;
  panel.userData.isHovered = false;

  return panel;
}

export function handleCardHover(card: THREE.Group, hovering: boolean): void {
  if (hovering === card.userData.isHovered) return;
  card.userData.isHovered = hovering;

  if (hovering) {
    gsap.to(card.position, { z: 0.08, duration: 0.25, ease: 'power2.out' });
    gsap.to(card.scale, { x: 1.02, y: 1.02, duration: 0.25, ease: 'power2.out' });
    if (card.userData.glowMesh) {
      gsap.to(card.userData.glowMesh.material, { opacity: 0.25, duration: 0.25 });
    }
    document.body.style.cursor = 'pointer';
  } else {
    gsap.to(card.position, { z: 0, duration: 0.25, ease: 'power2.out' });
    gsap.to(card.scale, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
    if (card.userData.glowMesh) {
      gsap.to(card.userData.glowMesh.material, { opacity: 0.12, duration: 0.25 });
    }
    document.body.style.cursor = 'default';
  }
}

export function animateCardStagger(cards: THREE.Group[], stagger: number = 0.08): gsap.core.Timeline {
  const tl = gsap.timeline();
  cards.forEach((card, i) => {
    card.scale.set(0.8, 0.8, 0.8);
    card.position.y -= 0.3;
    const mat = card.userData.panelMaterial;
    if (mat) mat.opacity = 0;

    tl.to(card.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(1.3)' }, i * stagger);
    tl.to(card.position, { y: `+=${0.3}`, duration: 0.4, ease: 'power2.out' }, i * stagger);
    if (mat) {
      tl.to(mat, { opacity: 0.9, duration: 0.35, ease: 'power2.out' }, i * stagger);
    }
  });
  return tl;
}
