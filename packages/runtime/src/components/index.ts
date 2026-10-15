import type { RuntimeComponent } from '../types.js';
import { code } from './code.js';
import { bucket, checklist, grid, lanes, meter, table, timeline } from './data.js';
import { arrow, chip, iconC, node, particles } from './diagram.js';
import { phone, trap } from './screens.js';
import { counter, cta, label, quote, stamp, title } from './text.js';

/** Runtime implementations, keyed by the component names of @reelforge/core. */
export const COMPONENT_REGISTRY: Record<string, RuntimeComponent> = Object.fromEntries(
  [title, label, code, node, arrow, chip, stamp, table, lanes, checklist, counter, meter, timeline, grid, bucket, phone, quote, particles, trap, cta, iconC].map(
    (c) => [c.name, c],
  ),
);
