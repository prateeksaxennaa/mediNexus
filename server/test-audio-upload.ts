import { uploadAudioAndGetUrl } from './src/controllers/whatsapp/db.helpers.js';
async function run() {
  const url = await uploadAudioAndGetUrl(Buffer.from("dummy-audio-content").toString("base64"), "audio/mpeg", "test-patient-id");
  console.log("Audio URL:", url);
}
run();
