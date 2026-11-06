// Opens Chromium for the a11y tests. The cloud sessions have a Chromium of their own whose version
// may not match the project's Playwright: use it when it is there, so the tests never wait on a
// browser that cannot start.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';

export function chromiumPath(env = process.env, exists = existsSync) {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  return exists(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : undefined;
}

// `server` is closed when the browser cannot start: an open server keeps the test run alive forever.
export async function launchBrowser(server) {
  const executablePath = chromiumPath();
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (e) {
    server?.close();
    throw e;
  }
}
