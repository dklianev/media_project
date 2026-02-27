import { spawn } from 'child_process';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SERVER_PORT = Number(process.env.PORT || 3001);
const SERVER_HOST = process.env.DEV_SERVER_HOST || '127.0.0.1';
const SERVER_READY_TIMEOUT_MS = Number(process.env.DEV_SERVER_READY_TIMEOUT_MS || 15000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(host, port, timeoutMs = 750) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForServer({ host, port, timeoutMs, isAlive }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      throw new Error('API process exited before it became ready.');
    }
    if (await canConnect(host, port)) {
      return;
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for API on ${host}:${port}.`);
}

function runClient() {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawn(npmBin, ['run', 'dev:client'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
}

const server = spawn('node', ['--watch', 'server/index.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' },
});

let client = null;

(async () => {
  try {
    await waitForServer({
      host: SERVER_HOST,
      port: SERVER_PORT,
      timeoutMs: SERVER_READY_TIMEOUT_MS,
      isAlive: () => server.exitCode === null,
    });
  } catch (err) {
    console.warn(`[dev] ${err.message}`);
    console.warn('[dev] Starting Vite anyway.');
  }

  if (server.exitCode !== null) {
    process.exit(server.exitCode || 1);
  }

  client = runClient();
  client.on('close', () => {
    server.kill();
    process.exit();
  });
})();

process.on('SIGINT', () => {
  server.kill();
  client?.kill();
  process.exit();
});

server.on('close', () => {
  client?.kill();
  process.exit();
});
