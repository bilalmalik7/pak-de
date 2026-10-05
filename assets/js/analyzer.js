/* DeutschDreams — Student Profile Analyzer
   Runs entirely in the browser: nothing is uploaded or stored.
   The German grade uses the Modified Bavarian Formula used by uni-assist and most German universities:
     German grade = 1 + 3 × (Nmax − Nd) / (Nmax − Nmin)
   Every score here is an estimate to start a conversation, not an admission decision. */
(function () {
  "use strict";

  var form = document.getElementById("analyzer-form");
  if (!form) return;

  var steps = Array.prototype.slice.call(form.querySelectorAll(".form-step"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".steps-dots span"));
  var errorEl = form.querySelector(".form-error");
  var current = 0;

  function val(name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el.length && !el.tagName) { // radio group
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
    var prevBtn = form.querySelector("[data-prev-step]"), nextBtn = form.querySelector("[data-next-step]"), submitBtn = form.querySelector("[type=submit]");
    prevBtn.style.visibility = i === 0 ? "hidden" : "visible";
    nextBtn.hidden = i === steps.length - 1;
    submitBtn.hidden = i < 1;
    var first = steps[i].querySelector("input, select");
    if (first && !noFocus && window.matchMedia("(hover: hover)").matches) first.focus({ preventScroll: true });
  }

  function validate(i) {
    var s = steps[i];
    var required = Array.prototype.slice.call(s.querySelectorAll("[required]"));
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

  // Live UI helpers
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

  /* ---------- Scoring ---------- */
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

  function analyse() {
    var d = {
      name: val("name").trim(),
      city: val("city"),
      target: val("target"),
      qual: val("qualification"),
      gradeType: val("gradeType"),
      grade: parseFloat(val("grade")),
      field: val("field"),
      english: val("english"),
      engScore: val("engScore"),
      german: val("german"),
      gap: parseInt(val("gap"), 10),
      work: parseInt(val("work"), 10),
      finance: val("finance"),
      intake: val("intake")
    };

    var gg = germanGrade(d.grade, d.gradeType, d.qual);
    var academics = clamp(100 - (gg - 1) * 26.7);
    var language = clamp(englishScore(d.english, d.engScore) + germanBonus[d.german]);
    var finance = { yes: 100, family: 80, maybe: 55, no: 22 }[d.finance] || 40;
    var effectiveGap = Math.max(0, d.gap - d.work);
    var profile = clamp(100 - effectiveGap * 12 + Math.min(d.work, 4) * 4);

    var score = academics * 0.32 + language * 0.26 + finance * 0.22 + profile * 0.2;

    var paths = [], tips = [];
    var target = d.target === "unsure" ? (["bs16", "ba14", "ms18"].indexOf(d.qual) > -1 ? "master" : "bachelor") : d.target;
    var structural = "";

    // Eligibility rules for Pakistani qualifications (anabin-based, simplified)
    if (target === "master") {
      if (d.qual === "ba14") {
        structural = "A 14-year BA/BSc from Pakistan is usually not accepted for German master's programs.";
        score = Math.min(score, 48);
        paths.push(["🎓", "Complete 16 years first", "Finish a 2-year MA/MSc or a BS top-up in Pakistan — then the full German master's market opens up for you.", "high"]);
        paths.push(["🏛️", "Bachelor's in Germany", "Start a 3-year English-taught bachelor's in Germany — many accept 14 years of education with good grades.", "mid"]);
      } else if (d.qual === "fsc" || d.qual === "matric" || d.qual === "alevels") {
        target = "bachelor";
      }
    }

    if (target === "bachelor") {
      if (d.qual === "matric") {
        structural = "With Matric only, you'll need Intermediate (FSc/ICS/ICom) or A-Levels before applying.";
        score = Math.min(score, 40);
        paths.push(["📘", "Finish FSc / A-Levels with strong marks", "Your marks in Intermediate are what German universities will look at — aim high and start German A1 alongside.", "high"]);
      } else if (d.qual === "fsc") {
        paths.push(["🏫", "Studienkolleg (foundation year)", "The classic route after FSc/ICS: a 1-year prep course, then direct bachelor's admission. Needs German B1 for the entrance test.", germanRank[d.german] >= 3 ? "high" : "mid"]);
        paths.push(["📚", "1 year of BS in Pakistan → Germany", "Two passed semesters of a related BS degree in Pakistan can give direct entry to German bachelor's programs.", "high"]);
        paths.push(["💼", "Private university with foundation", "State-recognised private universities offer English-taught foundation + bachelor's tracks with flexible entry.", d.finance === "yes" || d.finance === "family" ? "high" : "mid"]);
      } else if (d.qual === "alevels") {
        paths.push(["✨", "Direct bachelor's admission", "With 3 A-Levels in relevant subjects (plus O-Levels), you can often apply directly to German universities.", gg <= 2.7 ? "high" : "mid"]);
        paths.push(["🏫", "Studienkolleg backup", "If your subject combination doesn't match, a Studienkolleg year keeps the door open.", "mid"]);
      }
    }

    if (target === "master" && !structural) {
      paths.push(["🏛️", "Public universities (English-taught)", "TU & research universities — tuition-free or low-fee, but competitive. Best for strong grades + IELTS 6.5.", gg <= 2.5 && language >= 74 ? "high" : gg <= 3.0 ? "mid" : "low"]);
      paths.push(["⚙️", "Universities of Applied Sciences (Hochschulen)", "Practical, industry-linked master's programs — many look at your whole profile, not just one number.", gg <= 3.3 && language >= 55 ? "high" : "mid"]);
      paths.push(["💼", "State-recognised private universities", "Flexible on GPA, multiple intakes per year, English-taught. Tuition applies (~€8,000–€15,000 per year).", d.finance === "yes" || d.finance === "family" ? "high" : d.finance === "maybe" ? "mid" : "low"]);
      if (d.work >= 2 && d.qual !== "ba14") {
        paths.push(["🪪", "Opportunity Card (Chancenkarte)", "A points-based job-seeker visa for skilled graduates. Your work experience earns you points.", germanRank[d.german] >= 1 || language >= 74 ? "mid" : "low"]);
      }
    }

    if (target === "bachelor" && d.qual !== "matric" && germanRank[d.german] >= 4) {
      paths.push(["🇩🇪", "German-taught programs", "With B2+ German, hundreds more tuition-free programs open up — far less competition.", "high"]);
    }

    if (target === "ausbildung" || d.target === "unsure") {
      paths.push(["🛠️", "Ausbildung (paid vocational training)", "Earn €1,000+ a month while you train in nursing, IT, hospitality and more. No GPA cutoff — German B1 is the key.", germanRank[d.german] >= 3 ? "high" : d.qual === "matric" ? "low" : "mid"]);
      if (target === "ausbildung") {
        language = clamp(germanRank[d.german] * 20);
        score = academics * 0.15 + language * 0.45 + finance * 0.15 + profile * 0.25;
      }
    }

    // Tips
    if (structural) tips.push(structural);
    if (gg > 2.5 && target !== "ausbildung") tips.push("Your estimated German grade is " + gg.toFixed(1) + ". Don't panic — target Universities of Applied Sciences and programs without strict cutoffs, and let a strong SOP, projects and LORs carry your file.");
    if (d.english === "none" || d.english === "planning") tips.push("Book IELTS Academic and aim for 6.5 overall (no band below 6.0) — it unlocks most English-taught programs.");
    else if (d.english === "moi") tips.push("Some universities accept a Medium of Instruction letter, but an IELTS 6.5 widens your options a lot.");
    else if (language < 74 && target !== "ausbildung") tips.push("Raising your English score by half a band could noticeably widen your university list.");
    if (germanRank[d.german] < 1) tips.push("Start German A1 now — even basic German impresses visa officers and makes part-time jobs easier.");
    else if (germanRank[d.german] < 3 && target === "ausbildung") tips.push("For Ausbildung, German B1 (Goethe/ÖSD/telc) is the must-have. Plan 6–9 months of focused classes.");
    if (d.finance === "no" || d.finance === "maybe") tips.push("You'll need a blocked account (Sperrkonto) of about €11,904 per year for the visa — the official amount is updated regularly, so we'll confirm it and help you plan with family sponsorship or a scholarship.");
    if (effectiveGap >= 2) tips.push("Your study gap needs a clear story: experience letters, courses and certificates make gaps a strength, not a weakness.");
    if (d.qual === "bs16" || d.qual === "ba14" || d.qual === "ms18") tips.push("Start HEC degree attestation early — it's needed for both admission and the visa file.");
    if (d.qual === "fsc" || d.qual === "matric") tips.push("Get your Intermediate certificate attested by IBCC — German universities and the embassy will ask for it.");
    if (d.field === "medicine") tips.push("Medicine in Germany is mostly German-taught and highly competitive — C1 German is usually required. Ask us about nursing Ausbildung as a fast alternative.");

    var verdicts = [
      [80, "Germany-ready! 🚀", "Your profile is strong. Let's shortlist ambitious universities and get your applications out early."],
      [65, "Strong profile ✨", "You're in a good position — a few polishes and you'll have great options."],
      [50, "Promising 🌱", "There's a clear route for you. With the right strategy, Germany is absolutely realistic."],
      [0, "There's a route 🧭", "Your GPA doesn't define you. Let's build your path step by step — many of our ideal routes start right here."]
    ];
    score = clamp(score);
    var v = verdicts.filter(function (x) { return score >= x[0]; })[0];

    return { d: d, gg: gg, score: score, meters: { academics: academics, language: language, finance: finance, profile: profile }, paths: paths, tips: tips.slice(0, 5), verdict: v, target: target };
  }

  /* ---------- Render ---------- */
  var resultEmpty = document.getElementById("result-empty");
  var resultBody = document.getElementById("result-body");
  var lastReport = null;

  function gradeLabel(g) {
    if (g <= 1.5) return "Very good (sehr gut)";
    if (g <= 2.5) return "Good (gut)";
    if (g <= 3.5) return "Satisfactory (befriedigend)";
    if (g <= 4.0) return "Sufficient (ausreichend)";
    return "Below passing";
  }

  function render(r) {
    lastReport = r;
    resultEmpty.hidden = true;
    resultBody.hidden = false;
    var circ = 2 * Math.PI * 90;
    var bar = resultBody.querySelector(".score-ring .bar");
    bar.style.strokeDasharray = circ;
    bar.style.strokeDashoffset = circ;
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.strokeDashoffset = circ * (1 - r.score / 100); }); });

    var valEl = document.getElementById("score-val"), startT = null;
    function tick(ts) {
      if (!startT) startT = ts;
      var p = Math.min((ts - startT) / 1500, 1);
      valEl.textContent = Math.round(r.score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    document.getElementById("verdict-title").textContent = (r.d.name ? r.d.name.split(" ")[0] + ", " : "") + r.verdict[1];
    document.getElementById("verdict-text").textContent = r.verdict[2];
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

    var fitText = { high: "Great fit", mid: "Possible", low: "Stretch" };
    document.getElementById("pathways").innerHTML = r.paths.map(function (p, i) {
      return '<div class="pathway" style="animation-delay:' + (0.1 + i * 0.08) + 's"><span class="pw-ico" aria-hidden="true">' + p[0] + '</span><div><b>' + p[1] + '</b><p>' + p[2] + '</p></div><span class="fit ' + p[3] + '">' + fitText[p[3]] + '</span></div>';
    }).join("");
    document.getElementById("tips").innerHTML = r.tips.map(function (t) { return "<li>" + t + "</li>"; }).join("");

    if (window.matchMedia("(max-width: 900px)").matches) {
      resultBody.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    for (var i = 0; i <= current; i++) {
      if (!validate(i)) { var msg = errorEl.textContent; showStep(i); errorEl.textContent = msg; return; }
    }
    var r = analyse();
    render(r);
    var btn = form.querySelector("[type=submit]");
    btn.textContent = "Update my report ↻";
  });

  document.getElementById("wa-report").addEventListener("click", function () {
    if (!lastReport) return;
    var r = lastReport, d = r.d;
    var text = [
      "Assalam o Alaikum DeutschDreams! I used the Profile Analyzer 🇩🇪",
      "",
      "Name: " + (d.name || "—") + (d.city ? " (" + d.city + ")" : ""),
      "Goal: " + document.getElementById("target-label").textContent + " · Intake: " + d.intake,
      "Qualification: " + form.elements.qualification.selectedOptions[0].text,
      "Grade: " + d.grade + (d.gradeType === "percent" ? "%" : " CGPA") + " → German grade ≈ " + r.gg.toFixed(1),
      "English: " + form.elements.english.selectedOptions[0].text + (d.engScore ? " " + d.engScore : "") + " · German: " + d.german.toUpperCase(),
      "Gap: " + d.gap + " yrs · Work exp: " + d.work + " yrs",
      "Profile score: " + r.score + "/100",
      "",
      "Please guide me on the next steps."
    ].join("\n");
    window.open(window.ddWhatsAppLink(text), "_blank", "noopener");
  });

  document.getElementById("restart").addEventListener("click", function () {
    form.reset();
    syncEng();
    Array.prototype.forEach.call(form.querySelectorAll("input[type=range]"), function (r) { r.dispatchEvent(new Event("input")); });
    resultBody.hidden = true; resultEmpty.hidden = false;
    form.querySelector("[type=submit]").textContent = "Analyse my profile ✨";
    showStep(0);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  showStep(0, true);
})();
