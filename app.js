import express from 'express';
import application from './backend/src/app.js';

const app = express();
app.use(application);

export default app;
