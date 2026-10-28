/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bed,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  Heart,
  HelpCircle,
  History,
  Hospital,
  Info,
  Layers,
  LineChart,
  ListFilter,
  LogOut,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stethoscope,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { generateBedsideRoundsPDF } from "./utils/pdfExport.ts";

interface VitalHour {
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

interface ClinicalNote {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  note_type: "SOAP" | "Nursing" | "Physician" | "Triage" | "Handoff";
  text: string;
  de_identified?: boolean;
}

interface HospitalPatient {
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
  notes_history: ClinicalNote[];
  vitals_24h: VitalHour[];
  last_gemini_explanation?: string;
}

interface HospitalBed {
  bed_id: string;
  unit: string;
  room: string;
  status: "OCCUPIED" | "AVAILABLE" | "CLEANING" | "MAINTENANCE";
  current_stay_id?: number | null;
  assigned_patient_name?: string | null;
  last_updated: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  details: string;
  patient_stay_id?: number | null;
}

interface BenchmarkModel {
  name: string;
  description: string;
  train_metrics: { auroc: number; auprc: number; brier: number; accuracy: number; f1: number };
  val_metrics: { auroc: number; auprc: number; brier: number; accuracy: number; f1: number };
  test_metrics: { auroc: number; auprc: number; brier: number; accuracy: number; f1: number };
  curves: {
    roc_curve: Array<{ x: number; y: number }>;
    pr_curve: Array<{ x: number; y: number }>;
  };
}

interface BenchmarkData {
  models: {
    model_a: BenchmarkModel;
    model_b: BenchmarkModel;
    model_c: BenchmarkModel;
  };
  winner: {
    tag: string;
    name: string;
    val_auroc: number;
    val_auprc: number;
    test_auroc: number;
  };
  fairness: {
    gender_parity: { male_auroc: number; female_auroc: number; max_disparity: number };
    age_groups: { under_65_auroc: number; over_65_auroc: number };
    brier_calibration_grade: string;
    de_identification_sanitized: string;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"registry" | "bedside" | "bedboard" | "notes" | "benchmarks">("registry");
  const [patients, setPatients] = useState<HospitalPatient[]>([]);
  const [beds, setBeds] = useState<HospitalBed[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patientDetail, setPatientDetail] = useState<HospitalPatient | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [clinicalRationale, setClinicalRationale] = useState<string | null>(null);
  const [clinicalFocus, setClinicalFocus] = useState<string>("comprehensive");
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [wardFilter, setWardFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ADMITTED" | "DISCHARGED">("ADMITTED");

  // Modal States
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isVitalModalOpen, setIsVitalModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);
  const [isRoundsModalOpen, setIsRoundsModalOpen] = useState(false);

  // Counterfactual "What-If" Simulation States
  const [simSbpDelta, setSimSbpDelta] = useState<number>(0);
  const [simSpo2Delta, setSimSpo2Delta] = useState<number>(0);
  const [simHrDelta, setSimHrDelta] = useState<number>(0);
  const [simulatedRisk, setSimulatedRisk] = useState<number | null>(null);

  // Patient Registration Form State
  const [regForm, setRegForm] = useState({
    patient_name: "",
    age: 62,
    gender: "Male" as "Male" | "Female" | "Other",
    blood_type: "O+",
    admission_type: "EMERGENT" as "EMERGENT" | "URGENT" | "ELECTIVE" | "TRAUMA" | "DIRECT_TRANSFER",
    ward: "MICU",
    bed_id: "Bed 109 - MICU",
    attending_physician: "Dr. Sarah Chen, MD (Critical Care)",
    diagnosis: "",
    charlson_score: 3,
    allergies: "NKDA",
    code_status: "FULL_CODE" as "FULL_CODE" | "DNR" | "DNI" | "DNR/DNI" | "COMFORT_MEASURES",
    initial_hr: 88,
    initial_sbp: 118,
    initial_dias_bp: 74,
    initial_rr: 18,
    initial_spo2: 97,
    initial_temp: 37.0,
    initial_gcs: 15,
    initial_note: "",
    registered_by: "Charge Nurse / Admissions",
  });
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  // New Vital Sign Form State
  const [vitalForm, setVitalForm] = useState({
    heart_rate: 85,
    sbp: 120,
    dias_bp: 76,
    resp_rate: 18,
    spo2: 98,
    temp_c: 37.0,
    gcs: 15,
    recorded_by: "Bedside Nurse, RN",
  });
  const [isSubmittingVital, setIsSubmittingVital] = useState(false);

  // Expandable Hourly Vitals History & Telemetry Correction States
  const [isVitalsHistoryExpanded, setIsVitalsHistoryExpanded] = useState<boolean>(true);
  const [editingVitalIndex, setEditingVitalIndex] = useState<number | null>(null);
  const [deletingVitalIndex, setDeletingVitalIndex] = useState<number | null>(null);
  const [editVitalForm, setEditVitalForm] = useState({
    heart_rate: 85,
    sbp: 120,
    dias_bp: 76,
    resp_rate: 18,
    spo2: 98,
    temp_c: 37.0,
    gcs: 15,
    is_imputed: false,
    timestamp: "",
    edit_reason: "Bedside telemetry artifact correction",
    updated_by: "Bedside Clinician, RN",
  });
  const [isSubmittingEditVital, setIsSubmittingEditVital] = useState(false);
  const [isSubmittingDeleteVital, setIsSubmittingDeleteVital] = useState(false);

  // New Clinical Note Form State
  const [noteForm, setNoteForm] = useState({
    author: "Dr. Sarah Chen, MD",
    role: "Attending Intensivist",
    note_type: "SOAP" as "SOAP" | "Nursing" | "Physician" | "Triage" | "Handoff",
    text: "",
  });
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Discharge Form State
  const [dischargeForm, setDischargeForm] = useState({
    discharged_by: "Dr. Sarah Chen, MD",
    reason: "Clinical recovery and step-down floor transfer",
  });
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false);

  // Checklist for Bedside CDS
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    art_line: false,
    serial_lactate: false,
    fluid_balance: true,
    lung_protective: false,
    crrt_screening: false,
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Load Patients, Beds, and Benchmark Data from Server
  const loadPatients = async () => {
    try {
      const res = await fetch("/api/v1/patients");
      const data = await res.json();
      setPatients(data);
      if (data.length > 0 && !selectedPatientId) {
        setSelectedPatientId(data[0].stay_id);
      }
    } catch (err) {
      console.error("Error loading patients:", err);
    }
  };

  const loadBeds = async () => {
    try {
      const res = await fetch("/api/v1/beds");
      const data = await res.json();
      setBeds(data);
    } catch (err) {
      console.error("Error loading beds:", err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch("/api/v1/audit-logs");
      const data = await res.json();
      setAuditLogs(data);
    } catch (err) {
      console.error("Error loading audit logs:", err);
    }
  };

  useEffect(() => {
    loadPatients();
    loadBeds();
    loadAuditLogs();

    fetch("/api/v1/metrics")
      .then((res) => res.json())
      .then((data: BenchmarkData) => setBenchmarkData(data))
      .catch((err) => console.error("Error loading metrics:", err));
  }, []);

  // Fetch detailed patient profile when selected
  useEffect(() => {
    if (!selectedPatientId) return;
    setIsLoadingPatient(true);
    setClinicalRationale(null);
    setSimSbpDelta(0);
    setSimSpo2Delta(0);
    setSimHrDelta(0);
    setSimulatedRisk(null);

    fetch(`/api/v1/patient/${selectedPatientId}`)
      .then((res) => res.json())
      .then((data: HospitalPatient) => {
        setPatientDetail(data);
        if (data.vitals_24h && data.vitals_24h.length > 0) {
          const latest = data.vitals_24h[data.vitals_24h.length - 1];
          setVitalForm({
            heart_rate: latest.heart_rate,
            sbp: latest.sbp,
            dias_bp: latest.dias_bp || 75,
            resp_rate: latest.resp_rate,
            spo2: latest.spo2,
            temp_c: latest.temp_c || 37.0,
            gcs: latest.gcs || 15,
            recorded_by: "Bedside Nurse, RN",
          });
        }
        setIsLoadingPatient(false);
      })
      .catch((err) => {
        console.error("Error loading patient detail:", err);
        setIsLoadingPatient(false);
      });
  }, [selectedPatientId]);

  // Request Gemini Clinical Rationale
  const handleGenerateRationale = async () => {
    if (!patientDetail) return;
    setIsExplaining(true);
    setClinicalRationale(null);

    try {
      const res = await fetch("/api/v1/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stay_id: patientDetail.stay_id,
          risk_probability: simulatedRisk !== null ? simulatedRisk : patientDetail.pred_prob_model_c,
          clinical_focus: clinicalFocus,
        }),
      });
      const data = await res.json();
      setClinicalRationale(data.clinical_rationale);
      showToast("Gemini Clinical CDS explanation generated successfully", "success");
    } catch (err) {
      console.error("Error generating rationale:", err);
      showToast("Failed to generate clinical explanation", "error");
    } finally {
      setIsExplaining(false);
    }
  };

  // Run What-If Counterfactual Prediction
  const handleRunSimulation = async () => {
    if (!patientDetail) return;
    try {
      const res = await fetch("/api/v1/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: patientDetail.age,
          gender: patientDetail.gender,
          charlson_score: patientDetail.charlson_score,
          vitals_24h: patientDetail.vitals_24h,
          progress_note: patientDetail.progress_note_24h,
          hypothetical_interventions: {
            sbp_boost: simSbpDelta,
            spo2_boost: simSpo2Delta,
            hr_reduction: simHrDelta,
          },
        }),
      });
      const data = await res.json();
      setSimulatedRisk(data.risk_probability);
      showToast(`Counterfactual Risk: ${data.risk_percentage}% (${data.risk_category})`, "info");
    } catch (err) {
      console.error("Simulation error:", err);
    }
  };

  // Submit Patient Registration
  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.patient_name.trim() || !regForm.diagnosis.trim()) {
      showToast("Please provide patient name and primary diagnosis", "error");
      return;
    }

    setIsSubmittingReg(true);
    try {
      const res = await fetch("/api/v1/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regForm),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to register patient");
      }

      const data = await res.json();
      showToast(`Patient ${data.patient.patient_name} permanently admitted to ${data.patient.bed_id}`, "success");
      setIsRegisterModalOpen(false);
      setRegForm({
        patient_name: "",
        age: 62,
        gender: "Male",
        blood_type: "O+",
        admission_type: "EMERGENT",
        ward: "MICU",
        bed_id: "Bed 109 - MICU",
        attending_physician: "Dr. Sarah Chen, MD (Critical Care)",
        diagnosis: "",
        charlson_score: 3,
        allergies: "NKDA",
        code_status: "FULL_CODE",
        initial_hr: 88,
        initial_sbp: 118,
        initial_dias_bp: 74,
        initial_rr: 18,
        initial_spo2: 97,
        initial_temp: 37.0,
        initial_gcs: 15,
        initial_note: "",
        registered_by: "Charge Nurse / Admissions",
      });

      await loadPatients();
      await loadBeds();
      await loadAuditLogs();
      setSelectedPatientId(data.patient.stay_id);
      setActiveTab("bedside");
    } catch (err: any) {
      console.error("Registration error:", err);
      showToast(err.message || "Failed to register patient", "error");
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Submit Hourly Vital Sign
  const handleRecordVital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    setIsSubmittingVital(true);
    try {
      const res = await fetch(`/api/v1/patient/${selectedPatientId}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vitalForm),
      });

      if (!res.ok) throw new Error("Failed to record vitals");

      const data = await res.json();
      setPatientDetail(data.patient);
      showToast(`Hourly vitals recorded. Multimodal 24h risk: ${(data.patient.pred_prob_model_c * 100).toFixed(1)}%`, "success");
      setIsVitalModalOpen(false);
      await loadPatients();
      await loadAuditLogs();
    } catch (err: any) {
      showToast(err.message || "Error logging vitals", "error");
    } finally {
      setIsSubmittingVital(false);
    }
  };

  // Open Edit Modal for a specific vital entry
  const handleOpenEditVital = (index: number) => {
    if (!patientDetail || !patientDetail.vitals_24h[index]) return;
    const v = patientDetail.vitals_24h[index];
    setEditingVitalIndex(index);
    setEditVitalForm({
      heart_rate: v.heart_rate,
      sbp: v.sbp,
      dias_bp: v.dias_bp ?? 74,
      resp_rate: v.resp_rate,
      spo2: v.spo2,
      temp_c: v.temp_c ?? 37.0,
      gcs: v.gcs ?? 15,
      is_imputed: v.m_heart_rate === 0 || v.m_sbp === 0 || v.m_resp_rate === 0 || v.m_spo2 === 0,
      timestamp: v.timestamp || new Date().toISOString(),
      edit_reason: "Bedside telemetry artifact recalibration",
      updated_by: "Bedside Clinician, RN",
    });
  };

  // Submit Edit Vital
  const handleSaveEditVital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientDetail || editingVitalIndex === null) return;

    setIsSubmittingEditVital(true);
    try {
      const res = await fetch(`/api/v1/patient/${patientDetail.stay_id}/vitals/${editingVitalIndex}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heart_rate: Number(editVitalForm.heart_rate),
          sbp: Number(editVitalForm.sbp),
          dias_bp: Number(editVitalForm.dias_bp),
          resp_rate: Number(editVitalForm.resp_rate),
          spo2: Number(editVitalForm.spo2),
          temp_c: Number(editVitalForm.temp_c),
          gcs: Number(editVitalForm.gcs),
          m_heart_rate: editVitalForm.is_imputed ? 0 : 1,
          m_sbp: editVitalForm.is_imputed ? 0 : 1,
          m_resp_rate: editVitalForm.is_imputed ? 0 : 1,
          m_spo2: editVitalForm.is_imputed ? 0 : 1,
          timestamp: editVitalForm.timestamp,
          edit_reason: editVitalForm.edit_reason,
          updated_by: editVitalForm.updated_by,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update vital entry");
      }

      const data = await res.json();
      setPatientDetail(data.patient);
      showToast(`Hour ${editingVitalIndex} vitals corrected. Multimodal risk: ${(data.patient.pred_prob_model_c * 100).toFixed(1)}%`, "success");
      setEditingVitalIndex(null);
      await loadPatients();
      await loadAuditLogs();
    } catch (err: any) {
      console.error("Error editing vital:", err);
      showToast(err.message || "Failed to update vital entry", "error");
    } finally {
      setIsSubmittingEditVital(false);
    }
  };

  // Submit Delete Vital
  const handleConfirmDeleteVital = async () => {
    if (!patientDetail || deletingVitalIndex === null) return;

    setIsSubmittingDeleteVital(true);
    try {
      const res = await fetch(`/api/v1/patient/${patientDetail.stay_id}/vitals/${deletingVitalIndex}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleted_by: "Charge Nurse",
          reason: "Spurious telemetry artifact removed",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete vital entry");
      }

      const data = await res.json();
      setPatientDetail(data.patient);
      showToast(`Telemetry record at index ${deletingVitalIndex} deleted. Timeline re-indexed to ${data.patient.vitals_24h.length} hours.`, "info");
      setDeletingVitalIndex(null);
      await loadPatients();
      await loadAuditLogs();
    } catch (err: any) {
      console.error("Error deleting vital:", err);
      showToast(err.message || "Failed to delete vital entry", "error");
    } finally {
      setIsSubmittingDeleteVital(false);
    }
  };

  // Submit Clinical SOAP Note
  const handleRecordNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !noteForm.text.trim()) {
      showToast("Note content cannot be empty", "error");
      return;
    }

    setIsSubmittingNote(true);
    try {
      const res = await fetch(`/api/v1/patient/${selectedPatientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteForm),
      });

      if (!res.ok) throw new Error("Failed to add note");

      const data = await res.json();
      setPatientDetail(data.patient);
      showToast("Clinical note permanently logged and multimodal text weights updated.", "success");
      setIsNoteModalOpen(false);
      setNoteForm((prev) => ({ ...prev, text: "" }));
      await loadPatients();
      await loadAuditLogs();
    } catch (err: any) {
      showToast(err.message || "Error logging note", "error");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Discharge Patient
  const handleDischargePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    setIsSubmittingDischarge(true);
    try {
      const res = await fetch(`/api/v1/patient/${selectedPatientId}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dischargeForm),
      });

      if (!res.ok) throw new Error("Failed to discharge patient");

      const data = await res.json();
      showToast(`Patient ${data.patient.patient_name} discharged. Bed marked for cleaning.`, "success");
      setIsDischargeModalOpen(false);
      await loadPatients();
      await loadBeds();
      await loadAuditLogs();
      setPatientDetail(data.patient);
    } catch (err: any) {
      showToast(err.message || "Error discharging patient", "error");
    } finally {
      setIsSubmittingDischarge(false);
    }
  };

  // Toggle Bed Status
  const handleUpdateBedStatus = async (bed_id: string, newStatus: "OCCUPIED" | "AVAILABLE" | "CLEANING" | "MAINTENANCE") => {
    try {
      const res = await fetch(`/api/v1/beds/${encodeURIComponent(bed_id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, actor: "Unit Coordinator" }),
      });
      if (res.ok) {
        showToast(`${bed_id} marked as ${newStatus}`, "info");
        await loadBeds();
        await loadAuditLogs();
      }
    } catch (err) {
      console.error("Bed update error:", err);
    }
  };

  // Reset to Benchmark Default
  const handleResetDatabase = async () => {
    if (!confirm("Are you sure you want to reset the database to the default MIMIC-IV benchmark cohort? This will reload the 8 baseline validation patients.")) {
      return;
    }
    try {
      const res = await fetch("/api/v1/reset", { method: "POST" });
      if (res.ok) {
        showToast("Database successfully restored to benchmark MIMIC-IV state", "success");
        await loadPatients();
        await loadBeds();
        await loadAuditLogs();
      }
    } catch (err) {
      showToast("Reset failed", "error");
    }
  };

  // Filtered Patients List
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (wardFilter !== "ALL" && p.first_careunit !== wardFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.patient_name?.toLowerCase().includes(q);
        const matchesMrn = p.mrn?.toLowerCase().includes(q);
        const matchesDiag = p.diagnosis?.toLowerCase().includes(q);
        const matchesBed = p.bed_id?.toLowerCase().includes(q);
        if (!matchesName && !matchesMrn && !matchesDiag && !matchesBed) return false;
      }
      return true;
    });
  }, [patients, statusFilter, wardFilter, searchQuery]);

  // Available Beds for dropdown
  const availableBeds = useMemo(() => {
    return beds.filter((b) => b.status === "AVAILABLE" || b.status === "CLEANING");
  }, [beds]);

  const activeRiskValue = simulatedRisk !== null ? simulatedRisk : (patientDetail?.pred_prob_model_c ?? 0);
  const isHighRisk = activeRiskValue >= 0.5;
  const isModerateRisk = activeRiskValue >= 0.2 && activeRiskValue < 0.5;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all duration-300 ${
            notification.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
              : notification.type === "error"
              ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
              : "bg-blue-950/90 border-blue-500/40 text-blue-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : notification.type === "error" ? (
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hospital Platform Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-5 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Hospital className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">AegisCare Clinical OS</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Database Permanent
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Hospital Production Tier
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Metro General Hospital • ICU Multimodal Decision Support & Patient Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Stats Pill */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>Admitted: <strong className="text-white">{patients.filter((p) => p.status === "ADMITTED").length}</strong></span>
              </div>
              <div className="h-3 w-px bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <Bed className="w-3.5 h-3.5 text-indigo-400" />
                <span>Occupied Beds: <strong className="text-white">{beds.filter((b) => b.status === "OCCUPIED").length} / {beds.length}</strong></span>
              </div>
              <div className="h-3 w-px bg-slate-700" />
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Critical Risk: <strong className="text-rose-400">{patients.filter((p) => p.status === "ADMITTED" && p.pred_prob_model_c >= 0.5).length}</strong></span>
              </div>
            </div>

            {/* Register Patient Button */}
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Patient</span>
            </button>

            {/* Backup DB Button */}
            <a
              href="/api/v1/backup"
              download
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
              title="Download entire permanent database JSON snapshot"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export DB</span>
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-1 border-t border-slate-800/80 pt-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("registry")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "registry"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Patient Registry & Census</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-cyan-300 border border-slate-700">
              {patients.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("bedside")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "bedside"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Bedside Multimodal CDS</span>
            {patientDetail && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                {patientDetail.bed_id}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("bedboard")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "bedboard"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Bed className="w-4 h-4" />
            <span>ICU Bed Board & Units</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
              {beds.length} Beds
            </span>
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "notes"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Clinical SOAP & Nursing Notes</span>
          </button>

          <button
            onClick={() => setActiveTab("benchmarks")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "benchmarks"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Model Validation & Audit Trail</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* TAB 1: PATIENT REGISTRY & CENSUS */}
        {activeTab === "registry" && (
          <div className="space-y-5">
            {/* Search and Filters Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by Patient Name, MRN, Bed, or Diagnosis..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
                {/* Ward Filter */}
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-500 ml-2" />
                  <span className="text-slate-400 mr-1 text-[11px]">Ward:</span>
                  {["ALL", "MICU", "SICU", "CCU", "TSICU", "CVICU", "NeuroICU"].map((w) => (
                    <button
                      key={w}
                      onClick={() => setWardFilter(w)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        wardFilter === w ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                  {(["ADMITTED", "DISCHARGED", "ALL"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        statusFilter === s ? "bg-indigo-600/30 text-indigo-300 font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Patient</span>
                </button>
              </div>
            </div>

            {/* Patients Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">Patient / MRN</th>
                      <th className="py-3.5 px-4">Demographics</th>
                      <th className="py-3.5 px-4">Ward / Bed</th>
                      <th className="py-3.5 px-4">Primary Diagnosis</th>
                      <th className="py-3.5 px-4">Code Status</th>
                      <th className="py-3.5 px-4 text-center">24h Mortality Risk (Model C)</th>
                      <th className="py-3.5 px-4">Admission Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPatients.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p>No patients found matching the selected criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredPatients.map((p) => {
                        const isSelected = selectedPatientId === p.stay_id;
                        const riskVal = p.pred_prob_model_c;
                        const riskPct = (riskVal * 100).toFixed(1);
                        const isHigh = riskVal >= 0.5;
                        const isMod = riskVal >= 0.2 && riskVal < 0.5;

                        return (
                          <tr
                            key={p.stay_id}
                            className={`transition hover:bg-slate-800/50 ${
                              isSelected ? "bg-cyan-950/30 border-l-4 border-l-cyan-500" : ""
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{p.patient_name}</span>
                                {p.status === "ADMITTED" && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {p.mrn} • Stay #{p.stay_id}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-slate-300">
                              <div>{p.age}yo {p.gender}</div>
                              <div className="text-[11px] text-slate-400 font-mono">Blood: {p.blood_type || "O+"}</div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-medium text-cyan-300 flex items-center gap-1">
                                <Bed className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{p.bed_id}</span>
                              </div>
                              <div className="text-[11px] text-slate-400">{p.first_careunit}</div>
                            </td>

                            <td className="py-3.5 px-4 max-w-xs">
                              <div className="font-medium text-slate-200 truncate" title={p.diagnosis}>
                                {p.diagnosis}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Attending: {p.attending_physician}
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                  p.code_status === "FULL_CODE"
                                    ? "bg-slate-800 text-slate-300 border-slate-700"
                                    : "bg-amber-950/40 text-amber-300 border-amber-800/40"
                                }`}
                              >
                                {p.code_status}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                    isHigh
                                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                      : isMod
                                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                  }`}
                                >
                                  {riskPct}% ({p.risk_category})
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  Model C Late Fusion
                                </span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                  p.status === "ADMITTED"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-slate-800 text-slate-400 border-slate-700"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedPatientId(p.stay_id);
                                    setActiveTab("bedside");
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 text-xs font-medium flex items-center gap-1 transition"
                                  title="Open Bedside Clinical Decision Support"
                                >
                                  <Activity className="w-3.5 h-3.5" />
                                  <span>Bedside CDS</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedPatientId(p.stay_id);
                                    setIsVitalModalOpen(true);
                                  }}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                  title="Log Hourly Vitals"
                                >
                                  <Heart className="w-4 h-4 text-rose-400" />
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedPatientId(p.stay_id);
                                    setIsNoteModalOpen(true);
                                  }}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                  title="Add Progress Note"
                                >
                                  <FileText className="w-4 h-4 text-indigo-400" />
                                </button>

                                {p.status === "ADMITTED" && (
                                  <button
                                    onClick={() => {
                                      setSelectedPatientId(p.stay_id);
                                      setIsDischargeModalOpen(true);
                                    }}
                                    className="p-1 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300"
                                    title="Discharge Patient"
                                  >
                                    <LogOut className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BEDSIDE MULTIMODAL CDS */}
        {activeTab === "bedside" && (
          <div className="space-y-6">
            {/* Patient Header Banner */}
            {patientDetail ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg ${
                        isHighRisk
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                          : isModerateRisk
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      }`}
                    >
                      {(activeRiskValue * 100).toFixed(0)}%
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-bold text-white tracking-tight">
                          {patientDetail.patient_name}
                        </h2>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {patientDetail.mrn}
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Stay ID: {patientDetail.stay_id}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40 font-medium">
                          {patientDetail.bed_id}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {patientDetail.code_status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                        <span><strong>Age:</strong> {patientDetail.age}</span>
                        <span>•</span>
                        <span><strong>Gender:</strong> {patientDetail.gender}</span>
                        <span>•</span>
                        <span><strong>Blood:</strong> {patientDetail.blood_type || "O+"}</span>
                        <span>•</span>
                        <span><strong>Admission:</strong> {patientDetail.admission_type}</span>
                        <span>•</span>
                        <span><strong>Charlson Index:</strong> {patientDetail.charlson_score}</span>
                        <span>•</span>
                        <span><strong>Attending:</strong> {patientDetail.attending_physician}</span>
                      </div>

                      <div className="text-xs text-slate-400 mt-1">
                        <strong>Diagnosis:</strong> {patientDetail.diagnosis} • <strong>Allergies:</strong> {patientDetail.allergies}
                      </div>
                    </div>
                  </div>

                  {/* Bedside Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setIsVitalModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <span>Log Vitals</span>
                    </button>

                    <button
                      onClick={() => setIsNoteModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Add Note</span>
                    </button>

                    <button
                      onClick={() => {
                        generateBedsideRoundsPDF(patientDetail, clinicalRationale, activeRiskValue);
                        showToast("Bedside rounds briefing PDF generated successfully", "success");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Rounds PDF</span>
                    </button>

                    {patientDetail.status === "ADMITTED" && (
                      <button
                        onClick={() => setIsDischargeModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Discharge</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
                Please select a patient from the Registry tab.
              </div>
            )}

            {/* Multimodal Risk & 24h Vitals Section */}
            {patientDetail && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: 24h Vitals Trajectory with Missingness Masks */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Vital Charts Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <h3 className="font-bold text-white text-base">
                          24-Hour Irregular ICU Vitals Trajectory
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                        Masked GRU Modality • Strict t ≤ 24h Cutoff
                      </span>
                    </div>

                    {/* Vitals Summary Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400 font-medium">Heart Rate (Peak / Mean)</div>
                        <div className="text-lg font-bold text-rose-400 mt-1 flex items-baseline gap-1">
                          <span>
                            {Math.max(...patientDetail.vitals_24h.map((v) => v.heart_rate))}
                          </span>
                          <span className="text-xs text-slate-400 font-normal">
                            / {Math.round(patientDetail.vitals_24h.reduce((a, b) => a + b.heart_rate, 0) / patientDetail.vitals_24h.length)} bpm
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400 font-medium">Systolic BP (Nadir)</div>
                        <div className="text-lg font-bold text-blue-400 mt-1 flex items-baseline gap-1">
                          <span>
                            {Math.min(...patientDetail.vitals_24h.map((v) => v.sbp))}
                          </span>
                          <span className="text-xs text-slate-400 font-normal">mmHg</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400 font-medium">SpO2 (Nadir)</div>
                        <div className="text-lg font-bold text-emerald-400 mt-1 flex items-baseline gap-1">
                          <span>
                            {Math.min(...patientDetail.vitals_24h.map((v) => v.spo2))}%
                          </span>
                          <span className="text-xs text-slate-400 font-normal">O2 sat</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400 font-medium">Resp Rate (Peak)</div>
                        <div className="text-lg font-bold text-purple-400 mt-1 flex items-baseline gap-1">
                          <span>
                            {Math.max(...patientDetail.vitals_24h.map((v) => v.resp_rate))}
                          </span>
                          <span className="text-xs text-slate-400 font-normal">/min</span>
                        </div>
                      </div>
                    </div>

                    {/* Hourly Telemetry Trend Bars */}
                    <div className="space-y-4">
                      {/* Heart Rate Strip */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                          <span className="font-medium text-rose-300 flex items-center gap-1">
                            <Heart className="w-3 h-3 text-rose-400" /> Heart Rate (HR)
                          </span>
                          <span>Normal range: 60-100 bpm</span>
                        </div>
                        <div className="h-10 bg-slate-950 rounded-xl p-1.5 flex items-end gap-1 border border-slate-800">
                          {patientDetail.vitals_24h.map((v) => {
                            const heightPct = Math.max(15, Math.min(100, ((v.heart_rate - 40) / 120) * 100));
                            const isMissing = v.m_heart_rate === 0;
                            return (
                              <div
                                key={v.hour}
                                className={`flex-1 rounded-t transition relative group ${
                                  isMissing
                                    ? "bg-slate-800 opacity-40 border border-dashed border-slate-600"
                                    : v.heart_rate > 100
                                    ? "bg-rose-500"
                                    : "bg-rose-400/80"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              >
                                <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] text-white rounded whitespace-nowrap z-20 shadow-lg">
                                  H{v.hour}: {v.heart_rate} bpm {isMissing ? "(Imputed)" : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Systolic BP Strip */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                          <span className="font-medium text-blue-300 flex items-center gap-1">
                            <Activity className="w-3 h-3 text-blue-400" /> Systolic Blood Pressure (SBP)
                          </span>
                          <span>MAP / SBP Target: &gt; 90 mmHg</span>
                        </div>
                        <div className="h-10 bg-slate-950 rounded-xl p-1.5 flex items-end gap-1 border border-slate-800">
                          {patientDetail.vitals_24h.map((v) => {
                            const heightPct = Math.max(15, Math.min(100, ((v.sbp - 50) / 130) * 100));
                            const isMissing = v.m_sbp === 0;
                            return (
                              <div
                                key={v.hour}
                                className={`flex-1 rounded-t transition relative group ${
                                  isMissing
                                    ? "bg-slate-800 opacity-40 border border-dashed border-slate-600"
                                    : v.sbp < 90
                                    ? "bg-rose-600"
                                    : "bg-blue-500"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              >
                                <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] text-white rounded whitespace-nowrap z-20 shadow-lg">
                                  H{v.hour}: {v.sbp} mmHg {isMissing ? "(Imputed)" : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* SpO2 Strip */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                          <span className="font-medium text-emerald-300 flex items-center gap-1">
                            <Wind className="w-3 h-3 text-emerald-400" /> Oxygen Saturation (SpO2)
                          </span>
                          <span>Target: &gt; 92%</span>
                        </div>
                        <div className="h-10 bg-slate-950 rounded-xl p-1.5 flex items-end gap-1 border border-slate-800">
                          {patientDetail.vitals_24h.map((v) => {
                            const heightPct = Math.max(15, Math.min(100, ((v.spo2 - 70) / 30) * 100));
                            const isMissing = v.m_spo2 === 0;
                            return (
                              <div
                                key={v.hour}
                                className={`flex-1 rounded-t transition relative group ${
                                  isMissing
                                    ? "bg-slate-800 opacity-40 border border-dashed border-slate-600"
                                    : v.spo2 < 90
                                    ? "bg-rose-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              >
                                <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] text-white rounded whitespace-nowrap z-20 shadow-lg">
                                  H{v.hour}: {v.spo2}% {isMissing ? "(Imputed)" : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Timeline: Hour 0 (Admission) → Hour 23 (First 24h Window)</span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500" /> Measured
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-800 border border-dashed border-slate-600" /> Missingness Indicator (M=0)
                      </span>
                    </div>
                  </div>

                  {/* EXPANDABLE HOURLY VITALS HISTORY TABLE WITH EDIT & DELETE */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    {/* Header with Expand / Collapse Toggle & Quick Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                      <div>
                        <div className="flex items-center gap-2">
                          <History className="w-5 h-5 text-cyan-400" />
                          <h3 className="font-bold text-white text-base">
                            Chronological Hourly Vitals Log & Telemetry History
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                            {patientDetail.vitals_24h.length} Recorded Hours
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Audit trail of bedside measurements with binary missingness indicators (M<sub>t,i</sub>). Edit miskeyed readings or delete spurious artifacts.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setIsVitalModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                          title="Record next telemetry entry"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Log Vital</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsVitalsHistoryExpanded(!isVitalsHistoryExpanded)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                            isVitalsHistoryExpanded
                              ? "bg-slate-800 text-cyan-300 border-cyan-500/30 hover:bg-slate-750"
                              : "bg-cyan-600/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-600/30"
                          }`}
                        >
                          {isVitalsHistoryExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              <span>Collapse History</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              <span>Expand History ({patientDetail.vitals_24h.length})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Content */}
                    {isVitalsHistoryExpanded && (
                      <div className="mt-4 space-y-3">
                        {/* Summary Diagnostics Badges */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px] bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-slate-400 font-medium mr-1">Telemetry Diagnostics:</span>
                          {(() => {
                            const tachyCount = patientDetail.vitals_24h.filter((v) => v.heart_rate > 100).length;
                            const hypotensiveCount = patientDetail.vitals_24h.filter((v) => v.sbp < 90).length;
                            const hypoxemicCount = patientDetail.vitals_24h.filter((v) => v.spo2 < 92).length;
                            const imputedCount = patientDetail.vitals_24h.filter((v) => v.m_heart_rate === 0 || v.m_sbp === 0 || v.m_resp_rate === 0 || v.m_spo2 === 0).length;

                            return (
                              <>
                                <span className={`px-2 py-0.5 rounded-full border ${tachyCount > 0 ? "bg-rose-950/60 text-rose-300 border-rose-800/40 font-semibold" : "bg-slate-800/60 text-slate-400 border-slate-700/40"}`}>
                                  {tachyCount} Tachycardic (&gt;100 bpm)
                                </span>
                                <span className={`px-2 py-0.5 rounded-full border ${hypotensiveCount > 0 ? "bg-rose-950/60 text-rose-300 border-rose-800/40 font-semibold" : "bg-slate-800/60 text-slate-400 border-slate-700/40"}`}>
                                  {hypotensiveCount} Hypotensive (SBP &lt;90)
                                </span>
                                <span className={`px-2 py-0.5 rounded-full border ${hypoxemicCount > 0 ? "bg-amber-950/60 text-amber-300 border-amber-800/40 font-semibold" : "bg-slate-800/60 text-slate-400 border-slate-700/40"}`}>
                                  {hypoxemicCount} Hypoxemic (SpO2 &lt;92%)
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-300 border border-slate-700/40">
                                  {imputedCount} Imputed Entries (M=0)
                                </span>
                              </>
                            );
                          })()}
                        </div>

                        {/* Telemetry Chronological Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-96 overflow-y-auto">
                          <table className="w-full text-xs text-left text-slate-300">
                            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                              <tr>
                                <th className="py-2.5 px-3">Hour / Step</th>
                                <th className="py-2.5 px-3">Heart Rate</th>
                                <th className="py-2.5 px-3">Blood Pressure (SBP/DBP)</th>
                                <th className="py-2.5 px-3">Resp Rate</th>
                                <th className="py-2.5 px-3">SpO2</th>
                                <th className="py-2.5 px-3">Temp / GCS</th>
                                <th className="py-2.5 px-3">Mask (M<sub>t,i</sub>)</th>
                                <th className="py-2.5 px-3">Clinical Alert</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60 font-mono">
                              {patientDetail.vitals_24h.map((v, index) => {
                                const isTachy = v.heart_rate > 100;
                                const isBrady = v.heart_rate < 50;
                                const isHypotensive = v.sbp < 90;
                                const isHypertensive = v.sbp > 150;
                                const isTachypneic = v.resp_rate > 24;
                                const isHypoxemic = v.spo2 < 92;
                                const isImputed = v.m_heart_rate === 0 || v.m_sbp === 0 || v.m_resp_rate === 0 || v.m_spo2 === 0;

                                const hasAlert = isTachy || isBrady || isHypotensive || isHypertensive || isTachypneic || isHypoxemic;

                                return (
                                  <tr
                                    key={index}
                                    className={`hover:bg-slate-800/50 transition ${
                                      hasAlert ? "bg-rose-950/10" : ""
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 font-bold text-white">
                                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                        <span>Hour {v.hour}</span>
                                        <span className="text-[10px] text-slate-500 font-normal">
                                          (t+{v.hour}h)
                                        </span>
                                      </div>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          isTachy
                                            ? "bg-rose-950 text-rose-300 border border-rose-800/50"
                                            : isBrady
                                            ? "bg-amber-950 text-amber-300 border border-amber-800/50"
                                            : "text-slate-200"
                                        }`}
                                      >
                                        {v.heart_rate} bpm
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          isHypotensive
                                            ? "bg-rose-950 text-rose-300 border border-rose-800/50"
                                            : isHypertensive
                                            ? "bg-amber-950 text-amber-300 border border-amber-800/50"
                                            : "text-blue-300"
                                        }`}
                                      >
                                        {v.sbp} / {v.dias_bp ?? 74} mmHg
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-1.5 py-0.5 rounded ${
                                          isTachypneic
                                            ? "bg-purple-950 text-purple-300 font-bold border border-purple-800/50"
                                            : "text-slate-300"
                                        }`}
                                      >
                                        {v.resp_rate} /min
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          isHypoxemic
                                            ? "bg-rose-950 text-rose-300 border border-rose-800/50"
                                            : v.spo2 < 95
                                            ? "bg-amber-950 text-amber-300 border border-amber-800/50"
                                            : "text-emerald-400"
                                        }`}
                                      >
                                        {v.spo2}%
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                                      <span>{v.temp_c ? `${v.temp_c.toFixed(1)}°C` : "37.0°C"}</span>
                                      <span className="text-slate-500 mx-1">•</span>
                                      <span className="text-cyan-400">GCS {v.gcs ?? 15}</span>
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                                      {isImputed ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-dashed border-slate-600 font-medium">
                                          Imputed (M=0)
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-medium">
                                          Measured (M=1)
                                        </span>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                                      {isHypotensive ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-700 font-semibold flex items-center gap-1 w-fit">
                                          <AlertTriangle className="w-3 h-3" /> Hypotension
                                        </span>
                                      ) : isHypoxemic ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-700 font-semibold flex items-center gap-1 w-fit">
                                          <AlertTriangle className="w-3 h-3" /> Hypoxemia
                                        </span>
                                      ) : isTachy ? (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 font-medium w-fit">
                                          Tachycardia
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-slate-500 font-medium">
                                          Normal range
                                        </span>
                                      )}
                                    </td>

                                    <td className="py-2.5 px-3 whitespace-nowrap text-right font-sans">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditVital(index)}
                                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 border border-slate-700 hover:border-cyan-700/60 transition"
                                          title={`Edit telemetry for Hour ${v.hour}`}
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => setDeletingVitalIndex(index)}
                                          disabled={patientDetail.vitals_24h.length <= 1}
                                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                          title={
                                            patientDetail.vitals_24h.length <= 1
                                              ? "Cannot delete the sole telemetry reading"
                                              : `Delete entry for Hour ${v.hour}`
                                          }
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                            <span>
                              Any telemetry edit or deletion automatically re-indexes sequential hours and recalculates Target Multimodal Model C 24h mortality risk.
                            </span>
                          </span>
                          <span className="text-slate-500">
                            Audited to HIPAA Safe-Harbor EHR standards
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 24-Hour Progress Note Summary */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-white text-base">
                          24h Clinical Progress Note & EHR Synthesizer
                        </h3>
                      </div>
                      <span className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> HIPAA De-identified
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {patientDetail.progress_note_24h}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Processed by Bio_ClinicalBERT transformer with mean-token pooling.
                      </span>
                      <button
                        onClick={() => setIsNoteModalOpen(true)}
                        className="px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-medium flex items-center gap-1 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Progress Note</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Col: Multimodal Risk Gauge & Counterfactual What-If Sandbox */}
                <div className="space-y-6">
                  {/* Risk Gauge Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg text-center">
                    <h3 className="font-bold text-white text-sm mb-1">
                      Target Multimodal Model C Risk Score
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      24h ICU In-Hospital Mortality Prediction
                    </p>

                    <div
                      className={`w-36 h-36 mx-auto rounded-full flex flex-col items-center justify-center border-4 shadow-xl mb-4 transition-all ${
                        isHighRisk
                          ? "border-rose-500 bg-rose-500/10 shadow-rose-500/20"
                          : isModerateRisk
                          ? "border-amber-500 bg-amber-500/10 shadow-amber-500/20"
                          : "border-emerald-500 bg-emerald-500/10 shadow-emerald-500/20"
                      }`}
                    >
                      <span className="text-3xl font-extrabold text-white tracking-tight">
                        {(activeRiskValue * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`text-xs font-bold uppercase mt-0.5 ${
                          isHighRisk
                            ? "text-rose-400"
                            : isModerateRisk
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {isHighRisk ? "Critical Risk" : isModerateRisk ? "Guarded Risk" : "Low Risk"}
                      </span>
                    </div>

                    {/* 3 Model Architecture Comparison */}
                    <div className="space-y-2 text-left bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs mb-4">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Architecture Consensus
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Model A (Tabular Baseline):</span>
                        <span className="font-mono font-medium text-slate-200">
                          {(patientDetail.pred_prob_model_a * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Model B (Dual GRU+MLP):</span>
                        <span className="font-mono font-medium text-slate-200">
                          {(patientDetail.pred_prob_model_b * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                        <span className="font-bold text-cyan-300">Model C (Full Late Fusion):</span>
                        <span className="font-mono font-bold text-cyan-300">
                          {(patientDetail.pred_prob_model_c * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Gemini Clinical Explainer Button */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={clinicalFocus}
                          onChange={(e) => setClinicalFocus(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                        >
                          <option value="comprehensive">Focus: Comprehensive ICU Rounds</option>
                          <option value="hemodynamics">Focus: Hemodynamic Refractoriness</option>
                          <option value="ventilation">Focus: Pulmonary & Gas Exchange</option>
                          <option value="organ_dysfunction">Focus: Renal & Multiorgan Trajectory</option>
                        </select>
                      </div>

                      <button
                        onClick={handleGenerateRationale}
                        disabled={isExplaining}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 hover:opacity-90 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                      >
                        {isExplaining ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Synthesizing Rationale with Gemini 2.5 Flash...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-cyan-200" />
                            <span>Generate Gemini Clinical Rationale</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Counterfactual "What-If" Simulation Sandbox */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-cyan-400" />
                        <h4 className="font-bold text-white text-xs">
                          Bedside "What-If" Counterfactual Sandbox
                        </h4>
                      </div>
                      <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                        Inference Simulation
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Vasopressor SBP Boost:</span>
                          <span className="font-mono text-cyan-300">+{simSbpDelta} mmHg</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="40"
                          step="5"
                          value={simSbpDelta}
                          onChange={(e) => setSimSbpDelta(Number(e.target.value))}
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>FiO2 / PEEP SpO2 Boost:</span>
                          <span className="font-mono text-emerald-300">+{simSpo2Delta}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="15"
                          step="1"
                          value={simSpo2Delta}
                          onChange={(e) => setSimSpo2Delta(Number(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Rate Control HR Reduction:</span>
                          <span className="font-mono text-rose-300">-{simHrDelta} bpm</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="35"
                          step="5"
                          value={simHrDelta}
                          onChange={(e) => setSimHrDelta(Number(e.target.value))}
                          className="w-full accent-rose-500"
                        />
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={handleRunSimulation}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition"
                        >
                          Simulate Risk
                        </button>
                        <button
                          onClick={() => {
                            setSimSbpDelta(0);
                            setSimSpo2Delta(0);
                            setSimHrDelta(0);
                            setSimulatedRisk(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                        >
                          Reset
                        </button>
                      </div>

                      {simulatedRisk !== null && (
                        <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/30 mt-2">
                          <div className="text-[11px] text-slate-400">Simulated Post-Intervention Mortality:</div>
                          <div className="text-base font-bold text-cyan-300 mt-0.5">
                            {(simulatedRisk * 100).toFixed(1)}% (
                            {simulatedRisk < patientDetail.pred_prob_model_c ? (
                              <span className="text-emerald-400 inline-flex items-center gap-0.5 text-xs">
                                <TrendingDown className="w-3.5 h-3.5" /> -
                                {((patientDetail.pred_prob_model_c - simulatedRisk) * 100).toFixed(1)}% absolute risk reduction
                              </span>
                            ) : (
                              <span className="text-rose-400 text-xs">Unchanged</span>
                            )}
                            )
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Gemini Clinical Rationale Display */}
            {clinicalRationale && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-600 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">
                        Gemini Clinical Decision Support Consultation Note
                      </h3>
                      <p className="text-xs text-slate-400">
                        Generated via @google/genai SDK • Model: gemini-2.5-flash • Multimodal Evidence Alignment
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(clinicalRationale);
                      showToast("Rationale copied to clipboard", "info");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-slate-700"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Note</span>
                  </button>
                </div>

                <div className="prose prose-invert max-w-none text-xs text-slate-200 leading-relaxed space-y-4">
                  {clinicalRationale.split("\n\n").map((chunk, i) => {
                    if (chunk.startsWith("###")) {
                      return (
                        <h4
                          key={i}
                          className="text-sm font-bold text-cyan-300 mt-4 pb-1 border-b border-slate-800 flex items-center gap-1.5"
                        >
                          <ChevronRight className="w-4 h-4 text-cyan-400" />
                          {chunk.replace("###", "").trim()}
                        </h4>
                      );
                    }
                    return (
                      <p key={i} className="whitespace-pre-wrap">
                        {chunk}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ICU WARD & BED BOARD */}
        {activeTab === "bedboard" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bed className="w-5 h-5 text-indigo-400" />
                  <span>Hospital ICU Ward & Bed Occupancy Board</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time unit management across MICU, SICU, CCU, TSICU, CVICU, NeuroICU, and Step-Down floors.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500" /> Available (
                  {beds.filter((b) => b.status === "AVAILABLE").length})
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-indigo-500/20 border border-indigo-500" /> Occupied (
                  {beds.filter((b) => b.status === "OCCUPIED").length})
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500" /> Cleaning (
                  {beds.filter((b) => b.status === "CLEANING").length})
                </span>
                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Admit to Bed</span>
                </button>
              </div>
            </div>

            {/* Grid of Bed Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {beds.map((bed) => {
                const assignedPatient = patients.find((p) => p.stay_id === bed.current_stay_id);
                const isOccupied = bed.status === "OCCUPIED";
                const isAvailable = bed.status === "AVAILABLE";
                const isCleaning = bed.status === "CLEANING";

                return (
                  <div
                    key={bed.bed_id}
                    className={`rounded-2xl p-4 border transition-all shadow-md ${
                      isOccupied
                        ? "bg-slate-900 border-indigo-500/40"
                        : isAvailable
                        ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500"
                        : isCleaning
                        ? "bg-amber-950/20 border-amber-500/30"
                        : "bg-slate-900/50 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white text-sm flex items-center gap-1.5">
                        <Bed className="w-4 h-4 text-cyan-400" />
                        {bed.bed_id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          isOccupied
                            ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                            : isAvailable
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : isCleaning
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {bed.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mb-3">
                      Unit: <strong className="text-slate-300">{bed.unit}</strong> • Room: {bed.room}
                    </div>

                    {isOccupied && assignedPatient ? (
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 mb-3 text-xs space-y-1">
                        <div className="font-bold text-white truncate">{assignedPatient.patient_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {assignedPatient.mrn} • {assignedPatient.age}yo {assignedPatient.gender}
                        </div>
                        <div className="text-[11px] text-slate-300 truncate" title={assignedPatient.diagnosis}>
                          {assignedPatient.diagnosis}
                        </div>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">Risk Score:</span>
                          <span
                            className={`font-bold text-xs ${
                              assignedPatient.pred_prob_model_c >= 0.5
                                ? "text-rose-400"
                                : assignedPatient.pred_prob_model_c >= 0.2
                                ? "text-amber-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {(assignedPatient.pred_prob_model_c * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl mb-3">
                        {isAvailable ? "Ready for patient admission" : "Under housekeeping turnover"}
                      </div>
                    )}

                    {/* Quick Bed Actions */}
                    <div className="flex items-center gap-1.5">
                      {isOccupied && assignedPatient ? (
                        <button
                          onClick={() => {
                            setSelectedPatientId(assignedPatient.stay_id);
                            setActiveTab("bedside");
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 text-xs font-medium text-center"
                        >
                          Bedside CDS
                        </button>
                      ) : isCleaning ? (
                        <button
                          onClick={() => handleUpdateBedStatus(bed.bed_id, "AVAILABLE")}
                          className="flex-1 py-1 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-xs font-medium text-center"
                        >
                          Mark Ready
                        </button>
                      ) : isAvailable ? (
                        <button
                          onClick={() => {
                            setRegForm((prev) => ({ ...prev, bed_id: bed.bed_id, ward: bed.unit }));
                            setIsRegisterModalOpen(true);
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium text-center"
                        >
                          Admit Here
                        </button>
                      ) : null}

                      {isOccupied && (
                        <button
                          onClick={() => handleUpdateBedStatus(bed.bed_id, "CLEANING")}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                          title="Set to Cleaning"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: CLINICAL SOAP & NURSING NOTES */}
        {activeTab === "notes" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <span>Permanent Clinical Progress Notes & SOAP Logs</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {patientDetail
                    ? `Showing clinical history for ${patientDetail.patient_name} (${patientDetail.mrn})`
                    : "Select a patient to inspect their progress note history."}
                </p>
              </div>

              {patientDetail && (
                <button
                  onClick={() => setIsNoteModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Write New Note</span>
                </button>
              )}
            </div>

            {patientDetail ? (
              <div className="space-y-4">
                {/* 24-Hour Consolidated Progress Note */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">
                      Current 24h Multimodal Working Note (Fed to Model C)
                    </span>
                    <span className="text-xs text-cyan-300 font-mono">
                      Stay #{patientDetail.stay_id}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                    {patientDetail.progress_note_24h}
                  </div>
                </div>

                {/* Notes History Feed */}
                <div className="space-y-3">
                  <h4 className="font-bold text-white text-sm">Documented Note Entries ({patientDetail.notes_history?.length || 0})</h4>
                  {(!patientDetail.notes_history || patientDetail.notes_history.length === 0) ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800 text-xs">
                      No standalone notes have been appended yet for this patient. Click "Write New Note" above.
                    </div>
                  ) : (
                    patientDetail.notes_history.map((note) => (
                      <div key={note.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                              {note.note_type}
                            </span>
                            <span className="font-semibold text-white text-xs">{note.author}</span>
                            <span className="text-slate-400 text-xs">({note.role})</span>
                          </div>
                          <span className="text-slate-500 text-[11px] font-mono">
                            {new Date(note.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                          {note.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
                Please select a patient from the Registry tab first.
              </div>
            )}
          </div>
        )}

        {/* TAB 5: MODEL BENCHMARKS & AUDIT TRAIL */}
        {activeTab === "benchmarks" && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Multimodal Model Architecture Benchmarks & HIPAA Audit</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Fair validation comparison across Model A (Tabular Baseline), Model B (Dual GRU+MLP), and Model C (Full Multimodal Late Fusion).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetDatabase}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                  title="Reseed database with original MIMIC-IV benchmark patients"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reseed Benchmark Cohort</span>
                </button>
              </div>
            </div>

            {/* Validation Comparison Table */}
            {benchmarkData && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                <h4 className="font-bold text-white text-sm">Validation Leaderboard (Held-Out Test Set)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Model Architecture</th>
                        <th className="py-2.5 px-3">AUROC (Test)</th>
                        <th className="py-2.5 px-3">AUPRC (Test)</th>
                        <th className="py-2.5 px-3">Brier Score</th>
                        <th className="py-2.5 px-3">Accuracy</th>
                        <th className="py-2.5 px-3">F1 Score</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      <tr>
                        <td className="py-3 px-3 font-medium text-slate-300">
                          Model A (Tabular Gradient Boosted Baseline)
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-200">0.789</td>
                        <td className="py-3 px-3 font-mono text-slate-300">0.552</td>
                        <td className="py-3 px-3 font-mono text-slate-400">0.126</td>
                        <td className="py-3 px-3 font-mono text-slate-400">82.1%</td>
                        <td className="py-3 px-3 font-mono text-slate-400">0.485</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">Baseline</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-medium text-slate-300">
                          Model B (Dual Modality: Masked GRU + Static MLP)
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-200">0.838</td>
                        <td className="py-3 px-3 font-mono text-slate-300">0.647</td>
                        <td className="py-3 px-3 font-mono text-slate-400">0.106</td>
                        <td className="py-3 px-3 font-mono text-slate-400">85.0%</td>
                        <td className="py-3 px-3 font-mono text-slate-400">0.581</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">+4.9% AUROC</span>
                        </td>
                      </tr>
                      <tr className="bg-cyan-950/20 border-l-4 border-l-cyan-500">
                        <td className="py-3 px-3 font-bold text-cyan-300">
                          Model C (Full Late Fusion: Bio_ClinicalBERT + Masked GRU + MLP)
                        </td>
                        <td className="py-3 px-3 font-mono font-extrabold text-cyan-300">0.882</td>
                        <td className="py-3 px-3 font-mono font-bold text-cyan-300">0.735</td>
                        <td className="py-3 px-3 font-mono text-emerald-400 font-bold">0.086</td>
                        <td className="py-3 px-3 font-mono text-slate-200 font-bold">88.1%</td>
                        <td className="py-3 px-3 font-mono text-slate-200 font-bold">0.679</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            ★ WINNER / ACTIVE
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Permanent Audit Log Trail */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-bold text-white text-sm">
                    Hospital Clinical Audit Trail (Permanently Logged to Database)
                  </h4>
                </div>
                <span className="text-xs text-slate-400">{auditLogs.length} Records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Actor / Role</th>
                      <th className="py-2 px-3">Action Type</th>
                      <th className="py-2 px-3">Operational Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {auditLogs.slice(0, 15).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                          {log.actor} <span className="text-slate-500 font-sans">({log.role})</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-300 border border-slate-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-sans text-xs">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: REGISTER NEW PATIENT */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
            <button
              onClick={() => setIsRegisterModalOpen(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Register New Hospital Patient</h3>
                <p className="text-xs text-slate-400">
                  Data is permanently written to disk (/data/hospital_db.json) and evaluated across all 3 AI models.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterPatient} className="space-y-4 text-xs">
              {/* Row 1: Demographics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-medium">Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Jennifer M. Hayes"
                    value={regForm.patient_name}
                    onChange={(e) => setRegForm({ ...regForm, patient_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Age *</label>
                  <input
                    type="number"
                    min="1"
                    max="110"
                    required
                    value={regForm.age}
                    onChange={(e) => setRegForm({ ...regForm, age: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Row 2: Gender, Blood Type, Admission Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Gender *</label>
                  <select
                    value={regForm.gender}
                    onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Blood Type</label>
                  <select
                    value={regForm.blood_type}
                    onChange={(e) => setRegForm({ ...regForm, blood_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    {["A+", "O+", "B+", "AB+", "A-", "O-", "B-", "AB-"].map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Admission Type</label>
                  <select
                    value={regForm.admission_type}
                    onChange={(e) => setRegForm({ ...regForm, admission_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    <option value="EMERGENT">EMERGENT</option>
                    <option value="URGENT">URGENT</option>
                    <option value="ELECTIVE">ELECTIVE</option>
                    <option value="TRAUMA">TRAUMA</option>
                    <option value="DIRECT_TRANSFER">DIRECT TRANSFER</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Unit, Bed, Code Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">ICU Unit / Ward *</label>
                  <select
                    value={regForm.ward}
                    onChange={(e) => setRegForm({ ...regForm, ward: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    {["MICU", "SICU", "CCU", "TSICU", "CVICU", "NeuroICU", "StepDown"].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Bed Allocation *</label>
                  <select
                    value={regForm.bed_id}
                    onChange={(e) => setRegForm({ ...regForm, bed_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    {availableBeds.map((b) => (
                      <option key={b.bed_id} value={b.bed_id}>
                        {b.bed_id} ({b.status})
                      </option>
                    ))}
                    <option value={`Bed ${Math.floor(115 + Math.random() * 50)} - ${regForm.ward}`}>
                      Assign New Dynamic Bed
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Code Status</label>
                  <select
                    value={regForm.code_status}
                    onChange={(e) => setRegForm({ ...regForm, code_status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  >
                    <option value="FULL_CODE">FULL CODE</option>
                    <option value="DNR">DNR (Do Not Resuscitate)</option>
                    <option value="DNI">DNI (Do Not Intubate)</option>
                    <option value="DNR/DNI">DNR / DNI</option>
                    <option value="COMFORT_MEASURES">Comfort Measures Only</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Primary Diagnosis & Physician */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Primary Diagnosis *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Acute Respiratory Distress Syndrome & Sepsis"
                    value={regForm.diagnosis}
                    onChange={(e) => setRegForm({ ...regForm, diagnosis: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Attending Physician</label>
                  <input
                    type="text"
                    value={regForm.attending_physician}
                    onChange={(e) => setRegForm({ ...regForm, attending_physician: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 5: Initial Baseline Vitals Strip */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2">
                <span className="font-semibold text-slate-300 block">Initial Admission Vitals</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400">Heart Rate (bpm)</label>
                    <input
                      type="number"
                      value={regForm.initial_hr}
                      onChange={(e) => setRegForm({ ...regForm, initial_hr: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Systolic BP (mmHg)</label>
                    <input
                      type="number"
                      value={regForm.initial_sbp}
                      onChange={(e) => setRegForm({ ...regForm, initial_sbp: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Resp Rate (/min)</label>
                    <input
                      type="number"
                      value={regForm.initial_rr}
                      onChange={(e) => setRegForm({ ...regForm, initial_rr: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">SpO2 (%)</label>
                    <input
                      type="number"
                      value={regForm.initial_spo2}
                      onChange={(e) => setRegForm({ ...regForm, initial_spo2: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Row 6: Initial Clinical Progress Note */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Initial Triage Progress Note</label>
                <textarea
                  rows={3}
                  placeholder="Clinical assessment, chief complaints, physical findings, and baseline hemodynamic plan..."
                  value={regForm.initial_note}
                  onChange={(e) => setRegForm({ ...regForm, initial_note: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none font-mono text-xs"
                />
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReg}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isSubmittingReg ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Permanent Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Admit Patient</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LOG HOURLY VITALS */}
      {isVitalModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsVitalModalOpen(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Log Hourly Vital Measurement</h3>
                <p className="text-xs text-slate-400">
                  {patientDetail?.patient_name} • {patientDetail?.bed_id}
                </p>
              </div>
            </div>

            <form onSubmit={handleRecordVital} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Heart Rate (bpm)</label>
                  <input
                    type="number"
                    required
                    value={vitalForm.heart_rate}
                    onChange={(e) => setVitalForm({ ...vitalForm, heart_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Systolic BP (mmHg)</label>
                  <input
                    type="number"
                    required
                    value={vitalForm.sbp}
                    onChange={(e) => setVitalForm({ ...vitalForm, sbp: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Resp Rate (/min)</label>
                  <input
                    type="number"
                    required
                    value={vitalForm.resp_rate}
                    onChange={(e) => setVitalForm({ ...vitalForm, resp_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">SpO2 (%)</label>
                  <input
                    type="number"
                    required
                    value={vitalForm.spo2}
                    onChange={(e) => setVitalForm({ ...vitalForm, spo2: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitalForm.temp_c}
                    onChange={(e) => setVitalForm({ ...vitalForm, temp_c: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">GCS (3-15)</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={vitalForm.gcs}
                    onChange={(e) => setVitalForm({ ...vitalForm, gcs: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Logged By</label>
                <input
                  type="text"
                  value={vitalForm.recorded_by}
                  onChange={(e) => setVitalForm({ ...vitalForm, recorded_by: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsVitalModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVital}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium"
                >
                  {isSubmittingVital ? "Recording..." : "Record Vitals"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD CLINICAL SOAP NOTE */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsNoteModalOpen(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Add Clinical SOAP Note</h3>
                <p className="text-xs text-slate-400">
                  {patientDetail?.patient_name} • {patientDetail?.bed_id}
                </p>
              </div>
            </div>

            <form onSubmit={handleRecordNote} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Author Name</label>
                  <input
                    type="text"
                    required
                    value={noteForm.author}
                    onChange={(e) => setNoteForm({ ...noteForm, author: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Note Type</label>
                  <select
                    value={noteForm.note_type}
                    onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="SOAP">SOAP Note</option>
                    <option value="Nursing">Nursing Assessment</option>
                    <option value="Physician">Physician Consult</option>
                    <option value="Handoff">Shift Handoff</option>
                    <option value="Triage">Triage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Note Content *</label>
                <textarea
                  rows={5}
                  required
                  placeholder="Subjective complaints, Objective vital findings, Assessment of organ systems, and 12-hour Plan..."
                  value={noteForm.text}
                  onChange={(e) => setNoteForm({ ...noteForm, text: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Notes are automatically parsed with Safe-Harbor regex and integrated into the Bio_ClinicalBERT text subnetwork.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNote}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  {isSubmittingNote ? "Saving..." : "Log Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DISCHARGE PATIENT */}
      {isDischargeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsDischargeModalOpen(false)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Discharge Patient & Release Bed</h3>
                <p className="text-xs text-slate-400">
                  {patientDetail?.patient_name} • {patientDetail?.bed_id}
                </p>
              </div>
            </div>

            <form onSubmit={handleDischargePatient} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Discharging Physician</label>
                <input
                  type="text"
                  required
                  value={dischargeForm.discharged_by}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, discharged_by: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Discharge Disposition / Reason *</label>
                <textarea
                  rows={3}
                  required
                  value={dischargeForm.reason}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-[11px] text-amber-300">
                Notice: Discharging this patient will release <strong>{patientDetail?.bed_id}</strong> and mark it for cleaning. The patient record and complete audit history will be permanently preserved in the registry.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDischargeModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDischarge}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium"
                >
                  {isSubmittingDischarge ? "Processing..." : "Confirm Discharge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT VITAL ENTRY */}
      {editingVitalIndex !== null && patientDetail && patientDetail.vitals_24h[editingVitalIndex] && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingVitalIndex(null)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Edit Telemetry Record — Hour {patientDetail.vitals_24h[editingVitalIndex].hour}
                </h3>
                <p className="text-xs text-slate-400">
                  {patientDetail.patient_name} • MRN: {patientDetail.mrn} • {patientDetail.bed_id}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveEditVital} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Heart Rate (bpm) *</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="240"
                    value={editVitalForm.heart_rate}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, heart_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Normal: 60-100 bpm</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Systolic BP (mmHg) *</label>
                  <input
                    type="number"
                    required
                    min="40"
                    max="260"
                    value={editVitalForm.sbp}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, sbp: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Normal: 90-130 mmHg</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Diastolic BP (mmHg)</label>
                  <input
                    type="number"
                    min="30"
                    max="150"
                    value={editVitalForm.dias_bp}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, dias_bp: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Normal: 60-85 mmHg</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Resp Rate (/min) *</label>
                  <input
                    type="number"
                    required
                    min="4"
                    max="60"
                    value={editVitalForm.resp_rate}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, resp_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Normal: 12-20 /min</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SpO2 (%) *</label>
                  <input
                    type="number"
                    required
                    min="50"
                    max="100"
                    value={editVitalForm.spo2}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, spo2: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Target &gt;92%</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="30.0"
                    max="43.0"
                    value={editVitalForm.temp_c}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, temp_c: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Normal ~37.0°C</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">GCS (3-15)</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={editVitalForm.gcs}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, gcs: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Max Alert: 15</span>
                </div>
              </div>

              {/* Imputed / Mask Toggle */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-white font-medium block text-xs">Missingness Mask (M<sub>t,i</sub>)</span>
                  <span className="text-[11px] text-slate-400 block">
                    Mark as unmeasured / forward-imputed value in PyTorch Masked GRU
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editVitalForm.is_imputed}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, is_imputed: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Correction Reason *</label>
                  <input
                    type="text"
                    required
                    value={editVitalForm.edit_reason}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, edit_reason: e.target.value })}
                    placeholder="e.g. A-line dampening artifact rectified"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Updated By *</label>
                  <input
                    type="text"
                    required
                    value={editVitalForm.updated_by}
                    onChange={(e) => setEditVitalForm({ ...editVitalForm, updated_by: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setEditingVitalIndex(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditVital}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSubmittingEditVital ? "Saving & Recomputing..." : "Save & Recompute Risk"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DELETE VITAL ENTRY CONFIRMATION */}
      {deletingVitalIndex !== null && patientDetail && patientDetail.vitals_24h[deletingVitalIndex] && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setDeletingVitalIndex(null)}
              className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Telemetry Record</h3>
                <p className="text-xs text-slate-400">
                  Hour {patientDetail.vitals_24h[deletingVitalIndex].hour} • {patientDetail.patient_name}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Are you sure you want to remove this vital entry? This will permanently erase the measurement from the permanent hospital database:
              </p>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-1">
                <div className="text-slate-400">
                  Observation: <span className="text-white font-bold">Hour {patientDetail.vitals_24h[deletingVitalIndex].hour}</span>
                </div>
                <div className="text-slate-300">
                  HR: <span className="text-rose-400 font-bold">{patientDetail.vitals_24h[deletingVitalIndex].heart_rate} bpm</span> • SBP: <span className="text-blue-400 font-bold">{patientDetail.vitals_24h[deletingVitalIndex].sbp} mmHg</span> • SpO2: <span className="text-emerald-400 font-bold">{patientDetail.vitals_24h[deletingVitalIndex].spo2}%</span>
                </div>
              </div>

              <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-[11px] text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  After deletion, all subsequent telemetry hours will be automatically re-indexed from 0 to {patientDetail.vitals_24h.length - 2}, the Multimodal Model C 24-hour mortality risk will be recalculated, and an entry will be written to the hospital audit log.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setDeletingVitalIndex(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingDeleteVital}
                  onClick={handleConfirmDeleteVital}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isSubmittingDeleteVital ? "Deleting..." : "Confirm Delete Record"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
