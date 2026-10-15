import { z } from 'zod';
import { SOUNDS } from '@reelforge/audio';

/** A time expression (SRS §5). YAML numbers are accepted as seconds. */
export const time = () =>
  z.union([z.string().min(1), z.number().nonnegative()], {
    errorMap: () => ({ message: "Expected a time expression such as 12.5s, l7, l7+0.4 or l7:'word'" }),
  });

/** A theme color name (lime, red, …) or a CSS color (#rrggbb, rgb(), …). */
export const color = () => z.string().min(1);

export const sound = () => z.enum(SOUNDS);

export const LINE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const ELEMENT_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export const lineId = () =>
  z.string().regex(LINE_ID, 'Ids must start with a letter or "_" and contain only letters, digits and "_"');
export const elementId = () =>
  z
    .string()
    .regex(ELEMENT_ID, 'Ids must start with a letter or "_" and contain only letters, digits, "_" and "-"');

export const int = () => z.number().int();

/** An endpoint for arrows and particles: an element id with optional side, or a point. */
export const endpoint = () =>
  z.union([
    z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*(\.(left|right|top|bottom|center))?$/, {
      message: 'Expected "elementId", "elementId.left|right|top|bottom|center" or {x, y}',
    }),
    z.object({ x: z.number(), y: z.number() }).strict(),
  ]);

/** Turns `string | number` time fields into `number` for compiled (resolved) props. */
export type Resolved<T> = T extends string | number
  ? [string | number] extends [T]
    ? number
    : T
  : T extends (infer U)[]
    ? Resolved<U>[]
    : T extends object
      ? { [K in keyof T]: Resolved<T[K]> }
      : T;
