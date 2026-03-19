import 'dotenv/config';
import { createApp } from './app.js';
import { initializeTranscoder } from './utils/transcoder.js';
import { startNotificationCron } from './utils/notificationCron.js';

const app = createApp();
const PORT = process.env.PORT || 3001;
const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60 * 60 * 1000);
const SERVER_HEADERS_TIMEOUT_MS = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || (SERVER_REQUEST_TIMEOUT_MS + 60_000));
const SERVER_KEEP_ALIVE_TIMEOUT_MS = Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || 65_000);

await initializeTranscoder();

const stopNotificationCron = startNotificationCron();

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
server.headersTimeout = Math.max(SERVER_HEADERS_TIMEOUT_MS, SERVER_REQUEST_TIMEOUT_MS + 1_000);
server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
