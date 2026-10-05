/* DeutschDreams: AI Profile Analyzer
   1. On-device engine (always runs): German grade via the Modified Bavarian Formula
      (German grade = 1 + 3 × (Nmax − Nd) / (Nmax − Nmin)), profile sub-scores, eligibility rules
      for Pakistani qualifications, and matching against our German university database.
   2. AI counsellor report: the anonymous profile + engine results are sent to /api/analyze, where
      Claude writes a personal report. If the endpoint isn't deployed or fails, the engine writes
      the report itself, so the page always works (including on plain static hosting).
   Every score is an estimate to start a conversation, not an admission decision. */
(function () {
  "use strict";

  var form = document.getElementById("analyzer-form");
  if (!form) return;

  var AI_ENDPOINT = (window.DD_SITE && window.DD_SITE.aiEndpoint) || "";
  var steps = Array.prototype.slice.call(form.querySelectorAll(".form-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".steps-dots span"));
  var errorEl = form.querySelector(".form-error");
  var current = 0;
  var DE = [];

  /* ---------- Data ---------- */
  function loadJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); });
  }
  var dataReady = loadJSON("assets/data/universities-de.json").then(function (d) { DE = d; }).catch(function () {});

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* ---------- Form steps ---------- */
  function val(name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el.length && !el.tagName) {
      for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value;
      return "";
    }
    return el.value;
  }

  function showStep(i, noFocus) {
    current = i;
    steps.forEach(function (s, n) { s.classList.toggle("is-active", n === i); });
    dots.forEach(function (d, n) { d.classList.toggle("done", n <= i); });
    errorEl.textContent = "";
    form.querySelector("[data-prev-step]").style.visibility = i === 0 ? "hidden" : "visible";
    form.querySelector("[data-next-step]").hidden = i === steps.length - 1;
    form.querySelector("[type=submit]").hidden = i < 1;
    var first = steps[i].querySelector("input, select");
    if (first && !noFocus && window.matchMedia("(hover: hover)").matches) first.focus({ preventScroll: true });
  }

  function validate(i) {
    var required = Array.prototype.slice.call(steps[i].querySelectorAll("[required]"));
    for (var k = 0; k < required.length; k++) {
      var el = required[k];
      if (el.type === "radio") {
        if (!val(el.name)) { errorEl.textContent = "Please choose one option to continue."; return false; }
      } else if (!el.checkValidity()) {
        errorEl.textContent = el.getAttribute("data-msg") || "Please fill in this field correctly.";
        el.focus();
        return false;
      }
    }
    if (i === 1) {
      var g = parseFloat(val("grade")), max = val("gradeType") === "percent" ? 100 : 4;
      if (isNaN(g) || g <= 0 || g > max) { errorEl.textContent = "Enter a grade between 0 and " + max + "."; return false; }
    }
    return true;
  }

  form.addEventListener("click", function (e) {
    var t = e.target.closest("[data-next-step], [data-prev-step]");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-next-step")) { if (validate(current)) showStep(Math.min(current + 1, steps.length - 1)); }
    else showStep(Math.max(current - 1, 0));
  });

  var gradeInput = form.elements.grade;
  Array.prototype.forEach.call(form.querySelectorAll("input[name=gradeType]"), function (r) {
    r.addEventListener("change", function () {
      var pct = r.value === "percent";
      gradeInput.max = pct ? 100 : 4;
      gradeInput.step = pct ? 0.1 : 0.01;
      gradeInput.placeholder = pct ? "e.g. 68" : "e.g. 2.85";
    });
  });
  var engSel = form.elements.english, engScore = document.getElementById("eng-score-field");
  function syncEng() {
    var needs = ["ielts", "pte", "duolingo", "toefl"].indexOf(engSel.value) > -1;
    engScore.hidden = !needs;
    var inp = form.elements.engScore;
    inp.required = needs;
    var hints = { ielts: ["e.g. 6.5", 9, 0.5], pte: ["e.g. 58", 90, 1], duolingo: ["e.g. 110", 160, 5], toefl: ["e.g. 85", 120, 1] };
    if (hints[engSel.value]) { inp.placeholder = hints[engSel.value][0]; inp.max = hints[engSel.value][1]; inp.step = hints[engSel.value][2]; }
  }
  engSel.addEventListener("change", syncEng); syncEng();
  Array.prototype.forEach.call(form.querySelectorAll("input[type=range]"), function (r) {
    var out = document.querySelector("[data-for='" + r.name + "']");
    function upd() { if (out) out.textContent = r.value + (r.value === r.max ? "+" : "") + (r.value === "1" ? " year" : " years"); }
    r.addEventListener("input", upd); upd();
  });

  /* ---------- Engine: scoring ---------- */
  function germanGrade(g, type, qual) {
    var max, min;
    if (type === "percent") { max = 100; min = (qual === "fsc" || qual === "matric" || qual === "alevels") ? 33 : 50; }
    else { max = 4; min = 2.0; }
    var res = 1 + 3 * (max - g) / (max - min);
    return Math.round(Math.min(Math.max(res, 1), 5) * 10) / 10;
  }
  function englishScore(test, s) {
    s = parseFloat(s);
    switch (test) {
      case "ielts": return s >= 7 ? 100 : s >= 6.5 ? 90 : s >= 6 ? 74 : s >= 5.5 ? 55 : 35;
      case "pte": return s >= 65 ? 100 : s >= 58 ? 88 : s >= 50 ? 66 : 40;
      case "toefl": return s >= 95 ? 100 : s >= 80 ? 86 : s >= 70 ? 64 : 40;
      case "duolingo": return s >= 125 ? 95 : s >= 110 ? 80 : s >= 100 ? 62 : 40;
      case "moi": return 55;
      case "planning": return 35;
      default: return 18;
    }
  }
  var germanBonus = { none: 0, a1: 8, a2: 14, b1: 24, b2: 40, c1: 60 };
  var germanRank = { none: 0, a1: 1, a2: 2, b1: 3, b2: 4, c1: 5 };
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function clamp01(n) { return Math.max(0, Math.min(1, n)); }

  function analyse() {
    var d = {
      name: val("name").trim(), city: val("city"), target: val("target"), qual: val("qualification"),
      pkUni: val("pkUni").trim(), gradeType: val("gradeType"), grade: parseFloat(val("grade")), field: val("field"),
      english: val("english"), engScore: val("engScore"), german: val("german"),
      gap: parseInt(val("gap"), 10), work: parseInt(val("work"), 10), finance: val("finance"), intake: val("intake"),
      goal: val("goal").trim()
    };
    var gg = germanGrade(d.grade, d.gradeType, d.qual);
    var academics = clamp(100 - (gg - 1) * 26.7);
    var language = clamp(englishScore(d.english, d.engScore) + germanBonus[d.german]);
    var finance = { yes: 100, family: 80, maybe: 55, no: 22 }[d.finance] || 40;
    var effectiveGap = Math.max(0, d.gap - d.work);
    var profile = clamp(100 - effectiveGap * 12 + Math.min(d.work, 4) * 4);
    var score = academics * 0.32 + language * 0.26 + finance * 0.22 + profile * 0.2;
    var paths = [], tips = [], structural = "";
    var target = d.target === "unsure" ? (["bs16", "ba14", "ms18"].indexOf(d.qual) > -1 ? "master" : "bachelor") : d.target;

    // Eligibility rules for Pakistani qualifications (anabin-based, simplified)
    if (target === "master") {
      if (d.qual === "ba14") {
        structural = "A 14-year BA/BSc from Pakistan is usually not accepted for German master's programmes.";
        score = Math.min(score, 48);
        paths.push(["🎓", "Complete 16 years first", "Finish a 2-year MA/MSc or a BS top-up in Pakistan, and the full German master's market opens up.", "high"]);
        paths.push(["🏛️", "Bachelor's in Germany", "Start an English-taught bachelor's in Germany instead. Many accept 14 years of education with good grades.", "mid"]);
      } else if (d.qual === "fsc" || d.qual === "matric" || d.qual === "alevels") {
        target = "bachelor";
      }
    }
    if (target === "bachelor") {
      if (d.qual === "matric") {
        structural = "With Matric only, you'll need Intermediate (FSc/ICS/ICom) or A-Levels before applying.";
        score = Math.min(score, 40);
        paths.push(["📘", "Finish FSc / A-Levels with strong marks", "German universities look at your Intermediate marks. Aim high and start German A1 alongside.", "high"]);
      } else if (d.qual === "fsc") {
        paths.push(["🏫", "Studienkolleg (foundation year)", "The classic route after FSc/ICS: a 1-year prep course, then direct bachelor's admission. Needs German B1 for the entrance test.", germanRank[d.german] >= 3 ? "high" : "mid"]);
        paths.push(["📚", "1 year of BS in Pakistan, then Germany", "Two passed semesters of a related BS degree in Pakistan can give direct entry to German bachelor's programmes.", "high"]);
        paths.push(["💼", "Private university with foundation year", "State-recognised private universities offer English-taught foundation and bachelor's tracks with flexible entry.", d.finance === "yes" || d.finance === "family" ? "high" : "mid"]);
      } else if (d.qual === "alevels") {
        paths.push(["✨", "Direct bachelor's admission", "With 3 A-Levels in relevant subjects (plus O-Levels), you can often apply directly.", gg <= 2.7 ? "high" : "mid"]);
        paths.push(["🏫", "Studienkolleg backup", "If your subject combination doesn't match, a Studienkolleg year keeps the door open.", "mid"]);
      }
    }
    if (target === "master" && !structural) {
      paths.push(["🏛️", "Public universities (English-taught)", "TUs and research universities: tuition-free or low-fee, but competitive. Best with strong grades and IELTS 6.5.", gg <= 2.5 && language >= 74 ? "high" : gg <= 3.0 ? "mid" : "low"]);
      paths.push(["⚙️", "Universities of Applied Sciences", "Practical, industry-linked master's programmes that look at your whole profile, not just one number.", gg <= 3.3 && language >= 55 ? "high" : "mid"]);
      paths.push(["💼", "State-recognised private universities", "Flexible on GPA, several intakes a year, English-taught. Tuition applies (roughly €8,000–15,000 a year).", d.finance === "yes" || d.finance === "family" ? "high" : d.finance === "maybe" ? "mid" : "low"]);
      if (d.work >= 2) paths.push(["🪪", "Opportunity Card (Chancenkarte)", "A points-based job-seeker visa for skilled graduates. Your work experience earns points.", germanRank[d.german] >= 1 || language >= 74 ? "mid" : "low"]);
    }
    if (target === "bachelor" && d.qual !== "matric" && germanRank[d.german] >= 4) {
      paths.push(["🇩🇪", "German-taught programmes", "With B2+ German, hundreds more tuition-free programmes open up, with far less competition.", "high"]);
    }
    if (target === "ausbildung" || d.target === "unsure") {
      paths.push(["🛠️", "Ausbildung (paid vocational training)", "Earn a monthly stipend while you train in nursing, IT, hospitality and more. No CGPA cutoff: German B1 is the key.", germanRank[d.german] >= 3 ? "high" : d.qual === "matric" ? "low" : "mid"]);
      if (target === "ausbildung") {
        language = clamp(germanRank[d.german] * 20);
        score = academics * 0.15 + language * 0.45 + finance * 0.15 + profile * 0.25;
      }
    }

    if (structural) tips.push(structural);
    if (gg > 2.5 && target !== "ausbildung") tips.push("Your estimated German grade is " + gg.toFixed(1) + ". Target universities of applied sciences and programmes without strict cutoffs, and let a strong SOP, projects and LORs carry your file.");
    if (d.english === "none" || d.english === "planning") tips.push("Book IELTS Academic and aim for 6.5 overall (no band below 6.0). It unlocks most English-taught programmes.");
    else if (d.english === "moi") tips.push("Some universities accept a Medium of Instruction letter, but IELTS 6.5 widens your options a lot.");
    else if (language < 74 && target !== "ausbildung") tips.push("Raising your English score by half a band could noticeably widen your university list.");
    if (germanRank[d.german] < 1) tips.push("Start German A1 now. Even basic German impresses visa officers and makes part-time jobs easier.");
    else if (germanRank[d.german] < 3 && target === "ausbildung") tips.push("For Ausbildung, German B1 (Goethe/ÖSD/telc) is a must. Plan 6–9 months of focused classes.");
    if (d.finance === "no" || d.finance === "maybe") tips.push("The visa needs a blocked account of about €11,904 a year (the official amount is revised regularly). Plan family sponsorship early, and look at scholarships.");
    if (effectiveGap >= 2) tips.push("Your study gap needs a clear story. Experience letters, courses and certificates turn a gap into a strength.");
    if (d.qual === "bs16" || d.qual === "ba14" || d.qual === "ms18") tips.push("Start HEC degree attestation early, since admission and the visa file both need it." + (d.pkUni ? " Also confirm " + d.pkUni + "'s status in anabin." : ""));
    if (d.qual === "fsc" || d.qual === "matric") tips.push("Get your Intermediate certificate attested by IBCC. Universities and the embassy will ask for it.");
    if (d.field === "medicine") tips.push("Medicine in Germany is mostly German-taught and very competitive, usually with C1 German required. Nursing Ausbildung is a fast alternative.");

    score = clamp(score);
    var r = { d: d, gg: gg, score: score, meters: { academics: academics, language: language, finance: finance, profile: profile }, paths: paths, tips: tips.slice(0, 5), target: target, structural: structural };
    r.matches = matchUniversities(r);
    r.timeline = buildTimeline(r);
    return r;
  }

  /* ---------- Engine: university matching ---------- */
  var FIELD_AREA = { engineering: "E", cs: "C", business: "B", sciences: "N", medicine: "M", social: "H", other: "" };
  var FIELD_RX = {
    engineering: /engineer|mechatron|automotive|electrical|mechanical|energy|civil|power|manufactur|embedded|aerospace|aeronaut|robot|process|wind|photon/i,
    cs: /comput|software|data|informat|artificial|intelligen|web|cyber|digital|machine learning|security/i,
    business: /business|management|finance|econom|mba|logistic|supply|marketing|accounting/i,
    sciences: /physics|chem|bio|science|material|photon|nano|mathemat/i,
    medicine: /health|medic|biomed|pharm|neuro|infection/i,
    social: /policy|social|studies|governance|development|global|history|cognitive/i
  };
  var KIND_LABEL = { U: "Research university", T: "Technical university", H: "University of Applied Sciences", B: "Private university", M: "Medical university", D: "Dual / distance", K: "Arts", P: "Education", R: "Theology" };

  function matchUniversities(r) {
    if (!DE.length || r.target === "ausbildung" || r.structural) return [];
    var d = r.d, gg = r.gg, area = FIELD_AREA[d.field] || "", rx = FIELD_RX[d.field];
    var finOk = d.finance === "yes" || d.finance === "family";
    var kinds = d.field === "medicine" ? "TUHBM" : "TUHB";
    var scored = [];
    DE.forEach(function (u) {
      if (kinds.indexOf(u.k) === -1) return;
      if (area && u.a.indexOf(area) === -1) return;
      var tu9 = u.f.indexOf("tu9") > -1, pk = u.f.indexOf("pk") > -1;
      var threshold = tu9 ? 2.3 : u.k === "T" || u.k === "U" ? 2.6 : u.k === "M" ? 2.0 : u.k === "H" ? 3.1 : 3.7;
      if (gg > threshold + 0.7) return;
      var gradeFit = clamp01((threshold + 0.5 - gg) / 1.3);
      var costFit = u.free ? 1 : u.sec === "priv" ? (finOk ? (gg > 3.0 ? 0.7 : 0.35) : 0.1) : u.sec === "church" ? 0.5 : u.s === "TUM" ? 0.45 : (finOk ? 0.7 : 0.4);
      var progHit = rx ? u.p.filter(function (p) { return rx.test(p); }) : [];
      var s = 45 * gradeFit + 25 * costFit + (progHit.length ? 15 : 6) + (pk ? 8 : 0) + (tu9 && gg <= 2.3 ? 7 : 0);
      var fit = gg <= threshold - 0.5 ? "safe" : gg <= threshold + 0.2 ? "target" : "ambitious";
      scored.push({ u: u, score: Math.min(99, Math.round(s)), fit: fit, progs: progHit.length ? progHit : u.p.slice(0, 2) });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var picked = [], perKind = {}, ambitious = 0, privates = 0;
    for (var i = 0; i < scored.length && picked.length < 8; i++) {
      var m = scored[i];
      if ((perKind[m.u.k] || 0) >= 3) continue;
      if (m.fit === "ambitious" && ambitious >= 2) continue;
      if (m.u.sec === "priv" && privates >= 2) continue;
      if (m.u.sec === "priv") privates++;
      perKind[m.u.k] = (perKind[m.u.k] || 0) + 1;
      if (m.fit === "ambitious") ambitious++;
      picked.push(m);
    }
    picked.total = scored.length;
    return picked;
  }

  /* ---------- Engine: dated strategy timeline ---------- */
  function intakeDate(intake) {
    var m = /(Summer|Winter) (\d{4})/.exec(intake || "");
    if (!m) { var n = new Date(); return new Date(n.getFullYear() + 1, 9, 1); }
    return m[1] === "Summer" ? new Date(+m[2], 3, 1) : new Date(+m[2], 9, 1);
  }
  function addMonths(dt, n) { return new Date(dt.getFullYear(), dt.getMonth() + n, 1); }
  function fmt(dt) { return dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" }); }

  function buildTimeline(r) {
    var start = intakeDate(r.d.intake), now = new Date();
    var deadline = addMonths(start, -8);
    var monthsLeft = (deadline.getFullYear() - now.getFullYear()) * 12 + deadline.getMonth() - now.getMonth();
    var t = [];
    if (monthsLeft < 2) t.push({ when: "Now", action: "Your target intake is very close. Apply where deadlines are still open, and plan the next intake as a backup." });
    t.push({ when: "Now – " + fmt(addMonths(now, 2)), action: r.target === "ausbildung" ? "Start intensive German classes toward B1 and prepare a German CV." : (r.d.english === "ielts" || r.d.english === "pte" || r.d.english === "toefl") ? "Lock in your language results and start German A1. Shortlist 8–12 programmes." : "Book IELTS Academic (target 6.5) and start German A1. Shortlist 8–12 programmes." });
    t.push({ when: fmt(addMonths(deadline, -4)), action: "Documents: HEC/IBCC attestation, Europass CV, SOP drafts and two recommendation letters." });
    t.push({ when: fmt(addMonths(deadline, -2)) + " – " + fmt(deadline), action: r.target === "ausbildung" ? "Apply to hospitals and companies for Ausbildung places, with German cover letters." : "Submit applications via uni-assist / VPD or university portals. Many international programmes close early." });
    t.push({ when: fmt(addMonths(start, -5)), action: "Admission letters arrive. Accept your best offer, open the blocked account and arrange insurance." });
    t.push({ when: fmt(addMonths(start, -4)), action: "Visa appointment at the German Embassy Islamabad / Consulate Karachi, with a complete file and mock interviews." });
    t.push({ when: fmt(addMonths(start, -1)), action: "Book accommodation and flights. Fly out, register your address (Anmeldung) and start your semester." });
    return t;
  }

  /* ---------- Local report writer (used when the AI endpoint is unavailable) ---------- */
  function localReport(r) {
    var d = r.d, s = r.score, m = r.meters;
    var targetLabel = { master: "a master's", bachelor: "a bachelor's", ausbildung: "an Ausbildung" }[r.target] || "studies";
    var headline = r.structural ? "Not quite yet, but there is a clear route" : s >= 80 ? "A strong, Germany-ready profile" : s >= 65 ? "A solid profile with clear options" : s >= 50 ? "Realistic routes, with a few gaps to close" : "Not ready yet, but your route exists";
    var gradeTxt = d.gradeType === "percent" ? d.grade + "%" : d.grade + " CGPA";
    var compet = r.gg <= 2.3 ? "competitive even at top public universities" : r.gg <= 2.8 ? "competitive at many public universities and most universities of applied sciences" : r.gg <= 3.3 ? "best placed at universities of applied sciences and programmes without strict cutoffs" : "best placed at flexible-entry and private universities";
    var summary = "Your " + gradeTxt + " converts to a German grade of about " + r.gg.toFixed(1) + ", which makes you " + compet + " for " + targetLabel + ". ";
    summary += m.language >= 74 ? "Your language profile is a real strength. " : "Language is your biggest lever right now: a better English score (and some German) will widen your options. ";
    summary += m.finance >= 80 ? "Finances look ready for the blocked account. " : "Plan the blocked account early, as it is the most common reason applications stall. ";
    if (r.matches.length) summary += "Our engine matched you against " + DE.length + " German universities and found " + r.matches.total + " realistic options. Your top picks are below.";
    var strengths = [];
    if (m.academics >= 65) strengths.push("A competitive German grade of " + r.gg.toFixed(1) + ".");
    if (m.language >= 74) strengths.push("Language results that meet most English-taught requirements.");
    if (germanRank[d.german] >= 2) strengths.push("German at " + d.german.toUpperCase() + " level, which visa officers and employers notice.");
    if (d.work >= 1) strengths.push(d.work + " year" + (d.work > 1 ? "s" : "") + " of work experience: valuable for applied-sciences programmes and your SOP.");
    if (m.finance >= 80) strengths.push("A financial plan in place for the blocked account.");
    if (d.pkUni) strengths.push("A degree from " + d.pkUni + ". Confirm its anabin status, and lead your SOP with your strongest projects there.");
    if (!strengths.length) strengths.push("Clear motivation. Starting early gives you time to close every gap.");
    var risks = r.tips.length ? r.tips.slice(0, 4) : ["No major risks detected. Keep deadlines in view and start documents early."];
    var notes = r.matches.slice(0, 5).map(function (x) {
      var why = (KIND_LABEL[x.u.k] || "University") + " in " + x.u.c + ", " + x.u.fee.toLowerCase();
      if (x.progs.length) why += ". Look at " + x.progs.slice(0, 2).join(" and ");
      if (x.u.f.indexOf("pk") > -1) why += ". A well-trodden route with an established Pakistani community";
      return { name: x.u.n, fit: x.fit, why: why + "." };
    });
    var fieldName = { engineering: "engineering", cs: "computing", business: "business", sciences: "science", medicine: "health", social: "social-science", other: "academic" }[d.field] || "academic";
    var sop = "Lead with your strongest " + fieldName + " project and what it taught you" + (d.work ? ", then show how your " + d.work + " year" + (d.work > 1 ? "s" : "") + " of work sharpened that interest" : "") + ". " + (d.goal ? "Close by linking the programme to your goal: " + d.goal.slice(0, 120) + "." : "Close with a concrete career goal that the programme's modules clearly serve.");
    var urdu = s >= 75 ? "الحمدللہ، پروفائل مضبوط ہے اور جرمنی کی کئی یونیورسٹیاں موزوں ہیں۔ درست منصوبہ بندی اور وقت پر درخواستوں سے داخلے کے اچھے امکانات ہیں۔ ہم ہر قدم پر ساتھ ہیں۔"
      : s >= 50 ? "پروفائل اچھا ہے اور جرمنی میں تعلیم کا راستہ واضح ہے۔ زبان کے ٹیسٹ اور دستاویزات پر توجہ دینی ہے۔ ہم ہر قدم پر رہنمائی کریں گے۔"
      : "ابھی کچھ تیاری باقی ہے، لیکن جرمنی کا راستہ بند نہیں۔ صحیح حکمتِ عملی اور محنت سے کامیابی ممکن ہے، اور ہم ہر قدم پر ساتھ ہیں۔";
    return { headline: headline, summary: summary, strengths: strengths.slice(0, 4), risks: risks, strategy: r.timeline, university_notes: notes, sop_angle: sop, parent_note_urdu: urdu };
  }

  /* ---------- AI request ---------- */
  var labels = {
    qualification: function () { var o = form.elements.qualification.selectedOptions[0]; return o ? o.text : ""; },
    english: function () { var o = form.elements.english.selectedOptions[0]; return (o ? o.text : "") + (val("engScore") ? " " + val("engScore") : ""); }
  };
  function aiPayload(r) {
    var d = r.d;
    return {
      target: r.target, qualification: labels.qualification(), pakistaniUniversity: d.pkUni, city: d.city,
      field: d.field, grade: d.grade + (d.gradeType === "percent" ? "%" : " CGPA (4.0 scale)"), germanGrade: r.gg,
      english: labels.english(), german: d.german, gapYears: d.gap, workYears: d.work, finance: d.finance, intake: d.intake,
      goal: d.goal, score: r.score, subScores: r.meters,
      routes: r.paths.map(function (p) { return p[1] + " (" + p[3] + " fit)"; }),
      matches: r.matches.map(function (x) { return { name: x.u.n, city: x.u.c, type: KIND_LABEL[x.u.k], fee: x.u.fee, fit: x.fit, programmes: x.progs }; })
    }; // name, phone and email are never sent
  }
  function askAI(r) {
    if (!AI_ENDPOINT || !window.fetch) return Promise.reject(new Error("disabled"));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 55000);
    return fetch(AI_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiPayload(r)), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("status " + res.status);
      return res.json();
    }).then(function (j) {
      if (!j || !j.report || !j.report.summary) throw new Error("bad");
      return j.report;
    });
  }

  /* ---------- Render: score panel ---------- */
  var resultEmpty = document.getElementById("result-empty");
  var resultBody = document.getElementById("result-body");
  var reportSec = document.getElementById("ai-report");
  var lastReport = null, lastAnalysis = null;

  function gradeLabel(g) {
    if (g <= 1.5) return "Very good (sehr gut)";
    if (g <= 2.5) return "Good (gut)";
    if (g <= 3.5) return "Satisfactory (befriedigend)";
    if (g <= 4.0) return "Sufficient (ausreichend)";
    return "Below passing";
  }
  function renderPanel(r) {
    resultEmpty.hidden = true;
    resultBody.hidden = false;
    var circ = 2 * Math.PI * 90, bar = resultBody.querySelector(".score-ring .bar");
    bar.style.strokeDasharray = circ;
    bar.style.strokeDashoffset = circ;
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.strokeDashoffset = circ * (1 - r.score / 100); }); });
    var valEl = document.getElementById("score-val"), startT = null;
    (function tick(ts) {
      if (ts) { if (!startT) startT = ts; var p = Math.min((ts - startT) / 1500, 1); valEl.textContent = Math.round(r.score * (1 - Math.pow(1 - p, 3))); if (p >= 1) return; }
      requestAnimationFrame(tick);
    })();
    var verdict = r.score >= 80 ? "Germany-ready! 🚀" : r.score >= 65 ? "Strong profile ✨" : r.score >= 50 ? "Promising 🌱" : "There's a route 🧭";
    document.getElementById("verdict-title").textContent = (r.d.name ? r.d.name.split(" ")[0] + ", " : "") + verdict;
    document.getElementById("verdict-text").textContent = r.matches.length ? r.matches.total + " German universities match your profile" : "Your personal routes are in the report below";
    document.getElementById("german-grade").textContent = r.gg <= 4 ? r.gg.toFixed(1) : "4.0+";
    document.getElementById("grade-label").textContent = gradeLabel(r.gg);
    document.getElementById("target-label").textContent = { bachelor: "Bachelor's", master: "Master's", ausbildung: "Ausbildung" }[r.target] || "Explore";
    Object.keys(r.meters).forEach(function (k) {
      var m = resultBody.querySelector("[data-meter='" + k + "']");
      if (!m) return;
      m.querySelector("span:last-child").textContent = r.meters[k] + "/100";
      var i = m.querySelector("i");
      i.style.width = "0";
      setTimeout(function () { i.style.width = r.meters[k] + "%"; }, 80);
    });
  }

  /* ---------- Render: analysis pipeline + report ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wait(ms) { return new Promise(function (res) { setTimeout(res, reduce ? 0 : ms); }); }

  function runPipeline(r, aiPromise) {
    var list = document.getElementById("pipeline");
    var body = document.getElementById("report-body");
    body.hidden = true;
    list.hidden = false;
    var stepsTxt = [
      "Converting your " + (r.d.gradeType === "percent" ? "percentage" : "CGPA") + " with the Modified Bavarian Formula → " + r.gg.toFixed(1),
      "Checking eligibility rules for your Pakistani qualification",
      "Scoring language, finances and timeline",
      r.target === "ausbildung" ? "Mapping Ausbildung routes and German requirements" : "Matching you against " + (DE.length || "300+") + " German universities",
      "Building your dated strategy for " + r.d.intake,
      AI_ENDPOINT ? "Writing your AI counsellor report" : "Writing your counsellor report"
    ];
    list.innerHTML = stepsTxt.map(function (t) { return '<li><span class="pl-dot" aria-hidden="true"></span><span>' + esc(t) + "</span></li>"; }).join("");
    var items = list.querySelectorAll("li");
    var chain = Promise.resolve();
    Array.prototype.forEach.call(items, function (li, i) {
      chain = chain.then(function () {
        li.classList.add("is-running");
        if (i === items.length - 1) {
          return aiPromise.then(function (rep) { return rep ? { rep: rep, src: "ai" } : { rep: localReport(r), src: "local" }; })
            .then(function (out) { li.classList.remove("is-running"); li.classList.add("is-done"); return out; });
        }
        return wait(520).then(function () { li.classList.remove("is-running"); li.classList.add("is-done"); });
      });
    });
    return chain.then(function (out) { return wait(350).then(function () { return out; }); });
  }

  function li(arr) { return arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join(""); }
  var FIT = { safe: "Safe", target: "Target", ambitious: "Ambitious" };

  function renderReport(r, rep, src) {
    lastReport = rep;
    var badge = document.getElementById("report-source");
    badge.textContent = src === "ai" ? "✨ AI counsellor report" : "⚡ Smart engine report";
    badge.className = "report-badge " + (src === "ai" ? "is-ai" : "");
    document.getElementById("report-headline").textContent = rep.headline;
    document.getElementById("report-summary").textContent = rep.summary;
    document.getElementById("report-strengths").innerHTML = li(rep.strengths || []);
    document.getElementById("report-risks").innerHTML = li(rep.risks || []);

    var notesByName = {};
    (rep.university_notes || []).forEach(function (n) { notesByName[n.name] = n; });
    var matchesEl = document.getElementById("report-matches");
    var wrap = document.getElementById("report-matches-wrap");
    if (r.matches.length) {
      wrap.hidden = false;
      document.getElementById("report-match-count").textContent = r.matches.total;
      matchesEl.innerHTML = r.matches.map(function (x, i) {
        var note = notesByName[x.u.n];
        var fit = (note && note.fit) || x.fit;
        return '<article class="match-card" style="animation-delay:' + (i * 0.07) + 's">' +
          '<div class="match-top"><span class="match-pct">' + x.score + '%<small>match</small></span><span class="fit ' + (fit === "safe" ? "high" : fit === "target" ? "mid" : "low") + '">' + FIT[fit] + "</span></div>" +
          "<h4>" + esc(x.u.n) + '</h4><p class="match-meta">📍 ' + esc(x.u.c) + " · " + esc(KIND_LABEL[x.u.k]) + "</p>" +
          '<p class="match-fee">' + esc(x.u.fee) + "</p>" +
          (note ? '<p class="match-why">' + esc(note.why) + "</p>" : x.progs.length ? '<p class="match-why">Programmes to look at: ' + esc(x.progs.join(", ")) + "</p>" : "") +
          '<a class="link-arrow" href="universities.html#' + esc(x.u.id) + '">View university →</a></article>';
      }).join("");
    } else {
      wrap.hidden = true;
    }

    document.getElementById("report-strategy").innerHTML = (rep.strategy || []).map(function (s) {
      return '<li><span class="tl-when">' + esc(s.when) + "</span><p>" + esc(s.action) + "</p></li>";
    }).join("");
    document.getElementById("report-sop").textContent = rep.sop_angle || "";
    document.getElementById("report-urdu").textContent = rep.parent_note_urdu || "";
    document.getElementById("report-routes").innerHTML = r.paths.map(function (p, i) {
      var t = { high: "Great fit", mid: "Possible", low: "Stretch" };
      return '<div class="pathway" style="animation-delay:' + (0.1 + i * 0.08) + 's"><span class="pw-ico" aria-hidden="true">' + p[0] + "</span><div><b>" + esc(p[1]) + "</b><p>" + esc(p[2]) + '</p></div><span class="fit ' + p[3] + '">' + t[p[3]] + "</span></div>";
    }).join("");
    document.getElementById("report-body").hidden = false;
    document.getElementById("pipeline").hidden = true;
  }

  /* ---------- Submit ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    for (var i = 0; i <= current; i++) {
      if (!validate(i)) { var msg = errorEl.textContent; showStep(i); errorEl.textContent = msg; return; }
    }
    var btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    dataReady.then(function () {
      var r = analyse();
      lastAnalysis = r;
      renderPanel(r);
      reportSec.hidden = false;
      reportSec.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      var ai = askAI(r).catch(function () { return null; }); // handled now, so a failure never surfaces as an unhandled rejection
      return runPipeline(r, ai).then(function (out) { renderReport(r, out.rep, out.src); });
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Update my analysis ↻";
    }, function () { btn.disabled = false; });
  });

  /* ---------- Actions ---------- */
  function shareText() {
    var r = lastAnalysis, d = r.d;
    var lines = [
      "Assalam o Alaikum DeutschDreams! Here is my AI Profile Analysis 🇩🇪", "",
      "Name: " + (d.name || "-") + (d.city ? " (" + d.city + ")" : ""),
      "Goal: " + document.getElementById("target-label").textContent + " · Intake: " + d.intake,
      "Qualification: " + labels.qualification() + (d.pkUni ? " · " + d.pkUni : ""),
      "Grade: " + d.grade + (d.gradeType === "percent" ? "%" : " CGPA") + " → German grade ≈ " + r.gg.toFixed(1),
      "English: " + labels.english() + " · German: " + d.german.toUpperCase(),
      "Gap: " + d.gap + " yrs · Work: " + d.work + " yrs · Profile score: " + r.score + "/100"
    ];
    if (lastReport) lines.push("", "Verdict: " + lastReport.headline);
    if (r.matches.length) lines.push("Top matches: " + r.matches.slice(0, 4).map(function (x) { return x.u.n; }).join(", "));
    lines.push("", "Please guide me on the next steps.");
    return lines.join("\n");
  }
  document.querySelectorAll("[data-wa-report]").forEach(function (b) {
    b.addEventListener("click", function () { if (lastAnalysis) window.open(window.ddWhatsAppLink(shareText()), "_blank", "noopener"); });
  });
  document.querySelectorAll("[data-print-report]").forEach(function (b) {
    b.addEventListener("click", function () { document.documentElement.classList.add("print-report"); window.print(); setTimeout(function () { document.documentElement.classList.remove("print-report"); }, 500); });
  });
  document.getElementById("restart").addEventListener("click", function () {
    form.reset();
    syncEng();
    Array.prototype.forEach.call(form.querySelectorAll("input[type=range]"), function (rg) { rg.dispatchEvent(new Event("input")); });
    resultBody.hidden = true; resultEmpty.hidden = false; reportSec.hidden = true;
    form.querySelector("[type=submit]").textContent = "Run AI analysis ✨";
    showStep(0);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  showStep(0, true);
})();
