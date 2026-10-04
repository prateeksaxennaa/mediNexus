import { whatsappWebhook } from './src/controllers/whatsapp/whatsapp.controller.js';

async function run() {
  const req = {
    body: { From: "whatsapp:+916378654771", Body: "3" }
  } as any;
  const res = {
    status: (code) => res,
    set: (k,v) => res,
    send: (body) => console.log("Twilio ACK:", body)
  } as any;
  
  await whatsappWebhook(req, res);
}
run();
