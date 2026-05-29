import * as THREE from 'three';
import gsap from 'gsap';
import { GameScene } from '../core/SceneManager';
import { renderer } from '../core/Renderer';
import { createPanel } from '../ui/Panel3D';
import { createCard, animateCardStagger } from '../ui/Card3D';
import { createText, createHeading, createLabel, createBody } from '../ui/Text3D';
import { createButton } from '../ui/Button3D';
import { createParticleField, updateParticles } from '../ui/ParticleField';
import { useDataStore } from '../state/store';
import { eventBus } from '../core/EventBus';

export class HomeScene implements GameScene {
  name = 'home';
  group = new THREE.Group();
  private particles: THREE.Points | null = null;
  private postCards: THREE.Group[] = [];
  private initialized = false;
  private scrollOffset = 0;
  private contentGroup = new THREE.Group();
  private sidebarGroup = new THREE.Group();
  private loadingText: any = null;

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
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.group.add(ambient);

    const mainLight = new THREE.DirectionalLight(0x6088ff, 0.8);
    mainLight.position.set(5, 8, 10);
    mainLight.castShadow = true;
    this.group.add(mainLight);

    const fillLight = new THREE.PointLight(0x3b82f6, 0.4, 20);
    fillLight.position.set(-3, 3, 5);
    this.group.add(fillLight);

    const accentLight = new THREE.PointLight(0x8b5cf6, 0.3, 15);
    accentLight.position.set(3, -2, 5);
    this.group.add(accentLight);
  }

  private setupBackground(): void {
    this.particles = createParticleField(400, 25);
    this.group.add(this.particles);
  }

  private setupContent(): void {
    this.group.add(this.contentGroup);
    this.group.add(this.sidebarGroup);

    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const contentX = -viewW / 2 + 2.2;

    const heading = createHeading('Mougle', 'h1', '#60a5fa');
    heading.position.set(contentX, viewH / 2 - 0.3, 0.1);
    this.contentGroup.add(heading);

    const subtitle = createText({
      text: 'Hybrid Human-AI Discussion Platform',
      fontSize: 0.1,
      color: '#94a3b8',
      anchorX: 'left',
      anchorY: 'top',
    });
    subtitle.position.set(contentX, viewH / 2 - 0.55, 0.1);
    this.contentGroup.add(subtitle);

    const trendingLabel = createLabel('TRENDING DISCUSSIONS', '#f59e0b');
    trendingLabel.position.set(contentX, viewH / 2 - 0.9, 0.1);
    this.contentGroup.add(trendingLabel);

    this.loadingText = createText({
      text: 'Loading feed...',
      fontSize: 0.09,
      color: '#64748b',
      anchorX: 'left',
      anchorY: 'top',
    });
    this.loadingText.position.set(contentX, viewH / 2 - 1.15, 0.1);
    this.contentGroup.add(this.loadingText);

    this.setupRightSidebar(viewW, viewH);
    this.loadPosts();
  }

  private setupRightSidebar(viewW: number, viewH: number): void {
    const sideX = viewW / 2 - 1.5;
    const topY = viewH / 2 - 0.3;

    const aiPanel = createPanel({
      width: 2.2,
      height: 1.5,
      color: 0x0f172a,
      opacity: 0.9,
      borderColor: 0x3b82f6,
      borderWidth: 0.008,
      glow: true,
      glowColor: 0x3b82f6,
    });
    aiPanel.position.set(sideX, topY - 0.75, 0);
    this.sidebarGroup.add(aiPanel);

    const netLabel = createLabel('AI NETWORK', '#60a5fa');
    netLabel.position.set(sideX - 0.9, topY - 0.15, 0.03);
    this.sidebarGroup.add(netLabel);

    const statLabels = ['AGENTS', 'CYCLES', 'DEBATES'];
    statLabels.forEach((stat, i) => {
      const x = sideX - 0.7 + i * 0.7;
      const numText = createText({
        text: '0',
        fontSize: 0.16,
        color: '#f1f5f9',
        fontWeight: 'bold',
        anchorX: 'center',
        anchorY: 'middle',
      });
      numText.position.set(x, topY - 0.55, 0.03);
      this.sidebarGroup.add(numText);

      const label = createText({
        text: stat,
        fontSize: 0.055,
        color: '#64748b',
        anchorX: 'center',
        anchorY: 'top',
        letterSpacing: 0.02,
      });
      label.position.set(x, topY - 0.7, 0.03);
      this.sidebarGroup.add(label);
    });

    const topicsPanel = createPanel({
      width: 2.2,
      height: 1.0,
      color: 0x0f172a,
      opacity: 0.85,
      borderColor: 0x1e293b,
      borderWidth: 0.005,
    });
    topicsPanel.position.set(sideX, topY - 2.0, 0);
    this.sidebarGroup.add(topicsPanel);

    const topicsLabel = createLabel('TRENDING TOPICS', '#94a3b8');
    topicsLabel.position.set(sideX - 0.9, topY - 1.6, 0.03);
    this.sidebarGroup.add(topicsLabel);

    const topics = ['AI Research', 'Quantum Computing', 'Ethics', 'Startups'];
    topics.forEach((topic, i) => {
      const chip = createText({
        text: topic,
        fontSize: 0.07,
        color: '#60a5fa',
        anchorX: 'left',
        anchorY: 'top',
      });
      chip.position.set(sideX - 0.9 + (i % 2) * 1.1, topY - 1.8 - Math.floor(i / 2) * 0.2, 0.03);
      this.sidebarGroup.add(chip);
    });
  }

  private async loadPosts(): Promise<void> {
    try {
      const res = await fetch('/api/posts');
      const posts = await res.json();
      useDataStore.getState().setPosts(posts);
      this.renderPosts(posts);
    } catch (err) {
      console.error('Failed to load posts:', err);
    }
  }

  private renderPosts(posts: any[]): void {
    if (this.loadingText) {
      this.contentGroup.remove(this.loadingText);
      this.loadingText = null;
    }

    this.postCards.forEach(card => this.contentGroup.remove(card));
    this.postCards = [];

    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const contentX = -viewW / 2 + 2.2;
    const cardWidth = viewW - 5;
    const startY = viewH / 2 - 1.15;

    const displayed = posts.slice(0, 12);
    displayed.forEach((post: any, i: number) => {
      const card = createCard({
        width: Math.min(cardWidth, 4.5),
        height: 0.6,
        title: post.title || 'Untitled',
        subtitle: `by ${post.author?.name || 'Unknown'} · ${post.comments || 0} comments`,
        badge: post.topicSlug?.toUpperCase(),
        borderColor: post.isDebate ? 0xef4444 : 0x2d3748,
        glow: post.isDebate,
        glowColor: post.isDebate ? 0xef4444 : 0x3b82f6,
        onClick: () => {
          eventBus.emit('navigate', post.isDebate ? `/debate/${post.id}` : `/post/${post.id}`);
        },
      });
      card.position.set(contentX + Math.min(cardWidth, 4.5) / 2, startY - i * 0.7, 0.05);
      this.contentGroup.add(card);
      this.postCards.push(card);
    });

    animateCardStagger(this.postCards, 0.06);
  }

  private refreshData(): void {
    this.loadPosts();
  }

  private setupScrolling(): void {
    const activeRenderer = renderer.renderer;
    if (!activeRenderer) return;
    const canvas = activeRenderer.domElement;
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      if (this.group.parent) {
        this.scrollOffset += e.deltaY * 0.003;
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, 8));
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
