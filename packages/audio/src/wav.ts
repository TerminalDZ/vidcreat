/**
 * Minimal, dependency-free WAV (RIFF) reader and writer.
 * Supports PCM 8/16/24/32-bit integer and 32/64-bit IEEE float, mono or multi-channel,
 * including WAVE_FORMAT_EXTENSIBLE headers.
 */

export interface PcmAudio {
  sampleRate: number;
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: 'pcm' | 'float';
  frames: number;
  duration: number;
  dataOffset: number;
  dataLength: number;
}

export class WavError extends Error {}

function readHeader(buf: Uint8Array): WavInfo {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (buf.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new WavError('Not a RIFF/WAVE file');
  }
  let off = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (off + 8 <= buf.length) {
    const id = tag(off);
    let size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const sampleRate = dv.getUint32(body + 4, true);
      const bits = dv.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 40) format = dv.getUint16(body + 24, true);
      fmt = { format, channels, sampleRate, bits };
    } else if (id === 'data') {
      dataOffset = body;
      // Some writers (streams) put 0 or 0xFFFFFFFF; clamp to the file.
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      dataLength = size;
      break;
    }
    off = body + size + (size & 1);
  }
  if (!fmt) throw new WavError('Missing "fmt " chunk');
  if (dataOffset < 0) throw new WavError('Missing "data" chunk');
  const isFloat = fmt.format === 3;
  if (!(fmt.format === 1 || isFloat))
    throw new WavError(`Unsupported WAV encoding (format tag ${fmt.format})`);
  if (isFloat && fmt.bits !== 32 && fmt.bits !== 64)
    throw new WavError(`Unsupported float width ${fmt.bits}`);
  if (!isFloat && ![8, 16, 24, 32].includes(fmt.bits))
    throw new WavError(`Unsupported PCM width ${fmt.bits}`);
  if (fmt.channels < 1) throw new WavError('WAV has no channels');
  const frameBytes = (fmt.bits / 8) * fmt.channels;
  const frames = Math.floor(dataLength / frameBytes);
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bits,
    format: isFloat ? 'float' : 'pcm',
    frames,
    duration: frames / fmt.sampleRate,
    dataOffset,
    dataLength,
  };
}

/** Reads only the header; cheap way to get the duration. */
export function wavInfo(buf: Uint8Array): WavInfo {
  return readHeader(buf);
}

export function decodeWav(buf: Uint8Array): PcmAudio {
  const info = readHeader(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const { channels: nc, frames, bitsPerSample: bits } = info;
  const out: Float32Array[] = [];
  for (let c = 0; c < nc; c++) out.push(new Float32Array(frames));
  const bps = bits / 8;
  let p = info.dataOffset;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nc; c++) {
      let v: number;
      if (info.format === 'float') {
        v = bits === 32 ? dv.getFloat32(p, true) : dv.getFloat64(p, true);
      } else if (bits === 8) {
        v = (dv.getUint8(p) - 128) / 128;
      } else if (bits === 16) {
        v = dv.getInt16(p, true) / 32768;
      } else if (bits === 24) {
        let x = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getUint8(p + 2) << 16);
        if (x & 0x800000) x |= ~0xffffff;
        v = x / 8388608;
      } else {
        v = dv.getInt32(p, true) / 2147483648;
      }
      out[c][i] = v;
      p += bps;
    }
  }
  return { sampleRate: info.sampleRate, channels: out };
}

/** Encodes PCM audio as a WAV file. Default 16-bit PCM; `float: true` writes 32-bit float. */
export function encodeWav(audio: PcmAudio, opts: { float?: boolean } = {}): Uint8Array {
  const nc = audio.channels.length;
  const frames = audio.channels[0]?.length ?? 0;
  const bits = opts.float ? 32 : 16;
  const bps = bits / 8;
  const dataLen = frames * nc * bps;
  const buf = new Uint8Array(44 + dataLen);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) buf[o + i] = s.charCodeAt(i);
  };
  w(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, opts.float ? 3 : 1, true);
  dv.setUint16(22, nc, true);
  dv.setUint32(24, audio.sampleRate, true);
  dv.setUint32(28, audio.sampleRate * nc * bps, true);
  dv.setUint16(32, nc * bps, true);
  dv.setUint16(34, bits, true);
  w(36, 'data');
  dv.setUint32(40, dataLen, true);
  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nc; c++) {
      const v = Math.max(-1, Math.min(1, audio.channels[c][i]));
      if (opts.float) dv.setFloat32(p, v, true);
      else dv.setInt16(p, Math.round(v < 0 ? v * 32768 : v * 32767), true);
      p += bps;
    }
  }
  return buf;
}

/** Averages all channels into one. */
export function toMono(audio: PcmAudio): Float32Array {
  const [first, ...rest] = audio.channels;
  if (!first) return new Float32Array(0);
  if (rest.length === 0) return first;
  const out = new Float32Array(first.length);
  const n = audio.channels.length;
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let c = 0; c < n; c++) s += audio.channels[c][i];
    out[i] = s / n;
  }
  return out;
}
