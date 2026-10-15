/** JSON Schema export for editor autocompletion (SRS §2.3). */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { COMPONENTS } from './components/index.js';
import { episodeSchema } from './schema/episode.js';

export function episodeJsonSchema(): object {
  const base = zodToJsonSchema(episodeSchema, { name: 'Episode', $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  const components = Object.fromEntries(
    Object.values(COMPONENTS).map((c) => [c.name, zodToJsonSchema(c.schema, { $refStrategy: 'none' })]),
  );
  return { ...base, title: 'ReelForge episode.yaml', 'x-components': components };
}
