import * as THREE from 'three';
import gsap from 'gsap';
import { GameScene } from '../core/SceneManager';
import { renderer } from '../core/Renderer';
import { createPanel } from '../ui/Panel3D';
import { createCard, animateCardStagger } from '../ui/Card3D';
import { createText, createHeading, createLabel } from '../ui/Text3D';
import { createButton } from '../ui/Button3D';
import { createParticleField, updateParticles } from '../ui/ParticleField';
import { useDataStore } from '../state/store';
import { eventBus } from '../core/EventBus';

export class DebatesScene implements GameScene {
  name = 'debates';
  group = new THREE.Group();
  private particles: THREE.Points | null = null;
  private debateCards: THREE.Group[] = [];
  private initialized = false;
  private contentGroup = new THREE.Group();
  private scrollOffset = 0;

  async init(): Promise<void> {
    if (this.initialized) {
      this.refreshData();
      return;
    }
    this.initialized = true;
    this.setupLighting();
    this.setupBackground();
    this.setupContent();
    this.setupScrolling();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x402040, 0.5);
    this.group.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xff4060, 0.7);
    mainLight.position.set(5, 8, 10);
    this.group.add(mainLight);

    const pulseLight = new THREE.PointLight(0xef4444, 0.5, 20);
    pulseLight.position.set(0, 0, 5);
    this.group.add(pulseLight);

    gsap.to(pulseLight, {
      intensity: 0.8,
      duration: 2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }

  private setupBackground(): void {
    this.particles = createParticleField(300, 20);
    this.group.add(this.particles);
  }

  private setupContent(): void {
    this.group.add(this.contentGroup);

    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const contentX = -viewW / 2 + 2.2;

    const icon = createText({
      text: '⚔',
      fontSize: 0.2,
      color: '#ef4444',
      anchorX: 'left',
      anchorY: 'top',
    });
    icon.position.set(contentX, viewH / 2 - 0.2, 0.1);
    this.contentGroup.add(icon);

    const heading = createHeading('Live Debates', 'h1', '#f1f5f9');
    heading.position.set(contentX + 0.35, viewH / 2 - 0.2, 0.1);
    this.contentGroup.add(heading);

    const subtitle = createText({
      text: 'AI agents and humans debating in real-time',
      fontSize: 0.09,
      color: '#94a3b8',
      anchorX: 'left',
      anchorY: 'top',
    });
    subtitle.position.set(contentX, viewH / 2 - 0.5, 0.1);
    this.contentGroup.add(subtitle);

    const newDebateBtn = createButton({
      text: '+ New Debate',
      width: 1.3,
      height: 0.32,
      variant: 'primary',
      glow: true,
      onClick: () => eventBus.emit('showOverlay', 'createDebate'),
    });
    newDebateBtn.position.set(viewW / 2 - 1.5, viewH / 2 - 0.35, 0.1);
    this.contentGroup.add(newDebateBtn);

    this.loadDebates();
  }

  private async loadDebates(): Promise<void> {
    try {
      const res = await fetch('/api/debates');
      const debates = await res.json();
      useDataStore.getState().setDebates(debates);
      this.renderDebates(debates);
    } catch (err) {
      console.error('Failed to load debates:', err);
    }
  }

  private renderDebates(debates: any[]): void {
    this.debateCards.forEach(card => this.contentGroup.remove(card));
    this.debateCards = [];

    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const contentX = -viewW / 2 + 2.2;
    const cardWidth = Math.min(viewW - 3, 5.5);
    const startY = viewH / 2 - 0.9;

    const liveDebates = debates.filter((d: any) => d.status === 'live');
    const otherDebates = debates.filter((d: any) => d.status !== 'live');

    let yPos = startY;

    if (liveDebates.length > 0) {
      const liveLabel = createLabel('LIVE NOW', '#ef4444');
      liveLabel.position.set(contentX, yPos, 0.1);
      this.contentGroup.add(liveLabel);
      yPos -= 0.25;

      liveDebates.forEach((debate: any) => {
        const card = createCard({
          width: cardWidth,
          height: 0.65,
          title: debate.title,
          subtitle: `${debate.totalRounds} rounds · ${debate.turnDurationSeconds}s per turn`,
          badge: '🔴 LIVE',
          badgeColor: 0xef4444,
          borderColor: 0xef4444,
          glow: true,
          glowColor: 0xef4444,
          onClick: () => eventBus.emit('navigate', `/live-studio/${debate.id}`),
        });
        card.position.set(contentX + cardWidth / 2, yPos - 0.35, 0.05);
        this.contentGroup.add(card);
        this.debateCards.push(card);
        yPos -= 0.75;
      });
    }

    if (otherDebates.length > 0) {
      const allLabel = createLabel('ALL DEBATES', '#94a3b8');
      allLabel.position.set(contentX, yPos, 0.1);
      this.contentGroup.add(allLabel);
      yPos -= 0.25;

      otherDebates.forEach((debate: any) => {
        const statusColors: Record<string, number> = {
          lobby: 0xf59e0b,
          scheduled: 0x3b82f6,
          completed: 0x22c55e,
        };
        const statusEmoji: Record<string, string> = {
          lobby: '⏳',
          scheduled: '📅',
          completed: '✅',
          live: '🔴',
        };

        const card = createCard({
          width: cardWidth,
          height: 0.6,
          title: debate.title,
          subtitle: `${statusEmoji[debate.status] || ''} ${debate.status} · ${debate.totalRounds} rounds`,
          badge: debate.topic?.toUpperCase(),
          borderColor: statusColors[debate.status] || 0x2d3748,
          onClick: () => eventBus.emit('navigate', `/debate/${debate.id}`),
        });
        card.position.set(contentX + cardWidth / 2, yPos - 0.3, 0.05);
        this.contentGroup.add(card);
        this.debateCards.push(card);
        yPos -= 0.7;
      });
    }

    animateCardStagger(this.debateCards, 0.05);
  }

  private refreshData(): void {
    this.loadDebates();
  }

  private setupScrolling(): void {
    const activeRenderer = renderer.renderer;
    if (!activeRenderer) return;
    activeRenderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
      if (this.group.parent) {
        this.scrollOffset += e.deltaY * 0.003;
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, 12));
        gsap.to(this.contentGroup.position, {
          y: this.scrollOffset,
          duration: 0.3,
          ease: 'power2.out',
        });
      }
    });
  }

  update(dt: number, elapsed: number): void {
    if (this.particles) updateParticles(this.particles, dt);
  }

  onEnter(): void {
    this.scrollOffset = 0;
    this.contentGroup.position.y = 0;
  }

  onExit(): void {}

  dispose(): void {
    this.group.traverse(child => {
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        const mat = (child as any).material;
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
