import { dev } from 'astro';
export default async function setup() {
  const server = await dev({ server: { host: '127.0.0.1', port: 4340 } });
  return async () => {
    await server.stop();
  };
}
