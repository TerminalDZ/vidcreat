/**
 * Playback clock: audio.currentTime drives render(t) (FR-DEV-1). Without a voice file a
 * performance.now() clock is used instead (wall clock is fine in the studio; the runtime stays pure).
 */
export class Clock {
  private audio = new Audio();
  private hasAudio = false;
  private t0 = 0;
  private startedAt = 0;
  private playing = false;
  private rate = 1;
  duration = 0;
  onEnd: () => void = () => undefined;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => {
      this.playing = false;
      this.onEnd();
    });
  }

  setSource(url: string | null, duration: number): void {
    this.duration = duration;
    if (url && this.audio.getAttribute('src') !== url) {
      this.audio.src = url;
      this.hasAudio = true;
    } else if (!url) {
      this.hasAudio = false;
      this.audio.removeAttribute('src');
    }
  }

  get time(): number {
    if (this.hasAudio) return this.audio.currentTime;
    if (!this.playing) return this.t0;
    const t = this.t0 + ((performance.now() - this.startedAt) / 1000) * this.rate;
    if (t >= this.duration) {
      this.playing = false;
      this.t0 = this.duration;
      this.onEnd();
      return this.duration;
    }
    return t;
  }

  get isPlaying(): boolean {
    return this.hasAudio ? !this.audio.paused : this.playing;
  }

  async play(): Promise<void> {
    if (this.time >= this.duration - 0.01) this.seek(0);
    if (this.hasAudio) await this.audio.play().catch(() => undefined);
    else {
      this.startedAt = performance.now();
      this.playing = true;
    }
  }

  pause(): void {
    if (this.hasAudio) this.audio.pause();
    else {
      this.t0 = this.time;
      this.playing = false;
    }
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else void this.play();
  }

  seek(t: number): void {
    const v = Math.max(0, Math.min(this.duration, t));
    if (this.hasAudio) this.audio.currentTime = v;
    else {
      this.t0 = v;
      this.startedAt = performance.now();
    }
  }

  setRate(r: number): void {
    this.t0 = this.time;
    this.startedAt = performance.now();
    this.rate = r;
    this.audio.playbackRate = r;
  }
}
