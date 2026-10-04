-- Migration 003: Extend slot_status and waitlist_status enums
-- Adds 'blocked' to slot_status  (for doctor leave/block feature)
-- Adds 'offered' to waitlist_status (for waitlist notification flow)

ALTER TYPE slot_status     ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE waitlist_status ADD VALUE IF NOT EXISTS 'offered';
