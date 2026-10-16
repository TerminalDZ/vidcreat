/** Decodes the voice recording in the browser (waveform drawing and snap-to-onset). */
export interface DecodedAudio {
  mono: Float32Array;
  sampleRate: number;
  duration: number;
}

export async function decodeAudio(url: string): Promise<DecodedAudio | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels;
    }
    return { mono, sampleRate: audio.sampleRate, duration: audio.duration };
  } catch {
    return null;
  }
}
