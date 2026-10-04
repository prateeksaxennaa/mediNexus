/**
 * Bilingual string constants for the MediNexus WhatsApp bot.
 * All user-facing messages live here, indexed by key and language.
 * Use the `msg(lang, key, ...args)` helper function for substitutions.
 */

export type Lang = "en" | "hi";

type MsgKey =
  | "welcome"
  | "lang_select"
  | "main_menu"
  | "not_registered"
  | "invalid_choice"
  | "error_generic"
  | "type_menu"
  // Doctor booking
  | "select_dept"
  | "invalid_dept"
  | "searching_slots"
  | "no_slots"
  | "slots_list_header"
  | "invalid_slot_choice"
  | "booking_in_progress"
  | "slot_taken"
  | "booked_confirm"
  // Service booking
  | "select_svc_dept"
  | "no_svc_depts"
  | "selecting_services"
  | "services_list"
  | "no_services"
  | "invalid_svc_choice"
  | "svc_slots_header"
  | "no_svc_slots"
  | "invalid_svc_slot"
  | "svc_booked_confirm"
  // Appointments
  | "appts_submenu"
  | "loading_appts"
  | "no_upcoming_appts"
  | "upcoming_appts_header"
  | "no_past_appts"
  | "past_appts_header"
  | "cancel_prompt"
  | "cancel_confirm_prompt"
  | "cancel_confirmed"
  | "cancel_already"
  | "cancel_invalid"
  // Waitlist
  | "waitlist_empty"
  | "waitlist_header"
  | "waitlist_leave_confirm"
  | "waitlist_left"
  | "waitlist_freed_notify"
  // Reports
  | "loading_reports"
  | "no_reports"
  | "reports_header"
  | "invalid_report"
  | "analysis_wait"
  | "analysis_text_header"
  | "analysis_audio_header"
  | "analysis_file_header"
  | "analysis_no_file"
  | "analysis_error"
  // Health Passport
  | "loading_passport"
  | "passport_header"
  // Health Trends
  | "trends_loading"
  | "trends_need_more"
  | "trends_header"
  | "trends_concern_urgent"
  | "trends_concern_watch"
  | "trends_concern_none"
  | "trends_dir_improving"
  | "trends_dir_declining"
  | "trends_dir_stable"
  | "trends_dir_variable";

type Strings = Record<MsgKey, string>;

const EN: Strings = {
  welcome: `🏥 *Welcome to MediNexus!*\n\nPlease choose your language:\n1️⃣  English\n2️⃣  हिंदी (Hindi)`,
  lang_select: `Please reply *1* for English or *2* for Hindi.`,
  not_registered: `❌ Your number (*{0}*) is not registered in MediNexus.\n\nPlease register at your hospital first, then come back.\n\nType *hi* to restart.`,
  main_menu: `🏥 *MediNexus — What would you like to do?*\n\n1️⃣  Book Doctor Appointment\n2️⃣  Book Service / Lab Test\n3️⃣  My Appointments & Waitlist\n4️⃣  My Medical Reports\n5️⃣  Health Passport\n6️⃣  Health Trends\n\nReply with a number (1–6), or *menu* any time to return here.`,
  invalid_choice: `❓ Please reply with a valid number from the menu.\n\nType *menu* to see the options again.`,
  error_generic: `⚠️ Something went wrong. Please try again in a moment.\n\nType *hi* to restart.`,
  type_menu: `Type *menu* to return to the main menu.`,
  // Doctor booking
  select_dept: `👨‍⚕️ *Which department?*\n\n1️⃣  General Physician\n2️⃣  Orthopaedics\n3️⃣  Gynaecology\n4️⃣  Paediatrics\n5️⃣  Cardiology\n\nReply 1–5.`,
  invalid_dept: `❓ Please reply with a number from 1 to 5.`,
  searching_slots: `🔍 Searching available slots for *{0}*...`,
  no_slots: `😔 No slots available for *{0}* in the next 3 days.\n\nTry again tomorrow or type *menu* to go back.`,
  slots_list_header: `✅ *Available slots — {0}:*\n\n{1}\n\nWhich slot? Reply 1–{2}.`,
  invalid_slot_choice: `❓ Please reply with a number between 1 and {0}.`,
  booking_in_progress: `⏳ Booking your appointment...`,
  slot_taken: `😔 That slot was just taken by someone else.\n\nType *1* to search again or *menu* to go back.`,
  booked_confirm: `✅ *Appointment Confirmed!*\n\n👨‍⚕️ Dr. {0}\n📅 {1}\n⏰ {2}\n🏥 {3}\n\nYou will receive a reminder the day before. 🔔\n\nType *menu* for main menu.`,
  // Service booking
  select_svc_dept: `🏥 *Which type of service?*\n\n{0}\n\nReply with a number.`,
  no_svc_depts: `😔 No services are currently available.\n\nType *menu* to go back.`,
  selecting_services: `🔍 Loading services for *{0}*...`,
  services_list: `🧪 *Services in {0}:*\n\n{1}\n\nReply with a number to select.`,
  no_services: `😔 No services found in that category.\n\nType *menu* to go back.`,
  invalid_svc_choice: `❓ Please reply with a valid number from the list.`,
  svc_slots_header: `📅 *Available slots for {0}:*\n\n{1}\n\nWhich slot? Reply 1–{2}.`,
  no_svc_slots: `😔 No slots available for *{0}* in the next 3 days.\n\nType *menu* to go back.`,
  invalid_svc_slot: `❓ Please reply with a number between 1 and {0}.`,
  svc_booked_confirm: `✅ *Service Booked!*\n\n🧪 {0}\n📅 {1} (Slot #{2})\n🏥 {3}\n💰 Fee: ₹{4}{5}\n\nType *menu* for main menu.`,
  // Appointments
  appts_submenu: `📅 *My Appointments & Waitlist*\n\n1️⃣  Upcoming appointments\n2️⃣  Past appointments\n3️⃣  My waitlist\n\nReply 1–3.`,
  loading_appts: `🔍 Loading your appointments...`,
  no_upcoming_appts: `📅 You have no upcoming appointments.\n\nType *1* to book one or *menu* for main menu.`,
  upcoming_appts_header: `📅 *Your Upcoming Appointments:*\n\n{0}\n\nReply with number to cancel, or *menu* to go back.`,
  no_past_appts: `📅 No past appointments found.\n\nType *menu* for main menu.`,
  past_appts_header: `📅 *Your Past Appointments:*\n\n{0}\n\nType *menu* to go back.`,
  cancel_prompt: `Which appointment would you like to cancel?\nReply with the number, or *menu* to go back.`,
  cancel_confirm_prompt: `⚠️ *Cancel this appointment?*\n{0}\n\nReply *YES* to confirm cancellation, or anything else to keep it.`,
  cancel_confirmed: `✅ Appointment cancelled successfully.\nThe slot has been freed for others.\n\nType *menu* for main menu.`,
  cancel_already: `ℹ️ This appointment is already cancelled.\n\nType *menu* for main menu.`,
  cancel_invalid: `❌ This appointment cannot be cancelled (status: {0}).\n\nType *menu* for main menu.`,
  // Waitlist
  waitlist_empty: `📋 You are not on any waitlist at the moment.\n\nType *menu* for main menu.`,
  waitlist_header: `⏳ *Your Waitlist Entries:*\n\n{0}\n\nReply with number to *leave* that waitlist, or *menu* to go back.`,
  waitlist_leave_confirm: `✅ You have been removed from the waitlist for:\n{0}\n\nType *menu* for main menu.`,
  waitlist_left: `✅ Left the waitlist.\n\nType *menu* for main menu.`,
  waitlist_freed_notify: `⚡ *Good news!* A waitlist slot has just opened up for you.\n\nReply with *menu*, then go to *My waitlist* to accept this offer before it expires!`,
  // Reports
  loading_reports: `🔍 Loading your reports...`,
  no_reports: `📄 No medical reports found on your account.\n\nReports are uploaded by your hospital.\n\nType *menu* for main menu.`,
  reports_header: `📄 *Your Medical Reports:*\n\n{0}\n\nReply with a number to get the AI analysis, audio summary, and file.`,
  invalid_report: `❓ Please reply with a number between 1 and {0}.`,
  analysis_wait: `⏳ *Generating your report analysis...*\n\nThis may take ~30 seconds for first-time reports. Please wait.`,
  analysis_text_header: `📋 *{0}*\n📅 {1} | 🏷️ {2}\n\n🔍 *AI Analysis:*\n{3}\n\n_This is an AI-generated summary. Always consult your doctor._`,
  analysis_audio_header: `🎵 *Audio summary for {0}* — listen below:`,
  analysis_file_header: `📎 *Original report file — {0}:*`,
  analysis_no_file: `⚠️ The original report file could not be fetched.\n\nType *menu* for main menu.`,
  analysis_error: `⚠️ Could not generate analysis right now. Please try again later.\n\nType *menu* for main menu.`,
  // Health Passport
  loading_passport: `🔍 Loading your Health Passport...`,
  passport_header: `🏥 *Your MediNexus Health Passport*\n\n👤 {0}{1}\n\n📊 *Records:*\n• {2} prescription(s)\n• {3} medical report(s)\n• {4} active access grant(s)\n\n{5}{6}\n\nType *menu* for main menu.`,
  // Health Trends
  trends_loading: `🔬 *Analysing your health trends...*\n\nThis may take ~20 seconds. Please wait.`,
  trends_need_more: `📊 Health trend analysis needs at least 2 analysed reports.\n\nOpen your reports (option 4) and get the AI analysis first, then come back.\n\nType *menu* for main menu.`,
  trends_header: `🔬 *Your Health Trends*\n_(Based on {0} analysed reports)_\n\n{1}\n\n📝 *Overall:* {2}\n\n_Always discuss trends with your doctor._\n\nType *menu* for main menu.`,
  trends_concern_urgent: `🚨 Urgent`,
  trends_concern_watch: `⚠️ Watch`,
  trends_concern_none: `✅ Good`,
  trends_dir_improving: `📈 Improving`,
  trends_dir_declining: `📉 Declining`,
  trends_dir_stable: `➡️ Stable`,
  trends_dir_variable: `〰️ Variable`,
};

const HI: Strings = {
  welcome: `🏥 *MediNexus में आपका स्वागत है!*\n\nकृपया अपनी भाषा चुनें:\n1️⃣  English\n2️⃣  हिंदी`,
  lang_select: `भाषा चुनने के लिए *1* (English) या *2* (हिंदी) लिखें।`,
  not_registered: `❌ आपका नंबर (*{0}*) MediNexus में रजिस्टर नहीं है।\n\nपहले अस्पताल में रजिस्ट्रेशन करवाएं।\n\nफिर से शुरू करने के लिए *hi* लिखें।`,
  main_menu: `🏥 *MediNexus — क्या करना है?*\n\n1️⃣  डॉक्टर अपॉइंटमेंट बुक करें\n2️⃣  सेवा / लैब टेस्ट बुक करें\n3️⃣  मेरी अपॉइंटमेंट और वेटलिस्ट\n4️⃣  मेरी मेडिकल रिपोर्ट\n5️⃣  हेल्थ पासपोर्ट\n6️⃣  स्वास्थ्य ट्रेंड\n\nनंबर लिखें (1–6), या कभी भी *menu* लिखकर वापस आएं।`,
  invalid_choice: `❓ कृपया मेनू से एक सही नंबर चुनें।\n\nविकल्प देखने के लिए *menu* लिखें।`,
  error_generic: `⚠️ कुछ गड़बड़ हुई। थोड़ी देर में फिर कोशिश करें।\n\nफिर से शुरू करने के लिए *hi* लिखें।`,
  type_menu: `मुख्य मेनू पर वापस जाने के लिए *menu* लिखें।`,
  // Doctor booking
  select_dept: `👨‍⚕️ *किस विभाग के लिए?*\n\n1️⃣  सामान्य चिकित्सक\n2️⃣  हड्डी रोग\n3️⃣  स्त्री रोग\n4️⃣  बाल रोग\n5️⃣  हृदय रोग\n\n1 से 5 के बीच नंबर लिखें।`,
  invalid_dept: `❓ कृपया 1 से 5 के बीच नंबर लिखें।`,
  searching_slots: `🔍 *{0}* के लिए उपलब्ध समय खोज रहे हैं...`,
  no_slots: `😔 अगले 3 दिनों में *{0}* के लिए कोई slot उपलब्ध नहीं है।\n\nकल फिर कोशिश करें या *menu* लिखें।`,
  slots_list_header: `✅ *उपलब्ध समय — {0}:*\n\n{1}\n\nकौन सा समय चाहिए? {2} तक नंबर लिखें।`,
  invalid_slot_choice: `❓ कृपया 1 से {0} के बीच नंबर लिखें।`,
  booking_in_progress: `⏳ अपॉइंटमेंट बुक हो रही है...`,
  slot_taken: `😔 यह slot किसी और ने ले लिया। कृपया *1* लिखकर फिर से खोजें या *menu* लिखें।`,
  booked_confirm: `✅ *अपॉइंटमेंट कंफर्म हो गई!*\n\n👨‍⚕️ डॉक्टर: {0}\n📅 दिनांक: {1}\n⏰ समय: {2}\n🏥 अस्पताल: {3}\n\nएक दिन पहले reminder भेजा जाएगा। 🔔\n\nमुख्य मेनू के लिए *menu* लिखें।`,
  // Service booking
  select_svc_dept: `🏥 *कौन सी सेवा चाहिए?*\n\n{0}\n\nनंबर लिखें।`,
  no_svc_depts: `😔 अभी कोई सेवा उपलब्ध नहीं है।\n\n*menu* लिखें।`,
  selecting_services: `🔍 *{0}* की सेवाएं खोज रहे हैं...`,
  services_list: `🧪 *{0} में उपलब्ध सेवाएं:*\n\n{1}\n\nनंबर लिखकर चुनें।`,
  no_services: `😔 इस विभाग में कोई सेवा नहीं मिली।\n\n*menu* लिखें।`,
  invalid_svc_choice: `❓ कृपया सूची से एक सही नंबर चुनें।`,
  svc_slots_header: `📅 *{0} के लिए उपलब्ध समय:*\n\n{1}\n\nकौन सा? {2} तक नंबर लिखें।`,
  no_svc_slots: `😔 *{0}* के लिए अभी कोई slot उपलब्ध नहीं।\n\n*menu* लिखें।`,
  invalid_svc_slot: `❓ कृपया 1 से {0} के बीच नंबर लिखें।`,
  svc_booked_confirm: `✅ *सेवा बुक हो गई!*\n\n🧪 {0}\n📅 {1} (Slot #{2})\n🏥 {3}\n💰 शुल्क: ₹{4}{5}\n\n*menu* लिखें।`,
  // Appointments
  appts_submenu: `📅 *मेरी अपॉइंटमेंट और वेटलिस्ट*\n\n1️⃣  आने वाली अपॉइंटमेंट\n2️⃣  पिछली अपॉइंटमेंट\n3️⃣  मेरी वेटलिस्ट\n\n1–3 में से नंबर लिखें।`,
  loading_appts: `🔍 आपकी अपॉइंटमेंट देख रहे हैं...`,
  no_upcoming_appts: `📅 कोई आने वाली अपॉइंटमेंट नहीं है।\n\nबुक करने के लिए *1* लिखें या *menu* लिखें।`,
  upcoming_appts_header: `📅 *आपकी आने वाली अपॉइंटमेंट:*\n\n{0}\n\nरद्द करने के लिए नंबर लिखें, या *menu* लिखें।`,
  no_past_appts: `📅 कोई पिछली अपॉइंटमेंट नहीं मिली।\n\n*menu* लिखें।`,
  past_appts_header: `📅 *आपकी पिछली अपॉइंटमेंट:*\n\n{0}\n\n*menu* लिखें।`,
  cancel_prompt: `कौन सी अपॉइंटमेंट रद्द करनी है?\nनंबर लिखें, या *menu* लिखें।`,
  cancel_confirm_prompt: `⚠️ *क्या यह अपॉइंटमेंट रद्द करनी है?*\n{0}\n\nकन्फर्म के लिए *YES* लिखें, वरना कुछ भी लिखें।`,
  cancel_confirmed: `✅ अपॉइंटमेंट सफलतापूर्वक रद्द हो गई।\n\n*menu* लिखें।`,
  cancel_already: `ℹ️ यह अपॉइंटमेंट पहले से रद्द है।\n\n*menu* लिखें।`,
  cancel_invalid: `❌ यह अपॉइंटमेंट रद्द नहीं हो सकती (स्थिति: {0})।\n\n*menu* लिखें।`,
  // Waitlist
  waitlist_empty: `📋 आप किसी वेटलिस्ट में नहीं हैं।\n\n*menu* लिखें।`,
  waitlist_header: `⏳ *आपकी वेटलिस्ट:*\n\n{0}\n\nकिसी से बाहर होने के लिए नंबर लिखें, या *menu* लिखें।`,
  waitlist_leave_confirm: `✅ आपको इस वेटलिस्ट से हटा दिया गया:\n{0}\n\n*menu* लिखें।`,
  waitlist_left: `✅ वेटलिस्ट छोड़ दी।\n\n*menu* लिखें।`,
  waitlist_freed_notify: `⚡ *बधाई हो!* वेटलिस्ट में आपका नंबर आ गया है।\n\nमुख्य मेनू के लिए *menu* लिखें, और अपॉइंटमेंट पक्की करने के लिए *मेरी इंतज़ार सूची* पर जाएं।`,
  // Reports
  loading_reports: `🔍 आपकी रिपोर्ट देख रहे हैं...`,
  no_reports: `📄 आपके खाते पर कोई मेडिकल रिपोर्ट नहीं मिली।\n\nरिपोर्ट अस्पताल द्वारा अपलोड की जाती हैं।\n\n*menu* लिखें।`,
  reports_header: `📄 *आपकी मेडिकल रिपोर्ट:*\n\n{0}\n\nकिस रिपोर्ट का विश्लेषण चाहिए? नंबर लिखें।`,
  invalid_report: `❓ कृपया 1 से {0} के बीच नंबर लिखें।`,
  analysis_wait: `⏳ *रिपोर्ट का विश्लेषण तैयार हो रहा है...*\n\nपहली बार में ~30 सेकंड लग सकते हैं। कृपया प्रतीक्षा करें।`,
  analysis_text_header: `📋 *{0}*\n📅 {1} | 🏷️ {2}\n\n🔍 *AI विश्लेषण:*\n{3}\n\n_यह AI द्वारा तैयार सारांश है। हमेशा अपने डॉक्टर से परामर्श लें।_`,
  analysis_audio_header: `🎵 *{0}* का ऑडियो सारांश:`,
  analysis_file_header: `📎 *{0}* की मूल रिपोर्ट:`,
  analysis_no_file: `⚠️ रिपोर्ट फ़ाइल नहीं मिल सकी।\n\n*menu* लिखें।`,
  analysis_error: `⚠️ अभी विश्लेषण नहीं हो सका। बाद में कोशिश करें।\n\n*menu* लिखें।`,
  // Health Passport
  loading_passport: `🔍 आपका हेल्थ पासपोर्ट लोड हो रहा है...`,
  passport_header: `🏥 *आपका MediNexus हेल्थ पासपोर्ट*\n\n👤 {0}{1}\n\n📊 *रिकॉर्ड:*\n• {2} पर्चा\n• {3} रिपोर्ट\n• {4} एक्टिव एक्सेस\n\n{5}{6}\n\n*menu* लिखें।`,
  // Health Trends
  trends_loading: `🔬 *आपके स्वास्थ्य ट्रेंड का विश्लेषण हो रहा है...*\n\n~20 सेकंड लग सकते हैं। कृपया प्रतीक्षा करें।`,
  trends_need_more: `📊 स्वास्थ्य ट्रेंड के लिए कम से कम 2 analysed रिपोर्ट चाहिए।\n\nपहले विकल्प 4 में रिपोर्ट खोलें और AI विश्लेषण करें।\n\n*menu* लिखें।`,
  trends_header: `🔬 *आपके स्वास्थ्य ट्रेंड*\n_({0} रिपोर्ट के आधार पर)_\n\n{1}\n\n📝 *सारांश:* {2}\n\n_हमेशा डॉक्टर से परामर्श लें।_\n\n*menu* लिखें।`,
  trends_concern_urgent: `🚨 तुरंत ध्यान दें`,
  trends_concern_watch: `⚠️ निगरानी करें`,
  trends_concern_none: `✅ ठीक है`,
  trends_dir_improving: `📈 सुधर रहा है`,
  trends_dir_declining: `📉 गिर रहा है`,
  trends_dir_stable: `➡️ स्थिर`,
  trends_dir_variable: `〰️ बदलता रहता है`,
};

const STRINGS: Record<Lang, Strings> = { en: EN, hi: HI };

/** Get a message for the given language, substituting {0}, {1}, etc. with args. */
export function msg(lang: Lang, key: MsgKey, ...args: (string | number)[]): string {
  let str = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    str = str.replaceAll(`{${i}}`, String(args[i]));
  }
  return str;
}
