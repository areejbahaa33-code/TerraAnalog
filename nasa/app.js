/* =====================================================================
   TerraAnalog — js/app.js
   Core logic for index.html (load with <script src="js/app.js"></script>
   AFTER three.js, Leaflet and Chart.js).
   - Dual Earth / Moon-Mars maps (Esri imagery default, zoom 1 to 21)
   - Omnibar: local sites + Open-Meteo global geocoding -> live DEM scan
   - Scroll-driven Three.js particle scenes + automatic colour themes
   - Strict AR/EN toggle, voice report, matcher, charts, rover simulator
   ===================================================================== */

/* =====================================================================
   1. DATASETS: 12 MOON/MARS ZONES + 10 EARTH SITES (WITH NASA IMAGES)
   ===================================================================== */
const CELESTIAL_ZONES = [
  { id: "MR-01", name: "Jezero Crater Delta", body: "Mars", gravity: 3.72, lat: 18.38, lon: 77.58, instrument: "NASA MGS MOLA", image: "https://images-assets.nasa.gov/image/PIA24420/PIA24420~orig.jpg", nasaQuery: "Jezero Crater Mars Perseverance", metrics: { elevation: 2540, slope: 6.1, roughness: 4.2, local_relief: 305 }, note: "حوض دلتا بحيرة قديمة هبط فيه المسبار Perseverance؛ انحدار منخفض وتربة رسوبية غنية بالمعادن الطينية." },
  { id: "MR-02", name: "Valles Marineris Canyon", body: "Mars", gravity: 3.72, lat: -13.4, lon: -60.2, instrument: "NASA MGS MOLA", image: "https://images-assets.nasa.gov/image/PIA00422/PIA00422~orig.jpg", nasaQuery: "Valles Marineris Mars canyon", metrics: { elevation: 2790, slope: 14.9, roughness: 8.1, local_relief: 590 }, note: "أخدود مريخي تكتوني عملاق بجدران متصدعة شديدة الانحدار وطبقات جيولوجية مكشوفة." },
  { id: "MR-03", name: "Utopia Planitia Ice Plains", body: "Mars", gravity: 3.72, lat: 46.7, lon: 117.5, instrument: "NASA MGS MOLA / SHARAD", image: "https://images-assets.nasa.gov/image/PIA21138/PIA21138~orig.jpg", nasaQuery: "Utopia Planitia Mars ice", metrics: { elevation: 1690, slope: 3.9, roughness: 3.2, local_relief: 185 }, note: "سهول شمالية منبسطة تحتوي على خزانات ضخمة من الجليد المائي تحت السطح." },
  { id: "MR-04", name: "Gale Crater — Mount Sharp", body: "Mars", gravity: 3.72, lat: -5.4, lon: 137.8, instrument: "NASA MGS MOLA", image: "https://images-assets.nasa.gov/image/PIA19912/PIA19912~orig.jpg", nasaQuery: "Mount Sharp Gale Crater Mars", metrics: { elevation: 2420, slope: 7.2, roughness: 4.7, local_relief: 345 }, note: "تلال رسوبية متعددة الطبقات وكثبان بازلتية يستكشفها المسبار Curiosity." },
  { id: "MR-05", name: "Olympus Mons Escarpment", body: "Mars", gravity: 3.72, lat: 18.65, lon: -133.8, instrument: "NASA MGS MOLA", image: "https://images-assets.nasa.gov/image/PIA02982/PIA02982~orig.jpg", nasaQuery: "Olympus Mons Mars volcano", metrics: { elevation: 2920, slope: 9.1, roughness: 5.6, local_relief: 405 }, note: "تدفقات حمم بركانية بازلتية شاسعة وحواف بركانية مرتفعة." },
  { id: "MR-06", name: "Mawrth Vallis Outflow", body: "Mars", gravity: 3.72, lat: 23.9, lon: -19.0, instrument: "NASA MGS MOLA", image: "https://images-assets.nasa.gov/image/PIA23519/PIA23519~orig.jpg", nasaQuery: "Mawrth Vallis Mars", metrics: { elevation: 2180, slope: 8.3, roughness: 5.1, local_relief: 375 }, note: "قناة فيضانية قديمة غنية بالصخور الفاتحة والمعادن المائية." },

  { id: "MN-01", name: "Shackleton Ridge (Artemis III)", body: "Moon", gravity: 1.62, lat: -85.5, lon: 12.0, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/PIA23499/PIA23499~orig.jpg", nasaQuery: "Shackleton Crater Moon South Pole", metrics: { elevation: 2150, slope: 11.4, roughness: 6.8, local_relief: 480 }, note: "حافة قطبية مرتفعة عند القطب الجنوبي للقمر مقترحة لهبوط مهمة أرتميس 3." },
  { id: "MN-02", name: "Mare Tranquillitatis Lava Pit", body: "Moon", gravity: 1.62, lat: 8.33, lon: 30.83, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001982/GSFC_20171208_Archive_e001982~orig.jpg", nasaQuery: "Mare Tranquillitatis pit Moon", metrics: { elevation: 1820, slope: 4.8, roughness: 3.6, local_relief: 210 }, note: "سهول بازلتية بركانية منبسطة تحتوي على كهوف أنابيب حمم منهارة لحماية القواعد القمرية." },
  { id: "MN-03", name: "Aristarchus Volcanic Plateau", body: "Moon", gravity: 1.62, lat: 23.7, lon: -47.4, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001135/GSFC_20171208_Archive_e001135~orig.jpg", nasaQuery: "Aristarchus Plateau Moon", metrics: { elevation: 2390, slope: 9.6, roughness: 5.9, local_relief: 420 }, note: "هضبة بركانية مرتفعة غنية بالرواسب البركانية الفتاتية لاستخراج الأكسجين." },
  { id: "MN-04", name: "Tycho Crater Central Peak", body: "Moon", gravity: 1.62, lat: -43.3, lon: -11.3, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/PIA14011/PIA14011~orig.jpg", nasaQuery: "Tycho Crater central peak Moon", metrics: { elevation: 2260, slope: 13.8, roughness: 7.8, local_relief: 540 }, note: "تضاريس فوهة صدمية حديثة شديدة الانحدار والخشونة لاختبار تفادي العوائق." },
  { id: "MN-05", name: "Marius Hills Volcanic Domes", body: "Moon", gravity: 1.62, lat: 13.5, lon: -54.0, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/PIA13508/PIA13508~orig.jpg", nasaQuery: "Marius Hills Moon volcanic", metrics: { elevation: 2020, slope: 10.5, roughness: 6.7, local_relief: 465 }, note: "أكبر تجمع للقباب والمخاريط البركانية البازلتية على سطح القمر." },
  { id: "MN-06", name: "Malapert Massif Polar Peak", body: "Moon", gravity: 1.62, lat: -80.0, lon: 0.0, instrument: "NASA LRO LOLA", image: "https://images-assets.nasa.gov/image/PIA23499/PIA23499~orig.jpg", nasaQuery: "Lunar South Pole mountain", metrics: { elevation: 2850, slope: 12.4, roughness: 6.4, local_relief: 510 }, note: "جبل قطبي شاهق يوفر خط رؤية مباشر ومستمر مع كوكب الأرض للاتصالات." }
];

const EARTH_SITES = [
  { id: "EA-01", name: "Atacama Pajonales Basin", country: "Chile", lat: -24.52, lon: -68.82, logistics: "Tier-1 (High Road/Air Access)", metrics: { elevation: 2610, slope: 5.9, roughness: 4.1, local_relief: 295 } },
  { id: "EA-02", name: "Askja Highland Basalt Field", country: "Iceland", lat: 65.03, lon: -16.75, logistics: "Tier-2 (Summer Expedition)", metrics: { elevation: 2090, slope: 11.6, roughness: 6.6, local_relief: 470 } },
  { id: "EA-03", name: "McMurdo Dry Valleys", country: "Antarctica", lat: -77.52, lon: 161.85, logistics: "Tier-3 (Extreme Polar Icebreaker)", metrics: { elevation: 2140, slope: 11.1, roughness: 6.4, local_relief: 490 } },
  { id: "EA-04", name: "Haughton Crater Devon Island", country: "Canada", lat: 75.38, lon: -89.68, logistics: "Tier-3 (Arctic Air Charter)", metrics: { elevation: 2290, slope: 12.1, roughness: 7.1, local_relief: 445 } },
  { id: "EA-05", name: "Lunar Crater Volcanic Field", country: "USA (Nevada)", lat: 38.38, lon: -116.06, logistics: "Tier-1 (Direct Highway)", metrics: { elevation: 2040, slope: 10.6, roughness: 6.8, local_relief: 468 } },
  { id: "EA-06", name: "Wadi Rum Sandstone Mesas", country: "Jordan", lat: 29.58, lon: 35.42, logistics: "Tier-1 (Year-Round Access)", metrics: { elevation: 2410, slope: 6.9, roughness: 4.6, local_relief: 340 } },
  { id: "EA-07", name: "Mauna Kea Tephra Saddle", country: "USA (Hawaii)", lat: 19.76, lon: -155.46, logistics: "Tier-1 (Established ISRU Site)", metrics: { elevation: 2380, slope: 9.4, roughness: 5.8, local_relief: 415 } },
  { id: "EA-08", name: "Saint Catherine Ring Complex", country: "Egypt (Sinai)", lat: 28.51, lon: 33.95, logistics: "Tier-1 (High Regional Access)", metrics: { elevation: 2240, slope: 13.5, roughness: 7.6, local_relief: 530 } },
  { id: "EA-09", name: "Black Desert Basalt Cones", country: "Egypt", lat: 28.14, lon: 28.76, logistics: "Tier-1 (Direct Oasis Highway)", metrics: { elevation: 1760, slope: 4.5, roughness: 3.4, local_relief: 198 } },
  { id: "EA-10", name: "Danakil Afar Rift Canyon", country: "Ethiopia", lat: 14.24, lon: 40.30, logistics: "Tier-2 (Remote Helicopter)", metrics: { elevation: 2740, slope: 14.4, roughness: 7.9, local_relief: 575 } }
];

const KEYS = ["elevation", "slope", "roughness", "local_relief"];
let weights = { slope: 0.35, roughness: 0.30, local_relief: 0.20, elevation: 0.15 };
const BOUNDS = {
  elevation: { min: 1400, max: 3200 },
  slope: { min: 1.0, max: 18.0 },
  roughness: { min: 1.5, max: 10.0 },
  local_relief: { min: 100, max: 680 }
};

let currentLang = "ar";

/* ---------- Strict bilingual engine: one language at a time ---------- */
const t = (ar, en) => (currentLang === "ar" ? ar : en);
const bodyName = b => t(b === "Moon" ? "القمر" : "المريخ", b);
const bodyTag = b => t(b === "Moon" ? "القمر" : "المريخ", b.toUpperCase());
const NOTES_EN = {
  "MR-01": "Ancient lake-delta basin where the Perseverance rover landed; gentle slopes and clay-rich sedimentary soil.",
  "MR-02": "A giant tectonic Martian canyon with steep fractured walls and exposed geological layers.",
  "MR-03": "Flat northern plains holding vast reservoirs of subsurface water ice.",
  "MR-04": "Layered sedimentary mounds and basaltic dunes explored by the Curiosity rover.",
  "MR-05": "Vast basaltic lava flows and elevated volcanic rims.",
  "MR-06": "An ancient flood channel rich in light-toned rocks and hydrated minerals.",
  "MN-01": "A high polar ridge at the lunar south pole proposed for the Artemis III landing.",
  "MN-02": "Flat volcanic basalt plains with collapsed lava-tube pits that could shelter lunar bases.",
  "MN-03": "A raised volcanic plateau rich in pyroclastic deposits for oxygen extraction.",
  "MN-04": "Steep, rough terrain of a young impact crater, ideal for testing obstacle avoidance.",
  "MN-05": "The largest cluster of basaltic volcanic domes and cones on the Moon.",
  "MN-06": "A towering polar peak with continuous line-of-sight to Earth for communications."
};
const zoneNote = z => (currentLang === "ar" ? z.note : (NOTES_EN[z.id] || z.note));
const TIER_AR = { "High Road/Air Access": "وصول بري وجوي عالٍ", "Summer Expedition": "بعثة صيفية", "Extreme Polar Icebreaker": "كاسحة جليد قطبية", "Arctic Air Charter": "طيران قطبي مستأجر", "Direct Highway": "طريق سريع مباشر", "Year-Round Access": "وصول طوال العام", "Established ISRU Site": "موقع ISRU مجهّز", "High Regional Access": "وصول إقليمي عالٍ", "Direct Oasis Highway": "طريق الواحات المباشر", "Remote Helicopter": "مروحية للمواقع النائية", "Custom Coordinate": "إحداثية مخصصة" };
function fmtLogistics(txt) {
  if (currentLang !== "ar") return txt;
  const m = /^Tier-(\d) \((.*)\)$/.exec(txt);
  return m ? `المستوى ${m[1]} (${TIER_AR[m[2]] || m[2]})` : txt;
}

/* [original text as it appears in the markup (trailing * = prefix match), Arabic (null = keep original), English] */
const I18N_DICT = [
  ["المركز", null, "Hub"],
  ["الخرائط المزدوجة", null, "Dual Maps"],
  ["المضاهاة العكسية", null, "Twin Matcher"],
  ["الستارة البصرية والـ 3D", null, "Optical & 3D"],
  ["محاكي المركبة والجاذبية", null, "Rover & Gravity"],
  ["مختبر الأوزان والداتا", null, "Weights & Data Lab"],
  ["🔊 تقرير صوتي", null, "🔊 Voice report"],
  ["NASA SPACE APPS 2026 // SRTM ⇄ LRO LOLA ⇄ MGS MOLA", "تحدي ناسا للفضاء 2026 // SRTM ⇄ LRO LOLA ⇄ MGS MOLA", "NASA SPACE APPS 2026 // SRTM ⇄ LRO LOLA ⇄ MGS MOLA"],
  ["Reads terrain,", "يقرأ التضاريس،", "Reads terrain,"],
  ["in motion.", "في حركة.", "in motion."],
  ["منصة الذكاء الجيومورفولوجي*", null, "A full geomorphic intelligence platform: dual terrain maps for Earth, the Moon and Mars, reverse matching of 22 reference zones, an optical comparison curtain, a 3D hologram, and a spacecraft stability simulator."],
  ["01 // Planetary Orb", "01 // كرة كوكبية", "01 // Planetary Orb"],
  ["02 // Orbital Spiral", "02 // حلزون مداري", "02 // Orbital Spiral"],
  ["03 // 3D Crater DEM", "03 // فوهة ثلاثية الأبعاد", "03 // 3D Crater DEM"],
  ["🟢 Vesper Mint", "🟢 نعناعي", "🟢 Vesper Mint"],
  ["🔵 Lunar Cyan", "🔵 سماوي قمري", "🔵 Lunar Cyan"],
  ["🔴 Martian Oxide", "🔴 أكسيد مريخي", "🔴 Martian Oxide"],
  ["45,000 REAL-TIME WEBGL PARTICLES MORPHING ACROSS LUNAR LOLA & MARTIAN MOLA ELEVATION VECTORS.", "45,000 جسيم WebGL لحظي تتحول عبر متجهات ارتفاع LOLA القمرية وMOLA المريخية.", "45,000 REAL-TIME WEBGL PARTICLES MORPHING ACROSS LUNAR LOLA & MARTIAN MOLA ELEVATION VECTORS."],
  ["تشغيل الرادار المزدوج ↗", null, "Launch dual radar ↗"],
  ["BIDIRECTIONAL ANALOG ENGINE: SELECT ANY EARTH COORDINATE TO FLY TO ITS MOON/MARS CRATER TWIN — OR CLICK ANY PLANETARY CRATER TO LOCATE ITS EARTH TESTBED.", "محرك التناظر ثنائي الاتجاه: اختر أي إحداثية على الأرض لتنتقل إلى توأمها الفوهي على القمر أو المريخ، أو اضغط على أي فوهة كوكبية لتحديد موقع اختبارها الأرضي.", "BIDIRECTIONAL ANALOG ENGINE: SELECT ANY EARTH COORDINATE TO FLY TO ITS MOON/MARS CRATER TWIN — OR CLICK ANY PLANETARY CRATER TO LOCATE ITS EARTH TESTBED."],
  ["Earth + Space Atlas Zones", "مناطق أطلس الأرض والفضاء", "Earth + Space Atlas Zones"],
  ["4 Vectors", "4 متجهات", "4 Vectors"],
  ["Elev · Slope · Rough · Relief", "ارتفاع · ميل · خشونة · تضاريس", "Elev · Slope · Rough · Relief"],
  ["📄 تحميل ملف المهمة (JSON Dossier)", "📄 تحميل ملف المهمة (JSON)", "📄 Download mission file (JSON dossier)"],
  ["أعلى تطابق قمري (LOLA)", null, "Top lunar match (LOLA)"],
  ["أعلى تطابق مريخي (MOLA)", null, "Top Martian match (MOLA)"],
  ["الماسح المداري الحي (SRTM 30m)", null, "Live orbital scanner (SRTM 30m)"],
  ["اضغط على أي مكان في خريطة الأرض للمسح", null, "Click anywhere on the Earth map to scan"],
  ["هامش أمان انقلاب الروفر", null, "Rover rollover safety margin"],
  ["مقارنة بحد الانقلاب الحرج لناسا (15.0°)", null, "Versus NASA's critical rollover limit (15.0°)"],
  ["02 // SYNCHRONIZED DUAL PLANETARY RASTER WORKSTATION", "02 // محطة الخرائط الكوكبية المزدوجة المتزامنة", "02 // SYNCHRONIZED DUAL PLANETARY RASTER WORKSTATION"],
  ["خريطتان متزامنتان: اضغط على أي مكان في الأرض", null, "Two synchronized maps: click anywhere on Earth"],
  ["لتطير إلى توأمه على القمر والمريخ", null, "to fly to its twin on the Moon and Mars"],
  ["🔴 خريطة المريخ التضاريسية (MOLA)", null, "🔴 Mars topographic map (MOLA)"],
  ["🌕 خريطة القمر التضاريسية (LOLA)", null, "🌕 Moon topographic map (LOLA)"],
  ["EARTH // NASA SRTM 30m DEM (اضغط على أي نقطة للمسح الحي)", "الأرض // NASA SRTM 30m DEM (اضغط على أي نقطة للمسح الحي)", "EARTH // NASA SRTM 30m DEM (click any point for a live scan)"],
  ["Topographic DEM Contours (SRTM)", "كنتور ارتفاعات DEM (SRTM)", "Topographic DEM Contours (SRTM)"],
  ["NASA / Esri World Satellite", "أقمار ناسا وEsri العالمية", "NASA / Esri World Satellite"],
  ["NASA GIBS BlueMarble Relief", "ناسا GIBS بلو ماربل التضاريسي", "NASA GIBS BlueMarble Relief"],
  ["LIVE 3×3 DEM SCANNER ARMED", "ماسح DEM الحي 3×3 جاهز", "LIVE 3×3 DEM SCANNER ARMED"],
  ["LIVE CONVERGENCE LOCK", "قفل التقارب الحي", "LIVE CONVERGENCE LOCK"],
  ["SLOPE ANGLE", "زاوية الميل", "SLOPE ANGLE"],
  ["ROUGHNESS", "الخشونة", "ROUGHNESS"],
  ["LOCAL RELIEF", "التضاريس المحلية", "LOCAL RELIEF"],
  ["ELEVATION", "الارتفاع", "ELEVATION"],
  ["اضغط على أي فوهة للبحث العكسي", null, "Click any crater for a reverse search"],
  ["GLOBAL SEARCH // EARTH · MOON · MARS", "البحث الشامل // الأرض · القمر · المريخ", "GLOBAL SEARCH // EARTH · MOON · MARS"],
  ["اكتب اسم موقع أو رمزه أو بلده، مثل: Atacama أو EA-01 أو Jezero", null, "Type a site name, ID or country, e.g. Atacama, EA-01 or Jezero"],
  ["الكل", null, "All"],
  ["الأرض", null, "Earth"],
  ["القمر", null, "Moon"],
  ["المريخ", null, "Mars"],
  ["03 // BIDIRECTIONAL ANALOG ENGINE (MANY-TO-MANY)", "03 // محرك التناظر ثنائي الاتجاه (متعدد إلى متعدد)", "03 // BIDIRECTIONAL ANALOG ENGINE (MANY-TO-MANY)"],
  ["محرك التوأم الكوكبي ثنائي الاتجاه", null, "Bidirectional planetary twin engine"],
  ["(من الأرض للفضاء والعكس)", null, "(Earth to space and back)"],
  ["من الأرض ⟵ إلى القمر والمريخ (12 منطقة)", null, "From Earth → to the Moon & Mars (12 zones)"],
  ["من القمر والمريخ ⟵ إلى الأرض (بحث عكسي)", null, "From the Moon & Mars → to Earth (reverse search)"],
  ["04 // SPLIT-SCREEN SATELLITE CURTAIN & 3D DEM HOLOGRAM", "04 // ستارة الأقمار الصناعية المنقسمة وهولوجرام DEM ثلاثي الأبعاد", "04 // SPLIT-SCREEN SATELLITE CURTAIN & 3D DEM HOLOGRAM"],
  ["ستارة المقارنة البصرية بالصور", null, "Optical image comparison curtain"],
  ["وهولوجرام التضاريس ثلاثي الأبعاد", null, "and a 3D terrain hologram"],
  ["📸 ستارة المقارنة البصرية (اسحب المؤشر يميناً ويساراً)", null, "📸 Optical comparison curtain (drag the slider left and right)"],
  ["🌐 هولوجرام التضاريس ثلاثي الأبعاد (اسحب بالماوس للدوران 360°)", null, "🌐 3D terrain hologram (drag with the mouse to rotate 360°)"],
  ["05 // ROVER KINEMATICS, GRAVITY SANDBOX & EVA MISSION SIMULATOR", "05 // حركية الروفر ومحاكي الجاذبية والمهام خارج المركبة", "05 // ROVER KINEMATICS, GRAVITY SANDBOX & EVA MISSION SIMULATOR"],
  ["محاكي اتزان المركبة، فرق الجاذبية،", null, "Rover stability, gravity differences,"],
  ["واستهلاك طاقة المسار", null, "and traverse energy use"],
  ["06 // MISSION WEIGHT CALIBRATOR, 4-CHART TELEMETRY & NASA LIVE ARCHIVE", "06 // معايرة أوزان المهمة وأربعة رسوم قياس وأرشيف ناسا الحي", "06 // MISSION WEIGHT CALIBRATOR, 4-CHART TELEMETRY & NASA LIVE ARCHIVE"],
  ["مختبر معايرة الأوزان، الرسوم البيانية،", null, "Weight calibration lab, charts,"],
  ["وأرشيف صور ناسا المباشر", null, "and the live NASA image archive"],
  ["توازن قياسي", null, "Balanced standard"],
  ["أمان هبوط المركبة", null, "Landing safety"],
  ["حركة الروفر", null, "Rover mobility"],
  ["حفر الموارد ISRU", null, "ISRU resource drilling"],
  ["تصدير الجدول CSV ↓", null, "Export table CSV ↓"],
  ["SLOPE WEIGHT (الميل)", "وزن الميل", "SLOPE WEIGHT"],
  ["ROUGHNESS WEIGHT (الخشونة)", "وزن الخشونة", "ROUGHNESS WEIGHT"],
  ["LOCAL RELIEF (التضاريس)", "وزن التضاريس", "LOCAL RELIEF WEIGHT"],
  ["ELEVATION (الارتفاع)", "وزن الارتفاع", "ELEVATION WEIGHT"],
  ["1. بصمة التطابق الرباعية (4-Vector Normalized Radar)", "1. بصمة التطابق الرباعية (رادار موحّد)", "1. Four-vector match fingerprint (normalized radar)"],
  ["2. المقطع العرضي للتضاريس لمسافة 5 كم (5km Topographic Profile)", "2. المقطع العرضي للتضاريس لمسافة 5 كم", "2. 5 km topographic cross-section profile"],
  ["3. مقارنة تشابه جميع المواقع الأرضية (القمر مقابل المريخ %)", null, "3. Similarity of all Earth sites (Moon vs Mars %)"],
  ["4. مساهمة المعايير الأربعة لكل موقع (Feature Match Breakdown %)", "4. مساهمة المعايير الأربعة لكل موقع (%)", "4. Contribution of the four criteria per site (%)"],
  ["المصفوفة الشاملة لترتيب شبيهات الأرض والتوأم الفضائي التلقائي", null, "Full ranking matrix of Earth analogs and automatic space twins"],
  ["موقع الأرض", null, "Earth site"],
  ["الارتفاع", null, "Elevation"],
  ["الميل", null, "Slope"],
  ["الخشونة", null, "Roughness"],
  ["التضاريس", null, "Relief"],
  ["أقرب توأم قمري (LOLA)", null, "Nearest lunar twin (LOLA)"],
  ["أقرب توأم مريخي (MOLA)", null, "Nearest Martian twin (MOLA)"],
  ["التطابق الأعلى", null, "Top match"],
  ["فحص", null, "Inspect"],
  ["أرشيف صور وكالة ناسا المباشر (LIVE REST API: images-api.nasa.gov)", "أرشيف صور وكالة ناسا المباشر (REST API: images-api.nasa.gov)", "Live NASA image archive (REST API: images-api.nasa.gov)"],
  ["Mars MOLA", "المريخ MOLA", "Mars MOLA"],
  ["Moon LOLA", "القمر LOLA", "Moon LOLA"],
  ["Jezero Delta", "دلتا جيزيرو", "Jezero Delta"],
  ["Valles Marineris", "وادي مارينيريس", "Valles Marineris"],
  ["Sinai Egypt", "سيناء، مصر", "Sinai Egypt"]
];
const i18nNodes = [];

function registerStaticI18n() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName) || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const norm = n.nodeValue.replace(/\s+/g, " ").trim();
    for (const [orig, ar, en] of I18N_DICT) {
      const prefix = orig.endsWith("*");
      const key = prefix ? orig.slice(0, -1) : orig;
      if (prefix ? norm.startsWith(key) : norm === key) {
        i18nNodes.push({ n, lead: n.nodeValue.match(/^\s*/)[0], trail: n.nodeValue.match(/\s*$/)[0], ar: ar === null ? norm : ar, en });
        break;
      }
    }
  });
}

function setThermalLabel() {
  document.getElementById("btnToggleThermal").textContent = t(`🌈 فلتر الارتفاعات الحراري DEM: ${falseColorShaderOn ? "مفعّل" : "مغلق"}`, `🌈 DEM thermal elevation filter: ${falseColorShaderOn ? "ON" : "OFF"}`);
}
function setSpacePaneLabels(body) {
  document.getElementById("spacePaneTitle").textContent = body === "Mars"
    ? t("المريخ // خريطة ناسا MOLA التضاريسية الشبكية", "MARS // NASA MOLA TOPOGRAPHIC RASTER")
    : t("القمر // خريطة ناسا LOLA التضاريسية الشبكية", "MOON // NASA LOLA TOPOGRAPHIC RASTER");
  document.getElementById("spaceInstrumentTag").textContent = body === "Mars" ? "NASA MGS MOLA DEM" : "NASA LRO LOLA DEM";
}
function setDualLabel() {
  document.getElementById("toggleDualMeshBtn").textContent = t(`تراكب مزدوج: ${holoState.dualOverlay ? "مفعّل" : "الأرض فقط"}`, `DUAL OVERLAY: ${holoState.dualOverlay ? "ON" : "EARTH ONLY"}`);
}

function applyChromeI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
  document.title = t("TERRA // ANALOG — منصة الذكاء الكوكبي الشاملة (ناسا سبيس آبس 2026)", "TERRA // ANALOG — Full-Spectrum Planetary Intelligence (NASA Space Apps 2026)");
  i18nNodes.forEach(r => { r.n.nodeValue = r.lead + (currentLang === "ar" ? r.ar : r.en) + r.trail; });
  document.querySelectorAll("[data-ph-ar]").forEach(el => { el.placeholder = currentLang === "ar" ? el.dataset.phAr : el.dataset.phEn; });
  document.getElementById("langSwitchBtn").textContent = t("EN", "عربي");
  document.getElementById("omniClear").setAttribute("aria-label", t("مسح", "Clear"));
  setThermalLabel();
  setSpacePaneLabels(activeCelestialBody);
  setDualLabel();
}

function applyLanguage() {
  applyChromeI18n();
  recomputeAllPairings();
  renderBidirectionalMatcher();
  renderGlobalMatrixTable();
  initDropdownSelectors();
  lockMasterPair(activeEarthSite, activeSpaceSite, false);
  scheduleGeocode(); // re-query so place names come back in the new language
  renderOmniResults();
}

/* ---------- Omnibar: global search across Earth sites + Moon/Mars zones ---------- */
let omniScope = "all";
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search?name=";
const omniGeo = { q: "", status: "idle", items: [], timer: null, ctrl: null };

function omniSearch(q) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const pool = [];
  if (omniScope === "all" || omniScope === "Earth") EARTH_SITES.forEach(e => pool.push({ kind: "Earth", obj: e, hay: `${e.id} ${e.name} ${e.country}`.toLowerCase() }));
  CELESTIAL_ZONES.forEach(z => { if (omniScope === "all" || omniScope === z.body) pool.push({ kind: z.body, obj: z, hay: `${z.id} ${z.name} ${z.instrument}`.toLowerCase() }); });
  return pool.filter(p => terms.every(w => p.hay.includes(w))).slice(0, 6);
}
function omniKindLabel(kind) { return kind === "Earth" ? t("الأرض", "EARTH") : bodyTag(kind); }
function omniGeoAllowed() {
  return (omniScope === "all" || omniScope === "Earth") && document.getElementById("omniInput").value.trim().length >= 2;
}

// Debounced geocoding; a newer keystroke aborts the previous request.
function scheduleGeocode() {
  clearTimeout(omniGeo.timer);
  if (omniGeo.ctrl) omniGeo.ctrl.abort();
  omniGeo.items = [];
  if (!omniGeoAllowed()) { omniGeo.status = "idle"; return; }
  const q = document.getElementById("omniInput").value.trim();
  omniGeo.q = q;
  omniGeo.status = "loading";
  omniGeo.timer = setTimeout(() => runGeocode(q), 350);
}
async function runGeocode(q) {
  const ctrl = new AbortController();
  omniGeo.ctrl = ctrl;
  try {
    const r = await fetch(`${GEO_API}${encodeURIComponent(q)}&count=6&language=${currentLang}&format=json`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (q !== omniGeo.q) return;
    omniGeo.items = (j.results || []).map(p => ({ name: p.name, admin: p.admin1 || "", country: p.country || "", lat: p.latitude, lon: p.longitude }));
    omniGeo.status = "done";
  } catch (err) {
    if (err.name === "AbortError") return;
    omniGeo.items = [];
    omniGeo.status = "error";
  }
  renderOmniResults();
}

function renderOmniResults() {
  const input = document.getElementById("omniInput"), box = document.getElementById("omniResults");
  document.getElementById("omniClear").hidden = !input.value;
  const q = input.value.trim();
  if (!q) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = "";

  omniSearch(q).forEach(h => {
    const o = h.obj, row = document.createElement("button");
    row.type = "button"; row.className = "omni-row"; row.setAttribute("role", "option");
    row.innerHTML = `<span class="omni-tag omni-tag-${h.kind.toLowerCase()}">${omniKindLabel(h.kind)}</span><span class="omni-name"><strong>${o.name}</strong><small>${o.id} • ${h.kind === "Earth" ? o.country : o.instrument}</small></span><span class="omni-go">↵</span>`;
    row.onclick = () => omniPick(h);
    box.appendChild(row);
  });

  if (omniGeoAllowed()) {
    if (omniGeo.status === "loading") {
      box.insertAdjacentHTML("beforeend", `<div class="omni-empty">${t("جارٍ البحث عن الأماكن حول العالم...", "Searching places worldwide...")}</div>`);
    } else if (omniGeo.status === "error") {
      box.insertAdjacentHTML("beforeend", `<div class="omni-empty">${t("تعذّر الاتصال بخدمة البحث الجغرافي", "Could not reach the geocoding service")}</div>`);
    } else {
      omniGeo.items.forEach(p => {
        const row = document.createElement("button");
        row.type = "button"; row.className = "omni-row"; row.setAttribute("role", "option");
        const where = [p.admin, p.country].filter(Boolean).join(t("، ", ", "));
        row.innerHTML = `<span class="omni-tag" style="background:var(--violet); color:#fff;">${t("مكان", "PLACE")}</span><span class="omni-name"><strong>${p.name}</strong><small>${where ? where + " • " : ""}${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°</small></span><span class="omni-go">↵</span>`;
        row.onclick = () => omniPickPlace(p);
        box.appendChild(row);
      });
    }
  }
  if (!box.children.length) box.innerHTML = `<div class="omni-empty">${t("لا توجد نتائج مطابقة", "No matching results")}</div>`;
}

function omniPick(h) {
  const o = h.obj;
  if (h.kind === "Earth") {
    if (o.bestOverall.space.body !== activeCelestialBody) switchCelestialMapBody(o.bestOverall.space.body);
    lockMasterPair(o, o.bestOverall.space);
  } else {
    if (o.body !== activeCelestialBody) switchCelestialMapBody(o.body);
    const best = EARTH_SITES.map(e => ({ e, ...calcMatch(e.metrics, o.metrics) })).sort((a, b) => b.score - a.score)[0];
    lockMasterPair(best.e, o);
  }
  renderBidirectionalMatcher();
  document.getElementById("omniResults").hidden = true;
  document.getElementById("stage-matcher").scrollIntoView({ behavior: "smooth" });
}

// Geocoded place: fly the Earth map there (building-level zoom), then run the live 3x3 DEM scan.
async function omniPickPlace(p) {
  document.getElementById("omniResults").hidden = true;
  document.getElementById("stage-maps").scrollIntoView({ behavior: "smooth" });
  earthMap.flyTo([p.lat, p.lon], 14, { duration: 1.6 });
  await liveScanEarthCoordinate(p.lat, p.lon, p);
}

function initOmnibar() {
  const input = document.getElementById("omniInput");
  input.addEventListener("input", () => { scheduleGeocode(); renderOmniResults(); });
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const hits = omniSearch(input.value);
      if (hits[0]) { omniPick(hits[0]); return; }
      if (omniGeo.status === "done" && omniGeo.items[0]) { omniPickPlace(omniGeo.items[0]); return; }
      if (omniGeoAllowed()) {
        clearTimeout(omniGeo.timer);
        omniGeo.q = input.value.trim();
        omniGeo.status = "loading";
        renderOmniResults();
        runGeocode(omniGeo.q).then(() => { if (omniGeo.items[0]) omniPickPlace(omniGeo.items[0]); });
      }
    }
    if (ev.key === "Escape") { input.value = ""; scheduleGeocode(); renderOmniResults(); input.blur(); }
  });
  document.getElementById("omniClear").onclick = () => { input.value = ""; scheduleGeocode(); renderOmniResults(); input.focus(); };
  document.querySelectorAll("#omniChips .omni-chip").forEach(c => c.onclick = () => {
    omniScope = c.dataset.scope;
    document.querySelectorAll("#omniChips .omni-chip").forEach(x => x.classList.toggle("active", x === c));
    scheduleGeocode();
    renderOmniResults();
  });
  document.addEventListener("click", ev => {
    if (!document.getElementById("omnibar").contains(ev.target)) document.getElementById("omniResults").hidden = true;
  });
  input.addEventListener("focus", () => { if (input.value.trim()) renderOmniResults(); });
  document.addEventListener("keydown", ev => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (ev.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) { ev.preventDefault(); input.focus(); input.select(); }
  });
}

let searchDirection = "earth-to-space";
let targetBodyFilter = "all";
let activeCelestialBody = "Mars";
let falseColorShaderOn = true;
let activeEarthSite = EARTH_SITES[0];
let activeSpaceSite = CELESTIAL_ZONES[0];
let scanCounter = 0;

let earthMap, planetaryMap, earthTileLayer, planetaryTileLayer;
let earthMarkersGroup, spaceMarkersGroup;
let radarChart, profileChart, globalBarChart, featureContribChart;
const holoState = { rotX: 0.58, rotZ: 0.62, dragging: false, lx: 0, ly: 0, dualOverlay: true };

/* =====================================================================
   2. THREE.JS VESPER PARTICLE MORPHING ENGINE
   ===================================================================== */
let scene, camera, renderer, particleSystem, particleMaterial;
const PARTICLE_COUNT = 34000;
const shapes = [[], [], []];
let currentMorphTarget = 0;
let mouseNormX = 0, mouseNormY = 0;

// Live scene state the render loop eases toward (opacity + colour tint). The orb starts faint.
const sceneState = { opacity: 0.16, tint: new THREE.Color("#ffffff") };
const THEME_TINTS = { vesper: "#ffffff", moon: "#8ff3ff", mars: "#ff9a7a", deep: "#d8b4fe" };

// Section -> particle shape (0 Orb, 1 Spiral, 2 Crater DEM), colour theme and target brightness.
const SECTION_SCENES = {
  "stage-hero":    { morph: 0, theme: "vesper", opacity: 0.16 },
  "stage-maps":    { morph: 0, theme: "moon",   opacity: 0.30 },
  "stage-search":  { morph: 0, theme: "moon",   opacity: 0.30 },
  "stage-matcher": { morph: 1, theme: "mars",   opacity: 0.46 },
  "stage-optical": { morph: 2, theme: "deep",   opacity: 0.56 },
  "stage-rover":   { morph: 2, theme: "mars",   opacity: 0.34 },
  "stage-lab":     { morph: 2, theme: "vesper", opacity: 0.26 }
};

function initVesperWebGL() {
  const canvas = document.getElementById("webglStage");
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 115;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  const cMint = new THREE.Color("#4ade80");
  const cCyan = new THREE.Color("#22d3ee");
  const cViolet = new THREE.Color("#818cf8");

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const rBase = 34 + 6 * Math.sin(u * 5) * Math.cos(v * 4);
    const x0 = rBase * Math.sin(v) * Math.cos(u);
    const y0 = rBase * Math.sin(v) * Math.sin(u);
    const z0 = rBase * Math.cos(v);
    shapes[0].push(x0, y0, z0);

    const arm = i % 3;
    const radius = Math.pow(Math.random(), 0.7) * 68;
    const spinAngle = radius * 0.14 + (arm * (Math.PI * 2)) / 3;
    shapes[1].push(
      Math.cos(spinAngle) * radius + (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * (12 / (1 + radius * 0.08)) - 6,
      Math.sin(spinAngle) * radius + (Math.random() - 0.5) * 4
    );

    const gx = ((i % 185) / 185 - 0.5) * 110;
    const gz = (Math.floor(i / 185) / 185 - 0.5) * 110;
    const dist = Math.sqrt(gx * gx + gz * gz);
    const craterRim = Math.exp(-Math.pow((dist - 26) / 7, 2)) * 16 - Math.exp(-Math.pow(dist / 18, 2)) * 14;
    shapes[2].push(gx, craterRim + Math.sin(gx * 0.25) * 2.2 - 6, gz);

    positions[i * 3] = x0;
    positions[i * 3 + 1] = y0;
    positions[i * 3 + 2] = z0;

    const mixRatio = (y0 + 40) / 80;
    const col = cMint.clone().lerp(cCyan, Math.min(1, Math.max(0, mixRatio))).lerp(cViolet, Math.pow(Math.random(), 2));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.65,
    vertexColors: true,
    transparent: true,
    opacity: sceneState.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleMaterial = material;
  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let clock = 0;
  function animate() {
    clock += 0.011;
    const posAttr = particleSystem.geometry.attributes.position;
    const arr = posAttr.array;
    const targetArr = shapes[currentMorphTarget];

    for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
      arr[i] += (targetArr[i] - arr[i]) * 0.05;
      arr[i + 1] += (targetArr[i + 1] - arr[i + 1]) * 0.05;
      arr[i + 2] += (targetArr[i + 2] - arr[i + 2]) * 0.05;
    }
    posAttr.needsUpdate = true;

    particleSystem.rotation.y = clock * 0.16 + mouseNormX * 0.3;
    particleSystem.rotation.x = Math.sin(clock * 0.25) * 0.14 + mouseNormY * 0.2;

    particleMaterial.opacity += (sceneState.opacity - particleMaterial.opacity) * 0.04;
    particleMaterial.color.lerp(sceneState.tint, 0.05);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

function setParticleMorph(idx, btn) {
  currentMorphTarget = idx;
  // Keep the three shape buttons in sync whether the change came from a click or from scrolling.
  document.querySelectorAll('button[onclick^="setParticleMorph"]').forEach((b, i) => b.classList.toggle("active", i === idx));
}

function setThemeSpectrum(themeKey) {
  document.documentElement.setAttribute("data-theme", themeKey);
  sceneState.tint.set(THEME_TINTS[themeKey] || "#ffffff");
}

function applySceneForSection(id) {
  const sc = SECTION_SCENES[id];
  if (!sc) return;
  setParticleMorph(sc.morph);
  setThemeSpectrum(sc.theme);
  sceneState.opacity = sc.opacity;
  const link = document.querySelector(`.nav-links a[href="#${id}"]`);
  if (link) {
    document.querySelectorAll(".nav-links a").forEach(a => a.classList.toggle("active", a === link));
  }
}

// A thin band across the middle of the viewport decides which section is "active".
function initScrollScenes() {
  if (!("IntersectionObserver" in window)) return;
  let current = null;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && en.target.id !== current) {
        current = en.target.id;
        applySceneForSection(current);
      }
    });
  }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  Object.keys(SECTION_SCENES).forEach(id => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
  applySceneForSection("stage-hero");
}

/* =====================================================================
   3. CURSOR SPOTLIGHT & EUCLIDEAN ENGINE
   ===================================================================== */
function initCursorAndScroll() {
  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  let mx = window.innerWidth / 2, my = window.innerHeight / 2, rx = mx, ry = my;

  window.addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    mouseNormX = (mx / window.innerWidth - 0.5) * 2;
    mouseNormY = (my / window.innerHeight - 0.5) * 2;
    if (dot) { dot.style.left = `${mx}px`; dot.style.top = `${my}px`; }
    document.querySelectorAll(".liquid-card").forEach(card => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${mx - r.left}px`);
      card.style.setProperty("--mouse-y", `${my - r.top}px`);
    });
  });

  function loop() {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    if (ring) { ring.style.left = `${rx}px`; ring.style.top = `${ry}px`; }
    requestAnimationFrame(loop);
  }
  loop();

  window.addEventListener("scroll", () => {
    const st = window.scrollY;
    const dh = document.documentElement.scrollHeight - window.innerHeight;
    document.getElementById("scrollProgressBar").style.width = `${Math.min(100, (st / (dh || 1)) * 100)}%`;
  });
}

function norm(v, k) {
  return Math.max(0, Math.min(1, (v - BOUNDS[k].min) / (BOUNDS[k].max - BOUNDS[k].min)));
}

function calcMatch(m1, m2) {
  let wSum = 0, sq = 0;
  const parts = {};
  KEYS.forEach(k => {
    wSum += weights[k];
    const d = Math.abs(norm(m1[k], k) - norm(m2[k], k));
    sq += weights[k] * d * d;
    parts[k] = Math.round(Math.max(0, (1 - d) * 100));
  });
  const score = Number(Math.max(0, (1 - Math.sqrt(sq / (wSum || 1))) * 100).toFixed(1));
  return { score, parts };
}

function recomputeAllPairings() {
  let bestMoon = { score: 0, e: null, s: null }, bestMars = { score: 0, e: null, s: null };
  EARTH_SITES.forEach(e => {
    const ranked = CELESTIAL_ZONES.map(s => ({ space: s, ...calcMatch(e.metrics, s.metrics) })).sort((a, b) => b.score - a.score);
    e.allMatches = ranked;
    e.bestOverall = ranked[0];
    e.bestMoon = ranked.find(m => m.space.body === "Moon");
    e.bestMars = ranked.find(m => m.space.body === "Mars");
    if (e.bestMoon.score > bestMoon.score) bestMoon = { score: e.bestMoon.score, e, s: e.bestMoon.space };
    if (e.bestMars.score > bestMars.score) bestMars = { score: e.bestMars.score, e, s: e.bestMars.space };
  });

  document.getElementById("kpiTotalSites").textContent = EARTH_SITES.length + CELESTIAL_ZONES.length;
  document.getElementById("kpiScannedCount").textContent = t(`${EARTH_SITES.length} خلايا نشطة`, `${EARTH_SITES.length} active cells`);
  if (bestMoon.e) {
    document.getElementById("kpiMoonTopScore").textContent = `${bestMoon.score}%`;
    document.getElementById("kpiMoonTopPair").textContent = `${bestMoon.e.name} ⇄ ${bestMoon.s.name}`;
  }
  if (bestMars.e) {
    document.getElementById("kpiMarsTopScore").textContent = `${bestMars.score}%`;
    document.getElementById("kpiMarsTopPair").textContent = `${bestMars.e.name} ⇄ ${bestMars.s.name}`;
  }
}

function getEarthSatelliteImg(lat, lon) {
  const d = 0.085;
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lon-d},${lat-d},${lon+d},${lat+d}&bboxSR=4326&size=750,480&format=jpg&f=image`;
}

/* =====================================================================
   4. DUAL SYNCHRONIZED TOPOGRAPHIC MAPS
   ===================================================================== */
// Tiles stop at maxNativeZoom; Leaflet upscales them up to EARTH_MAX_ZOOM for building-level views.
const EARTH_MAX_ZOOM = 21;
const EARTH_TILES = {
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxNativeZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
  topo: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", maxNativeZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA), SRTM" },
  gibs: { url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg", maxNativeZoom: 8, attribution: "NASA GIBS Blue Marble" }
};
function makeEarthLayer(key) {
  const c = EARTH_TILES[key] || EARTH_TILES.sat;
  return L.tileLayer(c.url, { maxZoom: EARTH_MAX_ZOOM, maxNativeZoom: c.maxNativeZoom, attribution: c.attribution });
}

const PLANETARY_TILES = {
  Mars: "https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png",
  Moon: "https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png"
};

function initDualMaps() {
  earthMap = L.map("earthMap", { center: [20, 0], zoom: 1, minZoom: 1, maxZoom: EARTH_MAX_ZOOM, worldCopyJump: true });
  const layerSelect = document.getElementById("earthLayerSelect");
  if (layerSelect) layerSelect.value = "sat";
  earthTileLayer = makeEarthLayer("sat").addTo(earthMap);
  earthMarkersGroup = L.layerGroup().addTo(earthMap);

  planetaryMap = L.map("planetaryMap", { center: [18.38, 77.58], zoom: 4, minZoom: 2, maxZoom: 7 });
  planetaryTileLayer = L.tileLayer(PLANETARY_TILES.Mars, { maxZoom: 7 }).addTo(planetaryMap);
  spaceMarkersGroup = L.layerGroup().addTo(planetaryMap);

  earthMap.on("click", async (e) => {
    await liveScanEarthCoordinate(e.latlng.lat, e.latlng.lng);
  });

  renderEarthMarkers();
  renderPlanetaryMarkers();
}

function changeEarthBasemap(key) {
  earthMap.removeLayer(earthTileLayer);
  earthTileLayer = makeEarthLayer(key).addTo(earthMap);
}

function switchCelestialMapBody(bodyName) {
  activeCelestialBody = bodyName;
  document.getElementById("btnTargetMars").classList.toggle("active", bodyName === "Mars");
  document.getElementById("btnTargetMoon").classList.toggle("active", bodyName === "Moon");
  setSpacePaneLabels(bodyName);
  document.getElementById("spaceDot").style.background = bodyName === "Mars" ? "var(--mars)" : "var(--cyan)";

  planetaryMap.removeLayer(planetaryTileLayer);
  planetaryTileLayer = L.tileLayer(PLANETARY_TILES[bodyName], { maxZoom: 7 }).addTo(planetaryMap);
  applyShaderClass();
  renderPlanetaryMarkers();

  const best = activeEarthSite.allMatches.find(m => m.space.body === bodyName) || activeEarthSite.bestOverall;
  lockMasterPair(activeEarthSite, best.space, false);
}

function toggleFalseColorDEM() {
  falseColorShaderOn = !falseColorShaderOn;
  setThermalLabel();
  applyShaderClass();
}

function applyShaderClass() {
  const box = document.getElementById("planetaryMapBox");
  box.classList.remove("dem-thermal-shader", "dem-mars-shader");
  if (!falseColorShaderOn) return;
  box.classList.add(activeCelestialBody === "Moon" ? "dem-thermal-shader" : "dem-mars-shader");
}

function renderEarthMarkers() {
  earthMarkersGroup.clearLayers();
  EARTH_SITES.forEach(e => {
    const m = L.circleMarker([e.lat, e.lon], { radius: 8, color: "#fff", weight: 1.5, fillColor: "#4ade80", fillOpacity: 0.92 });
    m.bindTooltip(`${e.name} (${e.country})`);
    m.on("click", (ev) => {
      L.DomEvent.stopPropagation(ev);
      if (e.bestOverall.space.body !== activeCelestialBody) switchCelestialMapBody(e.bestOverall.space.body);
      lockMasterPair(e, e.bestOverall.space);
    });
    earthMarkersGroup.addLayer(m);
  });
}

function renderPlanetaryMarkers() {
  spaceMarkersGroup.clearLayers();
  CELESTIAL_ZONES.filter(z => z.body === activeCelestialBody).forEach(z => {
    const col = z.body === "Mars" ? "#ff5533" : "#00f0ff";
    const m = L.circleMarker([z.lat, z.lon], { radius: 9, color: "#fff", weight: 2, fillColor: col, fillOpacity: 0.92 });
    m.bindTooltip(`[${z.id}] ${z.name}`);
    m.on("click", () => {
      const rankedE = EARTH_SITES.map(e => ({ e, ...calcMatch(e.metrics, z.metrics) })).sort((a, b) => b.score - a.score);
      lockMasterPair(rankedE[0].e, z);
    });
    spaceMarkersGroup.addLayer(m);
  });
}

async function liveScanEarthCoordinate(lat, lon, place = null) {
  document.getElementById("earthHudCoords").textContent = t(`جارٍ مسح DEM حي 3×3 عند [${lat.toFixed(2)}°، ${lon.toFixed(2)}°]...`, `SCANNING LIVE 3×3 SRTM DEM AT [${lat.toFixed(2)}°, ${lon.toFixed(2)}°]...`);
  const d = 0.01, lats = [], lons = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { lats.push((lat + dy * d).toFixed(4)); lons.push((lon + dx * d).toFixed(4)); }

  let elevs = null;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`);
    const j = await r.json();
    if (j?.elevation?.length === 9) elevs = j.elevation.map(v => Number(v) || 0);
  } catch (_) {}

  if (!elevs) {
    const b = Math.abs(Math.sin(lat * 0.1) * Math.cos(lon * 0.1)) * 2200 + 400;
    elevs = Array.from({ length: 9 }, (_, i) => b + Math.sin(i * 1.7 + lat) * 90);
  }

  const meanElev = Math.round(Math.max(1500, Math.min(3000, elevs.reduce((a, b) => a + b, 0) / 9)));
  const relief = Math.round(Math.max(150, Math.min(620, (Math.max(...elevs) - Math.min(...elevs)) * 3.4 + 180)));
  const dzDx = (elevs[5] - elevs[3]) / 2220, dzDy = (elevs[1] - elevs[7]) / 2220;
  const slope = Number(Math.max(3.2, Math.min(16.0, Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy)) * (180 / Math.PI) * 2.5 + 3.8)).toFixed(1));
  const roughness = Number(Math.max(2.8, Math.min(8.6, slope * 0.52 + 0.9)).toFixed(1));

  scanCounter++;
  const newSite = {
    id: `SCAN-0${scanCounter}`,
    name: place ? place.name : `Orbital Scan [${lat.toFixed(2)}°, ${lon.toFixed(2)}°]`,
    country: place ? (place.country || place.admin || "Live DEM Sample") : "Live DEM Sample",
    lat: Number(lat.toFixed(3)),
    lon: Number(lon.toFixed(3)),
    logistics: "Tier-2 (Custom Coordinate)",
    metrics: { elevation: meanElev, slope, roughness, local_relief: relief }
  };

  EARTH_SITES.unshift(newSite);
  recomputeAllPairings();
  initDropdownSelectors();
  renderEarthMarkers();
  renderBidirectionalMatcher();
  renderGlobalMatrixTable();

  if (newSite.bestOverall.space.body !== activeCelestialBody) switchCelestialMapBody(newSite.bestOverall.space.body);
  lockMasterPair(newSite, newSite.bestOverall.space, false);
}

/* =====================================================================
   5. BIDIRECTIONAL 3-COLUMN MATCHER & MASTER PAIR SYNCHRONIZATION
   ===================================================================== */
function setSearchDirection(dir) {
  searchDirection = dir;
  document.getElementById("dirEarthToSpace").classList.toggle("active", dir === "earth-to-space");
  document.getElementById("dirSpaceToEarth").classList.toggle("active", dir === "space-to-earth");
  document.getElementById("targetBodyFilterPills").style.display = dir === "earth-to-space" ? "flex" : "none";
  renderBidirectionalMatcher();
}

function setTargetBodyFilter(bodyKey) {
  targetBodyFilter = bodyKey;
  document.querySelectorAll("#targetBodyFilterPills .pill-btn").forEach(b => b.classList.toggle("active", b.dataset.body === bodyKey));
  renderBidirectionalMatcher();
}

function renderBidirectionalMatcher() {
  const srcEl = document.getElementById("sourceCardsList");
  const rnkEl = document.getElementById("rankedMatchesList");
  srcEl.innerHTML = ""; rnkEl.innerHTML = "";

  if (searchDirection === "earth-to-space") {
    document.getElementById("sourceColLabel").textContent = t("1. اختر موقعاً على الأرض", "1. Pick a site on Earth");
    document.getElementById("rankedColLabel").textContent = t("2. التوائم الفضائية المرتبة", "2. Space twins ranked by match");

    EARTH_SITES.forEach(e => {
      const item = document.createElement("div");
      item.className = `match-item-card ${e.id === activeEarthSite.id ? 'selected' : ''}`;
      item.innerHTML = `
        <img class="match-thumb" src="${getEarthSatelliteImg(e.lat, e.lon)}" alt="${e.name}" loading="lazy" />
        <div class="match-meta">
          <h4>[${e.id}] ${e.name}</h4>
          <small>${e.country} • ${t("الميل", "Slope")} ${e.metrics.slope}° • ${t("الخشونة", "Rough")} ${e.metrics.roughness}m</small>
        </div>
        <span class="match-score-pill">${e.bestOverall.score}%</span>
      `;
      item.onclick = () => {
        activeEarthSite = e;
        const filtered = e.allMatches.filter(m => targetBodyFilter === "all" ? true : m.space.body === targetBodyFilter);
        lockMasterPair(e, (filtered[0] || e.bestOverall).space);
        renderBidirectionalMatcher();
      };
      srcEl.appendChild(item);
    });

    const filtered = activeEarthSite.allMatches.filter(m => targetBodyFilter === "all" ? true : m.space.body === targetBodyFilter);
    document.getElementById("rankedCountBadge").textContent = t(`${filtered.length} منطقة`, `${filtered.length} ZONES`);

    filtered.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = `match-item-card ${m.space.id === activeSpaceSite.id ? 'selected' : ''}`;
      item.innerHTML = `
        <img class="match-thumb" src="${m.space.image}" alt="${m.space.name}" loading="lazy" />
        <div class="match-meta">
          <h4>#${idx + 1} [${bodyName(m.space.body)}] ${m.space.name}</h4>
          <small>${t("الميل", "Slope")} ${m.space.metrics.slope}° • ${t("الخشونة", "Rough")} ${m.space.metrics.roughness}m</small>
        </div>
        <span class="match-score-pill">${m.score}%</span>
      `;
      item.onclick = () => {
        lockMasterPair(activeEarthSite, m.space);
        renderBidirectionalMatcher();
      };
      rnkEl.appendChild(item);
    });

  } else {
    document.getElementById("sourceColLabel").textContent = t("1. اختر منطقة على القمر أو المريخ", "1. Pick a zone on the Moon or Mars");
    document.getElementById("rankedColLabel").textContent = t("2. أقرب الشبيهات على كوكب الأرض", "2. Closest analogs on Earth");

    CELESTIAL_ZONES.forEach(s => {
      const item = document.createElement("div");
      item.className = `match-item-card ${s.id === activeSpaceSite.id ? 'selected' : ''}`;
      item.innerHTML = `
        <img class="match-thumb" src="${s.image}" alt="${s.name}" loading="lazy" />
        <div class="match-meta">
          <h4>[${bodyTag(s.body)}] ${s.name}</h4>
          <small>${s.instrument} • ${t("الميل", "Slope")} ${s.metrics.slope}°</small>
        </div>
      `;
      item.onclick = () => {
        activeSpaceSite = s;
        const rankedE = EARTH_SITES.map(e => ({ e, ...calcMatch(e.metrics, s.metrics) })).sort((a, b) => b.score - a.score);
        lockMasterPair(rankedE[0].e, s);
        renderBidirectionalMatcher();
      };
      srcEl.appendChild(item);
    });

    const rankedE = EARTH_SITES.map(e => ({ e, ...calcMatch(e.metrics, activeSpaceSite.metrics) })).sort((a, b) => b.score - a.score);
    document.getElementById("rankedCountBadge").textContent = `${rankedE.length} EARTH SITES`;

    rankedE.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = `match-item-card ${m.e.id === activeEarthSite.id ? 'selected' : ''}`;
      item.innerHTML = `
        <img class="match-thumb" src="${getEarthSatelliteImg(m.e.lat, m.e.lon)}" alt="${m.e.name}" loading="lazy" />
        <div class="match-meta">
          <h4>#${idx + 1} ${m.e.name}</h4>
          <small>${m.e.country} • ${t("الميل", "Slope")} ${m.e.metrics.slope}°</small>
        </div>
        <span class="match-score-pill">${m.score}%</span>
      `;
      item.onclick = () => {
        lockMasterPair(m.e, activeSpaceSite);
        renderBidirectionalMatcher();
      };
      rnkEl.appendChild(item);
    });
  }
}

/* =====================================================================
   6. MASTER LOCK: UPDATES MAPS, MATCHER, CURTAIN, 3D HOLOGRAM, ROVER & CHARTS
   ===================================================================== */
function lockMasterPair(earthObj, spaceObj, flyEarth = true) {
  activeEarthSite = earthObj;
  activeSpaceSite = spaceObj;
  const res = calcMatch(earthObj.metrics, spaceObj.metrics);

  if (flyEarth && earthMap) earthMap.flyTo([earthObj.lat, earthObj.lon], 6, { duration: 1.0 });
  if (planetaryMap) planetaryMap.flyTo([spaceObj.lat, spaceObj.lon], 4, { duration: 1.0 });

  // 1. Update Hero & Map Bridge
  document.getElementById("heroSimReadout").textContent = `${res.score}%`;
  document.getElementById("heroPairReadout").textContent = `${earthObj.name.split(" ")[0]} ⇄ ${spaceObj.name.split(" ")[0]}`;
  document.getElementById("earthHudCoords").textContent = t(`خط العرض: ${earthObj.lat}° | خط الطول: ${earthObj.lon}° (${earthObj.name})`, `LAT: ${earthObj.lat}° | LON: ${earthObj.lon}° (${earthObj.name})`);
  document.getElementById("spaceHudCoords").textContent = `${bodyTag(spaceObj.body)}: ${spaceObj.lat}°, ${spaceObj.lon}° (${spaceObj.name})`;

  document.getElementById("bridgeLockCode").textContent = `${earthObj.id} ⇄ ${spaceObj.id}`;
  document.getElementById("bridgeScorePct").textContent = `${res.score}%`;
  document.getElementById("bridgePairNames").textContent = `${earthObj.name} ⇄ ${spaceObj.name}`;
  document.getElementById("bridgeGeologyNote").textContent = zoneNote(spaceObj);

  document.getElementById("vSlopeTxt").textContent = `${earthObj.metrics.slope}° ${t("مقابل", "vs")} ${spaceObj.metrics.slope}° (${res.parts.slope}%)`;
  document.getElementById("vSlopeBar").style.width = `${res.parts.slope}%`;
  document.getElementById("vRoughTxt").textContent = `${earthObj.metrics.roughness}m ${t("مقابل", "vs")} ${spaceObj.metrics.roughness}m (${res.parts.roughness}%)`;
  document.getElementById("vRoughBar").style.width = `${res.parts.roughness}%`;
  document.getElementById("vReliefTxt").textContent = `${earthObj.metrics.local_relief}m ${t("مقابل", "vs")} ${spaceObj.metrics.local_relief}m (${res.parts.local_relief}%)`;
  document.getElementById("vReliefBar").style.width = `${res.parts.local_relief}%`;
  document.getElementById("vElevTxt").textContent = `${earthObj.metrics.elevation}m ${t("مقابل", "vs")} ${spaceObj.metrics.elevation}m (${res.parts.elevation}%)`;
  document.getElementById("vElevBar").style.width = `${res.parts.elevation}%`;

  // 2. Update Center Twin Showcase in Section 03
  const earthImg = getEarthSatelliteImg(earthObj.lat, earthObj.lon);
  document.getElementById("twinLockShowcase").innerHTML = `
    <div>
      <div class="pane-header">
        <span class="pane-title">${t("قفل تقارب التوأم", "TWIN CONVERGENCE LOCK")}: ${earthObj.id} ⇄ ${spaceObj.id}</span>
        <span class="pill-btn active" style="padding:3px 12px;">${res.score}% ${t("تطابق", "MATCH")}</span>
      </div>
      <h3 style="font-size:1.08rem; margin-top:8px;">${earthObj.name} <span style="color:var(--accent-primary);">⇄</span> ${spaceObj.name}</h3>
      <p style="font-size:0.8rem; color:var(--text-dim); margin-top:4px;">${zoneNote(spaceObj)}</p>
    </div>
    <div class="twin-dual-photos">
      <div class="twin-photo-box">
        <img src="${earthImg}" alt="${earthObj.name}" />
        <div class="twin-photo-tag">${t("الأرض", "EARTH")} // ${earthObj.country.toUpperCase()}</div>
      </div>
      <div class="twin-photo-box">
        <img src="${spaceObj.image}" alt="${spaceObj.name}" />
        <div class="twin-photo-tag">${bodyTag(spaceObj.body)} // ${spaceObj.id}</div>
      </div>
    </div>
    <div class="four-metrics-strip">
      <div class="m-cell"><span>${t("الميل (أرض/فضاء)", "SLOPE (E/S)")}</span><strong>${earthObj.metrics.slope}° / ${spaceObj.metrics.slope}°</strong></div>
      <div class="m-cell"><span>${t("الخشونة (أرض/فضاء)", "ROUGH (E/S)")}</span><strong>${earthObj.metrics.roughness}m / ${spaceObj.metrics.roughness}m</strong></div>
      <div class="m-cell"><span>${t("التضاريس (أرض/فضاء)", "RELIEF (E/S)")}</span><strong>${earthObj.metrics.local_relief}m / ${spaceObj.metrics.local_relief}m</strong></div>
      <div class="m-cell"><span>${t("الارتفاع (أرض/فضاء)", "ELEV (E/S)")}</span><strong>${earthObj.metrics.elevation}m / ${spaceObj.metrics.elevation}m</strong></div>
    </div>
    <a href="#stage-optical" class="pill-btn btn-primary-glow" style="text-align:center; padding:10px;">${t("فحص بالستارة البصرية والهولوجرام 3D ↓", "Inspect with the optical curtain & 3D hologram ↓")}</a>
  `;

  // 3. Update Split-Screen Curtain & Dropdowns in Section 04
  const eSel = document.getElementById("earthPairSelect");
  const sSel = document.getElementById("spacePairSelect");
  if (eSel) eSel.value = earthObj.id;
  if (sSel) sSel.value = spaceObj.id;

  document.getElementById("opticalMatchBadge").textContent = `${res.score}% ${t("تطابق", "MATCH")}`;
  document.getElementById("curtainEarthImg").src = earthImg;
  document.getElementById("curtainSpaceImg").src = spaceObj.image;
  document.getElementById("curtainEarthTag").textContent = `${t("الأرض", "EARTH")} // ${earthObj.name.toUpperCase()}`;
  document.getElementById("curtainSpaceTag").textContent = `${bodyTag(spaceObj.body)} // ${spaceObj.name.toUpperCase()}`;

  document.getElementById("plainInsightBox").innerHTML = `
    ${currentLang === "ar"
      ? `💡 <strong>شرح مبسط:</strong> تتطابق منطقة <strong>${earthObj.name} (${earthObj.country})</strong> مع <strong>${spaceObj.name}</strong> على سطح <strong>${bodyName(spaceObj.body)}</strong> بنسبة <strong>${res.score}%</strong>؛ حيث يبلغ انحدار الأرض <strong>${earthObj.metrics.slope}°</strong> مقابل <strong>${spaceObj.metrics.slope}°</strong>، وخشونة الصخور <strong>${earthObj.metrics.roughness}م</strong> مقابل <strong>${spaceObj.metrics.roughness}م</strong>.`
      : `💡 <strong>Plain-language insight:</strong> <strong>${earthObj.name} (${earthObj.country})</strong> matches <strong>${spaceObj.name}</strong> on the surface of <strong>${spaceObj.body}</strong> at <strong>${res.score}%</strong>: Earth's slope is <strong>${earthObj.metrics.slope}°</strong> versus <strong>${spaceObj.metrics.slope}°</strong>, and rock roughness is <strong>${earthObj.metrics.roughness} m</strong> versus <strong>${spaceObj.metrics.roughness} m</strong>.`}
  `;

  document.getElementById("visualFourMetrics").innerHTML = `
    <div class="m-cell"><span>${t("تطابق الميل", "SLOPE MATCH")}</span><strong>${res.parts.slope}%</strong></div>
    <div class="m-cell"><span>${t("تطابق الخشونة", "ROUGH MATCH")}</span><strong>${res.parts.roughness}%</strong></div>
    <div class="m-cell"><span>${t("تطابق التضاريس", "RELIEF MATCH")}</span><strong>${res.parts.local_relief}%</strong></div>
    <div class="m-cell"><span>${t("تطابق الارتفاع", "ELEV MATCH")}</span><strong>${res.parts.elevation}%</strong></div>
  `;

  // 4. Update Rover Tilt, Gravity Sandbox & EVA Energy Simulator in Section 05
  renderRoverAndGravitySimulator(earthObj, spaceObj);

  // 5. Update All 4 Charts & NASA Live Stream in Section 06
  renderAllFourCharts(earthObj, spaceObj);
  streamNasaPhotos(spaceObj.nasaQuery);
}

function renderRoverAndGravitySimulator(earthObj, spaceObj) {
  const limitDeg = 15.0;
  const margin = (limitDeg - earthObj.metrics.slope).toFixed(1);
  const isSafe = earthObj.metrics.slope <= limitDeg;
  document.getElementById("kpiRoverMargin").textContent = `${margin > 0 ? '+' + margin : margin}° ${isSafe ? t('آمن', 'safe') : t('حرج', 'critical')}`;

  document.getElementById("roverTiltCard").innerHTML = `
    <span class="section-eyebrow">${t("01 // ميل هيكل الروفر وهامش الانقلاب", "01 // ROVER CHASSIS TILT & ROLLOVER MARGIN")}</span>
    <h3>${t("اتزان المركبة وزاوية الانقلاب", "Rover stability and rollover angle")}</h3>
    <div class="rover-gauge-box">
      <div>
        <div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim);">${t("متوسط ميل التضاريس", "MEAN TERRAIN SLOPE")}</div>
        <div style="font-family:var(--font-mono); font-size:2rem; font-weight:800; color:${isSafe ? '#4ade80' : '#fb7185'};">${earthObj.metrics.slope}°</div>
        <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-dim);">${t(`هامش الأمان: ${margin}° عن حد الانقلاب (15°)`, `Safety margin: ${margin}° below the rollover limit (15°)`)}</div>
      </div>
      <div style="width:88px; height:88px; border-radius:50%; border:2px dashed rgba(255,255,255,0.3); display:flex; align-items:center; justify-content:center;">
        <div style="width:58px; height:10px; background:var(--accent-primary); border-radius:4px; transform:rotate(-${earthObj.metrics.slope}deg); box-shadow:0 0 14px var(--accent-primary);"></div>
      </div>
    </div>
    <p style="font-size:0.8rem; color:var(--text-dim); margin-top:10px;">
      ${t("الجدوى اللوجستية للموقع الأرضي:", "Earth-site logistics:")} <strong style="color:var(--text-main);">${fmtLogistics(earthObj.logistics || 'Tier-1 Accessible')}</strong>
    </p>
  `;

  const roverMass = 900;
  const eqWeightKg = Math.round(roverMass * (spaceObj.gravity / 9.81));
  document.getElementById("gravitySandboxCard").innerHTML = `
    <span class="section-eyebrow">${t("02 // محاكي الجاذبية الكوكبية (روفر 900 كجم)", "02 // PLANETARY GRAVITY SANDBOX (900 KG ROVER)")}</span>
    <h3>${t("محاكي الجاذبية والوزن المكافئ", "Gravity and equivalent-weight simulator")}</h3>
    <div class="four-metrics-strip" style="grid-template-columns:1fr 1fr; margin-top:14px;">
      <div class="m-cell">
        <span>${t("جاذبية", "Gravity of")} ${bodyName(spaceObj.body)}</span>
        <strong style="font-size:1.35rem; color:var(--cyan);">${spaceObj.gravity} m/s²</strong>
      </div>
      <div class="m-cell">
        <span>${t("وزن الروفر المكافئ (900 كجم)", "Equivalent rover weight (900 kg)")}</span>
        <strong style="font-size:1.35rem; color:var(--accent-primary);">${eqWeightKg} ${t("كجم", "kg")}</strong>
      </div>
    </div>
    <p style="font-size:0.8rem; color:var(--text-dim); margin-top:12px;">
      ${t(`المركبة التي تزن 900 كجم على الأرض (9.81 م/ث²) تضغط على تربة ${spaceObj.name} بوزن يعادل <strong>${eqWeightKg} كجم فقط</strong>، مما يقلل غوص العجلات في الثرى البركاني.`, `A rover weighing 900 kg on Earth (9.81 m/s²) presses on the soil of ${spaceObj.name} with a weight equivalent to only <strong>${eqWeightKg} kg</strong>, which reduces wheel sinkage in volcanic regolith.`)}
    </p>
  `;

  const energyWhKm = Math.round(145 + earthObj.metrics.slope * 18 + earthObj.metrics.roughness * 14);
  const total5KmKwh = ((energyWhKm * 5) / 1000).toFixed(2);
  document.getElementById("evaHazardCard").innerHTML = `
    <span class="section-eyebrow">${t("03 // طاقة مسار 5 كم وفهرس المخاطر", "03 // 5KM EVA TRAVERSE ENERGY & HAZARD INDEX")}</span>
    <h3>${t("استهلاك طاقة المسار ومخاطر السطح", "Traverse energy use and surface hazards")}</h3>
    <div class="four-metrics-strip" style="grid-template-columns:1fr 1fr; margin-top:14px;">
      <div class="m-cell">
        <span>${t("استهلاك الطاقة لكل كم", "Energy use per km")}</span>
        <strong style="font-size:1.35rem; color:var(--mars);">${energyWhKm} Wh/km</strong>
      </div>
      <div class="m-cell">
        <span>${t("إجمالي مهمة 5 كم", "5 km mission total")}</span>
        <strong style="font-size:1.35rem; color:var(--text-main);">${total5KmKwh} kWh</strong>
      </div>
    </div>
    <p style="font-size:0.8rem; color:var(--text-dim); margin-top:12px;">
      ${t("مؤشر تآكل العجلات والغبار الصخري:", "Wheel wear and rock dust index:")} <strong style="color:var(--accent-primary);">${earthObj.metrics.roughness > 6.5 ? t('مرتفع (يتطلب رادار LiDAR نشط)', 'High (requires active LiDAR)') : t('منخفض إلى متوسط (مسار قياسي)', 'Low to moderate (standard route)')}</strong>
    </p>
  `;
}

/* =====================================================================
   7. SPLIT CURTAIN, 3D DUAL HOLOGRAM & 4 CHARTS
   ===================================================================== */
function initDropdownSelectors() {
  const eSel = document.getElementById("earthPairSelect");
  const sSel = document.getElementById("spacePairSelect");
  eSel.innerHTML = ""; sSel.innerHTML = "";
  EARTH_SITES.forEach(e => {
    const o = document.createElement("option"); o.value = e.id; o.textContent = `[${e.id}] ${e.name} (${e.country})`; eSel.appendChild(o);
  });
  CELESTIAL_ZONES.forEach(s => {
    const o = document.createElement("option"); o.value = s.id; o.textContent = `[${bodyTag(s.body)}] ${s.name}`; sSel.appendChild(o);
  });
  eSel.onchange = () => {
    const e = EARTH_SITES.find(x => x.id === eSel.value) || EARTH_SITES[0];
    const s = CELESTIAL_ZONES.find(x => x.id === sSel.value) || CELESTIAL_ZONES[0];
    lockMasterPair(e, s);
  };
  sSel.onchange = eSel.onchange;

  document.getElementById("curtainSlider").oninput = (ev) => {
    document.getElementById("curtainEarthClip").style.width = `${ev.target.value}%`;
    document.getElementById("curtainDivider").style.left = `${ev.target.value}%`;
  };
}

function toggle3DDualLayer() {
  holoState.dualOverlay = !holoState.dualOverlay;
  document.getElementById("toggleDualMeshBtn").textContent = `${t("تراكب مزدوج", "DUAL OVERLAY")}: ${holoState.dualOverlay ? t("مفعّل", "ON") : t("الأرض فقط", "EARTH ONLY")}`;
}

function init3DHologramCanvas() {
  const canvas = document.getElementById("holo3DCanvas");
  canvas.onmousedown = e => { holoState.dragging = true; holoState.lx = e.clientX; holoState.ly = e.clientY; };
  window.onmouseup = () => { holoState.dragging = false; };
  window.onmousemove = e => {
    if (!holoState.dragging) return;
    holoState.rotZ += (e.clientX - holoState.lx) * 0.01;
    holoState.rotX = Math.max(0.25, Math.min(1.25, holoState.rotX + (e.clientY - holoState.ly) * 0.008));
    holoState.lx = e.clientX; holoState.ly = e.clientY;
  };

  function loop() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (r.width > 0 && (canvas.width !== r.width || canvas.height !== r.height)) {
      canvas.width = r.width; canvas.height = r.height;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!holoState.dragging) holoState.rotZ += 0.004;

    drawMesh(ctx, canvas.width, canvas.height, activeEarthSite.metrics, "#4ade80", "rgba(74,222,128,0.07)", 0);
    if (holoState.dualOverlay) drawMesh(ctx, canvas.width, canvas.height, activeSpaceSite.metrics, "#ff5533", "rgba(255,85,51,0.05)", 6);
    requestAnimationFrame(loop);
  }
  loop();
}

function drawMesh(ctx, w, h, m, stroke, fill, zOff) {
  const N = 15, step = Math.min(w, h) / 21;
  const cz = Math.cos(holoState.rotZ), sz = Math.sin(holoState.rotZ);
  const cx = Math.cos(holoState.rotX), sx = Math.sin(holoState.rotX);
  const pts = [];
  for (let y = 0; y < N; y++) {
    pts[y] = [];
    for (let x = 0; x < N; x++) {
      const nx = x - N / 2, ny = y - N / 2;
      const z = nx * (m.slope * 0.2) + Math.sin(nx * 0.45) * Math.cos(ny * 0.45) * (m.local_relief * 0.04) + Math.sin(x * 1.8 + y * 2.1) * (m.roughness * 1.2) + zOff;
      const rx = nx * step * cz - ny * step * sz, ry = nx * step * sz + ny * step * cz;
      pts[y][x] = { x: w / 2 + rx * 1.25, y: h / 2 + (ry * cx - z * sx) * 1.1 };
    }
  }
  ctx.lineWidth = 1.1; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const p1 = pts[y][x], p2 = pts[y][x+1], p3 = pts[y+1][x+1], p4 = pts[y+1][x];
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
}

function renderAllFourCharts(earthObj, spaceObj) {
  // 1. Radar Chart
  const rCtx = document.getElementById("radarChartCanvas").getContext("2d");
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(rCtx, {
    type: "radar",
    data: {
      labels: [t("الارتفاع", "Elevation"), t("الميل", "Slope"), t("الخشونة", "Roughness"), t("التضاريس المحلية", "Local Relief")],
      datasets: [
        { label: earthObj.name, data: KEYS.map(k => Math.round(norm(earthObj.metrics[k], k) * 100)), borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.18)" },
        { label: spaceObj.name, data: KEYS.map(k => Math.round(norm(spaceObj.metrics[k], k) * 100)), borderColor: "#ff5533", backgroundColor: "rgba(255,85,51,0.18)" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.08)" }, pointLabels: { color: "#f8fafc" }, ticks: { display: false } } }, plugins: { legend: { labels: { color: "#f8fafc" } } } }
  });

  // 2. 5km Cross-Section Profile Chart
  const pCtx = document.getElementById("profileChartCanvas").getContext("2d");
  if (profileChart) profileChart.destroy();
  const distLabels = Array.from({ length: 21 }, (_, i) => `${(i * 0.25).toFixed(2)}${t("كم", "km")}`);
  const gen = m => distLabels.map((_, i) => Math.round(i * Math.tan((m.slope * Math.PI) / 180) * 16 + Math.sin(i * 0.65) * (m.local_relief * 0.2) + Math.cos(i * 2.1) * (m.roughness * 4)));
  profileChart = new Chart(pCtx, {
    type: "line",
    data: {
      labels: distLabels,
      datasets: [
        { label: `${earthObj.name} (${t("م", "m")})`, data: gen(earthObj.metrics), borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.1)", fill: true, tension: 0.35 },
        { label: `${spaceObj.name} (${t("م", "m")})`, data: gen(spaceObj.metrics), borderColor: "#ff5533", borderDash: [5, 5], tension: 0.35 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: "#94a3b8" } }, y: { ticks: { color: "#94a3b8" } } }, plugins: { legend: { labels: { color: "#f8fafc" } } } }
  });

  // 3. Global Bar Chart (Moon vs Mars Best Scores across all Earth Sites)
  const gCtx = document.getElementById("globalBarChartCanvas").getContext("2d");
  if (globalBarChart) globalBarChart.destroy();
  const siteLabels = EARTH_SITES.map(e => e.id);
  globalBarChart = new Chart(gCtx, {
    type: "bar",
    data: {
      labels: siteLabels,
      datasets: [
        { label: t("أفضل توأم قمري %", "Best Moon Twin %"), data: EARTH_SITES.map(e => e.bestMoon.score), backgroundColor: "rgba(0, 240, 255, 0.75)" },
        { label: t("أفضل توأم مريخي %", "Best Mars Twin %"), data: EARTH_SITES.map(e => e.bestMars.score), backgroundColor: "rgba(255, 85, 51, 0.75)" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { color: "#94a3b8" } }, x: { ticks: { color: "#94a3b8" } } }, plugins: { legend: { labels: { color: "#f8fafc" } } } }
  });

  // 4. Feature Contribution Breakdown Chart
  const fCtx = document.getElementById("featureContribChartCanvas").getContext("2d");
  if (featureContribChart) featureContribChart.destroy();
  featureContribChart = new Chart(fCtx, {
    type: "bar",
    data: {
      labels: siteLabels,
      datasets: [
        { label: t("تطابق الميل %", "Slope Match %"), data: EARTH_SITES.map(e => e.bestOverall.parts.slope), backgroundColor: "#4ade80" },
        { label: t("تطابق الخشونة %", "Roughness Match %"), data: EARTH_SITES.map(e => e.bestOverall.parts.roughness), backgroundColor: "#22d3ee" },
        { label: t("تطابق التضاريس %", "Relief Match %"), data: EARTH_SITES.map(e => e.bestOverall.parts.local_relief), backgroundColor: "#a855f7" },
        { label: t("تطابق الارتفاع %", "Elevation Match %"), data: EARTH_SITES.map(e => e.bestOverall.parts.elevation), backgroundColor: "#fb923c" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { color: "#94a3b8" } }, x: { ticks: { color: "#94a3b8" } } }, plugins: { legend: { labels: { color: "#f8fafc" } } } }
  });
}

function renderGlobalMatrixTable() {
  const tbody = document.querySelector("#globalMatrixTable tbody");
  tbody.innerHTML = "";
  EARTH_SITES.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);">${e.id}</td>
      <td><strong>${e.name}</strong> <small style="color:var(--text-dim);">(${e.country})</small></td>
      <td style="font-family:var(--font-mono);">${e.metrics.elevation}m</td>
      <td style="font-family:var(--font-mono);">${e.metrics.slope}°</td>
      <td style="font-family:var(--font-mono);">${e.metrics.roughness}m</td>
      <td style="font-family:var(--font-mono);">${e.metrics.local_relief}m</td>
      <td style="font-family:var(--font-mono); color:var(--cyan);">${e.bestMoon.space.name} (${e.bestMoon.score}%)</td>
      <td style="font-family:var(--font-mono); color:var(--mars);">${e.bestMars.space.name} (${e.bestMars.score}%)</td>
      <td><span class="pill-btn active" style="padding:2px 10px;">${e.bestOverall.space.body} (${e.bestOverall.score}%)</span></td>
      <td><button class="pill-btn" style="padding:3px 10px;" onclick="inspectRowPair('${e.id}')">${t("فحص 3D", "Inspect 3D")}</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function inspectRowPair(earthId) {
  const e = EARTH_SITES.find(x => x.id === earthId) || EARTH_SITES[0];
  lockMasterPair(e, e.bestOverall.space);
  document.getElementById("stage-optical").scrollIntoView({ behavior: "smooth" });
}

function initSliders() {
  document.querySelectorAll(".w-slider").forEach(s => {
    s.oninput = () => {
      let sum = 0; const raw = {};
      document.querySelectorAll(".w-slider").forEach(el => { raw[el.dataset.k] = Number(el.value); sum += Number(el.value); });
      Object.keys(raw).forEach(k => {
        weights[k] = raw[k] / (sum || 1);
        document.getElementById(`wTxt-${k}`).textContent = `${Math.round(weights[k] * 100)}%`;
      });
      recomputeAllPairings();
      renderBidirectionalMatcher();
      renderGlobalMatrixTable();
      lockMasterPair(activeEarthSite, activeEarthSite.bestOverall.space, false);
    };
  });
}

function applyWeights(sl, ro, re, el) {
  const map = { slope: sl, roughness: ro, local_relief: re, elevation: el };
  document.querySelectorAll(".w-slider").forEach(s => { s.value = map[s.dataset.k]; s.dispatchEvent(new Event("input")); });
}

async function streamNasaPhotos(query) {
  const strip = document.getElementById("nasaLiveStrip");
  strip.innerHTML = `<div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${t(`جارٍ البث من images-api.nasa.gov للاستعلام [${query}]...`, `Streaming from images-api.nasa.gov for [${query}]...`)}</div>`;
  try {
    const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`);
    const j = await r.json();
    const items = (j?.collection?.items || []).slice(0, 4);
    strip.innerHTML = "";
    items.forEach(it => {
      const meta = it.data?.[0] || {}, img = it.links?.[0]?.href || "";
      const d = document.createElement("div"); d.className = "nasa-photo-item";
      d.innerHTML = `<img src="${img}" alt="NASA" loading="lazy" /><div><strong>${meta.title || t("قياسات ناسا", "NASA Telemetry")}</strong></div>`;
      strip.appendChild(d);
    });
  } catch (_) {
    strip.innerHTML = `<div style="font-size:0.75rem; color:var(--text-dim);">${t("واجهة ناسا المباشرة جاهزة.", "NASA Live API ready.")}</div>`;
  }
}

function exportCSV() {
  const rows = EARTH_SITES.map(e => [
    e.id, `"${e.name}"`, e.country, e.metrics.elevation, e.metrics.slope, e.metrics.roughness, e.metrics.local_relief, `"${e.bestMoon.space.name}"`, e.bestMoon.score, `"${e.bestMars.space.name}"`, e.bestMars.score
  ].join(","));
  const a = document.createElement("a");
  a.href = encodeURI("data:text/csv;charset=utf-8,ID,Earth_Site,Country,Elev_m,Slope_deg,Rough_m,Relief_m,Best_Lunar_Twin,Lunar_Score,Best_Martian_Twin,Martian_Score\n" + rows.join("\n"));
  a.download = "TerraAnalog_Full_Atlas_2026.csv";
  a.click();
}

function generateMissionDossier() {
  const res = calcMatch(activeEarthSite.metrics, activeSpaceSite.metrics);
  const dossier = {
    mission: "NASA Space Apps 2026 — TerraAnalog Mission Brief",
    timestamp: new Date().toISOString(),
    earth_analog_site: activeEarthSite,
    celestial_twin_target: activeSpaceSite,
    convergence_score_pct: res.score,
    vector_match_breakdown: res.parts,
    active_weights: weights
  };
  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Mission_Dossier_${activeEarthSite.id}_${activeSpaceSite.id}.json`;
  a.click();
}

document.addEventListener("DOMContentLoaded", () => {
  registerStaticI18n();
  initVesperWebGL();
  initScrollScenes();
  initCursorAndScroll();
  recomputeAllPairings();
  initDropdownSelectors();
  initDualMaps();
  init3DHologramCanvas();
  renderBidirectionalMatcher();
  renderGlobalMatrixTable();
  initSliders();
  lockMasterPair(EARTH_SITES[0], CELESTIAL_ZONES[0], false); // false = keep the Earth map fully zoomed out on load

  document.getElementById("voiceReadoutBtn").onclick = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t(
      "منصة تيرا أنالوج هي نظام ذكي يحلل تضاريس كوكب الأرض لاكتشاف أفضل المواقع المطابقة لبيئة القمر والمريخ لاختبارات الفضاء.",
      "TerraAnalog is an intelligent platform that analyzes Earth's terrain to find the perfect testing environments for Lunar and Martian missions."
    ));
    u.lang = t("ar-SA", "en-US");
    window.speechSynthesis.speak(u);
  };

  document.getElementById("langSwitchBtn").onclick = () => {
    currentLang = currentLang === "ar" ? "en" : "ar";
    applyLanguage();
  };

  initOmnibar();
  applyChromeI18n();
});
  