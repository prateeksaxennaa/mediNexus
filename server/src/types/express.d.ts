import type { User } from '@supabase/supabase-js';

// Extend the Express Request interface globally so every controller
// can access req.user without casting after the authenticate middleware runs.
declare global {
  namespace Express {
    interface Request {
      user?: User & {
        hospitalId?: string;
        role?: string;
      };
    }
  }
}
