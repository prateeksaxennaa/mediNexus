import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';
import { env } from './config/env.js';

const app = express();

const allowedOrigins = new Set(
  [env.FRONTEND_URL, ...env.FRONTEND_URLS, 'http://localhost:5173', 'http://127.0.0.1:5173']
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (Postman, curl, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ─── Global Middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ─────────────────────────────────────────────────
app.use('/api', apiRouter);

// ─── 404 Handler ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler (must be last) ────────────────────
app.use(errorHandler);

export default app;
