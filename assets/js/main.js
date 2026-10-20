/* DeutschDreams — site interactions (vanilla JS, no dependencies) */
(function () {
  "use strict";

  // Edit these once and every WhatsApp / email link on the site updates.
  var SITE = {
    whatsapp: "4915567783533", // international format, no "+" or spaces
    email: "hello@deutschdreams.pk",
    aiEndpoint: "/api/analyze", // AI Profile Analyzer endpoint; set to "" to always use the on-device report
    transcriptEndpoint: "/api/transcript", // Programme Finder: AI transcript reading; "" = on-device reading only
    adviceEndpoint: "/api/programme-advice", // Programme Finder: AI review of the top matches; "" = off
    daadEndpoint: "/api/daad" // Programme Finder: live DAAD search; "" = our catalogue only
  };
  window.DD_SITE = SITE;

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  doc.classList.remove("no-js");
  doc.classList.add("js");

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  window.ddWhatsAppLink = function (text) {
    return "https://wa.me/" + SITE.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
  };

  window.ddToast = function (msg) {
    var t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("is-shown");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("is-shown"); }, 3200);
  };

  /* ---------- Page load curtain + split headline words ---------- */
  $all("[data-split]").forEach(function (el) {
    var i = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement("span"); w.className = "w";
            var inner = document.createElement("span"); inner.style.setProperty("--i", i++); inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR" && !child.matches(".rotator, .accent, .underline-swash")) {
          walk(child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          var w2 = document.createElement("span"); w2.className = "w";
          var inner2 = document.createElement("span"); inner2.style.setProperty("--i", i++);
          node.replaceChild(w2, child); inner2.appendChild(child); w2.appendChild(inner2);
        }
      });
    }
    walk(el);
    el.classList.add("split-words");
  });

  function markLoaded() { doc.classList.add("is-loaded"); }
  if (document.readyState === "complete") setTimeout(markLoaded, 250);
  else window.addEventListener("load", function () { setTimeout(markLoaded, 250); });
  setTimeout(markLoaded, 2500); // never trap the visitor behind the curtain

  // Curtain transition when navigating to another internal page
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank" || a.hasAttribute("download")) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^(https?:|mailto:|tel:|javascript:)/.test(href)) return;
    if (href.split("#")[0] === location.pathname.split("/").pop()) return;
    e.preventDefault();
    doc.classList.add("is-leaving");
    setTimeout(function () { location.href = href; }, 420);
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) doc.classList.remove("is-leaving"); });

  /* ---------- Header, scroll progress ---------- */
  var header = $(".site-header");
  var progress = $(".scroll-progress");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("is-scrolled", y > 30);
    if (progress) {
      var max = document.body.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var toggle = $(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $all(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { document.body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) { document.body.classList.remove("nav-open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
    });
  }

  /* ---------- WhatsApp / email links ---------- */
  $all("[data-wa]").forEach(function (a) {
    a.href = window.ddWhatsAppLink(a.getAttribute("data-wa") || "Assalam o Alaikum! I want to study in Germany. Please guide me.");
    a.target = "_blank"; a.rel = "noopener";
  });
  $all("[data-email]").forEach(function (a) { a.href = "mailto:" + SITE.email; if (!a.textContent.trim()) a.textContent = SITE.email; });
  $all("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = $all(".reveal, [data-reveal-self], .underline-swash, .gpa-band");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }
  // Stagger children: <div data-stagger> children get incremental delays
  $all("[data-stagger]").forEach(function (wrap) {
    var step = parseFloat(wrap.getAttribute("data-stagger")) || 0.08;
    Array.prototype.slice.call(wrap.children).forEach(function (child, i) {
      if (child.classList.contains("reveal")) child.style.setProperty("--d", (i * step).toFixed(2) + "s");
    });
  });

  /* ---------- Counters ---------- */
  function animateCount(el) {
    var to = parseFloat(el.getAttribute("data-to"));
    var dec = (el.getAttribute("data-to").split(".")[1] || "").length;
    var dur = 1800, start = null;
    if (reduceMotion) { el.textContent = to.toLocaleString("en-US", { minimumFractionDigits: dec }); return; }
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * eased).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var counters = $all("[data-to]");
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { cio.observe(c); });
  } else counters.forEach(animateCount);

  /* ---------- Rotating words ---------- */
  $all(".rotator").forEach(function (rot) {
    var items = $all("span", rot).filter(function (s) { return s.parentNode === rot; });
    if (items.length < 2) return;
    var idx = 0;
    items[0].classList.add("is-active");
    setInterval(function () {
      var cur = items[idx];
      cur.classList.remove("is-active"); cur.classList.add("is-leaving");
      setTimeout(function () { cur.classList.remove("is-leaving"); }, 700);
      idx = (idx + 1) % items.length;
      items[idx].classList.add("is-active");
    }, 2600);
  });

  /* ---------- Fine pointer effects: tilt, magnetic, glow ---------- */
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (finePointer && !reduceMotion) {
    $all(".tilt").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(900px) rotateY(" + x * 8 + "deg) rotateX(" + -y * 8 + "deg) translateY(-6px)";
      });
      card.addEventListener("mouseleave", function () { card.style.transform = ""; });
    });
    $all(".magnetic").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * 0.18 + "px," + (e.clientY - r.top - r.height / 2) * 0.28 + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
    });
    var glow = $(".cursor-glow");
    if (glow) {
      var gx = 0, gy = 0, tx = 0, ty = 0, running = false;
      document.addEventListener("mousemove", function (e) {
        tx = e.clientX; ty = e.clientY; doc.classList.add("has-cursor");
        if (!running) { running = true; requestAnimationFrame(loop); }
      });
      document.addEventListener("mouseleave", function () { doc.classList.remove("has-cursor"); });
      var loop = function () {
        gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
        glow.style.transform = "translate(" + gx + "px," + gy + "px)";
        if (Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5) requestAnimationFrame(loop); else running = false;
      };
    }
  }

  /* ---------- Testimonials carousel ---------- */
  $all("[data-carousel]").forEach(function (wrap) {
    var track = $(".reviews-track", wrap);
    var prev = $("[data-prev]", wrap), next = $("[data-next]", wrap);
    if (!track) return;
    function by(dir) {
      var card = track.firstElementChild;
      var w = card ? card.getBoundingClientRect().width + 22 : 400;
      track.scrollBy({ left: dir * w, behavior: reduceMotion ? "auto" : "smooth" });
    }
    if (prev) prev.addEventListener("click", function () { by(-1); });
    if (next) next.addEventListener("click", function () { by(1); });
    var auto = !reduceMotion && setInterval(function () {
      if (track.matches(":hover")) return;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) track.scrollTo({ left: 0, behavior: "smooth" });
      else by(1);
    }, 5000);
    track.addEventListener("touchstart", function () { clearInterval(auto); }, { passive: true });
  });

  /* ---------- FAQ: keep one open per group ---------- */
  $all(".faq").forEach(function (group) {
    $all("details", group).forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (d.open) $all("details", group).forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  });

  /* ---------- Journey timeline progress ---------- */
  var timeline = $(".timeline");
  if (timeline) {
    var fill = $(".timeline-fill", timeline), plane = $(".timeline-plane", timeline);
    var items = $all(".tl-item", timeline);
    var updateTimeline = function () {
      var r = timeline.getBoundingClientRect();
      var mid = window.innerHeight * 0.55;
      var p = Math.min(Math.max((mid - r.top) / r.height, 0), 1);
      if (fill) fill.style.height = (p * 100) + "%";
      if (plane) plane.style.top = "calc(" + (p * 100) + "% - 23px)";
      items.forEach(function (it) { it.classList.toggle("is-active", it.getBoundingClientRect().top < mid); });
    };
    window.addEventListener("scroll", updateTimeline, { passive: true });
    window.addEventListener("resize", updateTimeline);
    updateTimeline();
  }

  /* ---------- Pricing toggle (Bachelor / Master) ---------- */
  $all("[data-price-toggle]").forEach(function (tg) {
    var btns = $all("button", tg), pill = $(".pill", tg);
    function place(btn) {
      if (!pill) return;
      pill.style.width = btn.offsetWidth + "px";
      pill.style.transform = "translateX(" + (btn.offsetLeft - 6) + "px)";
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        place(b);
        var mode = b.getAttribute("data-mode");
        $all("[data-price-" + mode + "]").forEach(function (el) {
          el.classList.add("is-swapping");
          setTimeout(function () { el.textContent = el.getAttribute("data-price-" + mode); el.classList.remove("is-swapping"); }, 220);
        });
      });
    });
    var active = btns.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0] || btns[0];
    requestAnimationFrame(function () { place(active); });
    window.addEventListener("resize", function () { place(btns.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0]); });
  });

  /* ---------- Explorers (university lists): search, filters, paging, URL prefill ---------- */
  $all("[data-explorer]").forEach(function (ex) {
    var items = $all("[data-items] > *", ex);
    var q = $("[data-q]", ex), countEl = $("[data-count]", ex), more = $("[data-more]", ex), empty = $("[data-empty]", ex);
    var controls = $all("[data-f]", ex);
    var pageSize = parseInt(ex.getAttribute("data-page"), 10) || 30, limit = pageSize;
    var params = new URLSearchParams(location.search);
    if (q && params.get("q")) q.value = params.get("q");
    controls.forEach(function (c) {
      var v = params.get(c.getAttribute("data-f"));
      if (v === null) return;
      if (c.type === "checkbox") { if (v.split(",").indexOf(c.value) > -1) c.checked = true; }
      else c.value = v;
    });
    function matches(it) {
      var term = q ? q.value.trim().toLowerCase() : "";
      if (term && (it.getAttribute("data-search") || it.textContent.toLowerCase()).indexOf(term) === -1) return false;
      for (var i = 0; i < controls.length; i++) {
        var c = controls[i];
        if (c.type === "checkbox" ? !c.checked : !c.value) continue;
        var have = it.getAttribute("data-" + c.getAttribute("data-f")) || "";
        var mode = c.getAttribute("data-mode");
        var ok = mode === "contains" ? have.indexOf(c.value) > -1 : mode === "word" ? have.split(" ").indexOf(c.value) > -1 : have === c.value;
        if (!ok) return false;
      }
      return true;
    }
    function apply() {
      var total = 0;
      items.forEach(function (it) {
        var ok = matches(it);
        if (ok) total++;
        it.hidden = !ok || total > limit;
      });
      if (countEl) countEl.textContent = total;
      if (more) more.hidden = total <= limit;
      if (empty) empty.hidden = total > 0;
    }
    function reset() { limit = pageSize; apply(); }
    if (q) q.addEventListener("input", reset);
    controls.forEach(function (c) { c.addEventListener("change", reset); });
    if (more) more.addEventListener("click", function () { limit += pageSize; apply(); });
    var rs = $("[data-reset]", ex);
    if (rs) rs.addEventListener("click", function () {
      if (q) q.value = "";
      controls.forEach(function (c) { if (c.type === "checkbox") c.checked = false; else c.value = ""; });
      reset();
    });
    apply();
  });

  /* ---------- Flipbook (guides) ---------- */
  $all("[data-flipbook]").forEach(function (fb) {
    var pages = $all(".page", fb);
    var counter = $("[data-flip-count]", fb.parentNode);
    var at = 0;
    pages.forEach(function (p, i) { p.style.zIndex = pages.length - i; });
    function render() {
      pages.forEach(function (p, i) {
        var flipped = i < at;
        p.classList.toggle("is-flipped", flipped);
        p.style.zIndex = flipped ? i + 1 : pages.length - i;
      });
      if (counter) counter.textContent = at === 0 ? "Cover" : "Spread " + at + " / " + pages.length;
    }
    function go(n) { at = Math.max(0, Math.min(pages.length, n)); render(); }
    pages.forEach(function (p, i) {
      p.addEventListener("click", function () { go(p.classList.contains("is-flipped") ? i : i + 1); });
    });
    var wrap = fb.parentNode;
    var prevB = $("[data-flip-prev]", wrap), nextB = $("[data-flip-next]", wrap);
    if (prevB) prevB.addEventListener("click", function () { go(at - 1); });
    if (nextB) nextB.addEventListener("click", function () { go(at + 1); });
    $all("[data-open-spread]").forEach(function (b) {
      b.addEventListener("click", function () {
        go(parseInt(b.getAttribute("data-open-spread"), 10));
        fb.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      });
    });
    fb.setAttribute("tabindex", "0");
    fb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") go(at + 1);
      if (e.key === "ArrowLeft") go(at - 1);
    });
    render();
  });

  $all("[data-print]").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });

  /* ---------- Contact / lead forms → WhatsApp ---------- */
  $all("form[data-wa-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = new FormData(form);
      var lines = ["Assalam o Alaikum DeutschDreams! 🇩🇪", ""];
      data.forEach(function (v, k) { if (String(v).trim()) lines.push(k + ": " + v); });
      window.open(window.ddWhatsAppLink(lines.join("\n")), "_blank", "noopener");
      window.ddToast("Opening WhatsApp — our counsellor will reply shortly ✨");
      form.reset();
    });
  });
})();
