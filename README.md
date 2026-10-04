# MediNexus

A healthcare platform for patients, doctors, and hospital admins. Built with React + Vite (TypeScript) on the frontend, Express + TypeScript on the backend, and Supabase (PostgreSQL) for the database and auth.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, TypeScript, Node.js |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (reports, PDFs) |
| Email | Nodemailer (report upload notifications) |
| Messaging | Twilio WhatsApp API (webhook bot + reminders) |
| Realtime | SSE for slot and waitlist streams |
| Jobs | node-cron background workers |

---

## Security (Implemented)

- **Authentication + Session Security**: Supabase JWT validation, role checks (`patient`, `doctor`, `hospital_admin`), `httpOnly` auth cookies, refresh-token rotation flow.
- **Authorization (RBAC)**: Route-level guards using `authenticate` + `requireRole(...)` middleware.
- **Request Validation**: Zod-based schema validation on auth and critical write APIs.
- **API Hardening**: `helmet`, strict CORS allowlist, centralized error handler with safe production responses.
- **Data Access Privacy Audit**: Patient data access logging with alerting for first-time provider access, unusual-hour access, and bulk record access.
- **Transport/Platform Security**: HTTPS/TLS and encryption-at-rest provided by Supabase/Twilio infrastructure.

## WhatsApp Integration (Implemented)

- **Inbound Webhook**: `POST /api/webhooks/whatsapp` receives Twilio WhatsApp messages.
- **Conversational Bot**: Stateful menu-driven patient flow with session TTL, `start/menu` reset support, and bilingual EN/HI responses.
- **Booking from WhatsApp**:
    - Doctor slot booking by department.
    - Service/lab booking by department and service.
- **Appointment Actions**:
    - View upcoming appointments.
    - Cancel eligible appointments.
    - View past appointments.
    - View and leave waitlist entries.
- **Health Records via WhatsApp**:
    - List reports.
    - Generate and deliver report analysis (text + audio + original file).
    - Fetch health passport summary.
    - Fetch health trends summary.
- **Automated Reminders**: Daily cron job sends D-1 WhatsApp reminders for booked appointments (scheduled at 6:00 PM IST).
- **Production Note**: Twilio signature verification is documented but currently not enforced in webhook middleware.

## Features

### Patient App / APIs

- **Sign up / Log in** — email and password via Supabase Auth
- **Discover** — browse hospitals, doctors, services, and available slots
- **Doctor appointment booking** — soft-lock + confirm flow with race-condition-safe booking
- **Service booking** — discover services, lock slot, confirm booking, release/cancel flows
- **My Appointments** — list/view/cancel doctor and service appointments
- **Waitlist** — join/accept/decline/leave with realtime SSE updates
- **Health Passport** — consolidated records view across hospitals
- **Reports** — list reports and trigger report-to-audio flow
- **Health Trends** — report-derived trend insights
- **Access Grants** — OTP-assisted grant flow, revoke single or all doctor grants
- **Privacy Console** — access logs, alert feed, and alert preference controls
- **AI Health Assistant** — patient chat endpoint for guided assistance

### Doctor App / APIs

- **Dashboard** — overview of today's activity
- **Appointments** — list/view appointments and update appointment status
- **Slots** — create/generate/block/unblock/delete slots and mark leave
- **Prescriptions** — create/list prescriptions and medicine search
- **AI Support** — appointment AI brief and prescription AI insights
- **Patient Access** — view passport and accessible documents (grant-aware)
- **Referrals** — create/list/update referral lifecycle

### Hospital Admin App / APIs

- **Hospital profile** — view/update hospital details
- **Doctor roster** — invite/update/delete doctors
- **Doctor slot operations** — list/block/unblock/delete slots, generate slots, walk-in booking, admin cancel
- **Service catalogue** — create/update/delete services
- **Service slot operations** — generate/list/update-day/delete/bulk-delete slots and availability checks
- **Service appointments** — list and update appointment status
- **Patient report operations** — patient search, list reports, upload report + email notification

### Platform Ops

- **Startup migrations** — backend runs pending migrations before serving traffic
- **Background jobs** — slot lock cleanup, waitlist queue processing, doctor/service slot seeders, WhatsApp reminders
- **Realtime channels** — SSE streams for slot availability and waitlist events

---

## Project Structure

```
mediNexus/
├── client/          # React frontend
│   └── src/
│       ├── features/
│       │   ├── dashboard/
│       │   │   ├── admin/
│       │   │   ├── doctor/
│       │   │   └── patient/
│       │   └── shared/
│       └── services/  # API service layer
└── server/          # Express backend
    └── src/
        ├── controllers/
        ├── routes/
        ├── db/
        │   └── migrations/
        └── jobs/    # Background seeders
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the migrations applied

### Environment

**`server/.env`**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=          # postgres:// connection string for running migrations
JWT_SECRET=
EMAIL_USER=            # SMTP credentials for report notification emails
EMAIL_PASS=
FRONTEND_URL=          # primary allowed frontend origin
FRONTEND_URLS=         # optional CSV additional frontend origins
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=  # e.g. whatsapp:+14155238886 (sandbox)
```

**`client/.env`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:5000
```

### Run

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start backend (runs migrations on startup)
cd server && npm run dev

# Start frontend
cd client && npm run dev
```

Backend runs on port **5000**, frontend on port **5173**.
