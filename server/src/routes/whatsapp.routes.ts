import { Router } from 'express';
import { whatsappWebhook } from '../controllers/whatsapp/whatsapp.controller.js';

export const whatsappRouter = Router();

/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages forwarded by Twilio.
 * This route is intentionally public — authentication is handled
 * via Twilio's X-Twilio-Signature header validation (omitted in
 * sandbox/dev mode for simplicity; add validateExpressRequest()
 * middleware from the twilio package before production deployment).
 */
whatsappRouter.post('/', whatsappWebhook);
