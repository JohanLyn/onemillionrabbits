import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the whole game into one self-contained index.html.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // Compile down for older iPhones and iPads: iOS/iPadOS 15 is the oldest with WebGL 2, which three.js needs.
  // (three.js ships class static blocks, a syntax error before Safari 16.4.)
  build: { target: ['safari15', 'ios15', 'chrome100', 'firefox100', 'edge100'], chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
