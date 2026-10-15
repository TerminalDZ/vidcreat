/** Cue marker model (FR-CUE-1…7): marks, undo, nudge, re-mark, word mode, snap to onset. */
import { snapToOnset } from '@reelforge/audio';
import type { DecodedAudio } from './wave.js';

type Op =
  | { kind: 'cue'; id: string; prev: number | undefined }
  | { kind: 'word'; id: string; prev: number[] | undefined };

export class CueModel {
  cues: Record<string, number> = {};
  words: Record<string, number[]> = {};
  selected: string | null = null;
  wordMode = false;
  autoSnap = false;
  private history: Op[] = [];
  lastMarked: string | null = null;

  constructor(public script: { id: string; text: string }[]) {}

  load(cues: Record<string, number>, words: Record<string, number[]>): void {
    this.cues = { ...cues };
    this.words = Object.fromEntries(Object.entries(words).map(([k, v]) => [k, [...v]]));
  }

  setScript(script: { id: string; text: string }[]): void {
    this.script = script;
    const ids = new Set(script.map((l) => l.id));
    for (const k of Object.keys(this.cues)) if (!ids.has(k)) delete this.cues[k];
    if (this.selected && !ids.has(this.selected)) this.selected = null;
  }

  get nextUnmarked(): string | null {
    return this.script.find((l) => this.cues[l.id] === undefined)?.id ?? null;
  }

  wordsOf(id: string): string[] {
    return (this.script.find((l) => l.id === id)?.text ?? '').trim().split(/\s+/).filter(Boolean);
  }

  private snap(t: number, audio: DecodedAudio | null): number {
    return this.autoSnap && audio
      ? snapToOnset(audio.mono, audio.sampleRate, t)
      : Math.round(t * 1000) / 1000;
  }

  /** Space: mark the selected line (re-mark), the next word (word mode) or the next unmarked line. */
  mark(t: number, audio: DecodedAudio | null): string | null {
    const time = this.snap(t, audio);
    if (this.wordMode && this.selected) {
      const id = this.selected;
      const list = this.words[id] ? [...this.words[id]] : [];
      const total = this.wordsOf(id).length;
      if (list.length >= total) return null;
      this.history.push({ kind: 'word', id, prev: this.words[id] ? [...this.words[id]] : undefined });
      list.push(time);
      this.words[id] = list;
      if (list.length === 1) this.cues[id] = time;
      if (list.length >= total) this.wordMode = false;
      return id;
    }
    const id = this.selected ?? this.nextUnmarked;
    if (!id) return null;
    this.history.push({ kind: 'cue', id, prev: this.cues[id] });
    this.cues[id] = time;
    if (this.selected) this.selected = null;
    this.lastMarked = id;
    return id;
  }

  undo(): string | null {
    const op = this.history.pop();
    if (!op) return null;
    if (op.kind === 'cue') {
      if (op.prev === undefined) delete this.cues[op.id];
      else this.cues[op.id] = op.prev;
    } else if (op.prev === undefined) delete this.words[op.id];
    else this.words[op.id] = op.prev;
    return op.id;
  }

  nudge(delta: number): string | null {
    const id = this.selected;
    if (!id || this.cues[id] === undefined) return null;
    this.history.push({ kind: 'cue', id, prev: this.cues[id] });
    this.cues[id] = Math.max(0, Math.round((this.cues[id] + delta) * 1000) / 1000);
    if (this.words[id]?.length) delete this.words[id]; // word marks no longer match the moved cue
    return id;
  }

  snapSelected(audio: DecodedAudio | null): string | null {
    const id = this.selected;
    if (!id || this.cues[id] === undefined || !audio) return null;
    this.history.push({ kind: 'cue', id, prev: this.cues[id] });
    this.cues[id] = snapToOnset(audio.mono, audio.sampleRate, this.cues[id]);
    return id;
  }

  startWordMode(): boolean {
    if (!this.selected) return false;
    this.history.push({ kind: 'word', id: this.selected, prev: this.words[this.selected] });
    delete this.words[this.selected];
    this.wordMode = true;
    return true;
  }

  /** Ids whose cue is earlier than a previous line's cue (non-monotonic, V-3). */
  get badIds(): Set<string> {
    const bad = new Set<string>();
    let max = -Infinity;
    for (const l of this.script) {
      const v = this.cues[l.id];
      if (v === undefined) continue;
      if (v < max) bad.add(l.id);
      max = Math.max(max, v);
    }
    return bad;
  }

  currentAt(t: number): string | null {
    let cur: string | null = null;
    for (const l of this.script) {
      const v = this.cues[l.id];
      if (v !== undefined && v <= t) cur = l.id;
    }
    return cur;
  }

  toJson(audioFile: string, duration: number) {
    const words: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(this.words)) if (v.length === this.wordsOf(k).length) words[k] = v;
    return {
      version: 1 as const,
      audio: { file: audioFile, duration: Math.round(duration * 1000) / 1000 },
      cues: Object.fromEntries(
        this.script.filter((l) => this.cues[l.id] !== undefined).map((l) => [l.id, this.cues[l.id]]),
      ),
      words,
    };
  }
}
