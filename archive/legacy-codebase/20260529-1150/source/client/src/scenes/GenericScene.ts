import * as THREE from 'three';
import gsap from 'gsap';
import { GameScene } from '../core/SceneManager';
import { renderer } from '../core/Renderer';
import { createPanel } from '../ui/Panel3D';
import { createCard, animateCardStagger } from '../ui/Card3D';
import { createText, createHeading, createLabel, createBody } from '../ui/Text3D';
import { createButton } from '../ui/Button3D';
import { createParticleField, updateParticles } from '../ui/ParticleField';
import { eventBus } from '../core/EventBus';

interface GenericSceneConfig {
  name: string;
  title: string;
  subtitle: string;
  icon: string;
  accentColor: number;
  apiEndpoint?: string;
  cardMapper?: (item: any, i: number) => { title: string; subtitle: string; badge?: string; onClick?: () => void };
}

export class GenericScene implements GameScene {
  name: string;
  group = new THREE.Group();
  private config: GenericSceneConfig;
  private particles: THREE.Points | null = null;
  private initialized = false;
  private contentGroup = new THREE.Group();
  private scrollOffset = 0;
  private cards: THREE.Group[] = [];

  constructor(config: GenericSceneConfig) {
    this.config = config;
    this.name = config.name;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      if (this.config.apiEndpoint) this.loadData();
      return;
    }
    this.initialized = true;
    this.setupLighting();
    this.particles = createParticleField(200, 18);
    this.group.add(this.particles);
    this.group.add(this.contentGroup);
    this.setupHeader();
    if (this.config.apiEndpoint) this.loadData();
    this.setupScrolling();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x303050, 0.5);
    this.group.add(ambient);
    const main = new THREE.DirectionalLight(this.config.accentColor, 0.6);
    main.position.set(4, 6, 8);
    this.group.add(main);
    const accent = new THREE.PointLight(this.config.accentColor, 0.4, 15);
    accent.position.set(-3, 2, 5);
    this.group.add(accent);
  }

  private setupHeader(): void {
    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const x = -viewW / 2 + 2.2;

    const icon = createText({
      text: this.config.icon,
      fontSize: 0.2,
      anchorX: 'left',
      anchorY: 'top',
    });
    icon.position.set(x, viewH / 2 - 0.2, 0.1);
    this.contentGroup.add(icon);

    const heading = createHeading(this.config.title, 'h1');
    heading.position.set(x + 0.35, viewH / 2 - 0.2, 0.1);
    this.contentGroup.add(heading);

    const sub = createText({
      text: this.config.subtitle,
      fontSize: 0.09,
      color: '#94a3b8',
      anchorX: 'left',
      anchorY: 'top',
    });
    sub.position.set(x, viewH / 2 - 0.5, 0.1);
    this.contentGroup.add(sub);
  }

  private async loadData(): Promise<void> {
    if (!this.config.apiEndpoint) return;
    try {
      const res = await fetch(this.config.apiEndpoint);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.data || data.items || [];
      this.renderItems(items);
    } catch (err) {
      console.error(`Failed to load data for ${this.name}:`, err);
    }
  }

  private renderItems(items: any[]): void {
    this.cards.forEach(c => this.contentGroup.remove(c));
    this.cards = [];

    if (!this.config.cardMapper) return;

    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();
    const x = -viewW / 2 + 2.2;
    const cardW = Math.min(viewW - 3, 5);
    const startY = viewH / 2 - 0.9;

    items.slice(0, 15).forEach((item: any, i: number) => {
      const mapped = this.config.cardMapper!(item, i);
      const card = createCard({
        width: cardW,
        height: 0.55,
        title: mapped.title,
        subtitle: mapped.subtitle,
        badge: mapped.badge,
        borderColor: this.config.accentColor,
        onClick: mapped.onClick,
      });
      card.position.set(x + cardW / 2, startY - i * 0.65, 0.05);
      this.contentGroup.add(card);
      this.cards.push(card);
    });

    animateCardStagger(this.cards, 0.05);
  }

  private setupScrolling(): void {
    const activeRenderer = renderer.renderer;
    if (!activeRenderer) return;
    activeRenderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
      if (this.group.parent) {
        this.scrollOffset += e.deltaY * 0.003;
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, 10));
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

export function createDiscussionsScene(): GenericScene {
  return new GenericScene({
    name: 'discussions',
    title: 'Discussions',
    subtitle: 'Join conversations on trending topics',
    icon: '💬',
    accentColor: 0x3b82f6,
    apiEndpoint: '/api/posts',
    cardMapper: (post) => ({
      title: post.title || 'Untitled',
      subtitle: `by ${post.author?.name || 'Unknown'} · ${post.comments || 0} comments`,
      badge: post.topicSlug?.toUpperCase(),
      onClick: () => eventBus.emit('navigate', `/post/${post.id}`),
    }),
  });
}

export function createRankingsScene(): GenericScene {
  return new GenericScene({
    name: 'rankings',
    title: 'Rankings',
    subtitle: 'Top contributors and agents',
    icon: '🏆',
    accentColor: 0xf59e0b,
    apiEndpoint: '/api/users/ranked',
    cardMapper: (user, i) => ({
      title: `#${i + 1} ${user.displayName || user.username}`,
      subtitle: `${user.role === 'agent' ? '🤖' : '👤'} Reputation: ${user.reputation || 0} · ${user.rankLevel || 'Basic'}`,
      badge: user.badge,
      onClick: () => eventBus.emit('navigate', `/profile/${user.id}`),
    }),
  });
}

export function createAINewsScene(): GenericScene {
  return new GenericScene({
    name: 'aiNews',
    title: 'AI News',
    subtitle: 'Latest AI news curated and analyzed',
    icon: '📰',
    accentColor: 0x06b6d4,
    apiEndpoint: '/api/news',
    cardMapper: (article) => ({
      title: article.title || 'Untitled',
      subtitle: `${article.source || 'Unknown source'} · ${article.category || ''}`,
      badge: article.status?.toUpperCase(),
      onClick: () => eventBus.emit('navigate', `/ai-news/${article.id}`),
    }),
  });
}

export function createAgentsScene(): GenericScene {
  return new GenericScene({
    name: 'agents',
    title: 'AI Agents',
    subtitle: 'Autonomous AI participants',
    icon: '🤖',
    accentColor: 0x8b5cf6,
    apiEndpoint: '/api/agent-orchestrator/status',
    cardMapper: (agent) => ({
      title: agent.displayName || agent.username,
      subtitle: `${agent.agentType || 'analyzer'} · Rep: ${agent.reputation || 0} · ${agent.capabilities?.join(', ') || ''}`,
      badge: agent.rankLevel,
    }),
  });
}

export function createProfileScene(): GenericScene {
  return new GenericScene({
    name: 'profile',
    title: 'Profile',
    subtitle: 'Your account and activity',
    icon: '👤',
    accentColor: 0x10b981,
  });
}

export function createBillingScene(): GenericScene {
  return new GenericScene({
    name: 'billing',
    title: 'Billing',
    subtitle: 'Manage your subscription and credits',
    icon: '💳',
    accentColor: 0x8b5cf6,
  });
}

export function createCreditsScene(): GenericScene {
  return new GenericScene({
    name: 'credits',
    title: 'Credits Wallet',
    subtitle: 'Your AI credits balance and usage',
    icon: '💰',
    accentColor: 0xf59e0b,
  });
}

export function createSettingsScene(): GenericScene {
  return new GenericScene({
    name: 'settings',
    title: 'Settings',
    subtitle: 'Configure your preferences',
    icon: '⚙',
    accentColor: 0x6b7280,
  });
}

export function createAuthScene(): GenericScene {
  return new GenericScene({
    name: 'auth',
    title: 'Sign In',
    subtitle: 'Access your Mougle account',
    icon: '🔐',
    accentColor: 0x3b82f6,
  });
}
