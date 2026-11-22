export type AppLang = "AZ" | "EN" | "RU";

export interface ExportLogItem {
  id: string;
  filename: string;
  format: "XLSX" | "HTML" | "CSV" | "JSON" | "MD";
  module: "VFM" | "PTA" | "GASLIFT" | "3D_TWIN" | "AI_CHAT" | "DELIVERABLES";
  sizeKb: string;
  user: string;
  timestamp: string;
  content?: string;
  downloadUrl?: string;
}

const EXPORT_STORAGE_KEY = "wp_export_logs_v1";

const INITIAL_EXPORT_LOGS: ExportLogItem[] = [
  {
    id: "exp_init_1",
    filename: "vfm_daily_predictions.xlsx",
    format: "XLSX",
    module: "VFM",
    sizeKb: "412.4 KB",
    user: "admin@socar.az",
    timestamp: "2026-11-21 15:20:14",
    downloadUrl: "/api/exports/download/vfm_daily_predictions.xlsx",
  },
  {
    id: "exp_init_2",
    filename: "pta_reservoir_properties.xlsx",
    format: "XLSX",
    module: "PTA",
    sizeKb: "128.7 KB",
    user: "reservoir@socar.az",
    timestamp: "2026-11-21 15:22:08",
    downloadUrl: "/api/exports/download/pta_reservoir_properties.xlsx",
  },
];

export function getExportLogs(): ExportLogItem[] {
  if (typeof window === "undefined") return INITIAL_EXPORT_LOGS;
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(INITIAL_EXPORT_LOGS));
      return INITIAL_EXPORT_LOGS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_EXPORT_LOGS;
  }
}

export function recordExportLog(
  item: Omit<ExportLogItem, "id" | "timestamp">
): ExportLogItem {
  const newEntry: ExportLogItem = {
    ...item,
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  if (typeof window !== "undefined") {
    try {
      const current = getExportLogs();
      const updated = [newEntry, ...current].slice(0, 100);
      localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("wp-export-logged", { detail: newEntry }));
    } catch {}
  }
  return newEntry;
}

export function triggerClientDownload(
  filename: string,
  content: string,
  mimeType: string,
  format: ExportLogItem["format"],
  module: ExportLogItem["module"],
  userEmail = "admin@socar.az"
) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const sizeKb = `${Math.max(1.2, blob.size / 1024).toFixed(1)} KB`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  recordExportLog({
    filename,
    format,
    module,
    sizeKb,
    user: userEmail,
    content,
  });
}

export const TRANSLATIONS: Record<AppLang, Record<string, string>> = {
  AZ: {
    nav_command: "3D Rəqəmsal Əkiz",
    nav_ai: "WellPerf AI (Claude)",
    nav_data: "Telemetriya & QC",
    nav_vfm: "Virtual Axın (VFM)",
    nav_pta: "Təzyiq Bərpası (PTA)",
    nav_gaslift: "Qaz-Lift Optimiser",
    nav_export: "Hesabat & İxrac",
    nav_logs: "Tarixçə & Loglar",
    nav_wells: "Quyular",
    logout: "Çıxış",
    home: "Ana səhifə",
    landing_btn: "Landing",
    optimiser_btn: "Optimiser (+$485k)",
    kpi_oil: "Gündəlik Neft Hasilatı",
    kpi_vfm: "VFM Forward Dəqiqliyi",
    kpi_pta: "Prioritet Stimulyasiya (PTA)",
    kpi_gaslift: "Zero-CAPEX Qaz-Lift Gəliri",
    loading_well: "Quyu telemetriyası yüklənir...",
    ai_new_chat: "Yeni Söhbət",
    ai_sessions: "Söhbət Tarixçəsi",
    ai_placeholder: "WellPerf AI-a sual yazın (məs: GL-06 skin, VFM dəqiqliyi, datanı CSV ixrac et)...",
    ai_send: "Göndər",
    ai_export_csv: "VFM CSV İxrac",
    ai_export_pta: "PTA CSV İxrac",
    ai_export_md: "Söhbəti İxrac (.MD)",
    ai_export_json: "JSON İxrac",
    logs_title: "Sistem Əməliyyatları və İxrac Tarixçəsi",
    logs_exports_tab: "İxrac Olunan Fayllar (Export Logs)",
    logs_audit_tab: "Sistem & RBAC Audit Logları",
    land_about: "HAQQIMIZDA",
    land_modules: "4 ƏSAS MODUL",
    land_edge: "TEXNİKİ ÜSTÜNLÜK",
    land_validation: "VALİDASİYA",
    land_dashboard: "DASHBOARDA KEÇ",
    land_hero_top: "10 QAZ-LİFT NEFT QUYUSU ÜÇÜN YARADILIB — 3.93M SENSOR SƏTRİNDƏN DƏQİQ QƏRARLARA.",
    land_hero_right: "FİZİKİ MƏHDUDİYYƏTLİ VFM & PTA. AVADANLIQ XƏRCİ OLMADAN MAKSİMUM HASİLAT.",
    land_enter_btn: "CANLI PLATFORMANI AÇ (3D + AI + VFM)",
  },
  EN: {
    nav_command: "3D Digital Twin",
    nav_ai: "WellPerf AI (Claude)",
    nav_data: "Telemetry & QC",
    nav_vfm: "Virtual Metering (VFM)",
    nav_pta: "Transient PTA",
    nav_gaslift: "Gas-Lift Optimiser",
    nav_export: "Reports & Export",
    nav_logs: "History & Logs",
    nav_wells: "Wells",
    logout: "Sign Out",
    home: "Home",
    landing_btn: "Landing",
    optimiser_btn: "Optimiser (+$485k)",
    kpi_oil: "Daily Oil Production",
    kpi_vfm: "VFM Forward Accuracy",
    kpi_pta: "Priority Workover (PTA)",
    kpi_gaslift: "Zero-CAPEX Gas-Lift Yield",
    loading_well: "Synchronizing well telemetry...",
    ai_new_chat: "New Session",
    ai_sessions: "Chat Sessions",
    ai_placeholder: "Ask WellPerf AI (e.g., GL-06 skin analysis, VFM MAPE, export well rates)...",
    ai_send: "Send",
    ai_export_csv: "Export VFM CSV",
    ai_export_pta: "Export PTA CSV",
    ai_export_md: "Export Chat (.MD)",
    ai_export_json: "Export JSON",
    logs_title: "System Audit & Export History Logs",
    logs_exports_tab: "Exported Files History",
    logs_audit_tab: "System & RBAC Audit Trail",
    land_about: "ABOUT PLATFORM",
    land_modules: "CORE MODULES",
    land_edge: "OUR EDGE",
    land_validation: "VALIDATION",
    land_dashboard: "LAUNCH DASHBOARD",
    land_hero_top: "ENGINEERED FOR 10 GAS-LIFTED OIL WELLS — SHAPING AUTONOMOUS UPSTREAM SURVEILLANCE.",
    land_hero_right: "PHYSICS-CONSTRAINED VFM & PTA. PRODUCTION WITHOUT COMPROMISE.",
    land_enter_btn: "ENTER LIVE WORKBENCH (3D + AI + VFM)",
  },
  RU: {
    nav_command: "3D Цифровой Двойник",
    nav_ai: "WellPerf AI (Claude)",
    nav_data: "Телеметрия и QC",
    nav_vfm: "Виртуальный Замер (VFM)",
    nav_pta: "Анализ КВД (PTA)",
    nav_gaslift: "Оптимизатор Газлифта",
    nav_export: "Отчеты и Экспорт",
    nav_logs: "История и Логи",
    nav_wells: "Скважины",
    logout: "Выйти",
    home: "Главная",
    landing_btn: "Лендинг",
    optimiser_btn: "Оптимизатор (+$485k)",
    kpi_oil: "Суточная Добыча Нефти",
    kpi_vfm: "Точность VFM (MAPE)",
    kpi_pta: "Кандидат на ОПЗ (PTA)",
    kpi_gaslift: "Доход от Газлифта ($0 CAPEX)",
    loading_well: "Загрузка телеметрии скважины...",
    ai_new_chat: "Новый Чат",
    ai_sessions: "История Сессий",
    ai_placeholder: "Спросите WellPerf AI (напр., скин GL-06, точность VFM, экспорт данных)...",
    ai_send: "Отправить",
    ai_export_csv: "Экспорт VFM CSV",
    ai_export_pta: "Экспорт PTA CSV",
    ai_export_md: "Экспорт Чата (.MD)",
    ai_export_json: "Экспорт JSON",
    logs_title: "Журнал Экспорта и Системных Логов",
    logs_exports_tab: "История Экспорта Файлов",
    logs_audit_tab: "Системный Аудит и RBAC",
    land_about: "О ПЛАТФОРМЕ",
    land_modules: "4 МОДУЛЯ",
    land_edge: "ПРЕИМУЩЕСТВА",
    land_validation: "ВАЛИДАЦИЯ",
    land_dashboard: "ОТКРЫТЬ ДАШБОРД",
    land_hero_top: "СОЗДАНО ДЛЯ 10 ГАЗЛИФТНЫХ СКВАЖИН — ОТ 3.93М СТРОК ДАТЧИКОВ К ТОЧНЫМ РЕШЕНИЯМ.",
    land_hero_right: "ФИЗИЧЕСКИ ОГРАНИЧЕННЫЙ VFM И PTA. МАКСИМАЛЬНАЯ ДОБЫЧА БЕЗ ЗАТРАТ.",
    land_enter_btn: "ОТКРЫТЬ ПЛАТФОРМУ (3D + AI + VFM)",
  },
};
