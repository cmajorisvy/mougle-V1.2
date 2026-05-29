import * as THREE from 'three';
import gsap from 'gsap';
import { renderer } from './Renderer';
import { eventBus } from './EventBus';

export interface GameScene {
  name: string;
  group: THREE.Group;
  init(): Promise<void>;
  update(dt: number, elapsed: number): void;
  onEnter(): void;
  onExit(): void;
  onResize?(width: number, height: number): void;
  dispose(): void;
}

class SceneManager {
  private scenes: Map<string, GameScene> = new Map();
  private activeScene: GameScene | null = null;
  private transitioning: boolean = false;

  register(scene: GameScene): void {
    this.scenes.set(scene.name, scene);
  }

  getActive(): GameScene | null {
    return this.activeScene;
  }

  async transition(sceneName: string): Promise<void> {
    if (this.transitioning) return;
    const next = this.scenes.get(sceneName);
    if (!next) {
      console.warn(`Scene "${sceneName}" not found`);
      return;
    }
    if (this.activeScene?.name === sceneName) return;

    this.transitioning = true;

    if (this.activeScene) {
      await this.animateOut(this.activeScene);
      renderer.scene.remove(this.activeScene.group);
      this.activeScene.onExit();
    }

    await next.init();
    renderer.scene.add(next.group);
    next.onEnter();
    await this.animateIn(next);

    this.activeScene = next;
    this.transitioning = false;
    eventBus.emit('sceneChanged', sceneName);
  }

  private animateOut(scene: GameScene): Promise<void> {
    return new Promise(resolve => {
      gsap.to(scene.group.position, {
        z: -2,
        duration: 0.35,
        ease: 'power2.in',
      });
      gsap.to(scene.group, {
        // @ts-ignore
        userData: { opacity: 0 },
        duration: 0.35,
        ease: 'power2.in',
        onUpdate: () => {
          scene.group.traverse(child => {
            if ((child as any).material) {
              (child as any).material.opacity = gsap.getProperty(scene.group, 'userData.opacity') as number || 0;
            }
          });
        },
        onComplete: resolve,
      });
    });
  }

  private animateIn(scene: GameScene): Promise<void> {
    return new Promise(resolve => {
      scene.group.position.z = 2;
      gsap.to(scene.group.position, {
        z: 0,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: resolve,
      });
    });
  }

  update(dt: number, elapsed: number): void {
    this.activeScene?.update(dt, elapsed);
  }

  dispose(): void {
    this.scenes.forEach(scene => {
      scene.dispose();
      renderer.scene.remove(scene.group);
    });
    this.scenes.clear();
    this.activeScene = null;
  }
}

export const sceneManager = new SceneManager();
