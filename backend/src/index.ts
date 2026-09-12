import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSockets } from './sockets/index';
import { startOverdueTaskJob } from './jobs/overdueTasks.job';

const app = createApp();
const server = http.createServer(app);

initSockets(server);
startOverdueTaskJob();

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Velozity dashboard API listening on port ${env.port}`);
});
