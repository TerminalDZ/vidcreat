/** Node-side entry of @reelforge/runtime: locations of the built page assets. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'page');
export const RUNTIME_HTML = path.join(RUNTIME_DIR, 'runtime.html');
