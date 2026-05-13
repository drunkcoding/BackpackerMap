import type { BrowserContext } from 'playwright';

const STEALTH_INIT_SCRIPT = `
(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });

  const originalQuery = window.navigator.permissions?.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  }

  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Plugin', filename: 'chrome-pdf', description: '' },
      { name: 'Chromium PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    ],
    configurable: true,
  });

  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-GB', 'en-US', 'en'],
    configurable: true,
  });

  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.apply(this, [parameter]);
  };

  if (window.chrome === undefined) {
    Object.defineProperty(window, 'chrome', {
      get: () => ({ runtime: {}, app: { isInstalled: false } }),
      configurable: true,
    });
  }
})();
`;

export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_INIT_SCRIPT);
}
