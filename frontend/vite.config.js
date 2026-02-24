import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hmrHost = env.VITE_HMR_HOST;
  const hmrProtocol = env.VITE_HMR_PROTOCOL || (hmrHost ? 'wss' : undefined);
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : 443;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      hmr: hmrHost
        ? {
            host: hmrHost,
            clientPort: hmrPort,
            protocol: hmrProtocol
          }
        : undefined,
      proxy: {
        '/api': 'http://127.0.0.1:4000',
        '/socket.io': {
          target: 'http://127.0.0.1:4000',
          ws: true
        },
        '/static-apps': 'http://127.0.0.1:4000'
      }
    }
  };
});
