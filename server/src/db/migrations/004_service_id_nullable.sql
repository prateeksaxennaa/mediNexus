-- Migration 004: Make appointments.service_id nullable
-- The booking flow does not require a service selection step, and service_id
-- can be resolved automatically server-side. Removing the NOT NULL constraint
-- prevents booking failures when no matching hospital_service exists.

ALTER TABLE appointments ALTER COLUMN service_id DROP NOT NULL;
