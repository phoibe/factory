import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig as resolveWith, enabledSkills, RUNNERS } from './config-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULTS = JSON.parse(readFileSync(join(root, 'defaults/factory.config.json'), 'utf8'));
export { enabledSkills, RUNNERS };
export const resolveConfig = (raw, catalog) => resolveWith(raw, catalog, DEFAULTS);
