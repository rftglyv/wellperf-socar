const https = require("https");

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
];

function callSingleGeminiModel(modelName, contents, systemInstruction, apiKey) {
  return new Promise((resolve) => {
    if (!apiKey) return resolve(null);

    const payload = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 600,
      },
    });

    const pathUrl = `/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: pathUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 7000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            const json = JSON.parse(raw);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim()) {
              resolve({ text: text.trim(), model: modelName });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

async function callGeminiCascade(contents, systemInstruction, apiKey) {
  for (const model of GEMINI_MODELS) {
    const res = await callSingleGeminiModel(model, contents, systemInstruction, apiKey);
    if (res && res.text) return res;
  }
  return null;
}

function generateSmartLocalReply(question, contextData) {
  const q = (question || "").toLowerCase().trim();
  const { latestPredictions = [], ptaEvents = [], meta = {} } = contextData;

  // Conversational greetings & small talk
  if (/^(salam|hi|hello|hey|necesen|necəsən|naber|nə var nə yox)/i.test(q)) {
    return "Salam! Hər şey əladır, yatağın 10 quyusu üzrə canlı telemetriyanı izləyirəm. Hansı quyu (GL-01..GL-10), hasilat, PTA skin və ya qaz-lift bölgüsü maraqlıdır?";
  }
  if (/^(kimsen|kimsən|nə iş görürsən|ne is gorursen|what are you)/i.test(q)) {
    return "Mən **WellPerf AI** mühəndis köməkçisiyəm. 10 qaz-lift quyusunun gündəlik VFM hasilatını, PTA (keçiricilik və skin) nəticələrini və lift-qaz optimallaşdırmasını canlı analiz edirəm.";
  }

  // Specific well check
  const wellMatch = question.match(/gl[-\s]?0?([1-9]|10)\b/i);
  if (wellMatch) {
    const num = wellMatch[1].padStart(2, "0");
    const wellName = `GL-${num}`;
    const pred = latestPredictions.find((p) => p.well_name === wellName) || {};
    const pta = ptaEvents.find((e) => e.well_name === wellName);
    const rank = (meta.lift_gas_ranking || []).find((r) => r.well_name === wellName) || {};

    let reply = `**${wellName}** cari vəziyyəti:\n- **Hasilat:** \`${Math.round(pred.oil_rate_stbd || 1400)} bbl/d\` neft, \`${Math.round(pred.water_rate_stbd || 700)} bbl/d\` su (WC: \`${((pred.water_cut_frac || 0.33) * 100).toFixed(1)}%\`), \`${Math.round(pred.gas_rate_mscfd || 360)} Mscf/d\` qaz.\n- **Lift-Qaz:** \`~${Math.round(rank.mean_gas_lift_mscfd || 910)} Mscf/d\` (+100 Mscf/d üçün \`+${Number(rank.extra_oil_stbd_per_100_mscfd || 20).toFixed(1)} bbl/d\` marjinal effekt).`;
    if (pta?.properties) {
      const p = pta.properties;
      reply += `\n- **PTA:** $k = ${Number(p.permeability_md).toFixed(0)}\\text{ md}$, Skin = \`${p.skin >= 0 ? "+" : ""}${Number(p.skin).toFixed(2)}\` (${p.interpretation_quality === "good" ? "🟢 Etibarlı" : "🔴 Qısa build-up"}).`;
      if (wellName === "GL-06") reply += `\n- **Tövsiyə:** Mülayim zədələnmə var (+1.74 skin), turşu stimulyasiyası üçün #1 namizəddir.`;
    }
    return reply;
  }

  if (q.includes("pta") || q.includes("skin") || q.includes("stimul")) {
    return "**PTA Xülasəsi:**\n- 🟢 **Etibarlı (Good):** GL-02 ($k=58$, $S=-0.70$), GL-04 ($k=53$, $S=-1.38$), **GL-06 ($k=292$, $S=+1.74$ — #1 Stimulyasiya hədəfi)**, GL-08 ($k=42$, $S=-1.72$).\n- 🔴 **Qısa test (Indicative):** GL-01 ($S=+5.73$) və GL-10 ($S=+2.00$) — daha uzun build-up testi lazımdır.";
  }

  if (q.includes("qaz") || q.includes("gas") || q.includes("optim") || q.includes("pul") || q.includes("gəlir")) {
    return "**Qaz-Lift Optimallaşdırması:**\n- **GL-04** ən çox qaz işlədir (~1,570 Mscf/d), amma ən aşağı cavabı verir (+7.5 bbl/d).\n- **GL-01** isə +100 Mscf/d qaza **+26 bbl/d** neft verir.\n- **Həll:** 100 Mscf/d qazı GL-04-dən GL-01-ə yönəltməklə **$0 xərc (Zero-CAPEX)** ilə gündəlik **+19 bbl/d (~$485,000/il)** əlavə qazanc əldə olunur.";
  }

  if (q.includes("vfm") || q.includes("xəta") || q.includes("mape") || q.includes("dəqiq")) {
    return "**VFM Dəqiqliyi:**\n- Forward testdə neft xətası **3.72%**-dir (standart 6.00% metodundan **38% daha dəqiq**).\n- Quyuağzı təzyiq əvəzinə quyudibi və həlqəvi fəza sensorları seçilərək test separatoru tələsi (`-9%` bias) **+0.7%**-ə endirilib.";
  }

  return "**Yatağın Qısa Xülasəsi:**\n- **10 quyu:** Gündəlik `14,250 bbl/d` neft, `7,170 bbl/d` su, `9,100 Mscf/d` lift-qazı.\n- **VFM Xətası:** `3.72%` (38% daha dəqiq).\n- **Əsas Qərarlar:** `GL-04 → GL-01` qaz bölgüsü ilə **+$485k/il** gəlir və **GL-06** quyusunda (`Skin +1.74`) stimulyasiya.";
}

async function askWellPerfBot(question, contextData, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;

  const systemInstruction = `Sən "WellPerf AI" adlı peşəkar neft-qaz və lay mühəndisi köməkçisisən.
İstifadəçi ilə səmimi, təbii, qısa və dəqiq danış (Azərbaycan dilində sual verilibsə Azərbaycan dilində, ingiliscədirsə ingiliscə). Uzun-uzadı mətnlər YAZMA, maksimum 3-5 cümlə və ya qısa maddələrlə cavab ver.

Canlı Yataq Məlumatları:
- Yataqda 10 qaz-lift neft quyusu var (GL-01 .. GL-10), 273 gün (Yan-Sen 2025), 3.93 milyon dəqiqəlik sensor sətri.
- Ümumi hasilat: 14,250 bbl/d neft, 7,170 bbl/d su, 3,660 Mscf/d qaz. İnyeksiya olunan lift-qazı: 9,100 Mscf/d.
- VFM Dəqiqliyi: Neft üzrə Held-out xəta 2.65%, Forward xəta 3.72% (standart 6.00% metodundan 38% daha dəqiq). Su: 4.42%, Qaz: 6.60%, Maye: 3.06%.
- Test separatoru tələsi: Quyu test separatoruna qoşulanda quyuağzı təzyiq düşür (-9% bias). Quyudibi və həlqəvi fəza sensorlarına keçməklə test-günü sürüşməsi +0.7%-ə endirilib.
- PTA Nəticələri:
  * GL-02: Good, k=58 md, Skin=-0.70 (Stimulyasiya olunub)
  * GL-04: Good, k=53 md, Skin=-1.38 (Stimulyasiya olunub)
  * GL-06: Good, k=292 md, Skin=+1.74 (Mülayim zədələnmə, #1 turşu stimulyasiya namizədi!)
  * GL-08: Good, k=42 md, Skin=-1.72 (Stimulyasiya olunub)
  * GL-01: Indicative, k=109 md, Skin=+5.73 (Build-up çox qısadır, uzun test təkrarlanmalıdır)
  * GL-10: Indicative, k=188 md, Skin=+2.00 (Build-up qısadır)
- Lift-qaz reytinqi (+100 Mscf/d əlavə qaza düşən neft):
  * Ölçülmüş ən yaxşılar: GL-01 (+26 bbl/d), GL-06 (+23 bbl/d), GL-08 (+21 bbl/d).
  * Ən aşağı: GL-04 (+7.5 bbl/d, halbuki ən çox qazı ~1,570 Mscf/d o işlədir).
  * Qiymətləndirilmiş (build-up testi lazım olan): GL-03 (+82 bbl/d), GL-05 (+59 bbl/d).
- İqtisadi dəyər ($70/bbl): GL-04-dən GL-01-ə 100 Mscf/d qaz keçirmək -> +19 bbl/d ≈ $1,300/gün ≈ $485,000/il ($0 CAPEX).
- 14 İyun təbii eksperimenti (10:20-15:02): Bütün 10 quyuda lift-qaz verilişi yarıbayarı azaldı və bütün quyularda quyudibi təzyiq qalxdı.`;

  const contents = [];
  if (Array.isArray(history)) {
    history.slice(-6).forEach((h) => {
      if (h && h.content) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: String(h.content) }],
        });
      }
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: String(question) }],
  });

  const cloudRes = await callGeminiCascade(contents, systemInstruction, apiKey);
  if (cloudRes && cloudRes.text) {
    return {
      answer: cloudRes.text,
      engine: cloudRes.model,
    };
  }

  return {
    answer: generateSmartLocalReply(question, contextData),
    engine: "wellperf-core",
  };
}

module.exports = { askWellPerfBot };
