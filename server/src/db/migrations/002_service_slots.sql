-- Service Slots - Simple numbered slots (first-come-first-served)

-- Add daily_slot_limit to existing hospital_services table
ALTER TABLE hospital_services 
ADD COLUMN IF NOT EXISTS daily_slot_limit INT NOT NULL DEFAULT 10;

-- Simplified service_slots table with just slot numbers
DROP TABLE IF EXISTS service_slots CASCADE;
DROP TABLE IF EXISTS service_appointments CASCADE;

CREATE TABLE service_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  slot_date       DATE NOT NULL,
  slot_number     INT NOT NULL,                    -- Slot 1, 2, 3... etc.
  status          slot_status NOT NULL DEFAULT 'available',
  locked_by       UUID REFERENCES auth.users(id),
  locked_until    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, slot_date, slot_number)
);

CREATE INDEX idx_service_slots_service ON service_slots(service_id);
CREATE INDEX idx_service_slots_date ON service_slots(slot_date);
CREATE INDEX idx_service_slots_status ON service_slots(status);
CREATE INDEX idx_service_slots_service_date ON service_slots(service_id, slot_date);

ALTER TABLE service_slots ENABLE ROW LEVEL SECURITY;

CREATE TABLE service_appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID NOT NULL REFERENCES service_slots(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  booking_type    booking_type NOT NULL DEFAULT 'online',
  status          appointment_status NOT NULL DEFAULT 'booked',
  notes           TEXT,
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_appointments_patient ON service_appointments(patient_id);
CREATE INDEX idx_service_appointments_hospital ON service_appointments(hospital_id);
CREATE INDEX idx_service_appointments_service ON service_appointments(service_id);
CREATE INDEX idx_service_appointments_slot ON service_appointments(slot_id);

ALTER TABLE service_appointments ENABLE ROW LEVEL SECURITY;
