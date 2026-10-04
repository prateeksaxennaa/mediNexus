import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Basic liveness check — no external dependencies.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'mediNexus-api',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/db
 * Pings Supabase to verify database connectivity.
 */
healthRouter.get('/db', async (_req: Request, res: Response) => {
  try {
    // Lightweight connectivity check — read one row from a known table
    const { error } = await supabaseAdmin.from('hospitals').select('id').limit(1);

    if (error) {
      res.status(503).json({
        status: 'error',
        message: 'Database connection failed',
        error: error.message,
      });
      return;
    }

    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
