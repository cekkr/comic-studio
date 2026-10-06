import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

export default defineConfig({
  ...base,
  use: { ...base.use, browserName: 'webkit' },
  grep: /first export|local upload|image tabs preserve/,
});
