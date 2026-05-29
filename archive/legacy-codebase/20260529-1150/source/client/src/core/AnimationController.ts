import gsap from 'gsap';

class AnimationController {
  private timelines: Map<string, gsap.core.Timeline> = new Map();
  private ticker: gsap.core.Tween | null = null;

  createTimeline(id: string, config?: gsap.TimelineVars): gsap.core.Timeline {
    this.killTimeline(id);
    const tl = gsap.timeline(config);
    this.timelines.set(id, tl);
    return tl;
  }

  getTimeline(id: string): gsap.core.Timeline | undefined {
    return this.timelines.get(id);
  }

  killTimeline(id: string): void {
    const tl = this.timelines.get(id);
    if (tl) {
      tl.kill();
      this.timelines.delete(id);
    }
  }

  killAll(): void {
    this.timelines.forEach(tl => tl.kill());
    this.timelines.clear();
  }

  static fadeIn(target: any, duration: number = 0.4, delay: number = 0): gsap.core.Tween {
    if (target.material) target.material.transparent = true;
    return gsap.fromTo(
      target.material || target,
      { opacity: 0 },
      { opacity: 1, duration, delay, ease: 'power2.out' }
    );
  }

  static fadeOut(target: any, duration: number = 0.3): gsap.core.Tween {
    if (target.material) target.material.transparent = true;
    return gsap.to(target.material || target, {
      opacity: 0,
      duration,
      ease: 'power2.in',
    });
  }

  static slideIn(target: any, from: 'left' | 'right' | 'top' | 'bottom' = 'right', distance: number = 2, duration: number = 0.5): gsap.core.Tween {
    const axis = from === 'left' || from === 'right' ? 'x' : 'y';
    const sign = from === 'right' || from === 'top' ? 1 : -1;
    target.position[axis] = distance * sign;
    return gsap.to(target.position, {
      [axis]: 0,
      duration,
      ease: 'power3.out',
    });
  }

  static scaleIn(target: any, duration: number = 0.4, delay: number = 0): gsap.core.Tween {
    target.scale.set(0.001, 0.001, 0.001);
    return gsap.to(target.scale, {
      x: 1, y: 1, z: 1,
      duration,
      delay,
      ease: 'back.out(1.7)',
    });
  }

  static pulse(target: any, scale: number = 1.05, duration: number = 0.8): gsap.core.Tween {
    return gsap.to(target.scale, {
      x: scale, y: scale,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }

  static float(target: any, amplitude: number = 0.1, duration: number = 3): gsap.core.Tween {
    return gsap.to(target.position, {
      y: `+=${amplitude}`,
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }
}

export const animationController = new AnimationController();
export default AnimationController;
