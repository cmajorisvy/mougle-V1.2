import { Avatar } from "./AvatarBuilder";

const RING_SIZE = 16;

export class VoiceController {
  private avatars: Map<string, Avatar> = new Map();
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animFrameId: number = 0;
  private onSpeakerChange: ((speakerId: string | null) => void) | null = null;
  private lipSyncDelayMs: number = 80 + Math.random() * 40;
  private levelRing: { time: number; level: number }[] = [];
  private isActive: boolean = false;

  constructor(onSpeakerChange?: (speakerId: string | null) => void) {
    this.onSpeakerChange = onSpeakerChange || null;
  }

  registerAvatar(id: string, avatar: Avatar): void {
    this.avatars.set(id, avatar);
  }

  async playAudio(participantId: string, audioBase64: string): Promise<void> {
    this.stopCurrent();

    const avatar = this.avatars.get(participantId);
    if (avatar) {
      avatar.setSpeaking(true, 0.5);
    }
    this.onSpeakerChange?.(participantId);

    try {
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      this.currentAudio = audio;

      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const source = this.audioContext.createMediaElementSource(audio);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.levelRing = [];
      this.isActive = true;
      const delayMs = this.lipSyncDelayMs;

      const updateLevel = () => {
        if (!this.isActive || !this.analyser || !this.dataArray) return;
        this.analyser.getByteFrequencyData(this.dataArray);
        const avg = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length / 255;
        const now = performance.now();

        this.levelRing.push({ time: now, level: avg });
        if (this.levelRing.length > RING_SIZE) this.levelRing.shift();

        const targetTime = now - delayMs;
        let delayedLevel = avg;
        for (let i = this.levelRing.length - 1; i >= 0; i--) {
          if (this.levelRing[i].time <= targetTime) {
            delayedLevel = this.levelRing[i].level;
            break;
          }
        }

        if (avatar && this.isActive) {
          avatar.setSpeaking(true, delayedLevel);
        }
        if (!audio.paused && !audio.ended && this.isActive) {
          this.animFrameId = requestAnimationFrame(updateLevel);
        }
      };

      audio.onplay = () => updateLevel();
      audio.onended = () => {
        if (avatar) {
          avatar.setSpeaking(false, 0);
        }
        this.onSpeakerChange?.(null);
        cancelAnimationFrame(this.animFrameId);
      };

      await audio.play();
    } catch (err) {
      console.error("Audio playback failed:", err);
      if (avatar) avatar.setSpeaking(false, 0);
      this.onSpeakerChange?.(null);
    }
  }

  simulateSpeech(participantId: string, durationMs: number = 3000): void {
    const avatar = this.avatars.get(participantId);
    if (!avatar) return;

    avatar.setSpeaking(true, 0.5);
    this.onSpeakerChange?.(participantId);

    let startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed > durationMs) {
        avatar.setSpeaking(false, 0);
        this.onSpeakerChange?.(null);
        return;
      }
      const level = 0.3 + Math.sin(elapsed * 0.01) * 0.3 + Math.random() * 0.2;
      avatar.setSpeaking(true, level);
      this.animFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  stopCurrent(): void {
    this.isActive = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    cancelAnimationFrame(this.animFrameId);
    this.levelRing = [];
    this.avatars.forEach((avatar) => avatar.setSpeaking(false, 0));
  }

  dispose(): void {
    this.stopCurrent();
    this.analyser?.disconnect();
    this.analyser = null;
    this.dataArray = null;
    this.avatars.clear();
    try { this.audioContext?.close(); } catch {}
    this.audioContext = null;
  }
}
