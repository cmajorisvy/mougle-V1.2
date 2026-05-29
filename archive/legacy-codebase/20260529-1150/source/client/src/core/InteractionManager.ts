import * as THREE from 'three';
import { renderer } from './Renderer';
import { handleButtonHover } from '../ui/Button3D';
import { handleCardHover } from '../ui/Card3D';

class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private hoveredObject: THREE.Object3D | null = null;
  private enabled: boolean = true;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('touchstart', this.onTouch, { passive: false });
  }

  detach(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
    canvas.removeEventListener('touchstart', this.onTouch);
  }

  private updateMouse(event: MouseEvent | Touch): void {
    if (!renderer.renderer) return;
    const rect = renderer.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private getInteractiveObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    renderer.scene.traverse(obj => {
      if (obj.userData?.interactive) objects.push(obj);
    });
    return objects;
  }

  private findInteractiveParent(obj: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.userData?.interactive) return current;
      current = current.parent;
    }
    return null;
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) return;
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, renderer.camera);

    const objects = this.getInteractiveObjects();
    const allMeshes: THREE.Mesh[] = [];
    objects.forEach(obj => {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    let newHovered: THREE.Object3D | null = null;

    if (intersects.length > 0) {
      newHovered = this.findInteractiveParent(intersects[0].object);
    }

    if (newHovered !== this.hoveredObject) {
      if (this.hoveredObject) {
        this.handleHover(this.hoveredObject, false);
      }
      if (newHovered) {
        this.handleHover(newHovered, true);
      }
      this.hoveredObject = newHovered;
    }

    if (!newHovered) {
      document.body.style.cursor = 'default';
    }
  };

  private onClick = (event: MouseEvent): void => {
    if (!this.enabled) return;
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, renderer.camera);

    const objects = this.getInteractiveObjects();
    const allMeshes: THREE.Mesh[] = [];
    objects.forEach(obj => {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const target = this.findInteractiveParent(intersects[0].object);
      if (target?.userData?.onClick) {
        target.userData.onClick();
      }
    }
  };

  private onTouch = (event: TouchEvent): void => {
    if (!this.enabled || !event.touches.length) return;
    this.updateMouse(event.touches[0]);
    this.raycaster.setFromCamera(this.mouse, renderer.camera);

    const objects = this.getInteractiveObjects();
    const allMeshes: THREE.Mesh[] = [];
    objects.forEach(obj => {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const target = this.findInteractiveParent(intersects[0].object);
      if (target?.userData?.onClick) {
        target.userData.onClick();
      }
    }
  };

  private handleHover(obj: THREE.Object3D, hovering: boolean): void {
    const type = obj.userData?.type;
    if (type === 'button') handleButtonHover(obj as THREE.Group, hovering);
    else if (type === 'card') handleCardHover(obj as THREE.Group, hovering);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.hoveredObject) {
      this.handleHover(this.hoveredObject, false);
      this.hoveredObject = null;
      document.body.style.cursor = 'default';
    }
  }
}

export const interactionManager = new InteractionManager();
