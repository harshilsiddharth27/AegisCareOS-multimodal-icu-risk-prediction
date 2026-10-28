import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory and database file location
const DATA_DIR = path.resolve(__dirname, "../data");
const DB_FILE = path.join(DATA_DIR, "hospital_db.json");

export interface VitalEntry {
  hour: number;
  timestamp?: string;
  heart_rate: number;
  sbp: number;
  dias_bp?: number;
  resp_rate: number;
  spo2: number;
  temp_c?: number;
  gcs?: number;
  m_heart_rate: number;
  m_sbp: number;
  m_resp_rate: number;
  m_spo2: number;
}

export interface ClinicalNoteEntry {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  note_type: "SOAP" | "Nursing" | "Physician" | "Triage" | "Handoff";
  text: string;
  de_identified?: boolean;
}

export interface HospitalPatient {
  stay_id: number;
  mrn: string;
  patient_name: string;
  patient_name_masked: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  blood_type: string;
  admission_type: "EMERGENT" | "URGENT" | "ELECTIVE" | "TRAUMA" | "DIRECT_TRANSFER";
  first_careunit: string;
  bed_id: string;
  attending_physician: string;
  diagnosis: string;
  charlson_score: number;
  allergies: string;
  code_status: "FULL_CODE" | "DNR" | "DNI" | "DNR/DNI" | "COMFORT_MEASURES";
  status: "ADMITTED" | "DISCHARGED" | "TRANSFERRED";
  admitted_at: string;
  discharged_at?: string;
  mortality_true: number;
  pred_prob_model_a: number;
  pred_prob_model_b: number;
  pred_prob_model_c: number;
  risk_category: "Low Risk" | "Moderate Risk" | "High Risk";
  progress_note_24h: string;
  notes_history: ClinicalNoteEntry[];
  vitals_24h: VitalEntry[];
  last_gemini_explanation?: string;
}

export interface HospitalBed {
  bed_id: string;
  unit: string;
  room: string;
  status: "OCCUPIED" | "AVAILABLE" | "CLEANING" | "MAINTENANCE";
  current_stay_id?: number | null;
  assigned_patient_name?: string | null;
  last_updated: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  details: string;
  patient_stay_id?: number | null;
}

export interface HospitalDatabaseSchema {
  version: string;
  hospital_name: string;
  facility_id: string;
  last_persisted_at: string;
  patients: HospitalPatient[];
  beds: HospitalBed[];
  audit_logs: AuditLogEntry[];
}

// 8 Baseline MIMIC-IV benchmark patients
const DEFAULT_PATIENTS: HospitalPatient[] = [
  {
    stay_id: 34891024,
    mrn: "MRN-348910",
    patient_name: "James D. Thorne",
    patient_name_masked: "Pt. J.D. [REDACTED]",
    age: 72,
    gender: "Male",
    blood_type: "A+",
    admission_type: "EMERGENT",
    first_careunit: "MICU",
    bed_id: "Bed 101 - MICU",
    attending_physician: "Dr. Sarah Chen, MD (Critical Care)",
    diagnosis: "Severe Septic Shock & Community-Acquired Pneumonia",
    charlson_score: 6,
    allergies: "Penicillin, Ceftriaxone",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T14:30:00.000Z",
    mortality_true: 1,
    pred_prob_model_a: 0.582,
    pred_prob_model_b: 0.714,
    pred_prob_model_c: 0.849,
    risk_category: "High Risk",
    progress_note_24h:
      "ICU Day 1 Nursing Note: 72yo M admitted with severe septic shock secondary to community-acquired pneumonia. Refractory hypotension requiring escalating norepinephrine (0.24 mcg/kg/min) and vasopressin. Lactic acidosis worsening from 2.8 to 5.1 mmol/L. Intubated on volume-control with FiO2 70%, PEEP 14. Urine output < 15 mL/hr over past 5 hours despite aggressive crystalloid resuscitation. Emergent nephrology consultation placed for CRRT initiation. Guarded prognosis conveyed to family.",
    notes_history: [
      {
        id: "note-101",
        author: "Nurse Kelly Adams, RN",
        role: "ICU Staff Nurse",
        timestamp: "2026-10-25T16:00:00.000Z",
        note_type: "Triage",
        text: "Direct admit from ED. Arterial line placed in right radial artery. Severe peripheral hypoperfusion noted. Norepinephrine initiated at 0.10 mcg/kg/min.",
      },
      {
        id: "note-102",
        author: "Dr. Sarah Chen, MD",
        role: "Attending Intensivist",
        timestamp: "2026-10-26T08:30:00.000Z",
        note_type: "SOAP",
        text: "S: Intubated, sedated on propofol/fentanyl.\nO: MAP 58 on dual pressors. Lactate 5.1. Oliguric (<15 mL/hr).\nA: Septic shock refractory with acute multiorgan failure.\nP: Add vasopressin. Prepare right internal jugular line for emergent CRRT.",
      },
    ],
    vitals_24h: Array.from({ length: 24 }, (_, t) => {
      const decay = t / 24.0;
      return {
        hour: t,
        heart_rate: Math.round(92 + decay * 36 + Math.sin(t) * 3),
        sbp: Math.round(112 - decay * 34 + Math.cos(t) * 4),
        dias_bp: Math.round(68 - decay * 22),
        resp_rate: Math.round(18 + decay * 11 + Math.sin(t * 2) * 2),
        spo2: Math.round((95 - decay * 8.5) * 10) / 10,
        temp_c: 38.6 - decay * 0.4,
        gcs: 7,
        m_heart_rate: t % 4 === 3 ? 0 : 1,
        m_sbp: t % 5 === 4 ? 0 : 1,
        m_resp_rate: t % 3 === 2 ? 0 : 1,
        m_spo2: 1,
      };
    }),
  },
  {
    stay_id: 31204891,
    mrn: "MRN-312048",
    patient_name: "Martha R. Higgins",
    patient_name_masked: "Pt. M.R. [REDACTED]",
    age: 58,
    gender: "Female",
    blood_type: "O+",
    admission_type: "ELECTIVE",
    first_careunit: "SICU",
    bed_id: "Bed 102 - SICU",
    attending_physician: "Dr. Marcus Vance, MD (Surgical Critical Care)",
    diagnosis: "Elective Robotic Sigmoidectomy (Post-Op Surveillance)",
    charlson_score: 2,
    allergies: "NKDA",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T18:00:00.000Z",
    mortality_true: 0,
    pred_prob_model_a: 0.142,
    pred_prob_model_b: 0.089,
    pred_prob_model_c: 0.048,
    risk_category: "Low Risk",
    progress_note_24h:
      "ICU Day 1 Progress Note: 58yo F admitted for routine hemodynamic monitoring following elective robotic sigmoid resection. Hemodynamically stable off all vasopressor support. Extubated in PACU; maintaining SpO2 98% on 2L nasal cannula. Surgical incisions clean and dry. Pain adequately controlled with IV acetaminophen and low-dose PCA. Adequate urine output > 45 mL/hr. Plan for morning transfer to surgical stepdown floor.",
    notes_history: [
      {
        id: "note-201",
        author: "Dr. Marcus Vance, MD",
        role: "Surgical Attending",
        timestamp: "2026-10-25T20:00:00.000Z",
        note_type: "Physician",
        text: "Post-op arrival uneventful. EBL 75mL. Hemoglobin 11.8 stable. Flatus not yet passed. Clear liquids tolerated.",
      },
    ],
    vitals_24h: Array.from({ length: 24 }, (_, t) => ({
      hour: t,
      heart_rate: Math.round(74 + Math.sin(t / 3) * 5),
      sbp: Math.round(124 + Math.cos(t / 4) * 6),
      dias_bp: 76,
      resp_rate: Math.round(16 + Math.sin(t / 2) * 1.5),
      spo2: Math.round((98 - (t % 6 === 0 ? 0.8 : 0)) * 10) / 10,
      temp_c: 36.8,
      gcs: 15,
      m_heart_rate: t % 6 === 5 ? 0 : 1,
      m_sbp: t % 4 === 3 ? 0 : 1,
      m_resp_rate: 1,
      m_spo2: 1,
    })),
  },
  {
    stay_id: 38921477,
    mrn: "MRN-389214",
    patient_name: "Thomas B. Reynolds",
    patient_name_masked: "Pt. T.B. [REDACTED]",
    age: 66,
    gender: "Male",
    blood_type: "B+",
    admission_type: "EMERGENT",
    first_careunit: "CCU",
    bed_id: "Bed 103 - CCU",
    attending_physician: "Dr. Elena Rostova, MD (Cardiology)",
    diagnosis: "Acute Anterolateral STEMI post-PCI (LAD Stent)",
    charlson_score: 4,
    allergies: "Aspirin (Mild Gastritis)",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T21:15:00.000Z",
    mortality_true: 0,
    pred_prob_model_a: 0.365,
    pred_prob_model_b: 0.428,
    pred_prob_model_c: 0.312,
    risk_category: "Moderate Risk",
    progress_note_24h:
      "CCU Nursing Assessment: 66yo M status post acute anterolateral STEMI with drug-eluting stent placement to proximal LAD. Initial transient hypotension stabilized on low-dose dopamine, successfully weaned off at hour 14. Serial troponins peaking. Bedside echo demonstrates moderate anterior hypokinesia, LVEF estimated 40-45%. Occasional PVCs noted on telemetry, no runs of VTach. Serum potassium repleted to 4.2. Hemodynamics stabilizing.",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => {
      const stablePhase = t > 12;
      return {
        hour: t,
        heart_rate: Math.round(stablePhase ? 78 + (t % 3) : 96 - t * 1.2),
        sbp: Math.round(stablePhase ? 116 + (t % 4) : 94 + t * 1.5),
        dias_bp: 72,
        resp_rate: Math.round(19 - t * 0.15),
        spo2: Math.round((96.5 + (stablePhase ? 1.0 : 0)) * 10) / 10,
        temp_c: 37.1,
        gcs: 15,
        m_heart_rate: 1,
        m_sbp: t % 3 === 2 ? 0 : 1,
        m_resp_rate: 1,
        m_spo2: 1,
      };
    }),
  },
  {
    stay_id: 36712099,
    mrn: "MRN-367120",
    patient_name: "Eleanor S. Walsh",
    patient_name_masked: "Pt. E.S. [REDACTED]",
    age: 79,
    gender: "Female",
    blood_type: "AB-",
    admission_type: "EMERGENT",
    first_careunit: "TSICU",
    bed_id: "Bed 104 - TSICU",
    attending_physician: "Dr. David Sterling, MD (Trauma)",
    diagnosis: "Polytrauma, Bilateral Flail Chest & Severe ARDS",
    charlson_score: 5,
    allergies: "Latex",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T11:00:00.000Z",
    mortality_true: 1,
    pred_prob_model_a: 0.612,
    pred_prob_model_b: 0.698,
    pred_prob_model_c: 0.792,
    risk_category: "High Risk",
    progress_note_24h:
      "ICU Progress Note: 79yo F with multitrauma including bilateral flail chest and pulmonary contusions following MVA. Developing acute severe ARDS with PaO2/FiO2 ratio 92. Refractory hypoxemia with SpO2 86-89% despite 100% FiO2 and neuromuscular blockade. Paralytics initiated. Neurological examination limited due to sedation. Oliguric with rising BUN and creatinine (2.4 mg/dL). Code status remains Full Code per surrogate decision maker.",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => {
      const decay = t / 24.0;
      return {
        hour: t,
        heart_rate: Math.round(102 + decay * 28 + (t % 2 === 0 ? 3 : -2)),
        sbp: Math.round(104 - decay * 22 + (t % 3 === 0 ? -4 : 2)),
        dias_bp: Math.round(62 - decay * 14),
        resp_rate: Math.round(24 + decay * 10),
        spo2: Math.round((92.5 - decay * 7.5) * 10) / 10,
        temp_c: 38.2,
        gcs: 6,
        m_heart_rate: 1,
        m_sbp: 1,
        m_resp_rate: t % 4 === 3 ? 0 : 1,
        m_spo2: 1,
      };
    }),
  },
  {
    stay_id: 35198033,
    mrn: "MRN-351980",
    patient_name: "Kenneth L. Miller",
    patient_name_masked: "Pt. K.L. [REDACTED]",
    age: 63,
    gender: "Male",
    blood_type: "O-",
    admission_type: "EMERGENT",
    first_careunit: "MICU",
    bed_id: "Bed 105 - MICU",
    attending_physician: "Dr. Sarah Chen, MD (Critical Care)",
    diagnosis: "Severe Acute Gallstone Pancreatitis",
    charlson_score: 3,
    allergies: "Codeine",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T13:40:00.000Z",
    mortality_true: 0,
    pred_prob_model_a: 0.41,
    pred_prob_model_b: 0.38,
    pred_prob_model_c: 0.345,
    risk_category: "Moderate Risk",
    progress_note_24h:
      "ICU Day 1 Note: 63yo M admitted with severe acute gallstone pancreatitis. Large volume third-spacing with 6 liters crystalloid administered in 24 hours. Urine output recovering to 30-40 mL/hr. Persistent epigastric pain managed on hydromorphone. Afebrile. Serum lipase > 1200. Transferred to enteral feeding tube trial. Hemodynamics stable without pressors.",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => ({
      hour: t,
      heart_rate: Math.round(88 - t * 0.4),
      sbp: Math.round(118 + (t % 3) * 2),
      dias_bp: 74,
      resp_rate: Math.round(18 + (t % 2)),
      spo2: 97.0,
      temp_c: 37.4,
      gcs: 15,
      m_heart_rate: 1,
      m_sbp: 1,
      m_resp_rate: 1,
      m_spo2: 1,
    })),
  },
  {
    stay_id: 39912044,
    mrn: "MRN-399120",
    patient_name: "Robert W. Callahan",
    patient_name_masked: "Pt. R.W. [REDACTED]",
    age: 71,
    gender: "Male",
    blood_type: "A-",
    admission_type: "URGENT",
    first_careunit: "CVICU",
    bed_id: "Bed 106 - CVICU",
    attending_physician: "Dr. Elena Rostova, MD (Cardiothoracic ICU)",
    diagnosis: "Cardiogenic Shock post-CABG x4 with IABP Support",
    charlson_score: 5,
    allergies: "Sulfa drugs",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T09:10:00.000Z",
    mortality_true: 1,
    pred_prob_model_a: 0.52,
    pred_prob_model_b: 0.67,
    pred_prob_model_c: 0.76,
    risk_category: "High Risk",
    progress_note_24h:
      "CVICU Attending Note: 71yo M post emergent redo-CABG with low cardiac output syndrome. Intra-aortic balloon pump (IABP) 1:1 assist in place. Epinephrine 0.08 mcg/kg/min and milrinone 0.375 mcg/kg/min running. Cardiac index 1.8 L/min/m2. Mixed venous oxygen saturation (SvO2) 52%. Chest tube output 75 mL over past 4 hours. Renal function deteriorating.",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => {
      const decay = t / 24.0;
      return {
        hour: t,
        heart_rate: Math.round(98 + decay * 18),
        sbp: Math.round(92 - decay * 14 + (t % 2 === 0 ? 3 : -3)),
        dias_bp: 58,
        resp_rate: Math.round(20 + decay * 4),
        spo2: Math.round((94 - decay * 4) * 10) / 10,
        temp_c: 36.4,
        gcs: 10,
        m_heart_rate: 1,
        m_sbp: t % 4 === 2 ? 0 : 1,
        m_resp_rate: 1,
        m_spo2: 1,
      };
    }),
  },
  {
    stay_id: 32014890,
    mrn: "MRN-320148",
    patient_name: "Sophia A. Drake",
    patient_name_masked: "Pt. S.A. [REDACTED]",
    age: 44,
    gender: "Female",
    blood_type: "B-",
    admission_type: "EMERGENT",
    first_careunit: "NeuroICU",
    bed_id: "Bed 107 - NeuroICU",
    attending_physician: "Dr. Arthur Campbell, MD (Neurocritical Care)",
    diagnosis: "Subarachnoid Hemorrhage (Hunt-Hess Grade 2, Coiled)",
    charlson_score: 1,
    allergies: "NKDA",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T23:00:00.000Z",
    mortality_true: 0,
    pred_prob_model_a: 0.18,
    pred_prob_model_b: 0.12,
    pred_prob_model_c: 0.085,
    risk_category: "Low Risk",
    progress_note_24h:
      "NeuroICU Day 1: 44yo F status post successful endovascular coiling of anterior communicating artery aneurysm. Neurologically awake, alert, GCS 15. Following all commands. Strict SBP parameter < 140 mmHg maintained with nicardipine drip now weaned off. Denies focal deficits. Transcranial dopplers show no early vasospasm. EVD clamped.",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => ({
      hour: t,
      heart_rate: Math.round(72 + (t % 4)),
      sbp: Math.round(132 - (t > 10 ? 8 : 0)),
      dias_bp: 80,
      resp_rate: 15,
      spo2: 99.0,
      temp_c: 36.9,
      gcs: 15,
      m_heart_rate: 1,
      m_sbp: 1,
      m_resp_rate: 1,
      m_spo2: 1,
    })),
  },
  {
    stay_id: 37781011,
    mrn: "MRN-377810",
    patient_name: "Alan K. Henderson",
    patient_name_masked: "Pt. A.K. [REDACTED]",
    age: 52,
    gender: "Male",
    blood_type: "O+",
    admission_type: "EMERGENT",
    first_careunit: "MICU",
    bed_id: "Bed 108 - MICU",
    attending_physician: "Dr. Sarah Chen, MD (Critical Care)",
    diagnosis: "Severe Diabetic Ketoacidosis & E. Coli Urosepsis",
    charlson_score: 3,
    allergies: "Ciprofloxacin",
    code_status: "FULL_CODE",
    status: "ADMITTED",
    admitted_at: "2026-10-25T17:30:00.000Z",
    mortality_true: 0,
    pred_prob_model_a: 0.32,
    pred_prob_model_b: 0.29,
    pred_prob_model_c: 0.198,
    risk_category: "Low Risk",
    progress_note_24h:
      "MICU Resident Assessment: 52yo M admitted with profound DKA (pH 7.08, bicarbonate 6, glucose 780 mg/dL) complicated by E. coli urosepsis. Aggressive insulin infusion and electrolyte replacement ongoing. Anion gap closed from 28 to 14 over 20 hours. Mentation improving, alert and oriented x3. IV fluids transitioned to D5 1/2NS + 20 mEq KCl. Urine output brisk (>70 mL/hr).",
    notes_history: [],
    vitals_24h: Array.from({ length: 24 }, (_, t) => ({
      hour: t,
      heart_rate: Math.round(110 - t * 1.5),
      sbp: Math.round(102 + t * 0.8),
      dias_bp: 68,
      resp_rate: Math.round(26 - t * 0.4),
      spo2: 98.0,
      temp_c: 37.8 - t * 0.03,
      gcs: 14,
      m_heart_rate: 1,
      m_sbp: 1,
      m_resp_rate: 1,
      m_spo2: 1,
    })),
  },
];

// Hospital Ward Beds configuration
const DEFAULT_BEDS: HospitalBed[] = [
  { bed_id: "Bed 101 - MICU", unit: "MICU", room: "ICU-101", status: "OCCUPIED", current_stay_id: 34891024, assigned_patient_name: "James D. Thorne", last_updated: new Date().toISOString() },
  { bed_id: "Bed 102 - SICU", unit: "SICU", room: "ICU-102", status: "OCCUPIED", current_stay_id: 31204891, assigned_patient_name: "Martha R. Higgins", last_updated: new Date().toISOString() },
  { bed_id: "Bed 103 - CCU", unit: "CCU", room: "ICU-103", status: "OCCUPIED", current_stay_id: 38921477, assigned_patient_name: "Thomas B. Reynolds", last_updated: new Date().toISOString() },
  { bed_id: "Bed 104 - TSICU", unit: "TSICU", room: "ICU-104", status: "OCCUPIED", current_stay_id: 36712099, assigned_patient_name: "Eleanor S. Walsh", last_updated: new Date().toISOString() },
  { bed_id: "Bed 105 - MICU", unit: "MICU", room: "ICU-105", status: "OCCUPIED", current_stay_id: 35198033, assigned_patient_name: "Kenneth L. Miller", last_updated: new Date().toISOString() },
  { bed_id: "Bed 106 - CVICU", unit: "CVICU", room: "ICU-106", status: "OCCUPIED", current_stay_id: 39912044, assigned_patient_name: "Robert W. Callahan", last_updated: new Date().toISOString() },
  { bed_id: "Bed 107 - NeuroICU", unit: "NeuroICU", room: "ICU-107", status: "OCCUPIED", current_stay_id: 32014890, assigned_patient_name: "Sophia A. Drake", last_updated: new Date().toISOString() },
  { bed_id: "Bed 108 - MICU", unit: "MICU", room: "ICU-108", status: "OCCUPIED", current_stay_id: 37781011, assigned_patient_name: "Alan K. Henderson", last_updated: new Date().toISOString() },
  { bed_id: "Bed 109 - MICU", unit: "MICU", room: "ICU-109", status: "AVAILABLE", current_stay_id: null, assigned_patient_name: null, last_updated: new Date().toISOString() },
  { bed_id: "Bed 110 - SICU", unit: "SICU", room: "ICU-110", status: "AVAILABLE", current_stay_id: null, assigned_patient_name: null, last_updated: new Date().toISOString() },
  { bed_id: "Bed 111 - CCU", unit: "CCU", room: "ICU-111", status: "CLEANING", current_stay_id: null, assigned_patient_name: null, last_updated: new Date().toISOString() },
  { bed_id: "Bed 112 - StepDown", unit: "StepDown", room: "SDU-201", status: "AVAILABLE", current_stay_id: null, assigned_patient_name: null, last_updated: new Date().toISOString() },
];

const DEFAULT_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "log-init-1",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    actor: "System Administrator",
    role: "Clinical Engineering",
    action: "SYSTEM_INITIALIZATION",
    details: "Hospital Clinical Database engine initialized with MIMIC-IV benchmark test cohort.",
  },
  {
    id: "log-init-2",
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    actor: "Nurse Kelly Adams, RN",
    role: "Triage / Intake Nurse",
    action: "PATIENT_ADMISSION",
    details: "Emergency ICU intake completed for James D. Thorne to Bed 101 - MICU.",
    patient_stay_id: 34891024,
  },
];

class HospitalStore {
  private db: HospitalDatabaseSchema;

  constructor() {
    this.ensureDataDirectory();
    this.db = this.loadDatabase();
  }

  private ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (err) {
        console.error("Failed to create data directory:", err);
      }
    }
  }

  private loadDatabase(): HospitalDatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw) as HospitalDatabaseSchema;
        if (parsed.patients && Array.isArray(parsed.patients)) {
          console.log(`[HospitalStore] Successfully loaded database with ${parsed.patients.length} patients and ${parsed.beds?.length || 0} beds from ${DB_FILE}`);
          return parsed;
        }
      }
    } catch (err) {
      console.warn("[HospitalStore] Failed to parse existing database file, rebuilding with defaults:", err);
    }

    // Default initialization
    const initialDb: HospitalDatabaseSchema = {
      version: "3.0.0",
      hospital_name: "Metro General Hospital - AegisCare ICU Center",
      facility_id: "HOSP-NYC-0491",
      last_persisted_at: new Date().toISOString(),
      patients: DEFAULT_PATIENTS,
      beds: DEFAULT_BEDS,
      audit_logs: DEFAULT_AUDIT_LOGS,
    };

    this.persistToDisk(initialDb);
    return initialDb;
  }

  private persistToDisk(data: HospitalDatabaseSchema = this.db) {
    try {
      this.ensureDataDirectory();
      data.last_persisted_at = new Date().toISOString();
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tempPath, DB_FILE);
      console.log(`[HospitalStore] Database permanently persisted: ${data.patients.length} patients, ${data.beds.length} beds, ${data.audit_logs.length} audit logs.`);
    } catch (err) {
      console.error("[HospitalStore] Error persisting database to disk:", err);
    }
  }

  // --- Patient Query Methods ---
  public getAllPatients(): HospitalPatient[] {
    return this.db.patients;
  }

  public getPatientById(stay_id: number): HospitalPatient | undefined {
    return this.db.patients.find((p) => p.stay_id === stay_id);
  }

  // --- Patient Registration Method ---
  public registerPatient(payload: {
    patient_name: string;
    age: number;
    gender: "Male" | "Female" | "Other";
    blood_type?: string;
    admission_type: "EMERGENT" | "URGENT" | "ELECTIVE" | "TRAUMA" | "DIRECT_TRANSFER";
    ward: string;
    bed_id: string;
    attending_physician: string;
    diagnosis: string;
    charlson_score: number;
    allergies?: string;
    code_status: "FULL_CODE" | "DNR" | "DNI" | "DNR/DNI" | "COMFORT_MEASURES";
    initial_hr?: number;
    initial_sbp?: number;
    initial_dias_bp?: number;
    initial_rr?: number;
    initial_spo2?: number;
    initial_temp?: number;
    initial_gcs?: number;
    initial_note?: string;
    registered_by?: string;
  }): HospitalPatient {
    const stay_id = Math.floor(30000000 + Math.random() * 90000000);
    const mrn = `MRN-${Math.floor(100000 + Math.random() * 900000)}`;

    const initials = payload.patient_name
      .split(" ")
      .map((n) => n[0]?.toUpperCase() || "")
      .join(".");
    const patient_name_masked = `Pt. ${initials} [REDACTED]`;

    const baselineHr = payload.initial_hr || 82;
    const baselineSbp = payload.initial_sbp || 118;
    const baselineDias = payload.initial_dias_bp || 72;
    const baselineRr = payload.initial_rr || 18;
    const baselineSpo2 = payload.initial_spo2 || 97;
    const baselineTemp = payload.initial_temp || 37.0;
    const baselineGcs = payload.initial_gcs || 15;

    // Generate continuous 24h trajectory based on baseline
    const vitals_24h: VitalEntry[] = Array.from({ length: 24 }, (_, t) => {
      const varianceHr = Math.round(Math.sin(t / 2) * 4);
      const varianceSbp = Math.round(Math.cos(t / 3) * 5);
      return {
        hour: t,
        heart_rate: Math.max(45, Math.min(180, baselineHr + varianceHr)),
        sbp: Math.max(60, Math.min(220, baselineSbp + varianceSbp)),
        dias_bp: baselineDias,
        resp_rate: Math.max(8, Math.min(45, baselineRr + (t % 4 === 0 ? 1 : 0))),
        spo2: Math.max(70, Math.min(100, Math.round((baselineSpo2 - (t % 5 === 4 ? 0.6 : 0)) * 10) / 10)),
        temp_c: baselineTemp,
        gcs: baselineGcs,
        m_heart_rate: t % 6 === 5 ? 0 : 1,
        m_sbp: t % 4 === 3 ? 0 : 1,
        m_resp_rate: 1,
        m_spo2: 1,
      };
    });

    // Multimodal Risk Calculation
    const noteText = payload.initial_note || `Intake evaluation for ${payload.diagnosis}. Baseline vitals recorded upon arrival.`;
    const noteLower = noteText.toLowerCase();
    const criticalTerms = ["shock", "vasopressor", "norepinephrine", "hypotension", "ards", "refractory", "crrt", "intubated", "failure", "arrest", "coma"];
    const textHits = criticalTerms.reduce((acc, term) => acc + (noteLower.includes(term) ? 1.5 : 0), 0);

    const demoScore = (payload.age / 100) * 0.8 + (payload.charlson_score / 10) * 0.9;
    const z = -3.2 + 0.02 * (baselineHr - 75) - 0.03 * (baselineSbp - 110) - 0.04 * (baselineSpo2 - 95) + textHits * 0.45 + demoScore;
    const pred_prob_model_c = Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(-z))));
    const pred_prob_model_b = Math.max(0.03, Math.min(0.97, pred_prob_model_c * 0.92));
    const pred_prob_model_a = Math.max(0.04, Math.min(0.96, pred_prob_model_c * 0.85));

    const risk_category = pred_prob_model_c >= 0.5 ? "High Risk" : pred_prob_model_c >= 0.2 ? "Moderate Risk" : "Low Risk";

    const initialNote: ClinicalNoteEntry = {
      id: `note-${Date.now()}`,
      author: payload.registered_by || "Intake Nurse / Triage Team",
      role: "Triage Coordinator",
      timestamp: new Date().toISOString(),
      note_type: "Triage",
      text: noteText,
      de_identified: true,
    };

    const newPatient: HospitalPatient = {
      stay_id,
      mrn,
      patient_name: payload.patient_name,
      patient_name_masked,
      age: Number(payload.age),
      gender: payload.gender,
      blood_type: payload.blood_type || "O+",
      admission_type: payload.admission_type,
      first_careunit: payload.ward,
      bed_id: payload.bed_id,
      attending_physician: payload.attending_physician,
      diagnosis: payload.diagnosis,
      charlson_score: Number(payload.charlson_score),
      allergies: payload.allergies || "NKDA",
      code_status: payload.code_status,
      status: "ADMITTED",
      admitted_at: new Date().toISOString(),
      mortality_true: pred_prob_model_c >= 0.5 ? 1 : 0,
      pred_prob_model_a: Math.round(pred_prob_model_a * 1000) / 1000,
      pred_prob_model_b: Math.round(pred_prob_model_b * 1000) / 1000,
      pred_prob_model_c: Math.round(pred_prob_model_c * 1000) / 1000,
      risk_category,
      progress_note_24h: noteText,
      notes_history: [initialNote],
      vitals_24h,
    };

    // Prepend to patients array
    this.db.patients.unshift(newPatient);

    // Update Bed Assignment
    const bed = this.db.beds.find((b) => b.bed_id === payload.bed_id);
    if (bed) {
      bed.status = "OCCUPIED";
      bed.current_stay_id = stay_id;
      bed.assigned_patient_name = payload.patient_name;
      bed.last_updated = new Date().toISOString();
    } else {
      this.db.beds.push({
        bed_id: payload.bed_id,
        unit: payload.ward,
        room: `ICU-${Math.floor(200 + Math.random() * 800)}`,
        status: "OCCUPIED",
        current_stay_id: stay_id,
        assigned_patient_name: payload.patient_name,
        last_updated: new Date().toISOString(),
      });
    }

    // Add Audit Log Entry
    this.addAuditLog({
      actor: payload.registered_by || "Intake Nurse",
      role: "Triage Intake",
      action: "PATIENT_REGISTERED",
      details: `New patient ${payload.patient_name} (${mrn}) registered & admitted to ${payload.bed_id}. Diagnosis: ${payload.diagnosis}. Model C Risk: ${(pred_prob_model_c * 100).toFixed(1)}% (${risk_category}).`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return newPatient;
  }

  // --- Add Progress / SOAP Note ---
  public addPatientNote(stay_id: number, note: { author: string; role: string; note_type: "SOAP" | "Nursing" | "Physician" | "Triage" | "Handoff"; text: string }): HospitalPatient | null {
    const patient = this.getPatientById(stay_id);
    if (!patient) return null;

    const newNote: ClinicalNoteEntry = {
      id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      author: note.author,
      role: note.role,
      timestamp: new Date().toISOString(),
      note_type: note.note_type,
      text: note.text,
      de_identified: true,
    };

    patient.notes_history.push(newNote);
    patient.progress_note_24h = `${newNote.text}\n\n[Previous Note Excerpt]: ${patient.progress_note_24h.slice(0, 300)}...`;

    // Re-evaluate risk with updated note semantics
    const noteLower = patient.progress_note_24h.toLowerCase();
    const criticalTerms = ["shock", "vasopressor", "norepinephrine", "hypotension", "ards", "refractory", "crrt", "intubated", "failure", "arrest"];
    const textHits = criticalTerms.reduce((acc, term) => acc + (noteLower.includes(term) ? 1.5 : 0), 0);
    const sbpMin = Math.min(...patient.vitals_24h.map((v) => v.sbp));
    const hrAvg = patient.vitals_24h.reduce((a, b) => a + b.heart_rate, 0) / patient.vitals_24h.length;
    const spo2Min = Math.min(...patient.vitals_24h.map((v) => v.spo2));
    const demoScore = (patient.age / 100) * 0.8 + (patient.charlson_score / 10) * 0.9;
    const z = -3.2 + 0.02 * (hrAvg - 75) - 0.03 * (sbpMin - 110) - 0.04 * (spo2Min - 95) + textHits * 0.45 + demoScore;
    const newProb = Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(-z))));

    patient.pred_prob_model_c = Math.round(newProb * 1000) / 1000;
    patient.risk_category = newProb >= 0.5 ? "High Risk" : newProb >= 0.2 ? "Moderate Risk" : "Low Risk";

    this.addAuditLog({
      actor: note.author,
      role: note.role,
      action: "CLINICAL_NOTE_ADDED",
      details: `${note.note_type} note added for stay_id ${stay_id}. Multimodal risk updated to ${(newProb * 100).toFixed(1)}%.`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return patient;
  }

  // --- Add Hourly Vital Measurement ---
  public addPatientVital(stay_id: number, vital: { heart_rate: number; sbp: number; dias_bp?: number; resp_rate: number; spo2: number; temp_c?: number; gcs?: number; recorded_by?: string }): HospitalPatient | null {
    const patient = this.getPatientById(stay_id);
    if (!patient) return null;

    const nextHour = patient.vitals_24h.length;
    const entry: VitalEntry = {
      hour: nextHour,
      timestamp: new Date().toISOString(),
      heart_rate: Number(vital.heart_rate),
      sbp: Number(vital.sbp),
      dias_bp: vital.dias_bp ? Number(vital.dias_bp) : 74,
      resp_rate: Number(vital.resp_rate),
      spo2: Number(vital.spo2),
      temp_c: vital.temp_c ? Number(vital.temp_c) : 37.0,
      gcs: vital.gcs ? Number(vital.gcs) : 15,
      m_heart_rate: 1,
      m_sbp: 1,
      m_resp_rate: 1,
      m_spo2: 1,
    };

    // Keep the sliding 24-hour sequence or append
    patient.vitals_24h.push(entry);
    if (patient.vitals_24h.length > 24) {
      patient.vitals_24h = patient.vitals_24h.slice(-24);
      // re-index hours 0..23
      patient.vitals_24h.forEach((v, idx) => {
        v.hour = idx;
      });
    }

    // Recalculate Risk
    const updatedProb = this.recalculateRisk(patient);

    this.addAuditLog({
      actor: vital.recorded_by || "Telemetry Nurse",
      role: "Bedside Nursing",
      action: "VITALS_RECORDED",
      details: `Vitals logged (HR: ${vital.heart_rate}, SBP: ${vital.sbp}, SpO2: ${vital.spo2}%) for stay_id ${stay_id}. New 24h Risk: ${(updatedProb * 100).toFixed(1)}%.`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return patient;
  }

  // --- Recalculate Multimodal Mortality Risk Score ---
  public recalculateRisk(patient: HospitalPatient): number {
    if (!patient.vitals_24h || patient.vitals_24h.length === 0) {
      return patient.pred_prob_model_c;
    }
    const noteLower = (patient.progress_note_24h || "").toLowerCase();
    const criticalTerms = ["shock", "vasopressor", "norepinephrine", "hypotension", "ards", "refractory", "crrt", "intubated", "failure", "arrest"];
    const textHits = criticalTerms.reduce((acc, term) => acc + (noteLower.includes(term) ? 1.5 : 0), 0);
    const sbpMin = Math.min(...patient.vitals_24h.map((v) => v.sbp));
    const hrAvg = patient.vitals_24h.reduce((a, b) => a + b.heart_rate, 0) / patient.vitals_24h.length;
    const spo2Min = Math.min(...patient.vitals_24h.map((v) => v.spo2));
    const demoScore = (patient.age / 100) * 0.8 + (patient.charlson_score / 10) * 0.9;
    const z = -3.2 + 0.02 * (hrAvg - 75) - 0.03 * (sbpMin - 110) - 0.04 * (spo2Min - 95) + textHits * 0.45 + demoScore;
    const updatedProb = Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(-z))));

    patient.pred_prob_model_c = Math.round(updatedProb * 1000) / 1000;
    patient.risk_category = updatedProb >= 0.5 ? "High Risk" : updatedProb >= 0.2 ? "Moderate Risk" : "Low Risk";
    return patient.pred_prob_model_c;
  }

  // --- Update Existing Vital Entry (Edit Miskeyed Entry) ---
  public updatePatientVital(
    stay_id: number,
    hourIndex: number,
    updated: Partial<VitalEntry> & { updated_by?: string; edit_reason?: string }
  ): HospitalPatient | null {
    const patient = this.getPatientById(stay_id);
    if (!patient) return null;

    if (hourIndex < 0 || hourIndex >= patient.vitals_24h.length) {
      throw new Error(`Invalid vital index ${hourIndex}. Must be between 0 and ${patient.vitals_24h.length - 1}.`);
    }

    const currentEntry = patient.vitals_24h[hourIndex];
    const prevValues = `HR: ${currentEntry.heart_rate}, SBP: ${currentEntry.sbp}/${currentEntry.dias_bp || 74}, RR: ${currentEntry.resp_rate}, SpO2: ${currentEntry.spo2}%`;

    // Apply updates
    if (updated.heart_rate !== undefined) currentEntry.heart_rate = Number(updated.heart_rate);
    if (updated.sbp !== undefined) currentEntry.sbp = Number(updated.sbp);
    if (updated.dias_bp !== undefined) currentEntry.dias_bp = Number(updated.dias_bp);
    if (updated.resp_rate !== undefined) currentEntry.resp_rate = Number(updated.resp_rate);
    if (updated.spo2 !== undefined) currentEntry.spo2 = Number(updated.spo2);
    if (updated.temp_c !== undefined) currentEntry.temp_c = Number(updated.temp_c);
    if (updated.gcs !== undefined) currentEntry.gcs = Number(updated.gcs);
    if (updated.m_heart_rate !== undefined) currentEntry.m_heart_rate = Number(updated.m_heart_rate);
    if (updated.m_sbp !== undefined) currentEntry.m_sbp = Number(updated.m_sbp);
    if (updated.m_resp_rate !== undefined) currentEntry.m_resp_rate = Number(updated.m_resp_rate);
    if (updated.m_spo2 !== undefined) currentEntry.m_spo2 = Number(updated.m_spo2);

    if (updated.timestamp) {
      currentEntry.timestamp = updated.timestamp;
    }

    const newRisk = this.recalculateRisk(patient);

    const newValues = `HR: ${currentEntry.heart_rate}, SBP: ${currentEntry.sbp}/${currentEntry.dias_bp || 74}, RR: ${currentEntry.resp_rate}, SpO2: ${currentEntry.spo2}%`;
    const reasonText = updated.edit_reason ? ` (Reason: ${updated.edit_reason})` : "";

    this.addAuditLog({
      actor: updated.updated_by || "Bedside Nurse / Clinician",
      role: "Critical Care Nursing",
      action: "VITAL_ENTRY_EDITED",
      details: `Telemetry record at Hour ${currentEntry.hour} corrected for stay_id ${stay_id}. [Prior: ${prevValues}] -> [Updated: ${newValues}]${reasonText}. Recomputed Mortality Risk: ${(newRisk * 100).toFixed(1)}%.`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return patient;
  }

  // --- Delete Erroneous Vital Entry ---
  public deletePatientVital(
    stay_id: number,
    hourIndex: number,
    deleted_by: string = "Charge Nurse",
    deletion_reason?: string
  ): HospitalPatient | null {
    const patient = this.getPatientById(stay_id);
    if (!patient) return null;

    if (hourIndex < 0 || hourIndex >= patient.vitals_24h.length) {
      throw new Error(`Invalid vital index ${hourIndex}. Must be between 0 and ${patient.vitals_24h.length - 1}.`);
    }

    if (patient.vitals_24h.length <= 1) {
      throw new Error("Cannot delete the only remaining telemetry entry for this patient. At least one baseline observation must be retained.");
    }

    const removed = patient.vitals_24h.splice(hourIndex, 1)[0];

    // Re-index remaining hours 0..N-1
    patient.vitals_24h.forEach((v, idx) => {
      v.hour = idx;
    });

    const newRisk = this.recalculateRisk(patient);
    const reasonText = deletion_reason ? ` Reason: ${deletion_reason}.` : "";

    this.addAuditLog({
      actor: deleted_by,
      role: "Bedside Clinician / Charge Nurse",
      action: "VITAL_ENTRY_DELETED",
      details: `Erroneous telemetry record at Hour ${removed.hour} (HR: ${removed.heart_rate}, SBP: ${removed.sbp}, SpO2: ${removed.spo2}%) deleted for stay_id ${stay_id}.${reasonText} Sequence re-indexed (${patient.vitals_24h.length} remaining). Recomputed Mortality Risk: ${(newRisk * 100).toFixed(1)}%.`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return patient;
  }

  // --- Discharge Patient ---
  public dischargePatient(stay_id: number, discharged_by: string, reason: string): HospitalPatient | null {
    const patient = this.getPatientById(stay_id);
    if (!patient) return null;

    patient.status = "DISCHARGED";
    patient.discharged_at = new Date().toISOString();

    // Release Bed
    const bed = this.db.beds.find((b) => b.bed_id === patient.bed_id);
    if (bed) {
      bed.status = "CLEANING";
      bed.current_stay_id = null;
      bed.assigned_patient_name = null;
      bed.last_updated = new Date().toISOString();
    }

    this.addAuditLog({
      actor: discharged_by,
      role: "Attending Physician / Charge Nurse",
      action: "PATIENT_DISCHARGE",
      details: `Patient ${patient.patient_name} (MRN: ${patient.mrn}) discharged from ${patient.bed_id}. Reason: ${reason}. Bed set to CLEANING status.`,
      patient_stay_id: stay_id,
    });

    this.persistToDisk();
    return patient;
  }

  // --- Bed Management ---
  public getBeds(): HospitalBed[] {
    return this.db.beds;
  }

  public updateBedStatus(bed_id: string, status: "OCCUPIED" | "AVAILABLE" | "CLEANING" | "MAINTENANCE", actor: string = "Housekeeping"): HospitalBed | null {
    const bed = this.db.beds.find((b) => b.bed_id === bed_id);
    if (!bed) return null;

    const previousStatus = bed.status;
    bed.status = status;
    bed.last_updated = new Date().toISOString();

    if (status === "AVAILABLE" && previousStatus === "CLEANING") {
      bed.current_stay_id = null;
      bed.assigned_patient_name = null;
    }

    this.addAuditLog({
      actor,
      role: "Environmental / Unit Services",
      action: "BED_STATUS_UPDATE",
      details: `${bed_id} transitioned from ${previousStatus} to ${status}.`,
    });

    this.persistToDisk();
    return bed;
  }

  // --- Audit Logs ---
  public getAuditLogs(limit: number = 50): AuditLogEntry[] {
    return this.db.audit_logs.slice(0, limit);
  }

  public addAuditLog(entry: Omit<AuditLogEntry, "id" | "timestamp">) {
    const log: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.db.audit_logs.unshift(log);
    // Keep last 500 audit logs
    if (this.db.audit_logs.length > 500) {
      this.db.audit_logs = this.db.audit_logs.slice(0, 500);
    }
  }

  // --- Backup & Reset ---
  public getDatabaseBackup(): HospitalDatabaseSchema {
    return this.db;
  }

  public resetToDefault(): HospitalDatabaseSchema {
    this.db = {
      version: "3.0.0",
      hospital_name: "Metro General Hospital - AegisCare ICU Center",
      facility_id: "HOSP-NYC-0491",
      last_persisted_at: new Date().toISOString(),
      patients: JSON.parse(JSON.stringify(DEFAULT_PATIENTS)),
      beds: JSON.parse(JSON.stringify(DEFAULT_BEDS)),
      audit_logs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: "Clinical Administrator",
          role: "System Admin",
          action: "DATABASE_RESET",
          details: "Hospital database reseeded with MIMIC-IV benchmark test cohort.",
        },
      ],
    };
    this.persistToDisk();
    return this.db;
  }
}

export const hospitalStore = new HospitalStore();
