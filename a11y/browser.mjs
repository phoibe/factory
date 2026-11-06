// Opens Chromium for the a11y tests. The cloud sessions have a Chromium of their own whose version
// may not match the project's Playwright: use it when it is there, so the tests never wait on a
// browser that cannot start.
import { existsSync } from 'node:fs';

const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';

export function chromiumPath(env = process.env, exists = existsSync) {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  return exists(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : undefined;
}

// Playwright is loaded only here: the unit tests import chromiumPath on runners where
// dependencies are not installed (the « Déclarer stable » workflow runs node --test without npm ci).
// `server` is closed when the browser cannot start: an open server keeps the test run alive forever.
export async function launchBrowser(server) {
  const executablePath = chromiumPath();
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (e) {
    server?.close();
    throw e;
  }
}
