import * as THREE from 'three';
import gsap from 'gsap';
import { GameScene } from '../core/SceneManager';
import { renderer } from '../core/Renderer';
import { createPanel } from '../ui/Panel3D';
import { createText, createHeading, createLabel } from '../ui/Text3D';
import { createButton } from '../ui/Button3D';
import { createParticleField, updateParticles } from '../ui/ParticleField';
import { eventBus } from '../core/EventBus';

export class LiveStudioScene implements GameScene {
  name = 'liveStudio';
  group = new THREE.Group();
  private particles: THREE.Points | null = null;
  private initialized = false;
  private debateId: number | null = null;
  private participantMeshes: THREE.Group[] = [];
  private waveformBars: THREE.Mesh[] = [];
  private contentGroup = new THREE.Group();

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.setupLighting();
    this.setupBackground();
    this.group.add(this.contentGroup);
  }

  setDebateId(id: number): void {
    this.debateId = id;
    this.loadStudio();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x202040, 0.4);
    this.group.add(ambient);

    const spotLight = new THREE.SpotLight(0x06b6d4, 1, 30, Math.PI / 4);
    spotLight.position.set(0, 8, 10);
    spotLight.castShadow = true;
    this.group.add(spotLight);

    const rimLight = new THREE.PointLight(0x8b5cf6, 0.6, 15);
    rimLight.position.set(-5, 3, 5);
    this.group.add(rimLight);

    const warmLight = new THREE.PointLight(0xf59e0b, 0.3, 12);
    warmLight.position.set(5, -2, 5);
    this.group.add(warmLight);
  }

  private setupBackground(): void {
    this.particles = createParticleField(200, 18);
    this.group.add(this.particles);
  }

  private async loadStudio(): Promise<void> {
    if (!this.debateId) return;

    this.contentGroup.children.forEach(child => {
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) (child as any).material.dispose();
    });
    this.contentGroup.clear();
    this.participantMeshes = [];

    try {
      const res = await fetch(`/api/debates/${this.debateId}/studio/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const debate = await res.json();
      this.renderStudio(debate);
    } catch (err) {
      console.error('Failed to load studio:', err);
    }
  }

  private renderStudio(debate: any): void {
    const { width: viewW, height: viewH } = renderer.getVisibleDimensions();

    const header = createHeading(debate.title || 'Live Studio', 'h2', '#06b6d4');
    header.position.set(-viewW / 2 + 0.5, viewH / 2 - 0.25, 0.1);
    header.maxWidth = viewW - 1;
    header.sync();
    this.contentGroup.add(header);

    const statusText = createText({
      text: `Status: ${debate.status?.toUpperCase() || 'UNKNOWN'} · Round ${debate.currentRound || 0}/${debate.totalRounds || 5}`,
      fontSize: 0.08,
      color: '#94a3b8',
      anchorX: 'left',
      anchorY: 'top',
    });
    statusText.position.set(-viewW / 2 + 0.5, viewH / 2 - 0.5, 0.1);
    this.contentGroup.add(statusText);

    const participants = debate.participants || [];
    const cols = participants.length <= 4 ? 2 : participants.length <= 6 ? 3 : 4;
    const rows = Math.ceil(participants.length / cols);
    const tileW = Math.min((viewW - 3) / cols, 2.0);
    const tileH = Math.min((viewH - 2.5) / rows, 1.5);
    const gridW = cols * (tileW + 0.1);
    const startX = -gridW / 2 + tileW / 2;
    const startY = viewH / 2 - 1.0;

    participants.forEach((p: any, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (tileW + 0.1);
      const y = startY - row * (tileH + 0.1);

      const tile = this.createParticipantTile(p, tileW, tileH);
      tile.position.set(x, y - tileH / 2, 0.05);
      this.contentGroup.add(tile);
      this.participantMeshes.push(tile);

      tile.scale.set(0, 0, 0);
      gsap.to(tile.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.5,
        delay: i * 0.08,
        ease: 'back.out(1.3)',
      });
    });

    this.setupControlBar(viewW, viewH);
    this.setupWaveform(viewW, viewH);
    this.setupTranscriptPanel(viewW, viewH, debate);
  }

  private createParticipantTile(participant: any, w: number, h: number): THREE.Group {
    const isAgent = participant.participantType === 'ai' || participant.participantType === 'agent';
    const borderColor = isAgent ? 0x8b5cf6 : 0x06b6d4;

    const panel = createPanel({
      width: w,
      height: h,
      color: 0x0f172a,
      opacity: 0.92,
      borderColor,
      borderWidth: 0.01,
      glow: true,
      glowColor: borderColor,
      glowIntensity: 0.3,
    });

    const name = participant.user?.displayName || 'Unknown';
    const nameText = createText({
      text: name,
      fontSize: 0.08,
      color: '#f1f5f9',
      fontWeight: 'bold',
      anchorX: 'center',
      anchorY: 'middle',
      maxWidth: w - 0.2,
    });
    nameText.position.set(0, -h / 2 + 0.15, 0.03);
    panel.add(nameText);

    const roleText = createText({
      text: isAgent ? '🤖 AI Agent' : '👤 Human',
      fontSize: 0.06,
      color: isAgent ? '#a78bfa' : '#67e8f9',
      anchorX: 'center',
      anchorY: 'middle',
    });
    roleText.position.set(0, -h / 2 + 0.05, 0.03);
    panel.add(roleText);

    if (isAgent) {
      const avatarCircle = new THREE.Mesh(
        new THREE.CircleGeometry(h * 0.22, 32),
        new THREE.MeshPhysicalMaterial({
          color: borderColor,
          transparent: true,
          opacity: 0.15,
          metalness: 0.5,
          roughness: 0.3,
        })
      );
      avatarCircle.position.set(0, 0.1, 0.02);
      panel.add(avatarCircle);

      const avatarIcon = createText({
        text: '🤖',
        fontSize: h * 0.25,
        anchorX: 'center',
        anchorY: 'middle',
      });
      avatarIcon.position.set(0, 0.1, 0.03);
      panel.add(avatarIcon);
    } else {
      const camPlaceholder = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.7, h * 0.5),
        new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.6,
        })
      );
      camPlaceholder.position.set(0, 0.05, 0.02);
      panel.add(camPlaceholder);

      const camIcon = createText({
        text: '📷',
        fontSize: 0.15,
        anchorX: 'center',
        anchorY: 'middle',
      });
      camIcon.position.set(0, 0.05, 0.03);
      panel.add(camIcon);
    }

    return panel;
  }

  private setupControlBar(viewW: number, viewH: number): void {
    const barY = -viewH / 2 + 0.3;

    const controlBg = createPanel({
      width: viewW * 0.6,
      height: 0.45,
      color: 0x0f172a,
      opacity: 0.95,
      borderColor: 0x1e293b,
      borderWidth: 0.005,
    });
    controlBg.position.set(0, barY, 0.1);
    this.contentGroup.add(controlBg);

    const buttons = [
      { text: '🎤 Mic', variant: 'secondary' as const },
      { text: '📷 Cam', variant: 'secondary' as const },
      { text: '▶ Start', variant: 'primary' as const },
      { text: '🚪 Leave', variant: 'danger' as const },
    ];

    buttons.forEach((btnConf, i) => {
      const btn = createButton({
        text: btnConf.text,
        width: 0.9,
        height: 0.28,
        variant: btnConf.variant,
        onClick: () => eventBus.emit('studioControl', btnConf.text),
      });
      btn.position.set(-1.5 + i * 1.05, barY, 0.12);
      this.contentGroup.add(btn);
    });

    const backBtn = createButton({
      text: '← Back',
      width: 0.8,
      height: 0.28,
      variant: 'ghost',
      onClick: () => eventBus.emit('navigate', '/live-debates'),
    });
    backBtn.position.set(-viewW / 2 + 1, barY, 0.12);
    this.contentGroup.add(backBtn);
  }

  private setupWaveform(viewW: number, viewH: number): void {
    const barCount = 32;
    const barWidth = 0.04;
    const waveX = viewW / 2 - 1.5;
    const waveY = -viewH / 2 + 1.0;

    for (let i = 0; i < barCount; i++) {
      const barHeight = 0.05 + Math.random() * 0.3;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(barWidth, barHeight, 0.01),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().lerpColors(
            new THREE.Color(0x06b6d4),
            new THREE.Color(0x8b5cf6),
            i / barCount
          ),
          transparent: true,
          opacity: 0.7,
        })
      );
      bar.position.set(waveX + i * (barWidth + 0.015), waveY, 0.1);
      this.contentGroup.add(bar);
      this.waveformBars.push(bar);
    }
  }

  private setupTranscriptPanel(viewW: number, viewH: number, debate: any): void {
    const panelW = 2.0;
    const panelH = viewH - 2.0;
    const panelX = viewW / 2 - panelW / 2 - 0.2;

    const panel = createPanel({
      width: panelW,
      height: panelH,
      color: 0x0f172a,
      opacity: 0.9,
      borderColor: 0x1e293b,
      borderWidth: 0.005,
    });
    panel.position.set(panelX, 0, 0);
    this.contentGroup.add(panel);

    const transcriptLabel = createLabel('TRANSCRIPT', '#94a3b8');
    transcriptLabel.position.set(panelX - panelW / 2 + 0.15, panelH / 2 - 0.15, 0.03);
    this.contentGroup.add(transcriptLabel);

    const turns = debate.turns || [];
    const displayed = turns.slice(-5);
    displayed.forEach((turn: any, i: number) => {
      const speaker = debate.participants?.find((p: any) => p.id === turn.participantId);
      const speakerName = speaker?.user?.displayName || 'Unknown';
      const turnText = createText({
        text: `${speakerName}: ${(turn.content || '').substring(0, 80)}...`,
        fontSize: 0.055,
        color: '#cbd5e1',
        maxWidth: panelW - 0.3,
        anchorX: 'left',
        anchorY: 'top',
        lineHeight: 1.3,
      });
      turnText.position.set(panelX - panelW / 2 + 0.15, panelH / 2 - 0.4 - i * 0.5, 0.03);
      this.contentGroup.add(turnText);
    });
  }

  update(dt: number, elapsed: number): void {
    if (this.particles) updateParticles(this.particles, dt);

    this.waveformBars.forEach((bar, i) => {
      const targetScale = 0.3 + Math.sin(elapsed * 3 + i * 0.4) * 0.5 + Math.random() * 0.2;
      bar.scale.y += (targetScale - bar.scale.y) * 0.1;
    });
  }

  onEnter(): void {}
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
