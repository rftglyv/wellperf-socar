# 🏆 SOCAR HACKATHON 2026 — JÜRI MÜDAFİƏ VƏ Q&A MASTER SƏNƏDİ
**Məhsul:** WellPerf Enterprise — Intelligent Well Performance Analysis  
**Komanda:** Enthuzone  
**Tarix:** 21 Noyabr 2026  

---

## 📌 BÖLMƏ 1: 5-DƏQİQƏLİK PİTCH SSENARİSİ (SƏHNƏ ÇIXIŞI)

### [00:00 - 00:45] Giriş & Problem (The Blind Spot)
> "Hörmətli münsiflər, bu gün Xəzər dənizində hasilat edən 10 qaz-lift quyumuz var. Bu quyular gündəlik 14,250 barel neft hasil edir. Lakin hasilatın həcmi hər quyuda yalnız ayda bir dəfə test separatorunda ölçülür. Qalan 29 gün ərzində rezervuar mühəndisi sahəni kor idarə edir: su basması, ştuser aşınması və ya qaz-lift qeyri-sabitliyi yalnız növbəti ay aşkar olunur. Bizim məqsədimiz xam 1-dəqiqəlik sensor datalarını dəqiq Virtual Axın Ölçməsinə (VFM), oradan avtomatlaşdırılmış Quyu Sınağı Analizinə (PTA) və birbaşa sıfır xərclə qazanc gətirən Qaz-Lift Optimizasiyasına çevirməkdir."

### [00:45 - 01:45] Mühəndislik Kəşfi: "Separator Routing Trap"
> "İlk böyük kəşfimiz: Standart maşın öyrənməsi modelləri bu datada yanılır. Çünki quyu test separatoruna yönləndiriləndə manifold təzyiq fərqinə görə quyuağzı təzyiq (WHP) 4–12% düşür. Əgər modeli xam WHP ilə təlim etsəniz, model test günlərində süni şəkildə −9.0% mənfi xəta (bias) öyrənir. Biz neft mühəndisliyi fizikasını tətbiq edərək, WHP düşüşünü təcrid etdik və test günü meylliliyini −9.0%-dən +0.7%-ə endirdik! Nəticədə BoundedRidge modelimiz Forward Validation-da 3.72% neft xətası verdi — bu, sənayedə qəbul edilən standart metoddan 38% daha dəqiqdir!"

### [01:45 - 03:00] Avtomatlaşdırılmış PTA və Yataq İnsaytı (GL-06)
> "PTA mərhələsində 6 qapalı quyunun hər birində Bourdet törəməsi və Horner semilog analizi apardıq. Horner düz xətt reqressiyamız bütün quyularda R² > 0.999 səviyyəsindədir. Ən əsası, biz kor-təbii rəqəm uydurmadıq: GL-02, GL-04, GL-06 və GL-08-də radial axını (IARF) təsdiqlədik, lakin GL-01 və GL-10-da sınaq qısa olduğu və törəmə düzləşmədiyi üçün onları 'Indicative' olaraq bayraqlandırdıq.
> 
> Ən böyük texniki tapıntımız GL-06 quyusudur: Lay keçiriciliyi çox yüksəkdir (k = 292 md), lakin Skin faktoru +1.74-dür (ΔP_skin = 23.3 psi). Bu, quyudibi zonanın mexaniki zədələndiyini sübut edir. GL-06 sahə üzrə dərhal turşulama və təkrar perforasiya edilməli #1 quyudur!"

### [03:00 - 04:00] İqtisadi Təsir: $0 CAPEX Qaz-Lift Optimizasiyası (+19 bbl/d = +$485k/il)
> "Bir çox komandalar sadəcə qrafik çəkir. Biz isə birbaşa SOCAR-a pul qazandırırıq. 14 İyun 2025 tarixində bütün sahədə baş verən 50%-lik qaz-lift kəsintisi təbii eksperimentindən istifadə edərək quyuların fərdi məhsuldarlıq indeksini (J) və qaz-lift cavabını modelləşdirdik. Nəticə: GL-04 quyusu qaz-liftə doymuş vəziyyətdədir (100 Mscf-ə cəmi +7.5 bbl verir), GL-01 isə qaza acdır (+26.5 bbl verir). Biz heç bir qəpik xərc çəkmədən ($0 CAPEX), yalnız klapanı tənzimləyərək 100 Mscf/d qazı GL-04-dən GL-01-ə yönləndirməyi təklif edirik: Bu, gündəlik +19 barel təmiz əlavə neft və illik $485,000 təmiz gəlir deməkdir!"

### [04:00 - 05:00] Platforma və Canlı Nümayiş (WellPerf Enterprise)
> "Bütün bu analitika arxa planda qalmır. Biz Next.js 14 və Three.js ilə Xəzər dənizi quyularının 3D Subsurface Digital Twin-ini qurduq. Sistemdə 5 Enterprise rolu var: Rezervuar mühəndisi PTA pəncərəsini canlı dəyişə bilər, Hasilat mühəndisi ştuser simulyasiyası apara bilər, Operator isə anomaliyaları izləyir. İcazə verin canlı interfeysi göstərək..."

---

## 📌 BÖLMƏ 2: MÜNSİFLƏRİN TƏLƏ SUALLARI VƏ DƏQİQ CAVABLAR

### Sual 1: "GL-01 və GL-10 quyularında niyə radial axın yoxdur dediniz?"
* **Cavab:** "Çünki Bourdet diaqnostik qrafikində log-log törəməsi ($\Delta p'$) üfüqi xəttə (flat plateau) çatmayıb. GL-01-də qapama müddəti cəmi 72 saat olub və törəmə hələ quyudibi saxlama (wellbore storage) və keçid zonasından düşməkdə davam edirdi. Əgər belə quyuya zorla Horner düz xətti çəksəniz, aldığınız keçiricilik (k) və skin (s) saxta olacaq. Biz bunu dürüst şəkildə 'Indicative only' kimi sənədləşdirdik."

### Sual 2: "Separator Routing Trap nədir? Niyə WHP-ni çıxartdınız?"
* **Cavab:** "Test separatoruna gedən test xəttinin hidravlik müqaviməti ümumi hasilat kollektorundan fərqlidir. Quyu testə yönləndiriləndə quyuağzı təzyiq (WHP) 4–12% düşür, halbuki rezervuardakı real hasilat dəyişmir. ML modeli isə bu süni təzyiq düşüşünü 'hasilat azaldı' kimi şərh edir. Biz modeli yalnız quyudibi təzyiq ($P_{wf}$), qaz-lift debiti ($q_{inj}$) və temperatur ilə təlim edərək modelin test-separator asılılığını qırdıq və Forward MAPE-ni 3.72%-ə saldıq."

### Sual 3: "PTA-da effektiv hasilat vaxtını (tp) necə hesabladınız?"
* **Cavab:** "PTA təkfazalı neft modeli kimi tələb olunurdu. Biz bağlanan günə qədər olan kumulyativ neft hasilatını ($N_p$) bağlanan günün VFM modeli ilə təyin etdiyimiz neft debitinə ($q_o$) böldük:
  $$t_p = 24 \times \frac{N_p}{q_o}$$
  Beləliklə, VFM-in hasilat nəticəsi birbaşa PTA-nın Horner vaxt oxuna daxil edildi."

### Sual 4: "Niyə Random Forest və ya Dərin Neyron Şəbəkə yox, BoundedRidge istifadə etdiniz?"
* **Cavab:** "Çünki neft quyularında fiziki qanunlar var: quyudibi təzyiq artdıqda hasilat AZALMALIDIR ($\partial q / \partial P_{wf} \le 0$), qaz-lift artdıqda isə hasilat artmalıdır. Neyron şəbəkələr və Random Forest sensorlarda səs-küy olanda bu fiziki qanunu pozur və qeyri-fiziki nəticələr verir. BoundedRidge modeli fiziki sərhədləri qoruyur, heç vaxt mənfi hasilat vermir və ekstrapolyasiyada partlamır."

### Sual 5: "Qaz-lift optimizasiyasında quyular arasındakı qarşılıqlı təsiri nəzərə aldınızmı?"
* **Cavab:** "Bəli. 14 İyun 2025-ci il saat 10:20–15:02 aralığında bütün yataqda qaz-lift kompressorunda problem yaranmış və ümumi qaz 50% azalmışdı. Bu təbii eksperiment zamanı hər bir quyunun quyudibi təzyiq reaksiyasını ($\Delta P_{wf}$) və fərdi Məhsuldarlıq İndeksini ($J = q_o / (P_{res} - P_{wf})$) hesabladıq. Məhz buna görə qazın GL-04-dən GL-01-ə ötürülməsinin sistem üzrə +19 bbl/d xalis gəlir verəcəyini sübut etdik."
