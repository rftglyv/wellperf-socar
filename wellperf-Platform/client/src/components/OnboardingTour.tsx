"use client";

import { useEffect } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "AZ" | "EN" | "RU";
  onSelectTab: (tab: string) => void;
}

type L = { EN: string; AZ: string; RU: string };
const S: { el: string; tab?: string; title: L; text: L }[] = [
  {
    el: '[data-tour="upload"]',
    tab: "data",
    title: { EN: "1. Upload sensor data", AZ: "1. Sensor məlumatlarını yükləyin", RU: "1. Загрузите данные датчиков" },
    text: {
      EN: "Drop minute-level exports here: CSV, Excel, Parquet or ZIP. Upload in parts; each part is appended.",
      AZ: "Dəqiqəlik faylları bura atın: CSV, Excel, Parquet və ya ZIP. Hissə-hissə yükləyə bilərsiniz.",
      RU: "Перетащите поминутные выгрузки: CSV, Excel, Parquet или ZIP. Можно частями — они дополняют друг друга.",
    },
  },
  {
    el: '[data-tour="rehearse"]',
    tab: "data",
    title: { EN: "No file yet?", AZ: "Faylınız yoxdur?", RU: "Нет файла?" },
    text: {
      EN: "Load one month of training data as if it were a new delivery. July 2025 has a GL-06 shut-in on 22 Jul.",
      AZ: "Təlim məlumatlarından bir ayı yeni fayl kimi yükləyin. İyul 2025-də GL-06 22 iyulda bağlanıb.",
      RU: "Загрузите месяц обучающих данных как новую поставку. В июле 2025 есть остановка GL-06 22 июля.",
    },
  },
  {
    el: '[data-tour="run"]',
    tab: "data",
    title: { EN: "2. Run the workflow", AZ: "2. Axını işə salın", RU: "2. Запустите расчёт" },
    text: {
      EN: "Cleaning, VFM and PTA run in one go, about 20 seconds. Steps get a green tick when done.",
      AZ: "Təmizləmə, VFM və PTA birlikdə işləyir, təxminən 20 saniyə. Hazır olan addımlar yaşıl işarə alır.",
      RU: "Очистка, VFM и ГДИ выполняются за один запуск, около 20 секунд. Готовые шаги отмечаются галочкой.",
    },
  },
  {
    el: '[data-tour="model"]',
    tab: "data",
    title: { EN: "The trained model", AZ: "Öyrədilmiş model", RU: "Обученная модель" },
    text: {
      EN: "Trained on 85 repaired well tests. Held-out and forward MAPE for oil, water and gas.",
      AZ: "85 bərpa olunmuş quyu ölçməsində öyrədilib. Neft, su və qaz üçün test və sonrakı dövr MAPE.",
      RU: "Обучена на 85 исправленных замерах. MAPE по нефти, воде и газу на тестовой и следующей выборке.",
    },
  },
  {
    el: '[data-sidebar="content"]',
    title: { EN: "3. Seven steps", AZ: "3. Yeddi addım", RU: "3. Семь шагов" },
    text: {
      EN: "Work top to bottom. A step unlocks once the one before it has results.",
      AZ: "Yuxarıdan aşağı işləyin. Hər addım əvvəlkinin nəticəsi olanda açılır.",
      RU: "Сверху вниз. Шаг открывается, когда у предыдущего есть результат.",
    },
  },
  {
    el: '[data-step="vfm"]',
    title: { EN: "Virtual flow meter", AZ: "Virtual sərfölçmə", RU: "Виртуальный расходомер" },
    text: {
      EN: "Daily oil, water and gas per well with a P10–P90 band.",
      AZ: "Hər quyu üçün P10–P90 intervalı ilə gündəlik neft, su və qaz.",
      RU: "Суточные нефть, вода и газ по скважинам с полосой P10–P90.",
    },
  },
  {
    el: '[data-step="pta"]',
    title: { EN: "Well-test analysis", AZ: "Quyu sınağı təhlili", RU: "Анализ ГДИ" },
    text: {
      EN: "Every shut-in: log-log, Horner and MDH plots, then k, skin and ΔP-skin with a quality flag.",
      AZ: "Hər bağlanma üçün log-log, Horner və MDH; sonra k, skin və ΔP-skin, keyfiyyət qiyməti ilə.",
      RU: "Каждая КВД: log-log, Хорнер, MDH, затем k, скин и ΔP скина с оценкой качества.",
    },
  },
  {
    el: '[data-step="twin"]',
    title: { EN: "Field twin", AZ: "Rəqəmsal əkiz", RU: "Двойник месторождения" },
    text: {
      EN: "All ten wells in 3D. Ring size follows oil rate, colour follows skin. Click a well to open it.",
      AZ: "On quyu 3D-də. Halqanın ölçüsü neft debitinə, rəngi skinə görədir. Quyuya klikləyin.",
      RU: "Десять скважин в 3D. Размер кольца — дебит нефти, цвет — скин. Кликните по скважине.",
    },
  },
  {
    el: '[data-step="export"]',
    title: { EN: "4. Export", AZ: "4. İxrac", RU: "4. Экспорт" },
    text: {
      EN: "Excel, portal CSV and offline HTML reports for VFM and PTA, or everything in one ZIP.",
      AZ: "VFM və PTA üçün Excel, portal CSV və oflayn HTML hesabatlar, ya da hamısı bir ZIP-də.",
      RU: "Excel, CSV для портала и офлайн HTML-отчёты по VFM и ГДИ, или всё одним ZIP.",
    },
  },
  {
    el: '[data-tour="prefs"]',
    title: { EN: "Language and theme", AZ: "Dil və tema", RU: "Язык и тема" },
    text: { EN: "AZ, EN or RU. Light or dark.", AZ: "AZ, EN və ya RU. İşıqlı və ya qaranlıq.", RU: "AZ, EN или RU. Светлая или тёмная." },
  },
  {
    el: '[data-tour="ask"]',
    title: { EN: "Ask about the results", AZ: "Nəticələr barədə soruşun", RU: "Спросите о результатах" },
    text: {
      EN: "Questions are answered from the current workspace results. Reopen this tour from the engine menu, bottom left.",
      AZ: "Cavablar cari nəticələrə əsaslanır. Bələdçini sol aşağıdakı mühərrik menyusundan yenidən aça bilərsiniz.",
      RU: "Ответы строятся на текущих результатах. Тур можно открыть снова из меню движка внизу слева.",
    },
  },
];

const BTN = {
  EN: ["Next", "Back", "Done"],
  AZ: ["Növbəti", "Geri", "Bitdi"],
  RU: ["Далее", "Назад", "Готово"],
} as const;

export function OnboardingTour({ isOpen, onClose, lang, onSelectTab }: OnboardingTourProps) {
  useEffect(() => {
    if (!isOpen) return;
    onSelectTab("data");
    const [next, prev, done] = BTN[lang];
    const steps: DriveStep[] = S.map((s) => ({
      element: s.el,
      popover: { title: s.title[lang], description: s.text[lang] },
      onHighlightStarted: () => s.tab && onSelectTab(s.tab),
    }));
    const finish = () => {
      try {
        localStorage.setItem("wellperf_tour_completed", "true");
      } catch {}
      onClose();
    };
    const d = driver({
      steps,
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      nextBtnText: next,
      prevBtnText: prev,
      doneBtnText: done,
      allowClose: true,
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: "wp-tour",
      onDestroyed: finish,
    });
    // wait one frame so the Data step is mounted before the first highlight
    const id = window.setTimeout(() => d.drive(), 150);
    return () => {
      window.clearTimeout(id);
      if (d.isActive()) d.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lang]);
  return null;
}
