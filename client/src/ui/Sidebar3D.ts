import * as THREE from 'three';
import gsap from 'gsap';
import { createPanel } from './Panel3D';
import { createText } from './Text3D';
import { renderer } from '../core/Renderer';
import { eventBus } from '../core/EventBus';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', icon: '⌂', route: '/' },
  { label: 'Discussions', icon: '💬', route: '/discussions' },
  { label: 'AI News', icon: '📰', route: '/ai-news-updates' },
  { label: 'Agents', icon: '🤖', route: '/dashboard' },
  { label: 'Rankings', icon: '🏆', route: '/ranking' },
  { label: 'Credits', icon: '💰', route: '/credits' },
  { label: 'Billing', icon: '💳', route: '/billing' },
  { label: 'Profile', icon: '👤', route: '/profile' },
  { label: 'Settings', icon: '⚙', route: '/settings' },
];

export function createSidebar(onNavigate: (route: string) => void): THREE.Group {
  const group = new THREE.Group();
  const { height: viewHeight } = renderer.getVisibleDimensions();

  const sidebarWidth = 1.6;
  const sidebarHeight = viewHeight * 0.95;

  const bg = createPanel({
    width: sidebarWidth,
    height: sidebarHeight,
    color: 0x0f172a,
    opacity: 0.95,
    borderColor: 0x1e293b,
    borderWidth: 0.005,
    depth: 0.01,
  });
  group.add(bg);

  const logo = createText({
    text: 'MOUGLE',
    fontSize: 0.14,
    color: '#60a5fa',
    fontWeight: 'bold',
    anchorX: 'left',
    anchorY: 'top',
    letterSpacing: 0.03,
  });
  logo.position.set(-sidebarWidth / 2 + 0.15, sidebarHeight / 2 - 0.2, 0.03);
  group.add(logo);

  const itemHeight = 0.28;
  const startY = sidebarHeight / 2 - 0.6;

  NAV_ITEMS.forEach((item, i) => {
    const itemGroup = new THREE.Group();
    const y = startY - i * itemHeight;

    const hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(sidebarWidth - 0.2, itemHeight - 0.04),
      new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0,
      })
    );
    hitArea.position.set(0, 0, 0.02);
    itemGroup.add(hitArea);

    const iconText = createText({
      text: item.icon,
      fontSize: 0.12,
      color: '#94a3b8',
      anchorX: 'left',
      anchorY: 'middle',
    });
    iconText.position.set(-sidebarWidth / 2 + 0.2, 0, 0.03);
    itemGroup.add(iconText);

    const labelText = createText({
      text: item.label,
      fontSize: 0.09,
      color: '#cbd5e1',
      anchorX: 'left',
      anchorY: 'middle',
    });
    labelText.position.set(-sidebarWidth / 2 + 0.45, 0, 0.03);
    itemGroup.add(labelText);

    itemGroup.position.set(0, y, 0);
    itemGroup.userData = {
      interactive: true,
      type: 'navItem',
      route: item.route,
      onClick: () => onNavigate(item.route),
      isHovered: false,
      hitArea,
      labelText,
      iconText,
    };

    group.add(itemGroup);
  });

  group.userData.sidebarWidth = sidebarWidth;
  return group;
}

export function handleNavItemHover(item: THREE.Group, hovering: boolean): void {
  if (hovering === item.userData.isHovered) return;
  item.userData.isHovered = hovering;
  const hitArea = item.userData.hitArea;

  if (hovering) {
    gsap.to(hitArea.material, { opacity: 0.3, duration: 0.2 });
    gsap.to(item.position, { x: 0.05, duration: 0.2, ease: 'power2.out' });
    document.body.style.cursor = 'pointer';
  } else {
    gsap.to(hitArea.material, { opacity: 0, duration: 0.2 });
    gsap.to(item.position, { x: 0, duration: 0.2, ease: 'power2.out' });
    document.body.style.cursor = 'default';
  }
}

export function highlightActiveNavItem(sidebar: THREE.Group, route: string): void {
  sidebar.children.forEach(child => {
    if (child.userData?.type === 'navItem') {
      const isActive = child.userData.route === route;
      const hitArea = child.userData.hitArea;
      if (hitArea) {
        gsap.to(hitArea.material, {
          opacity: isActive ? 0.2 : 0,
          duration: 0.3,
        });
        hitArea.material.color.setHex(isActive ? 0x3b82f6 : 0x1e293b);
      }
    }
  });
}
