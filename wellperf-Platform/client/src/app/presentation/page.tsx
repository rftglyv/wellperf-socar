"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  CheckCircle2,
  Cpu,
  Activity,
  Flame,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface Slide {
  category: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: Slide[] = [
    // SLIDE 1: COVER
    {
      category: "SOCAR HACKATHON 2026 · KOMANDA RUBRA",
      title: "WellPerf: Ağıllı Quyu Analizi",
      subtitle: "Xam sensor datasından Virtual Axın Ölçməsinə (VFM) və Təzyiq Bərpa Analizinə (PTA) — vahid platformada",
      content: (
        <div className="space-y-8 max-w-4xl">
          <p className="text-xl text-zinc-300 leading-relaxed">
            Caspian Intelligence: 10 qaz-lift quyusu üzrə fasiləsiz sensor telemetriyasını fiziki məhdudiyyətli axın proqnozlarına və etibarlı rezervuar parametrlərinə çevirən inteqrasiya olunmuş mühəndis həlli.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] shadow-lg">
              <div className="text-xs font-mono uppercase text-zinc-400">Sahə Hasilatı</div>
              <div className="text-3xl font-mono font-bold text-cyan-400 mt-1">14,246 bbl/gün</div>
              <div className="text-xs text-zinc-400 mt-1">10 Qaz-Lift Quyusu</div>
            </div>
            <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] shadow-lg">
              <div className="text-xs font-mono uppercase text-zinc-400">VFM Dəqiqliyi</div>
              <div className="text-3xl font-mono font-bold text-emerald-400 mt-1">MAPE: 3.7%</div>
              <div className="text-xs text-zinc-400 mt-1">Forward Validasiya</div>
            </div>
            <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] shadow-lg">
              <div className="text-xs font-mono uppercase text-zinc-400">Qaz-Lift Qiyməti</div>
              <div className="text-3xl font-mono font-bold text-amber-400 mt-1">+$485,000 / il</div>
              <div className="text-xs text-zinc-400 mt-1">+19 bbl/gün ($0 CAPEX)</div>
            </div>
          </div>
        </div>
      ),
    },

    // SLIDE 2: PROBLEM TƏHLİLİ
    {
      category: "PROBLEM TƏHLİLİ",
      title: "29 Günlük Kor Nöqtə",
      subtitle: "10 qaz-lift quyusu üzrə sahə hasilatı ≈ 14,246 barel/gün neftdir",
      content: (
        <div className="space-y-6">
          <p className="text-base text-zinc-300 leading-relaxed max-w-4xl">
            Hər quyu test separatorunda ayda cəmi 1 dəfə ölçülür. Qalan ~29 gün: su basması, ştuser problemi, qaz-lift qeyri-sabitliyi gec aşkar olunur və hasilat itkilərinə səbəb olur.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="p-6 rounded-2xl border border-rose-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">Fasiləsiz Telemetriya</div>
              <div className="text-2xl font-bold font-mono text-white">10 QUYU</div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Sahə üzrə qaz-lift quyuları dəqiqəbəbədəqiqə SCADA təzyiq və temperatur məlumatları qeyd edir.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-rose-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">Hasilat Həcmi</div>
              <div className="text-2xl font-bold font-mono text-white">14,246 bbl/gün</div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Sahə üzrə orta hasilat həcmi yüksək dəqiqlikli monitorinq və qərarvermə tələb edir.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-rose-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-rose-400 uppercase">Əsas Problem</div>
              <div className="text-2xl font-bold font-mono text-rose-400">Ayda 1 Dəfə</div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Test separatorunda tək ölçmə. 29 gün boyunca debitlər yalnız təxminlər üzərində qurulur.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // SLIDE 3: HƏLL ARXİTEKTURASI
    {
      category: "HƏLL ARXİTEKTURASI",
      title: "5 Addımlı Mühəndis İş Axını",
      subtitle: "Xam sensor datasından avtomatlaşdırılmış qərarverməyə qədər ucdan-uca mühəndis zənciri",
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-4">
          {[
            { num: "01", title: "Xam Data Qəbulu", desc: "1-dəqiqəlik sensor SCADA telemetriyası" },
            { num: "02", title: "QC & Hadisələr", desc: "-999.25 təmizlənməsi, donma və 14 İyun hadisəsi" },
            { num: "03", title: "VFM Modeli", desc: "BoundedRidge: Gündəlik Neft / Su / Qaz proqnozu" },
            { num: "04", title: "PTA Analizi", desc: "Bourdet törəməsi və Horner ilə k, skin, ΔPskin" },
            { num: "05", title: "İnteraktiv UI", desc: "Vahid mühəndis platforması və audit hesabatları" },
          ].map((st, i) => (
            <div key={i} className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] flex flex-col justify-between h-56">
              <div>
                <div className="text-2xl font-bold font-mono text-cyan-400">{st.num}</div>
                <div className="text-sm font-bold text-white mt-2">{st.title}</div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{st.desc}</p>
            </div>
          ))}
        </div>
      ),
    },

    // SLIDE 4: KEYFİYYƏT NƏZARƏTİ
    {
      category: "KEYFİYYƏT NƏZARƏTİ (QC)",
      title: "Datanı kor-koranə qəbul etmədik",
      subtitle: "Sensor datası və quyu testləri təmizlənib, hər bir düzəliş Excel çıxışında tam qeydə alınıb",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-4">
            <div className="text-base font-bold text-emerald-400 font-mono">Sensor Datası & Hadisələr</div>
            <ul className="text-xs text-zinc-300 space-y-2.5 leading-relaxed font-mono">
              <li>• -999.25 boş kodları, ~2,500 dublikat və ~7,000 ardıcıllığı pozulmuş qeyd təmizləndi.</li>
              <li>• 2–3 dəqiqəlik sıçrayışlar və donmuş sensorlar (≥60 dəq) təmizləndi.</li>
              <li>• 6 quyu bağlanması (shut-in) avtomatik aşkarlandı.</li>
              <li>• 14 İyun 2025, 10:20–15:02 bütün 10 quyuda sahəvi qaz-lift kəsintisi aşkarlandı və təbii eksperiment kimi istifadə edildi.</li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-4">
            <div className="text-base font-bold text-emerald-400 font-mono">Quyu Testləri Düzəlişləri (23 Düzəliş)</div>
            <ul className="text-xs text-zinc-300 space-y-2.5 leading-relaxed font-mono">
              <li>• 23 səhv dəyər aşkarlanıb düzəldildi.</li>
              <li>• 5 ədəd mənfi işarə xətası düzəldildi.</li>
              <li>• GL-06 qaz debiti Sm³/gün ilə yazılmışdı, ÷28.317 ilə Mscf/gün-ə çevrildi və GOR ilə təsdiqləndi.</li>
              <li>• Hər bir düzəliş Excel hesabatında tam izlənilən audit jurnalı kimi qeyd edilib.</li>
            </ul>
          </div>
        </div>
      ),
    },

    // SLIDE 5: VFM METODOLOGİYASI
    {
      category: "VIRTUAL AXIN ÖLÇMƏSİ (VFM)",
      title: "Fiziki Modelləşdirmə & Test Separator Tələsi",
      subtitle: "Maye debiti sensorlardan: log-xətti bounded ridge reqressiya",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="p-6 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-4">
            <div className="text-base font-bold text-cyan-400 font-mono">Log-Xətti Bounded Ridge Reqressiya</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              Giriş parametrləri: Pwf, temperatur, annulus təzyiqi, qaz-lift debiti, ştuser ölçüsü.
            </p>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono text-zinc-200">
              <div className="text-emerald-400 font-bold">✓ Fiziki Məhdudiyyət:</div>
              <div>Hər quyuda Pwf artanda debit azalmalıdır (dQ/dPwf ≤ -0.0002 mənfi əmsal məcburidir).</div>
              <div className="text-zinc-400">neft = maye × (1 − WC), su = maye × WC, qaz = neft × GOR.</div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-4">
            <div className="text-base font-bold text-amber-400 font-mono">Test Separator Tələsinin Aradan Qaldırılması</div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Test zamanı quyuağzı təzyiq (WHP) 4%, aşağı axın təzyiqi 12% düşür, quyudibi təzyiq (Pwf) isə cəmi 0.3% dəyişir.
            </p>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs font-mono text-zinc-200">
              <div className="text-cyan-400 font-bold">✓ Həllimiz:</div>
              <div>Səth təzyiqlərini (WHP) modeldən tam çıxardıq → test günü ilə normal gün arasındakı routing fərqi cəmi +0.7%-ə endi!</div>
            </div>
          </div>
        </div>
      ),
    },

    // SLIDE 6: VFM DƏQİQLİYİ
    {
      category: "MODEL VALİDASİYASI",
      title: "Forward Validasiya: Neft Xətasında 38% Azalma",
      subtitle: "Baza metoduna nisbətən neft debiti proqnoz xətası 3.7% vs 6.0%",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-3">
            <div className="text-xs font-mono text-zinc-400 uppercase">Əsas Nəticə</div>
            <div className="text-3xl font-bold font-mono text-emerald-400">38% Azalma</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              Neft xətası baza metodundan 38% azaldıldı (3.7% vs 6.0%). Qərar qəbulu üçün ən yüksək etibarlılıq.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-3">
            <div className="text-xs font-mono text-zinc-400 uppercase">Etibarlılıq Göstəricisi</div>
            <div className="text-3xl font-bold font-mono text-cyan-400">R² ≥ 0.994</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              Bütün 3 faza üzrə R² ≥ 0.994. Hər quyu üçün gündəlik P10–P90 qeyri-müəyyənlik zolağı verilir.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-2 font-mono text-xs">
            <div className="text-xs text-zinc-400 uppercase">Forward Validasiya (55 Test)</div>
            <div className="flex justify-between pt-1">
              <span className="text-zinc-400">Neft MAPE:</span>
              <span className="text-emerald-400 font-bold">3.7% (Baza 6.0%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Su MAPE:</span>
              <span className="text-zinc-200">4.4% (Baza 5.9%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Qaz MAPE:</span>
              <span className="text-zinc-200">6.6% (Baza 9.2%)</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1">
              <span className="text-zinc-400">Held-out (85 test):</span>
              <span className="text-cyan-400">Neft 2.7%, Su 3.5%</span>
            </div>
          </div>
        </div>
      ),
    },

    // SLIDE 7: PTA METODOLOGİYASI
    {
      category: "REZERVUAR PTA",
      title: "Bourdet Törəməsi & Horner Analizi",
      subtitle: "Tapşırığa uyğun: Yalnız VFM proqnozlaşdırdığı gündəlik neft debiti ilə təkfazalı neft modeli",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="p-6 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-3">
            <div className="text-sm font-bold text-cyan-400 font-mono uppercase">VFM ilə Dinamik Əlaqələndirmə</div>
            <ul className="text-xs text-zinc-300 space-y-2 font-mono leading-relaxed">
              <li>• q = Bağlanmadan əvvəlki son 3 tam günün orta neft debiti.</li>
              <li>• Dəqiq hasilat müddəti: tp = 24 · Np / q.</li>
              <li>• Horner düz xətti: k = 162.6 · q · B · μ / (m · h); ΔPskin = 0.869 · m · s.</li>
              <li>• Diaqnostik qrafiklər: Log-log (Bourdet), Horner və MDH.</li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-3">
            <div className="text-sm font-bold text-purple-400 font-mono uppercase">Bourdet & Keyfiyyət Reytinqi</div>
            <ul className="text-xs text-zinc-300 space-y-2 font-mono leading-relaxed">
              <li>• Bourdet törəməsi (Agarwal ekvivalent vaxtı) ilə radial axın (IARF) pəncərəsi avtomatik tapılır.</li>
              <li>• Keyfiyyət Reytinqi: Tolerans 0.08–0.20 arasında təkrar hesablama aparılır.</li>
              <li>• Nəticə stabil deyilsə, rəqəm uydurmaq əvəzinə açıq şəkildə &apos;indicative&apos; bayrağı ilə qeyd olunur.</li>
            </ul>
          </div>
        </div>
      ),
    },

    // SLIDE 8: PTA NƏTİCƏLƏRİ
    {
      category: "REZERVUAR PARAMETRLƏRİ",
      title: "PTA Nəticələri: 6 Quyu Bağlanmasının Təhlili",
      subtitle: "6 / 6 Bağlanma Analiz Edildi",
      content: (
        <div className="space-y-3 pt-2">
          {[
            { well: "GL-01", k: "109.15 md", skin: "+5.73", dp: "115.69 psi", m: "23.25", status: "🔴 Göstərici (Indicative)", note: "Törəmə düzləşmədi (saxlama effekti)" },
            { well: "GL-02", k: "58.17 md", skin: "−0.70", dp: "−32.97 psi", m: "54.04", status: "🟢 Təsdiqlənib", note: "Stabil radial axın" },
            { well: "GL-04", k: "53.11 md", skin: "−1.38", dp: "−178.04 psi", m: "148.42", status: "🟢 Təsdiqlənib", note: "Stabil radial axın" },
            { well: "GL-06", k: "291.74 md", skin: "+1.74", dp: "23.29 psi", m: "15.43", status: "🟢 Təsdiqlənib", note: "Yüksək keçiricilik, quyudibi zədələnib" },
            { well: "GL-08", k: "41.95 md", skin: "−1.72", dp: "−141.65 psi", m: "94.62", status: "🟢 Təsdiqlənib", note: "Stabil radial axın" },
            { well: "GL-10", k: "188.23 md", skin: "+2.00", dp: "50.05 psi", m: "28.86", status: "🔴 Göstərici (Indicative)", note: "Faza yenidən paylanması artefaktı" },
          ].map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-mono ${
                row.status.includes("🟢")
                  ? "border-emerald-500/30 bg-emerald-950/10 text-zinc-200"
                  : "border-rose-500/30 bg-rose-950/10 text-zinc-300"
              }`}
            >
              <span className="font-bold text-white text-sm w-16">{row.well}</span>
              <span>k = {row.k}</span>
              <span>Skin = {row.skin}</span>
              <span>ΔPskin = {row.dp}</span>
              <span>m = {row.m}</span>
              <span className={row.status.includes("🟢") ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {row.status}
              </span>
              <span className="text-zinc-400 text-[11px]">{row.note}</span>
            </div>
          ))}
          <div className="text-xs text-zinc-400 font-mono pt-1">
            Qeyd: GL-01 və GL-10-da törəmə düzləşmədi — rəqəm uydurmaq əvəzinə mühəndislik dürüstlüyü ilə bayraqlandırdıq.
          </div>
        </div>
      ),
    },

    // SLIDE 9: ƏSAS TAPINTI: GL-06 STİMULYASİYA
    {
      category: "ƏSAS TAPINTI · HASİLAT ARTIMI",
      title: "GL-06 — Stimulyasiya Namizədi",
      subtitle: "Keçiricilik çox yüksəkdir: k ≈ 292 md, lakin skin +1.74",
      content: (
        <div className="space-y-6 pt-2">
          <p className="text-sm text-zinc-300 leading-relaxed max-w-4xl">
            GL-06 quyusu stimulyasiya üçün 1 nömrəli sahə namizədidir. Keçiricilik çox yüksəkdir (k ≈ 292 md). Lakin skin +1.74 (ΔPskin ≈ 23.3 psi) quyudibi zonanın zədələndiyini göstərir. Təsdiqlənmiş radial axın nəticənin 100% etibarlı olduğunu sübut edir.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-amber-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">Keçiricilik</div>
              <div className="text-3xl font-bold font-mono text-emerald-400">k ≈ 292 md</div>
              <p className="text-xs text-zinc-400">Yüksək keçiricilik (Radial axın təsdiqlənib)</p>
            </div>

            <div className="p-6 rounded-2xl border border-amber-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">Quyu Zədələnməsi</div>
              <div className="text-3xl font-bold font-mono text-amber-400">Skin +1.74</div>
              <p className="text-xs text-zinc-400">ΔP skin ≈ 23.3 psi süni təzyiq itkisi</p>
            </div>

            <div className="p-6 rounded-2xl border border-amber-500/30 bg-[#042234] space-y-2">
              <div className="text-xs font-mono text-zinc-400 uppercase">Mühəndislik Qərarı</div>
              <div className="text-2xl font-bold font-mono text-cyan-400">Tövsiyə</div>
              <p className="text-xs text-zinc-300">Turşulama / Təkrar perforasiya ilə hasilat dərhal artacaq</p>
            </div>
          </div>
        </div>
      ),
    },

    // SLIDE 10: QAZ-LİFT OPTİMİZASİYASI
    {
      category: "QAZ-LİFT YENİDƏN BÖLGÜSÜ",
      title: "Qaz-Lift İmkanı: +19 bbl/gün ($0 CAPEX)",
      subtitle: "14 İyun sahə miqyaslı kəsinti 'təbii eksperiment' kimi istifadə olundu",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-3">
            <div className="text-sm font-bold text-cyan-400 font-mono uppercase">GL-01: Yüksək Həssaslıq</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">+26.5 bbl/gün</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              100 Mscf/gün əlavə qaza canlı Pwf reaksiyası və ölçülmüş yüksək PI verir.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-3">
            <div className="text-sm font-bold text-rose-400 font-mono uppercase">GL-04: Doymuş Rejim</div>
            <div className="text-2xl font-bold font-mono text-zinc-300">+7.5 bbl/gün</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              100 Mscf/gün qaz debitinə minimal reaksiya verir, qaz izafi xərclənir.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-emerald-500/30 bg-[#042234] space-y-3">
            <div className="text-sm font-bold text-emerald-400 font-mono uppercase">Xalis Artım ($0 CAPEX)</div>
            <div className="text-3xl font-bold font-mono text-emerald-400">+19 bbl/gün</div>
            <p className="text-xs text-zinc-300 leading-relaxed font-mono">
              100 Mscf qazı GL-04-dən GL-01-ə yönləndirmək: İllik +$485,000 xalis gəlir, $0 əlavə xərc!
            </p>
          </div>
        </div>
      ),
    },

    // SLIDE 11: İNTERAKTİV PLATFORMA
    {
      category: "İNTERAKTİV PLATFORMA",
      title: "WellPerf Mühəndis İnterfeysi",
      subtitle: "Mühəndislərin bütün iş axını üçün vahid sistem",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-1.5">
            <div className="text-sm font-bold text-cyan-400 font-mono">1. DATA QƏBULU VƏ QC</div>
            <p className="text-xs text-zinc-300">
              Real-vaxt SCADA axını, xam CSV qəbulu, min/max zərf vizuallaşdırması. Bağlanmalar qırmızı, qaz-lift kəsintiləri narıncı ilə vurğulanır.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-1.5">
            <div className="text-sm font-bold text-emerald-400 font-mono">2. VIRTUAL AXIN ÖLÇMƏSİ (VFM)</div>
            <p className="text-xs text-zinc-300">
              Log-xətti bounded ridge reqressiya, model statusu, MAPE & R² xəta qrafikləri və gündəlik P10–P90 qeyri-müəyyənlik zolağı.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-1.5">
            <div className="text-sm font-bold text-purple-400 font-mono">3. TƏZYİQ BƏRPA ANALİZİ (PTA)</div>
            <p className="text-xs text-zinc-300">
              Hər bağlanma üçün keyfiyyət nişanı, Bourdet, Horner və MDH diaqnostik qrafikləri və tam izlənilən audit jurnalı.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-cyan-500/30 bg-[#042234] space-y-1.5">
            <div className="text-sm font-bold text-amber-400 font-mono">4. HESABATLAR VƏ İXRAC</div>
            <p className="text-xs text-zinc-300">
              Excel ixracı: 2,730 sətirlik proqnozlar, rezervuar xassələri, tam audit hesabatı və oflayn işləyən interaktiv HTML hesabatları.
            </p>
          </div>
        </div>
      ),
    },

    // SLIDE 12: YEKUN DƏYƏR XÜLASƏSİ
    {
      category: "YEKUN DƏYƏR XÜLASƏSİ",
      title: "«Ayda bir ölçmədən — hər gün etibarlı qərara»",
      subtitle: "Komanda Rubra · SOCAR Hackathon 2026",
      content: (
        <div className="space-y-6 max-w-4xl pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-[#042234] space-y-1">
              <div className="text-sm font-bold text-emerald-400 font-mono">✓ Neft MAPE 3.7%</div>
              <div className="text-xs text-zinc-300">Baza metodundan 38% daha dəqiq gündəlik proqnozlaşdırma.</div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/30 bg-[#042234] space-y-1">
              <div className="text-sm font-bold text-emerald-400 font-mono">✓ 6/6 Bağlanma Analiz Edildi</div>
              <div className="text-xs text-zinc-300">Bourdet və Horner ilə tam təsdiqlənmiş nəticələr.</div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/30 bg-[#042234] space-y-1">
              <div className="text-sm font-bold text-amber-400 font-mono">✓ GL-06: Stimulyasiya Namizədi</div>
              <div className="text-xs text-zinc-300">k ≈ 292 md, skin +1.74 quyudibi təmizlənmə potensialı.</div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/30 bg-[#042234] space-y-1">
              <div className="text-sm font-bold text-cyan-400 font-mono">✓ Qaz-Lift Optimizasiyası</div>
              <div className="text-xs text-zinc-300">+19 bbl/gün neft artımı və +$485,000/il xalis gəlir ($0 CAPEX).</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-cyan-500/40 bg-[#021824] flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-base font-bold text-white">Diqqətinizə görə təşəkkür edirik!</div>
              <div className="text-xs text-cyan-400 font-mono">Suallar və Müzakirə · Komanda Rubra · SOCAR Hackathon 2026</div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://www.canva.com/d/J9HV-OOdwjU-XD7"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-500/50 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-950 font-bold text-xs font-mono transition"
              >
                <span>Canva-da Aç</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href="/SOCAR_HACKATHON_PITCH_DECK.pptx"
                download="SOCAR_HACKATHON_PITCH_DECK.pptx"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-xs hover:bg-zinc-200 transition shadow-lg font-mono"
              >
                <Download className="w-4 h-4" />
                Download .pptx
              </a>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const current = slides[currentSlide];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        if (currentSlide < slides.length - 1) setCurrentSlide((prev) => prev + 1);
      } else if (e.key === "ArrowLeft") {
        if (currentSlide > 0) setCurrentSlide((prev) => prev - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, slides.length]);

  return (
    <div className="min-h-screen bg-[#021824] text-white flex flex-col justify-between select-none">
      {/* Top Header */}
      <header className="h-16 border-b border-white/10 px-6 sm:px-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition"
          >
            <Home className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider">
            Komanda Rubra · 12 Slayd
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400">
            Slide {currentSlide + 1} of {slides.length}
          </span>

          <a
            href="https://www.canva.com/d/J9HV-OOdwjU-XD7"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-950/60 text-xs font-mono transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Canva</span>
          </a>

          <a
            href="/SOCAR_HACKATHON_PITCH_DECK.pptx"
            download="SOCAR_HACKATHON_PITCH_DECK.pptx"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-200 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .pptx</span>
          </a>
        </div>
      </header>

      {/* Main Slide Canvas */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-5xl space-y-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-semibold mb-2">
              {current.category}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {current.title}
            </h1>
            {current.subtitle && (
              <p className="text-sm text-zinc-400 mt-1 font-mono">
                {current.subtitle}
              </p>
            )}
          </div>

          <div className="pt-2">{current.content}</div>
        </div>
      </main>

      {/* Bottom Navigation Toolbar */}
      <footer className="h-16 border-t border-white/10 px-6 sm:px-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentSlide ? "w-8 bg-cyan-400" : "w-2 bg-zinc-700 hover:bg-zinc-500"
              }`}
              title={`Slide ${idx + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/5 disabled:opacity-30 hover:bg-white/10 text-xs font-mono transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          <button
            onClick={() => setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlide === slides.length - 1}
            className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs font-mono transition shadow-md disabled:opacity-30"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
