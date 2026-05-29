import * as THREE from 'three';
import { eventBus } from './EventBus';

export class Renderer {
  public renderer: THREE.WebGLRenderer | null = null;
  public camera: THREE.PerspectiveCamera;
  public scene: THREE.Scene;
  public webglAvailable: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  private container: HTMLElement | null = null;
  private clock: THREE.Clock;
  private rafId: number = 0;
  private running: boolean = false;
  private renderCallbacks: Set<(dt: number, elapsed: number) => void> = new Set();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 10);
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
  }

  private initWebGL(): boolean {
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        console.warn('WebGL not supported by this browser');
        this.webglAvailable = false;
        return false;
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: testCanvas,
        context: gl as WebGLRenderingContext,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.webglAvailable = true;
      return true;
    } catch (e) {
      console.warn('WebGL not available, using 2D fallback:', e);
      this.renderer = null;
      this.webglAvailable = false;
      return false;
    }
  }

  mount(container: HTMLElement): void {
    this.container = container;

    if (!this.initWebGL() || !this.renderer) {
      eventBus.emit('webglFailed');
      return;
    }

    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.handleResize();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  private handleResize(): void {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    eventBus.emit('resize', w, h);
  }

  onRender(callback: (dt: number, elapsed: number) => void): () => void {
    this.renderCallbacks.add(callback);
    return () => this.renderCallbacks.delete(callback);
  }

  start(): void {
    if (this.running || !this.renderer) return;
    this.running = true;
    this.clock.start();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private tick = (): void => {
    if (!this.running || !this.renderer) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    this.renderCallbacks.forEach(cb => cb(dt, elapsed));
    this.renderer.render(this.scene, this.camera);
  };

  getSize(): { width: number; height: number } {
    return {
      width: this.container?.clientWidth || window.innerWidth,
      height: this.container?.clientHeight || window.innerHeight,
    };
  }

  screenToWorld(screenX: number, screenY: number, z: number = 0): THREE.Vector3 {
    const ndc = new THREE.Vector3(
      (screenX / this.getSize().width) * 2 - 1,
      -(screenY / this.getSize().height) * 2 + 1,
      0.5
    );
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const dist = (z - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  getVisibleDimensions(z: number = 0): { width: number; height: number } {
    const dist = Math.abs(this.camera.position.z - z);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFov / 2) * dist;
    const width = height * this.camera.aspect;
    return { width, height };
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
    this.renderCallbacks.clear();
  }
}

export const renderer = new Renderer();
