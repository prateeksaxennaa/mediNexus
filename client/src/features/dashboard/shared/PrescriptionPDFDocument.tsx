import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { format, parseISO, differenceInYears } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PDFPrescriptionData {
  id: string;
  issued_at: string;
  illness_description: string | null;
  pdf_url: string | null;

  // Doctor info
  doctor: {
    full_name: string;
    specialisation: string;
    qualifications?: string | null;
    registration_number?: string | null;
    department?: string | null;
  } | null;

  // Patient info
  patient: {
    full_name: string;
    dob?: string | null;
    blood_group?: string | null;
    known_allergies?: string | null;
  } | null;

  // Hospital info (via appointments join)
  hospital: {
    name: string;
    city: string;
  } | null;

  // Medicine items
  items: {
    id: string;
    medicine_name: string;
    therapeutic_class?: string | null;
    dosage: string;
    frequency: string;
    duration: string;
    doctor_comment: string | null;
  }[];
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },

  // Letterhead
  letterhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 10,
  },
  brandBlock: {
    flexDirection: 'column',
  },
  brandName: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2,
  },
  doctorBlock: {
    alignItems: 'flex-end',
  },
  doctorName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  doctorSpec: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 1,
  },
  doctorQuals: {
    fontSize: 8,
    color: '#9ca3af',
    marginTop: 1,
  },
  doctorReg: {
    fontSize: 8,
    color: '#9ca3af',
    marginTop: 1,
    fontFamily: 'Courier',
  },

  // Patient bar
  patientBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  patientName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  patientMeta: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2,
  },
  patientAllergy: {
    fontSize: 8,
    color: '#d97706',
    marginTop: 3,
  },
  dateBlock: {
    alignItems: 'flex-end',
  },
  dateLabel: {
    fontSize: 8,
    color: '#9ca3af',
  },
  dateValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginTop: 2,
  },
  illnessText: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 3,
    maxWidth: 160,
    textAlign: 'right',
  },

  // Rx Symbol + Divider
  rxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  rxSymbol: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginRight: 8,
  },
  rxDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },

  // Medicine items
  itemsContainer: {
    marginBottom: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderBottomStyle: 'dashed',
    paddingVertical: 7,
  },
  itemIndex: {
    fontSize: 9,
    color: '#9ca3af',
    width: 16,
    marginRight: 4,
    marginTop: 1,
  },
  itemLeft: {
    flex: 1,
  },
  itemMedicineName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  itemTherapeutic: {
    fontSize: 8,
    color: '#9ca3af',
    marginTop: 1,
  },
  itemComment: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
    fontStyle: 'italic',
  },
  itemRight: {
    alignItems: 'flex-end',
    width: 140,
  },
  itemDosage: {
    fontSize: 9,
    color: '#374151',
    fontFamily: 'Helvetica-Bold',
  },
  itemFreqDur: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
  },

  // Signature
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 'auto',
    paddingTop: 24,
  },
  signatureBlock: {
    alignItems: 'center',
  },
  signatureLine: {
    width: 120,
    height: 1,
    backgroundColor: '#9ca3af',
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#6b7280',
  },
  signatureDoctor: {
    fontSize: 9,
    color: '#374151',
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#d1d5db',
  },
});

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  data: PDFPrescriptionData;
}

export const PrescriptionPDFDocument = ({ data }: Props) => {
  const doctor = data.doctor;
  const patient = data.patient;
  const hospital = data.hospital;

  // Derive age from dob
  const patientAge = patient?.dob
    ? differenceInYears(new Date(), parseISO(patient.dob))
    : null;

  const issuedDate = format(parseISO(data.issued_at), 'MMMM d, yyyy');

  const hospitalLabel = hospital
    ? `${hospital.name}${hospital.city ? `, ${hospital.city}` : ''}`
    : 'mediNexus';

  return (
    <Document
      title={`Prescription — ${patient?.full_name ?? 'Patient'}`}
      author={doctor?.full_name ?? 'mediNexus'}
      subject="Medical Prescription"
    >
      <Page size="A4" style={s.page}>
        {/* ── Letterhead ── */}
        <View style={s.letterhead}>
          <View style={s.brandBlock}>
            <Text style={s.brandName}>mediNexus</Text>
            <Text style={s.brandSub}>{hospitalLabel}</Text>
          </View>

          {doctor && (
            <View style={s.doctorBlock}>
              <Text style={s.doctorName}>{doctor.full_name}</Text>
              <Text style={s.doctorSpec}>{doctor.specialisation}</Text>
              {doctor.qualifications ? (
                <Text style={s.doctorQuals}>{doctor.qualifications}</Text>
              ) : null}
              {doctor.registration_number ? (
                <Text style={s.doctorReg}>Reg. {doctor.registration_number}</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* ── Patient bar ── */}
        <View style={s.patientBar}>
          <View>
            <Text style={s.patientName}>{patient?.full_name ?? '—'}</Text>
            <Text style={s.patientMeta}>
              {[
                patientAge != null ? `${patientAge} yrs` : null,
                patient?.blood_group ?? null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {patient?.known_allergies ? (
              <Text style={s.patientAllergy}>Allergies: {patient.known_allergies}</Text>
            ) : null}
          </View>
          <View style={s.dateBlock}>
            <Text style={s.dateLabel}>Date</Text>
            <Text style={s.dateValue}>{issuedDate}</Text>
            {data.illness_description ? (
              <Text style={s.illnessText}>{data.illness_description}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Rx Symbol ── */}
        <View style={s.rxRow}>
          <Text style={s.rxSymbol}>℞</Text>
          <View style={s.rxDivider} />
        </View>

        {/* ── Medicine items ── */}
        <View style={s.itemsContainer}>
          {data.items.map((item, idx) => (
            <View key={item.id} style={s.itemRow}>
              <Text style={s.itemIndex}>{idx + 1}.</Text>
              <View style={s.itemLeft}>
                <Text style={s.itemMedicineName}>{item.medicine_name}</Text>
                {item.therapeutic_class ? (
                  <Text style={s.itemTherapeutic}>{item.therapeutic_class}</Text>
                ) : null}
                {item.doctor_comment ? (
                  <Text style={s.itemComment}>{item.doctor_comment}</Text>
                ) : null}
              </View>
              <View style={s.itemRight}>
                <Text style={s.itemDosage}>{item.dosage}</Text>
                <Text style={s.itemFreqDur}>
                  {item.frequency} · {item.duration}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Signature ── */}
        <View style={s.signatureSection}>
          <View style={s.signatureBlock}>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Doctor's Signature</Text>
            {doctor ? (
              <Text style={s.signatureDoctor}>{doctor.full_name}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>mediNexus — Digital Health Record</Text>
          <Text style={s.footerText}>Prescription ID: {data.id}</Text>
        </View>
      </Page>
    </Document>
  );
};
