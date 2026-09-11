import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
  ],
  optimizeDeps: {
    // Exclude WebAssembly binaries from esbuild pre-bundling
    exclude: ['zxing-wasm'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});