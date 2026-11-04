import { validateWorld } from './validator.js';

/**
 * Loads and validates data/world.json.
 * @param {string} [url='data/world.json']
 */
export async function loadWorld(url = 'data/world.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  const world = await response.json();
  const validation = validateWorld(world);
  if (!validation.valid) {
    throw new Error(`Invalid world.json: ${validation.errors.join('; ')}`);
  }
  return world;
}
