/* DeutschDreams: AI Programme Finder
   Three ways in: keyword search, "describe my degree", or a transcript upload. Every programme in
   assets/data/programmes.json gets a subject fit and an estimated admission chance for the student:
     subject fit  = how well the student's degree and courses cover the programme's subjects
                    (topics in assets/data/topics.json; related topics count as partial fit)
     grade fit    = German grade (Modified Bavarian Formula) vs. the usual competitiveness of that university type
     eligibility  = 16-year rule, English score, German for German-taught programmes
   Transcripts are read on the device (text PDFs via pdf.js, pasted text) or, with consent, by Claude through
   /api/transcript. /api/programme-advice adds an AI review of the top matches and /api/daad adds live DAAD
   results. Every endpoint is optional: without them the page still works from the local catalogue.
   Chances are estimates to start a conversation, not admission decisions. */
(function () {
  "use strict";

  var root = document.getElementById("finder");
  if (!root) return;

  var SITE = window.DD_SITE || {};
  var EP = { transcript: SITE.transcriptEndpoint || "", advice: SITE.adviceEndpoint || "", daad: SITE.daadEndpoint || "" };
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  var PAGE = 24;
  var MAX_FILE = 10 * 1024 * 1024, MAX_AI_PDF = 3 * 1024 * 1024;

  var UNI = {}, PROGS = [], TOPICS = [], TOPIC = {}, SYN = {}, NEAR_IN = {};
  var state = { mode: "search", query: null, limit: PAGE, uni: "", focus: "", advice: null, adviceKey: "", source: "", extracted: null };
  var profile = { target: "master", qual: "", grade: null, scale: "4", english: "", engScore: null, german: "none", field: "", weights: {}, interests: [], courses: [], degree: "", institution: "", notes: [] };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function store(key, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(v)); } catch (e) { return null; } }

  /* ---------- Data ---------- */
  function loadJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  var ready = Promise.all([loadJSON("assets/data/universities-de.json"), loadJSON("assets/data/programmes.json"), loadJSON("assets/data/topics.json")])
    .then(function (res) {
      res[0].forEach(function (u) { UNI[u.id] = u; });
      TOPICS = res[2].topics;
      SYN = res[2].synonyms || {};
      TOPICS.forEach(function (t) {
        t.pRx = new RegExp(t.p, "i"); t.cRx = new RegExp(t.c, "i"); TOPIC[t.id] = t;
        t.near.forEach(function (n) {
          var part = n.split(":");
          (NEAR_IN[part[0]] = NEAR_IN[part[0]] || []).push([t.id, part[1] ? +part[1] : 0.55]);
        });
      });
      PROGS = res[1].filter(function (p) { return UNI[p.u]; });
      PROGS.forEach(function (p) {
        var u = UNI[p.u];
        p.uni = u;
        p.hay = (p.dg + " " + p.n + " " + u.n + " " + u.s + " " + u.c + " " + u.st + " " + p.t.map(function (id) { return TOPIC[id] ? TOPIC[id].label : ""; }).join(" ")).toLowerCase();
        p.nameLc = p.n.toLowerCase();
      });
    });

  /* ---------- Topic tagging ---------- */
  function tagName(name) {
    var hits = [];
    TOPICS.forEach(function (t) {
      var m = t.pRx.exec(name);
      if (m) hits.push([m.index, -m[0].length, t.id]);
    });
    hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return hits.map(function (h) { return h[2]; });
  }
  // how: "course" = course-title patterns only (transcript lines), "both" = also programme-name patterns (degree titles, interests, queries)
  function topicsInText(text, how) {
    var out = [];
    TOPICS.forEach(function (t) { if (t.cRx.test(text) || (how === "both" && t.pRx.test(text))) out.push(t.id); });
    return out;
  }
  function addWeight(w, ids, amount) { ids.forEach(function (id) { w[id] = (w[id] || 0) + amount; }); }

  /* ---------- Parsing: free text (describe mode, pasted transcripts) ---------- */
  var QUAL_LABEL = { bs16: "16-year Bachelor's", ms18: "MS / MPhil", ba14: "14-year BA / BSc", fsc: "Intermediate (FSc / ICS)", alevels: "A-Levels" };

  function lastMatch(rx, text) { var m, out = null; rx.lastIndex = 0; while ((m = rx.exec(text))) out = m; return out; }
  function parseGrade(text) {
    // Transcripts list a running CGPA every semester: the last one is the final CGPA.
    var m = lastMatch(/(?:\bc\.?\s?g\.?\s?p\.?\s?a\b|cumulative (?:grade point average|gpa))\s*(?:of|is|was|=|:|-)?\s*([0-4](?:\.\d{1,3})?)(?!\d)/ig, text) ||
      lastMatch(/\bgpa\b\s*(?:of|is|was|=|:|-)?\s*([0-4](?:\.\d{1,3})?)(?!\d)/ig, text) ||
      /\b([0-4]\.\d{1,3})\s*(?:\/\s*4(?:\.0+)?\s*)?(?:c\.?g\.?p\.?a|gpa)\b/i.exec(text) ||
      /\b([0-4]\.\d{1,3})\s*\/\s*4(?:\.0+)?\b/.exec(text);
    if (m) return { grade: parseFloat(m[1]), scale: "4" };
    m = /(\d{2}(?:\.\d{1,2})?)\s*(?:%|percent|marks)/i.exec(text) || /(?:percentage|aggregate|marks obtained)\D{0,20}(\d{2}(?:\.\d{1,2})?)/i.exec(text);
    if (m && +m[1] <= 100) return { grade: parseFloat(m[1]), scale: "100" };
    return null;
  }
  function parseEnglish(text) {
    var tests = [["ielts", /ielts\D{0,15}(\d(?:\.5)?)\b/i], ["pte", /\bpte\D{0,15}(\d{2})\b/i], ["toefl", /toefl\D{0,15}(\d{2,3})\b/i], ["duolingo", /(?:duolingo|\bdet\b)\D{0,15}(\d{2,3})\b/i]];
    for (var i = 0; i < tests.length; i++) { var m = tests[i][1].exec(text); if (m) return { english: tests[i][0], engScore: parseFloat(m[1]) }; }
    if (/\bmoi\b|medium of instruction/i.test(text)) return { english: "moi", engScore: null };
    if (/\bno (english|ielts)|without ielts/i.test(text)) return { english: "none", engScore: null };
    return null;
  }
  function parseGerman(text) {
    var m = /(?:german|deutsch)\D{0,20}\b([abc][12])\b/i.exec(text) || /\b([abc][12])\b\s*(?:level\s*)?(?:german|deutsch)/i.exec(text);
    if (!m) return null;
    var lv = m[1].toLowerCase();
    return lv === "c2" ? "c1" : lv;
  }
  function parseQual(text) {
    var t = text.toLowerCase();
    if (/\b(14.?years?|2.?years?) (ba|bsc|b\.sc|bcom|b\.com|degree|bachelor)|\b(ba|bsc|bcom) \(?2.?years?|\bb\.?com\b|\bba\b(?! ?\(?hons)(?! ?\+ ?ma)/.test(t)) return "ba14";
    if (/\b(done|completed|have|hold|holding|did|finished|with) (an? )?(ms|m\.?phil|mphil|m\.?sc|master'?s?)\b|\b(ms|mphil|m\.?phil)\b[^.\n]{0,40}\bcgpa/.test(t)) return "ms18";
    if (/\b(bs|b\.s|bsc|b\.sc|be(?= (?:in )?(?:electrical|electronic|mechanical|civil|chemical|software|computer|telecom|mechatronic|industrial|biomedical|textile|petroleum|metallurg|aerospace|avionics|mining|agricultural))|b\.e|bba|bscs|bsee|bsse|bsit|b\.?tech|bachelor'?s?|mbbs|pharm\.?d|dpt|bds|llb|b\.?arch|undergrad\w*)\b/.test(t)) return "bs16";
    if (/a.?levels?/.test(t)) return "alevels";
    if (/\b(fsc|f\.sc|ics|i\.com|icom|intermediate|fa|hssc)\b/.test(t)) return "fsc";
    return "";
  }
  var TAIL = "\\s*(?:\\(hons\\.?\\))?\\s*(?:of|in)?\\s*(?:science|engineering|arts)?\\s*(?:in)?\\s*[a-z&,()\\- ]{3,60}";
  var BACHELOR_RX = new RegExp("\\b(?:bs|b\\.s\\.?|bsc|b\\.sc\\.?|b\\.e\\.?|be(?= (?:in )?(?:electrical|electronic|mechanical|civil|chemical|software|computer|telecom|mechatronic|industrial|biomedical|textile|petroleum|metallurg|aerospace|avionics|mining|agricultural))|bba|bscs|bsee|bsse|bsit|b\\.?tech|mbbs|pharm\\.?d|bachelor(?:'?s)?(?: degree)?)" + TAIL, "i");
  var MASTER_RX = new RegExp("\\b(?:ms|m\\.?phil|m\\.?sc|master(?:'?s)?(?: degree)?)" + TAIL, "i");
  // The completed degree: a bachelor phrase first ("I want to do MS in…" is an interest, not a degree).
  function degreePhrase(text, qual) {
    var m = BACHELOR_RX.exec(text) || (qual === "ms18" ? MASTER_RX.exec(text) : null);
    if (!m) return "";
    return m[0].split(/\bfrom\b|\bat\b|,|\.|\bwith\b|\band i\b|\bcgpa\b|\bi want\b|\bwant\b/i)[0].trim();
  }
  function interestsPhrase(text) {
    var m = /(?:interested in|interest in|want to (?:study|do|pursue|apply for)|planning to (?:study|do)|looking for|specialize in|specialise in|focus on|career in|masters? in|ms in|bachelor'?s? in)\s+([^.\n;]{3,120})/ig, out = [], r;
    while ((r = m.exec(text))) out.push(r[1]);
    return out.join(" · ");
  }
  // Short abbreviations (IT, CS, EE…) only count in capitals, so everyday words like "it" or "me" stay words.
  function expandSynonyms(text) {
    return text.replace(/\b[a-z]{2,8}\b/gi, function (w) {
      var s = SYN[w.toLowerCase()];
      return s && (w.length > 3 || w === w.toUpperCase()) ? w + " " + s : w;
    });
  }

  function parseFreeText(text, transcriptLike) {
    var res = { weights: {}, interests: [], courses: [], degree: "", notes: [] };
    var g = parseGrade(text); if (g) { res.grade = g.grade; res.scale = g.scale; }
    var e = parseEnglish(text); if (e) { res.english = e.english; res.engScore = e.engScore; }
    var de = parseGerman(text); if (de) res.german = de;
    res.qual = parseQual(text);
    var expanded = expandSynonyms(text);
    var deg = degreePhrase(expanded, res.qual);
    if (deg) { res.degree = deg.replace(/\s+/g, " ").slice(0, 80); addWeight(res.weights, topicsInText(deg, "both"), 30); }
    var interest = interestsPhrase(expanded);
    if (interest) res.interests = topicsInText(interest, "both");
    // Background: every line (courses on a transcript) adds to the topics it mentions, minus the interest phrase.
    var background = interest ? expanded.replace(interest, " ") : expanded;
    background.split(/\n|;|,|\.\s/).forEach(function (line) {
      line = line.trim();
      if (line.length < 3 || line.length > 160) return;
      var ids = topicsInText(line, "course");
      if (!ids.length) return;
      var cr = /\b([1-4])(?:\.0)?\s*(?:cr|ch|credit|\(\d\+\d\))/i.exec(line) || /\s([1-4])\s*$/.exec(line);
      addWeight(res.weights, ids, cr ? +cr[1] : 3);
      if (transcriptLike && res.courses.length < 80) res.courses.push(line.replace(/\s{2,}/g, " ").slice(0, 90));
    });
    var w = /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:work|job|professional|industry|experience)/i.exec(text);
    if (w) res.workYears = +w[1];
    return res;
  }

  function fromAI(t) {
    var res = { weights: {}, interests: [], courses: [], notes: [], degree: t.degree_title || t.field_of_study || "", institution: t.institution || "" };
    res.qual = { bachelor_16_year: "bs16", master: "ms18", bachelor_14_year: "ba14", intermediate: "fsc", a_levels: "alevels" }[t.degree_level] || "";
    if (t.cgpa != null && (!t.cgpa_scale || t.cgpa_scale === 4)) { res.grade = t.cgpa; res.scale = "4"; }
    else if (t.cgpa != null && t.cgpa_scale === 5) { res.grade = Math.round(t.cgpa * 0.8 * 100) / 100; res.scale = "4"; res.notes.push("Your CGPA was converted from a 5.0 scale; check the result."); }
    else if (t.percentage != null) { res.grade = t.percentage; res.scale = "100"; }
    addWeight(res.weights, topicsInText(expandSynonyms(res.degree + " " + (t.field_of_study || "")), "both"), 30);
    (t.courses || []).forEach(function (c) {
      var ids = topicsInText(c.title, "course");
      addWeight(res.weights, ids, c.credits || 3);
      res.courses.push(c.title + (c.credits ? " (" + c.credits + " cr)" : "") + (c.grade ? " · " + c.grade : ""));
    });
    (t.strongest_subjects || []).forEach(function (s) { addWeight(res.weights, topicsInText(s, "course"), 6); });
    if (t.notes) res.notes.push(t.notes);
    if (t.document_type === "not_academic") res.notes.unshift("This doesn't look like an academic record. Try your degree transcript or mark sheet.");
    return res;
  }

  /* ---------- Profile ---------- */
  var profileEl = document.getElementById("finder-profile");
  function setControl(name, v) {
    var el = profileEl.querySelector("[data-p='" + name + "']");
    if (el && v != null && v !== "") el.value = v;
  }
  function readControls() {
    $all("[data-p]", profileEl).forEach(function (el) {
      var k = el.getAttribute("data-p"), v = el.value;
      profile[k] = (k === "grade" || k === "engScore") ? (v === "" ? null : parseFloat(v)) : v;
    });
    var g = profileEl.querySelector("[data-p='grade']");
    g.max = profile.scale === "100" ? 100 : 4;
    g.placeholder = profile.scale === "100" ? "68" : "3.10";
  }
  function applyParsed(res, source) {
    ["qual", "grade", "scale", "english", "engScore", "german"].forEach(function (k) { if (res[k] != null && res[k] !== "") setControl(k, res[k]); });
    if (res.qual === "fsc" || res.qual === "alevels") setControl("target", "bachelor");
    else if (res.qual) setControl("target", "master");
    profileEl.querySelector("[data-p='field']").value = ""; // detect the field from the new text
    readControls();
    profile.weights = res.weights || {};
    profile.interests = res.interests || [];
    profile.courses = res.courses || [];
    profile.degree = res.degree || "";
    profile.institution = res.institution || "";
    profile.notes = res.notes || [];
    profile.workYears = res.workYears || 0;
    state.source = source;
    state.extracted = res;
  }

  function germanGrade() {
    if (profile.grade == null || isNaN(profile.grade)) return null;
    var max = profile.scale === "100" ? 100 : 4;
    var min = profile.scale === "100" ? ((profile.qual === "fsc" || profile.qual === "alevels") ? 33 : 50) : 2;
    if (profile.grade <= 0 || profile.grade > max) return null;
    return Math.round(clamp(1 + 3 * (max - profile.grade) / (max - min), 1, 5) * 10) / 10;
  }

  // Normalised subject strengths 0..1, with related topics counting as partial fit.
  function strengths() {
    var w = {}, k;
    for (k in profile.weights) w[k] = profile.weights[k];
    if (profile.field) w[profile.field] = (w[profile.field] || 0) + 40;
    var max = 0;
    for (k in w) max = Math.max(max, w[k]);
    if (!max) return null;
    var s = {};
    for (k in w) s[k] = Math.min(1, w[k] / max * 1.25);
    TOPICS.forEach(function (t) {
      var best = s[t.id] || 0;
      (NEAR_IN[t.id] || []).forEach(function (n) { if (s[n[0]]) best = Math.max(best, n[1] * s[n[0]]); });
      if (best > 0.04) s[t.id] = Math.round(best * 100) / 100; else delete s[t.id];
    });
    return s;
  }

  /* ---------- Scoring ---------- */
  var GERMAN_RANK = { none: 0, a1: 1, a2: 2, b1: 3, b2: 4, c1: 5 };
  var KIND_LABEL = { U: "Research university", T: "Technical university", H: "University of Applied Sciences", B: "Private university", M: "Medical university", D: "Dual / distance", K: "Arts", P: "Education", R: "Theology" };

  function threshold(p) {
    var u = p.uni, f = p.f;
    var t = u.f.indexOf("tu9") > -1 ? 2.3 : u.k === "T" || u.k === "U" ? 2.6 : u.k === "M" ? 2.0 : u.k === "H" ? 3.1 : u.k === "B" || u.k === "D" ? 3.7 : 2.8;
    if (f.indexOf("sel") > -1) t -= 0.4;
    if (f.indexOf("open") > -1) t += 0.4;
    return Math.round(clamp(t, 1.5, 4) * 10) / 10;
  }
  function englishFactor(p) {
    if (p.l === "de" || !profile.english) return [1, ""];
    var s = profile.engScore, e = profile.english;
    var table = { ielts: [6.5, 6, 5.5], pte: [58, 50, 43], toefl: [88, 79, 70], duolingo: [120, 110, 100] }[e];
    if (table) {
      if (s == null || isNaN(s)) return [1, ""];
      if (s >= table[0]) return [1, ""];
      if (s >= table[1]) return [0.85, "Most programmes ask for IELTS 6.5 or equivalent"];
      if (s >= table[2]) return [0.6, "Your English score is below most requirements"];
      return [0.4, "Your English score is well below most requirements"];
    }
    if (e === "moi") return [0.8, "Check that this programme accepts an MOI letter"];
    return [0.7, "Needs IELTS (usually 6.5) or equivalent"];
  }
  function fee(p) {
    var u = p.uni;
    if (p.f.indexOf("fee") > -1 && u.sec === "pub") return ["Programme tuition fees apply", "gold"];
    return [u.fee, u.free && p.f.indexOf("fee") === -1 ? "green" : u.sec === "pub" ? "gold" : "red"];
  }

  function score(p, S, gg) {
    var r = null, notes = [], ok = true;
    if (S) {
      var prim = p.t[0], sP = prim ? (S[prim] || 0) : 0.3, other = 0;
      for (var i = 1; i < p.t.length; i++) other = Math.max(other, S[p.t[i]] || 0);
      r = p.t.length > 1 ? 0.75 * sP + 0.25 * Math.max(other, sP) : sP;
      if ((prim === "bus" && p.uni.sec === "priv") || p.dg === "MBA") r = Math.max(r, 0.6);
      r = clamp(r, 0, 1);
    }
    var t = threshold(p);
    var g = gg == null ? 0.6 : 1 / (1 + Math.exp(-(t + 0.3 - gg) / 0.28));
    var factor = 1;
    // Level: 16-year rule for master's, Studienkolleg for FSc
    if (p.lv === "m") {
      if (profile.qual === "ba14") { factor *= 0.1; ok = false; notes.push("A 14-year degree is usually not accepted for a master's"); }
      else if (profile.qual === "fsc" || profile.qual === "alevels") { factor = 0; ok = false; }
    } else if (profile.qual === "fsc") {
      factor *= 0.55; notes.push("After FSc you usually need Studienkolleg or one year of a BS first");
    }
    // Language
    if (p.l === "de") {
      var gr = GERMAN_RANK[profile.german] || 0;
      if (gr < 3) { factor *= 0.08; ok = false; notes.push("Taught in German: needs C1 (TestDaF / DSH-2)"); }
      else if (gr < 5) { factor *= 0.45; notes.push("Taught in German: you'll need C1 before you start"); }
    } else {
      var ef = englishFactor(p);
      factor *= ef[0];
      if (ef[1]) notes.push(ef[1]);
    }
    var chance = null, label = "", cls = "";
    var personal = gg != null || S;
    if (personal) {
      chance = g * (r == null ? 0.75 : 0.35 + 0.65 * r) * factor;
      chance = Math.round(clamp(chance * 100 * 0.92, 3, 88));
      if (r != null && r < 0.2) { chance = Math.min(chance, 8); label = "Subject mismatch"; cls = "low"; ok = false; }
      else if (!ok && factor < 0.2) { label = "Not eligible yet"; cls = "low"; }
      else if (chance >= 65) { label = "Strong chance"; cls = "high"; }
      else if (chance >= 45) { label = "Good chance"; cls = "high"; }
      else if (chance >= 25) { label = "Possible"; cls = "mid"; }
      else { label = "Reach"; cls = "low"; }
    }
    if (gg != null) {
      var diff = gg - t;
      notes.unshift(diff <= -0.5 ? "Your German grade " + gg.toFixed(1) + " is comfortably inside the usual range here" : diff <= 0.2 ? "Your German grade " + gg.toFixed(1) + " is around what's usually competitive here (≈ " + t.toFixed(1) + ")" : "Usually competitive with ≈ " + t.toFixed(1) + " or better; yours is " + gg.toFixed(1));
    }
    if (r != null && r >= 0.2) {
      var prim2 = TOPIC[p.t[0]];
      notes.push(r >= 0.75 ? "Strong subject match" + (prim2 ? " (" + prim2.label + ")" : "") : r >= 0.45 ? "Related background, check the required modules" : "Partial subject match: you may need extra prerequisite courses");
    }
    var interest = profile.interests.length && p.t.some(function (id) { return profile.interests.indexOf(id) > -1; });
    if (interest) notes.push("Matches your interest");
    return { chance: chance, label: label, cls: cls, fit: r, t: t, notes: notes, ok: ok && (chance == null || chance >= 25), interest: interest, level: factor > 0 };
  }

  /* ---------- Keyword search ---------- */
  var STOP = { in: 1, of: 1, and: 1, the: 1, for: 1, a: 1, an: 1, master: 1, masters: 1, "master's": 1, msc: 1, ms: 1, ma: 1, degree: 1, programme: 1, program: 1, programs: 1, programmes: 1, course: 1, courses: 1, germany: 1, german: 1, study: 1, studies: 1, university: 1, universities: 1, english: 1, taught: 1, with: 1, at: 1, to: 1, i: 1, want: 1, bachelor: 1, bachelors: 1, "bachelor's": 1 };
  function prepQuery(q) {
    q = (q || "").trim();
    if (!q) return null;
    var expanded = expandSynonyms(q).toLowerCase();
    var tokens = expanded.split(/[^a-zäöüß0-9+#]+/).filter(function (w) { return w.length > 1 && !STOP[w]; });
    var phrase = q.toLowerCase().replace(/\s+/g, " ");
    var topics = topicsInText(expanded, "both");
    if (!tokens.length && !topics.length) return null;
    return { raw: q, phrase: phrase, tokens: tokens, topics: topics };
  }
  function queryScore(p, Q) {
    if (!Q) return 0;
    var s = 0, hit = 0;
    if (p.nameLc.indexOf(Q.phrase) > -1) s += 12;
    Q.tokens.forEach(function (w) {
      if (p.nameLc.indexOf(w) > -1) { s += 3; hit++; }
      else if (p.hay.indexOf(w) > -1) { s += 2; hit++; }
    });
    var th = 0;
    Q.topics.forEach(function (id) { var i = p.t.indexOf(id); if (i === 0) th += 3; else if (i > 0) th += 1.5; });
    s += Math.min(th, 6);
    var need = Q.tokens.length ? Math.ceil(Q.tokens.length * 0.6) : 0;
    return (hit >= need && hit > 0) || th >= 3 ? s : 0;
  }

  /* ---------- Filters + render ---------- */
  var resultsEl = $("[data-results]"), countEl = $("[data-results-count]"), emptyEl = $("[data-results-empty]"), moreBtn = $("[data-results-more]");
  var filters = {};
  $all("[data-filter]").forEach(function (el) { filters[el.getAttribute("data-filter")] = el; });
  var shortlist = store("dd-shortlist") || [];
  function syncShortCount() { $("[data-shortlist-count]").textContent = shortlist.length; }

  function compute() {
    var S = strengths(), gg = germanGrade(), Q = state.query;
    var targetLv = profile.target === "bachelor" ? "b" : "m";
    var personal = S || gg != null;
    var rows = [];
    PROGS.forEach(function (p) {
      if (p.lv !== targetLv && !state.focus) return;
      var qs = queryScore(p, Q);
      if (Q && !qs) return;
      if (state.uni && p.u !== state.uni) return;
      if (state.focus && p.id !== state.focus) return;
      rows.push({ p: p, qs: qs, sc: score(p, S, gg) });
    });
    var eligible = rows.filter(function (x) { return x.sc.ok && x.sc.level; }).length;
    return { rows: rows, S: S, gg: gg, personal: personal, eligible: eligible, Q: Q };
  }

  function passes(x) {
    var p = x.p, u = p.uni;
    if (filters.english.checked && p.l === "de") return false;
    if (filters.free.checked && !(u.free && p.f.indexOf("fee") === -1)) return false;
    if (filters.topic.value && p.t.indexOf(filters.topic.value) === -1) return false;
    if (filters.state.value && u.st !== filters.state.value) return false;
    var k = filters.kind.value;
    if (k === "TU" && "TUM".indexOf(u.k) === -1) return false;
    if (k === "H" && u.k !== "H") return false;
    if (k === "B" && "BD".indexOf(u.k) === -1) return false;
    if (filters.eligible.checked && !(x.sc.chance != null && x.sc.chance >= 45)) return false;
    if (filters.shortlist.checked && shortlist.indexOf(p.id) === -1) return false;
    return true;
  }
  function popularity(p) { return (p.uni.f.indexOf("pk") > -1 ? 4 : 0) + (p.uni.f.indexOf("tu9") > -1 ? 2 : 0) + (p.l !== "de" ? 1 : 0); }

  // "Best chance" ranking: the chance, nudged towards tuition-free programmes and the student's interests,
  // so private universities (easy entry, high fees) don't crowd out good public options. A typed search
  // keeps relevance first.
  function rank(x, hasQuery) {
    var p = x.p, cost = p.uni.free && p.f.indexOf("fee") === -1 ? 8 : p.uni.sec === "pub" ? 3 : -6;
    var personal = (x.sc.chance || 0) + cost + (x.sc.interest ? 15 : 0);
    return hasQuery ? x.qs * 3 + personal * 0.5 : personal;
  }
  function sortRows(rows, personal, hasQuery) {
    var mode = filters.sort.value;
    rows.sort(function (a, b) {
      if (mode === "name") return a.p.n.localeCompare(b.p.n) || a.p.uni.n.localeCompare(b.p.uni.n);
      if (mode === "fit" && personal) return (b.sc.fit || 0) - (a.sc.fit || 0) || (b.sc.chance || 0) - (a.sc.chance || 0);
      if (personal) return rank(b, hasQuery) - rank(a, hasQuery) || popularity(b.p) - popularity(a.p);
      return b.qs - a.qs || popularity(b.p) - popularity(a.p) || a.p.n.localeCompare(b.p.n);
    });
  }

  function daadSearchUrl(p) {
    return "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/result/?q=" + encodeURIComponent(p.n + " " + p.uni.c.split(" (")[0]);
  }
  function aiNote(id) {
    var a = state.advice;
    if (!a) return null;
    for (var i = 0; i < a.programme_notes.length; i++) if (a.programme_notes[i].id === id) return a.programme_notes[i];
    return null;
  }
  var VERDICT = { apply: ["Apply", "high"], consider: ["Consider", "mid"], stretch: ["Stretch", "low"], skip: ["Skip", "low"] };

  function card(x, i) {
    var p = x.p, u = p.uni, sc = x.sc, f = fee(p), starred = shortlist.indexOf(p.id) > -1;
    var lang = p.l === "en" ? "English" : p.l === "de" ? "German" : "English / German";
    var note = aiNote(p.id);
    var chance = sc.chance != null
      ? '<span class="chance ' + sc.cls + '"><b>' + sc.chance + '%</b><small>' + esc(sc.label) + "</small></span>"
      : '<span class="chance none"><b>≈ ' + sc.t.toFixed(1) + "</b><small>usual grade</small></span>";
    var fit = sc.fit != null ? '<div class="pc-fit"><span>Subject fit</span><i><em style="width:' + Math.round(sc.fit * 100) + '%"></em></i><b>' + Math.round(sc.fit * 100) + "%</b></div>" : "";
    var notes = sc.notes.slice(0, 3);
    return '<article class="prog-card" style="animation-delay:' + Math.min(i, 12) * 0.03 + 's" data-id="' + esc(p.id) + '">' +
      '<div class="pc-top"><div class="pc-badges"><span class="tag">' + esc(p.dg) + '</span><span class="tag">' + lang + "</span>" +
      (p.f.indexOf("sel") > -1 ? '<span class="tag red">Very competitive</span>' : "") + (p.f.indexOf("open") > -1 ? '<span class="tag green">Flexible entry</span>' : "") + "</div>" + chance + "</div>" +
      "<h3>" + esc(p.n) + "</h3>" +
      '<p class="pc-uni"><a href="universities.html#' + esc(u.id) + '">' + esc(u.n) + "</a><br>📍 " + esc(u.c) + " · " + esc(KIND_LABEL[u.k] || "University") + "</p>" +
      '<p class="pc-fee"><span class="tag ' + f[1] + '">' + esc(f[0]) + "</span></p>" + fit +
      (notes.length ? '<ul class="pc-why">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
      (note ? '<div class="pc-ai"><span class="fit ' + VERDICT[note.verdict][1] + '">✨ ' + VERDICT[note.verdict][0] + "</span><p>" + esc(note.why) + (note.gaps ? " <b>Gap:</b> " + esc(note.gaps) : "") + "</p></div>" : "") +
      '<div class="pc-links">' + (u.d ? '<a href="https://' + esc(u.d) + '" target="_blank" rel="noopener nofollow">University ↗</a>' : "") +
      '<a href="' + esc(daadSearchUrl(p)) + '" target="_blank" rel="noopener nofollow">DAAD details ↗</a>' +
      '<button type="button" class="pc-star" data-star="' + esc(p.id) + '" aria-pressed="' + starred + '">' + (starred ? "★ Shortlisted" : "☆ Shortlist") + "</button></div></article>";
  }

  var last = null;
  function render() {
    if (!PROGS.length) return;
    readControls();
    last = compute();
    var rows = last.rows.filter(passes);
    sortRows(rows, last.personal, !!state.query);
    last.visible = rows;
    resultsEl.innerHTML = rows.slice(0, state.limit).map(card).join("");
    var label = rows.length.toLocaleString("en-US") + (state.focus ? "" : profile.target === "bachelor" ? " bachelor's" : " master's") + (rows.length === 1 ? " programme" : " programmes");
    var ctx = state.query ? ' for "' + state.query.raw + '"' : "";
    if (state.uni && UNI[state.uni]) ctx += " at " + UNI[state.uni].n;
    countEl.innerHTML = "<span>" + esc(label) + "</span>" + esc(ctx) + (last.personal ? " · sorted by your estimated chance" : " · add your CGPA and degree to see your chances") +
      (state.uni || state.focus ? ' <button type="button" class="link-reset" data-clear-scope>Show all universities ✕</button>' : "");
    emptyEl.hidden = rows.length > 0;
    moreBtn.hidden = rows.length <= state.limit;
    $("[data-actions]").hidden = !rows.length;
    renderInsight();
  }

  /* ---------- Insight panel ---------- */
  function renderInsight() {
    var hasData = state.source && (Object.keys(profile.weights).length || profile.grade != null || profile.qual);
    $("[data-insight-empty]").hidden = !!hasData;
    $("[data-insight-body]").hidden = !hasData;
    if (!hasData) return;
    var src = $("[data-insight-source]");
    src.textContent = state.source === "ai" ? "✨ Read by AI" : state.source === "analyzer" ? "🧭 From your profile analysis" : "⚡ Read on your device";
    src.className = "report-badge" + (state.source === "ai" ? " is-ai" : "");
    $("[data-insight-degree]").textContent = profile.degree || QUAL_LABEL[profile.qual] || "Your profile";
    $("[data-insight-inst]").textContent = [profile.institution, profile.qual && profile.degree ? QUAL_LABEL[profile.qual] : ""].filter(Boolean).join(" · ");
    $("[data-insight-gg]").textContent = last.gg != null ? last.gg.toFixed(1) : "—";
    $("[data-insight-eligible]").textContent = last.eligible.toLocaleString("en-US");
    var S = last.S || {}, w = profile.weights, ids = Object.keys(w).sort(function (a, b) { return w[b] - w[a]; }).slice(0, 6);
    if (profile.field && ids.indexOf(profile.field) === -1) ids.unshift(profile.field);
    $("[data-insight-topics]").innerHTML = ids.length ? ids.map(function (id) {
      return '<div class="it-row"><span>' + esc(TOPIC[id] ? TOPIC[id].label : id) + '</span><i><em style="width:' + Math.round((S[id] || 0) * 100) + '%"></em></i></div>';
    }).join("") : '<p class="insight-notes">No subjects detected yet. Pick your field in the profile, or add course names.</p>';
    var notes = profile.notes.slice();
    if (profile.interests.length) notes.push("Interested in: " + profile.interests.map(function (id) { return TOPIC[id].label; }).join(", ") + ". Matching programmes are boosted.");
    if (profile.qual === "ba14" && profile.target === "master") notes.push("A 14-year degree is usually not enough for a German master's. Completing 16 years or a German bachelor's are the common routes.");
    if (profile.grade == null) notes.push("Add your CGPA or percentage in the profile to get chances.");
    $("[data-insight-notes]").textContent = notes.join(" ");
    var cw = $("[data-insight-courses-wrap]");
    cw.hidden = !profile.courses.length;
    $("[data-insight-course-count]").textContent = profile.courses.length;
    $("[data-insight-courses]").innerHTML = profile.courses.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("");
  }

  /* ---------- AI review of the top matches ---------- */
  var adviceEl = $("[data-advice]");
  function adviceProgrammes() {
    return last.visible.filter(function (x) { return x.sc.chance != null && x.sc.chance >= 20 && x.sc.level; }).slice(0, 10);
  }
  function requestAdvice() {
    state.aiConsent = true;
    if (!EP.advice || !window.fetch || !last || !last.S) { adviceEl.hidden = true; return; }
    var picks = adviceProgrammes();
    if (picks.length < 2) { adviceEl.hidden = true; return; }
    var key = picks.map(function (x) { return x.p.id; }).join(",") + "|" + profile.grade + profile.english + profile.engScore + profile.qual;
    if (key === state.adviceKey) return;
    state.adviceKey = key;
    state.advice = null;
    adviceEl.hidden = false;
    $("[data-advice-headline]").textContent = "Reviewing your best matches…";
    $("[data-advice-summary]").textContent = "";
    $("[data-advice-pipeline]").hidden = false;
    $("[data-advice-body]").hidden = true;
    var S = last.S, top = Object.keys(S).sort(function (a, b) { return S[b] - S[a]; }).slice(0, 6);
    var payload = {
      target: profile.target, qualification: QUAL_LABEL[profile.qual] || "", degree: profile.degree, institution: profile.institution,
      grade: profile.grade != null ? profile.grade + (profile.scale === "100" ? "%" : " CGPA (4.0 scale)") : "", germanGrade: last.gg,
      english: profile.english ? profile.english + (profile.engScore != null ? " " + profile.engScore : "") : "", german: profile.german,
      workYears: profile.workYears || 0,
      subjects: top.map(function (id) { return TOPIC[id].label; }),
      interests: profile.interests.map(function (id) { return TOPIC[id].label; }),
      courses: profile.courses.slice(0, 45),
      programmes: picks.map(function (x) {
        var p = x.p;
        return { id: p.id, name: p.n, degree: p.dg, university: p.uni.n, city: p.uni.c, type: KIND_LABEL[p.uni.k], language: p.l, fee: fee(p)[0], chance: x.sc.chance, subjectFit: x.sc.fit != null ? Math.round(x.sc.fit * 100) : null };
      })
    };
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 55000);
    fetch(EP.advice, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (j) {
        if (state.adviceKey !== key) return;
        if (!j || !j.advice || !j.advice.summary) throw new Error("bad");
        state.advice = j.advice;
        $("[data-advice-headline]").textContent = j.advice.headline;
        $("[data-advice-summary]").textContent = j.advice.summary;
        $("[data-advice-eligibility]").innerHTML = (j.advice.eligibility || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
        $("[data-advice-steps]").innerHTML = (j.advice.prerequisite_gaps || []).concat(j.advice.next_steps || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
        $("[data-advice-pipeline]").hidden = true;
        $("[data-advice-body]").hidden = false;
        render();
      })
      .catch(function () { if (state.adviceKey === key) adviceEl.hidden = true; });
  }

  /* ---------- Live DAAD results ---------- */
  var daadEl = $("[data-daad]"), daadSeq = 0;
  function searchDaad(q) {
    daadEl.hidden = true;
    if (!EP.daad || !q || q.length < 2) return;
    var seq = ++daadSeq;
    fetch(EP.daad + "?q=" + encodeURIComponent(q) + "&level=" + (profile.target === "bachelor" ? "bachelor" : "master"))
      .then(function (r) { if (!r.ok) throw new Error("status"); return r.json(); })
      .then(function (j) {
        if (seq !== daadSeq || !j || !Array.isArray(j.results) || !j.results.length) return;
        var gg = germanGrade(), S = strengths();
        $("[data-daad-q]").textContent = q;
        $("[data-daad-total]").textContent = (j.total || j.results.length).toLocaleString("en-US");
        $("[data-daad-results]").innerHTML = j.results.map(function (d, i) {
          // Tag the DAAD result like our own programmes, and borrow university type / fees when we know the university.
          var known = matchUni(d.university), est = "";
          if (known && (gg != null || S)) {
            var sc = score({ n: d.name, t: tagName(d.name), dg: "", lv: profile.target === "bachelor" ? "b" : "m", l: /german/i.test(d.languages.join(" ")) && !/english/i.test(d.languages.join(" ")) ? "de" : "en", f: [], uni: known }, S, gg);
            est = '<span class="chance ' + sc.cls + '"><b>' + sc.chance + "%</b><small>" + esc(sc.label) + "</small></span>";
          }
          return '<article class="prog-card daad-card" style="animation-delay:' + i * 0.03 + 's"><div class="pc-top"><div class="pc-badges"><span class="tag">DAAD</span>' +
            (d.languages.length ? '<span class="tag">' + esc(d.languages.join(" / ")) + "</span>" : "") + "</div>" + est + "</div>" +
            "<h3>" + esc(d.name) + '</h3><p class="pc-uni">' + esc(d.university) + (d.city ? "<br>📍 " + esc(d.city) : "") + "</p>" +
            (d.tuition ? '<p class="pc-fee"><span class="tag gold">' + esc(d.tuition) + "</span></p>" : known ? '<p class="pc-fee"><span class="tag ' + (known.free ? "green" : "gold") + '">' + esc(known.fee) + "</span></p>" : "") +
            (d.beginning ? '<ul class="pc-why"><li>Starts: ' + esc(d.beginning) + "</li></ul>" : "") +
            '<div class="pc-links">' + (d.link ? '<a href="' + esc(d.link) + '" target="_blank" rel="noopener nofollow">Open on DAAD ↗</a>' : "") + "</div></article>";
        }).join("");
        daadEl.hidden = false;
      })
      .catch(function () {});
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  var uniIndex = null;
  function matchUni(name) {
    if (!uniIndex) { uniIndex = {}; Object.keys(UNI).forEach(function (id) { uniIndex[norm(UNI[id].n)] = UNI[id]; }); }
    var n = norm(name);
    if (uniIndex[n]) return uniIndex[n];
    for (var k in uniIndex) if (k.length > 12 && (n.indexOf(k) > -1 || k.indexOf(n) > -1)) return uniIndex[k];
    return null;
  }

  /* ---------- Transcript files ---------- */
  var pdfLib = null;
  function loadPdfJs() {
    if (pdfLib) return pdfLib;
    pdfLib = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = PDFJS + "pdf.min.js";
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; resolve(window.pdfjsLib); };
      s.onerror = function () { pdfLib = null; reject(new Error("pdf.js")); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  function pdfText(file) {
    return Promise.all([loadPdfJs(), file.arrayBuffer()]).then(function (res) {
      return res[0].getDocument({ data: res[1] }).promise;
    }).then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= Math.min(pdf.numPages, 15); i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      // Rebuild lines from text items by their vertical position.
      return contents.map(function (c) {
        var lines = {};
        c.items.forEach(function (it) { var y = Math.round(it.transform[5] / 3); (lines[y] = lines[y] || []).push(it); });
        return Object.keys(lines).sort(function (a, b) { return b - a; }).map(function (y) {
          return lines[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; }).map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
        }).filter(Boolean).join("\n");
      }).join("\n");
    });
  }
  function fileBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  // Photos are resized to at most 2000 px on the long side so they upload quickly and stay under the size limit.
  function imageBase64(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }
  function askTranscriptAI(body) {
    if (!EP.transcript || !window.fetch) return Promise.reject(new Error("disabled"));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 58000);
    return fetch(EP.transcript, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (j) { if (!j || !j.transcript) throw new Error("bad"); return j.transcript; });
  }

  /* ---------- Modes ---------- */
  var tabs = $all("[role=tab]");
  function setMode(mode, focusTab) {
    state.mode = mode;
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-mode") === mode;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && focusTab) t.focus();
    });
    $all("[data-mode-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-mode-panel") !== mode; });
    $("[data-profile-note]").textContent = mode === "search" ? "Optional for search. Add it to see your chances." : "Filled in from your " + (mode === "transcript" ? "transcript" : "description") + ". Correct anything we got wrong.";
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { setMode(t.getAttribute("data-mode")); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      setMode(tabs[(i + d + tabs.length) % tabs.length].getAttribute("data-mode"), true);
    });
  });

  function busy(form, on, text) {
    var b = form.querySelector("[type=submit]");
    if (!b) return;
    if (!b._label) b._label = b.innerHTML;
    b.disabled = on;
    b.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span> ' + esc(text) : b._label;
  }
  function scrollToResults() {
    var el = window.matchMedia("(max-width: 900px)").matches ? document.getElementById("finder-insight") : document.getElementById("finder-results");
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  function startAnalysis() { state.aiConsent = false; adviceEl.hidden = true; state.advice = null; state.query = null; state.uni = ""; state.focus = ""; state.limit = PAGE; state.adviceKey = ""; daadEl.hidden = true; }

  // Search
  var searchForm = document.getElementById("mode-search"), qInput = document.getElementById("f-q");
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    ready.then(function () {
      state.aiConsent = false; state.advice = null; adviceEl.hidden = true; // the AI review belongs to an analysis, not a keyword search
      state.query = prepQuery(qInput.value);
      state.limit = PAGE; state.focus = "";
      render();
      searchDaad(qInput.value.trim());
      document.getElementById("finder-results").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  });
  var typing;
  qInput.addEventListener("input", function () {
    clearTimeout(typing);
    typing = setTimeout(function () { ready.then(function () { state.query = prepQuery(qInput.value); state.limit = PAGE; state.focus = ""; render(); }); }, 220);
  });
  $all("[data-q]").forEach(function (b) { b.addEventListener("click", function () { qInput.value = b.getAttribute("data-q"); searchForm.requestSubmit ? searchForm.requestSubmit() : searchForm.dispatchEvent(new Event("submit")); }); });

  // Describe
  var describeForm = document.getElementById("mode-describe");
  describeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = describeForm.elements.describe.value.trim();
    if (text.length < 8) { window.ddToast("Tell us a little about your degree first ✍️"); return; }
    ready.then(function () {
      startAnalysis();
      applyParsed(parseFreeText(text, false), "local");
      render();
      scrollToResults();
      if (!describeForm.elements.useAi.checked || !EP.transcript) return; // no AI without consent, including the review
      busy(describeForm, true, "AI is reading…");
      askTranscriptAI({ text: text }).then(function (t) {
        var ai = fromAI(t), local = state.extracted;
        // Keep what the student typed about interests; take the AI's reading of the academic facts.
        ai.interests = local.interests; ai.workYears = local.workYears;
        ["english", "engScore", "german"].forEach(function (k) { if (local[k] != null) ai[k] = local[k]; });
        if (!Object.keys(ai.weights).length) ai.weights = local.weights;
        applyParsed(ai, "ai");
        render();
      }).catch(function () {}).then(function () { busy(describeForm, false); requestAdvice(); });
    });
  });

  // Transcript
  var tForm = document.getElementById("mode-transcript"), fileInput = document.getElementById("f-file"), dz = $("[data-dropzone]");
  function showFile(f) {
    $("[data-dz-title]").textContent = f ? "📎 " + f.name : "Drop your transcript here or tap to choose";
    $("[data-dz-sub]").textContent = f ? Math.max(1, Math.round(f.size / 1024)) + " KB · ready to analyse" : "PDF, JPG or PNG · up to 10 MB · degree transcript, mark sheet or CV";
    dz.classList.toggle("has-file", !!f);
  }
  fileInput.addEventListener("change", function () { showFile(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function () { dz.classList.remove("is-drag"); }); });
  dz.addEventListener("drop", function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) { try { fileInput.files = e.dataTransfer.files; } catch (err) { /* older browsers */ } dz._file = e.dataTransfer.files[0]; showFile(dz._file); }
  });

  tForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var file = (fileInput.files && fileInput.files[0]) || dz._file, pasted = tForm.elements.pasted.value.trim();
    var useAi = tForm.elements.useAi.checked && !!EP.transcript;
    if (!file && pasted.length < 20) { window.ddToast("Choose your transcript file, or paste your courses 📄"); return; }
    if (file && file.size > MAX_FILE) { window.ddToast("That file is over 10 MB. Try a smaller scan or a screenshot."); return; }
    var isPdf = file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    var isImg = file && /^image\/(jpeg|png|webp|gif)$/.test(file.type);
    if (file && !isPdf && !isImg) { window.ddToast("Please upload a PDF, JPG or PNG."); return; }
    if (isImg && !useAi) { window.ddToast("Photos need AI reading: tick \"Let AI read my transcript\", or paste your courses."); return; }
    ready.then(function () {
      startAnalysis();
      busy(tForm, true, useAi ? "AI is reading your transcript…" : "Reading…");
      var localText = !file ? Promise.resolve(pasted) : isPdf ? pdfText(file).catch(function () { return ""; }) : Promise.resolve("");
      return localText.then(function (text) {
        var local = text.length > 80 ? parseFreeText(text, true) : null;
        if (local) { applyParsed(local, "local"); render(); scrollToResults(); }
        if (!useAi) {
          if (!local) window.ddToast("We couldn't read text from this PDF (it may be a scan). Tick \"Let AI read my transcript\" or paste your courses.");
          return false;
        }
        var body;
        if (!file) body = Promise.resolve({ text: pasted });
        else if (isImg) body = imageBase64(file).then(function (img) { return { file: img }; });
        else if (file.size <= MAX_AI_PDF) body = fileBase64(file).then(function (d) { return { file: { type: "application/pdf", data: d } }; });
        else body = Promise.resolve(text.length > 80 ? { text: text.slice(0, 30000) } : null);
        return body.then(function (b) {
          if (!b) { window.ddToast("This PDF is too large for AI reading (max 3 MB). Try photos of the pages instead."); return; }
          return askTranscriptAI(b).then(function (t) {
            applyParsed(fromAI(t), "ai");
            render();
            if (!local) scrollToResults();
          }).catch(function () {
            if (!local) window.ddToast("AI reading isn't available right now. Paste your courses instead, or try again shortly.");
          });
        });
      }).then(function (aiUsed) { busy(tForm, false); if (aiUsed !== false) requestAdvice(); }, function () { busy(tForm, false); });
    });
  });

  /* ---------- Profile + filter changes ---------- */
  $all("[data-p]", profileEl).forEach(function (el) {
    el.addEventListener("change", function () { state.limit = PAGE; render(); if (state.aiConsent) requestAdvice(); });
  });
  Object.keys(filters).forEach(function (k) { filters[k].addEventListener("change", function () { state.limit = PAGE; render(); }); });
  $("[data-reset]").addEventListener("click", function () {
    filters.topic.value = ""; filters.state.value = ""; filters.kind.value = ""; filters.sort.value = "chance";
    filters.english.checked = true; filters.free.checked = false; filters.eligible.checked = false; filters.shortlist.checked = false;
    state.uni = ""; state.focus = ""; state.limit = PAGE;
    render();
  });
  moreBtn.addEventListener("click", function () { state.limit += PAGE; render(); });
  root.addEventListener("click", function (e) {
    var star = e.target.closest("[data-star]");
    if (star) {
      var id = star.getAttribute("data-star"), i = shortlist.indexOf(id);
      if (i > -1) shortlist.splice(i, 1); else shortlist.push(id);
      store("dd-shortlist", shortlist);
      syncShortCount();
      star.setAttribute("aria-pressed", i === -1 ? "true" : "false");
      star.textContent = i === -1 ? "★ Shortlisted" : "☆ Shortlist";
      if (filters.shortlist.checked) render();
      return;
    }
    if (e.target.closest("[data-clear-scope]")) { state.uni = ""; state.focus = ""; render(); }
  });

  /* ---------- Share to a counsellor ---------- */
  root.querySelector("[data-wa-shortlist]").addEventListener("click", function () {
    if (!last) return;
    var byId = {};
    PROGS.forEach(function (p) { byId[p.id] = p; });
    var picks = shortlist.length ? last.rows.filter(function (x) { return shortlist.indexOf(x.p.id) > -1; }) : last.visible.slice(0, 6);
    var lines = ["Assalam o Alaikum DeutschDreams! Here are my programme matches 🇩🇪", ""];
    if (profile.degree || profile.qual) lines.push("Degree: " + (profile.degree || QUAL_LABEL[profile.qual]) + (profile.institution ? " · " + profile.institution : ""));
    if (profile.grade != null) lines.push("Grade: " + profile.grade + (profile.scale === "100" ? "%" : " CGPA") + (last.gg != null ? " → German grade ≈ " + last.gg.toFixed(1) : ""));
    if (profile.english) lines.push("English: " + profile.english.toUpperCase() + (profile.engScore != null ? " " + profile.engScore : "") + " · German: " + profile.german.toUpperCase());
    lines.push("", shortlist.length ? "My shortlist:" : "Top matches:");
    picks.slice(0, 10).forEach(function (x) { lines.push("• " + x.p.dg + " " + x.p.n + " – " + x.p.uni.n + (x.sc.chance != null ? " (" + x.sc.chance + "%)" : "")); });
    lines.push("", "Please check my eligibility and guide me.");
    window.open(window.ddWhatsAppLink(lines.join("\n")), "_blank", "noopener");
  });

  /* ---------- Start ---------- */
  syncShortCount();
  ready.then(function () {
    var params = new URLSearchParams(location.search);
    if (params.get("uni") && UNI[params.get("uni")]) state.uni = params.get("uni");
    if (params.get("p")) {
      var hit = PROGS.filter(function (p) { return p.id === params.get("p"); })[0];
      if (hit) { state.focus = hit.id; if (hit.l === "de") filters.english.checked = false; }
    }
    // Profile handed over from the Profile Analyzer
    var carried = false;
    [["target", "target"], ["qual", "qual"], ["grade", "grade"], ["scale", "scale"], ["english", "english"], ["score", "engScore"], ["german", "german"], ["field", "field"]].forEach(function (k) {
      var v = params.get(k[0]), el = profileEl.querySelector("[data-p='" + k[1] + "']");
      if (v === null || !el) return;
      if (el.tagName === "SELECT" && !el.querySelector("option[value='" + v.replace(/[^\w.]/g, "") + "']")) return;
      el.value = v; carried = true;
    });
    if (carried) { readControls(); state.source = "analyzer"; }
    if (params.get("q")) { qInput.value = params.get("q"); state.query = prepQuery(qInput.value); searchDaad(qInput.value.trim()); }
    if (location.hash === "#transcript") setMode("transcript");
    if (state.uni && UNI[state.uni] && !UNI[state.uni].np) state.uni = "";
    if (state.uni) {
      var hasEnglish = PROGS.some(function (p) { return p.u === state.uni && p.l !== "de" && p.lv === "m"; });
      if (!hasEnglish) filters.english.checked = false;
    }
    render();
  }).catch(function () {
    countEl.textContent = "Couldn't load the programme list. Please refresh the page.";
  });
})();
