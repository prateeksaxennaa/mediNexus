-- ═══════════════════════════════════════════════════════════════════
-- Migration 002: Row Level Security (RLS) Policies
--
-- Strategy:
--   • service_role key (used by the backend) bypasses RLS entirely.
--   • These policies protect direct client / anon access to the DB.
--   • auth.uid()            → the calling user's Supabase auth UUID
--   • auth.jwt() ->> key    → raw JWT claim value (text)
--   • The role is stored in app_metadata (set only by service_role),
--     so we read it from the JWT as:
--       (auth.jwt() -> 'app_metadata' ->> 'role')
-- ═══════════════════════════════════════════════════════════════════


-- ─── Helper: reusable role expressions ───────────────────────────────
-- We use inline expressions rather than a stored function so that the
-- planner can inline them and avoid extra function overhead.
--   patient role check  : (auth.jwt() -> 'app_metadata' ->> 'role') = 'patient'
--   hospital_admin check: (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
--   doctor check        : (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'


-- ════════════════════════════════════════════════════════════════════
-- 1. hospitals
-- ════════════════════════════════════════════════════════════════════

-- Approved hospitals are publicly readable (patients, doctors searching)
CREATE POLICY "hospitals: approved hospitals are publicly readable"
  ON hospitals FOR SELECT
  USING (is_approved = true);

-- Hospital admin can read their own hospital regardless of approval status
CREATE POLICY "hospitals: admin reads own hospital"
  ON hospitals FOR SELECT
  USING (admin_id = auth.uid());

-- Hospital admin can update their own hospital profile
CREATE POLICY "hospitals: admin updates own hospital"
  ON hospitals FOR UPDATE
  USING (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

-- Hospital admin can delete their own hospital
CREATE POLICY "hospitals: admin deletes own hospital"
  ON hospitals FOR DELETE
  USING (admin_id = auth.uid());

-- INSERT is handled exclusively by the service_role backend (no direct client inserts)


-- ════════════════════════════════════════════════════════════════════
-- 2. hospital_services
-- ════════════════════════════════════════════════════════════════════

-- Any authenticated user can view services of approved hospitals
CREATE POLICY "hospital_services: readable for approved hospitals"
  ON hospital_services FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = hospital_services.hospital_id
        AND h.is_approved = true
    )
  );

-- Hospital admin can manage services for their own hospital
CREATE POLICY "hospital_services: admin manages own hospital services"
  ON hospital_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = hospital_services.hospital_id
        AND h.admin_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = hospital_services.hospital_id
        AND h.admin_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 3. doctors
-- ════════════════════════════════════════════════════════════════════

-- Verified doctors are publicly readable (for patient-facing search)
CREATE POLICY "doctors: verified doctors are publicly readable"
  ON doctors FOR SELECT
  USING (verified = true);

-- A doctor can always read their own profile
CREATE POLICY "doctors: doctor reads own profile"
  ON doctors FOR SELECT
  USING (user_id = auth.uid());

-- A doctor can update their own profile
CREATE POLICY "doctors: doctor updates own profile"
  ON doctors FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Hospital admin can read all doctors in their hospital
CREATE POLICY "doctors: hospital admin reads own hospital doctors"
  ON doctors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = doctors.hospital_id
        AND h.admin_id = auth.uid()
    )
  );

-- Hospital admin can update doctors in their hospital (e.g. toggle verified)
CREATE POLICY "doctors: hospital admin manages own hospital doctors"
  ON doctors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = doctors.hospital_id
        AND h.admin_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = doctors.hospital_id
        AND h.admin_id = auth.uid()
    )
  );

-- INSERT/DELETE handled exclusively by service_role backend


-- ════════════════════════════════════════════════════════════════════
-- 4. patients
-- ════════════════════════════════════════════════════════════════════

-- A patient can read and update only their own row
CREATE POLICY "patients: patient reads own profile"
  ON patients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "patients: patient updates own profile"
  ON patients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Doctors can read basic patient info for patients they have appointments with
CREATE POLICY "patients: doctor reads patients with shared appointment"
  ON patients FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
    AND EXISTS (
      SELECT 1 FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = patients.id
        AND d.user_id = auth.uid()
    )
  );

-- Hospital admins can read patients who have appointments at their hospital
CREATE POLICY "patients: hospital admin reads patients with appointments"
  ON patients FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
    AND EXISTS (
      SELECT 1 FROM appointments a
      JOIN hospitals h ON h.id = a.hospital_id
      WHERE a.patient_id = patients.id
        AND h.admin_id = auth.uid()
    )
  );

-- INSERT handled exclusively by service_role backend


-- ════════════════════════════════════════════════════════════════════
-- 5. appointment_slots
-- ════════════════════════════════════════════════════════════════════

-- Any authenticated user can view available slots
CREATE POLICY "appointment_slots: authenticated users view available slots"
  ON appointment_slots FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only the owning doctor or their hospital admin can insert/update slots
CREATE POLICY "appointment_slots: doctor manages own slots"
  ON appointment_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = appointment_slots.doctor_id
        AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = appointment_slots.doctor_id
        AND d.user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 6. appointments
-- ════════════════════════════════════════════════════════════════════

-- Patients can read their own appointments
CREATE POLICY "appointments: patient reads own appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = appointments.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can read appointments assigned to them
CREATE POLICY "appointments: doctor reads own appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = appointments.doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Hospital admins can read all appointments at their hospital
CREATE POLICY "appointments: hospital admin reads own hospital appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = appointments.hospital_id
        AND h.admin_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE handled exclusively by service_role backend


-- ════════════════════════════════════════════════════════════════════
-- 7. patient_reports
-- ════════════════════════════════════════════════════════════════════

-- Patients can view their own reports
CREATE POLICY "patient_reports: patient reads own reports"
  ON patient_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_reports.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can view reports for patients where a valid access grant exists
CREATE POLICY "patient_reports: doctor reads with access grant"
  ON patient_reports FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
    AND EXISTS (
      SELECT 1 FROM record_access_grants g
      JOIN doctors d ON d.id = g.granted_to_doctor_id
      WHERE g.patient_id = patient_reports.patient_id
        AND d.user_id = auth.uid()
        AND g.valid_until > now()
    )
  );

-- Hospital admins can view reports for their hospital
CREATE POLICY "patient_reports: hospital admin reads own hospital reports"
  ON patient_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = patient_reports.hospital_id
        AND h.admin_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 8. prescriptions & prescription_items
-- ════════════════════════════════════════════════════════════════════

-- Patients can read their own prescriptions
CREATE POLICY "prescriptions: patient reads own"
  ON prescriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = prescriptions.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can read and write prescriptions for their appointments
CREATE POLICY "prescriptions: doctor manages own"
  ON prescriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = prescriptions.doctor_id
        AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = prescriptions.doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Prescription items follow the same rules as prescriptions
CREATE POLICY "prescription_items: patient reads own"
  ON prescription_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prescriptions pr
      JOIN patients p ON p.id = pr.patient_id
      WHERE pr.id = prescription_items.prescription_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "prescription_items: doctor manages own"
  ON prescription_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM prescriptions pr
      JOIN doctors d ON d.id = pr.doctor_id
      WHERE pr.id = prescription_items.prescription_id
        AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prescriptions pr
      JOIN doctors d ON d.id = pr.doctor_id
      WHERE pr.id = prescription_items.prescription_id
        AND d.user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 9. record_access_grants
-- ════════════════════════════════════════════════════════════════════

-- Patients manage their own access grants
CREATE POLICY "record_access_grants: patient manages own"
  ON record_access_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = record_access_grants.patient_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = record_access_grants.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can view grants assigned to them
CREATE POLICY "record_access_grants: doctor reads own grants"
  ON record_access_grants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = record_access_grants.granted_to_doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Hospital admins can view grants to their hospital
CREATE POLICY "record_access_grants: hospital admin reads own grants"
  ON record_access_grants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hospitals h
      WHERE h.id = record_access_grants.granted_to_hospital_id
        AND h.admin_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 10. slot_waitlist
-- ════════════════════════════════════════════════════════════════════

-- Patients can manage their own waitlist entries
CREATE POLICY "slot_waitlist: patient manages own"
  ON slot_waitlist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = slot_waitlist.patient_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = slot_waitlist.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can view the waitlist for their slots
CREATE POLICY "slot_waitlist: doctor reads own slot waitlists"
  ON slot_waitlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointment_slots s
      JOIN doctors d ON d.id = s.doctor_id
      WHERE s.id = slot_waitlist.slot_id
        AND d.user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════
-- 11. appointment_status_log  (audit — read-only for clients)
-- ════════════════════════════════════════════════════════════════════

-- Only parties involved in the appointment can view its status log
CREATE POLICY "appointment_status_log: parties can read"
  ON appointment_status_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      LEFT JOIN patients pt ON pt.id = a.patient_id AND pt.user_id = auth.uid()
      LEFT JOIN doctors  dr ON dr.id = a.doctor_id  AND dr.user_id = auth.uid()
      LEFT JOIN hospitals h ON h.id  = a.hospital_id AND h.admin_id = auth.uid()
      WHERE a.id = appointment_status_log.appointment_id
        AND (pt.id IS NOT NULL OR dr.id IS NOT NULL OR h.id IS NOT NULL)
    )
  );

-- INSERT handled exclusively by service_role backend (or DB triggers)


-- ════════════════════════════════════════════════════════════════════
-- 12. medicines  (public read-only catalogue)
-- ════════════════════════════════════════════════════════════════════

CREATE POLICY "medicines: publicly readable"
  ON medicines FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE handled exclusively by service_role (admin seeding)


-- ════════════════════════════════════════════════════════════════════
-- 13. search_cache  (internal — no direct client access)
-- ════════════════════════════════════════════════════════════════════
-- No policies created — all access goes through service_role backend only.
-- The table has RLS enabled (from migration 001) so direct client access is
-- denied by default.
