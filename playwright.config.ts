// Tests d'installation du livre (Î8). Le dossier `out/` doit être construit avant (`npm run build -- --part-mib 1`).
// PW_CHROMIUM_PATH : exécutable Chromium à utiliser à la place de celui de Playwright (machines sans téléchargement
// de navigateurs).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: { locale: 'fr-FR', serviceWorkers: 'allow' },
  webServer: {
    command: 'npx tsx tests/static-server.ts 4173 out --annonces 4175',
    url: 'http://localhost:4173/__stats',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }
          : {},
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
