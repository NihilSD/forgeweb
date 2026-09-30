import './config/load-dotenv.js';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp();
await app.listen(env.PORT);
console.info(`Forge API listening on :${env.PORT}`);
