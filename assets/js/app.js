/* Daintta Learning app - shared learner application.
 * Works with any store implementing the interface described in README
 * (store-local.js). */
(function () {
  "use strict";
  const C = Course.config;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const view = () => $("#view");
  const catalog = Course.catalog;
  const modById = Object.fromEntries(catalog.map((m) => [m.id, m]));
  const assessById = Object.fromEntries((Course.assessments || []).map((a) => [a.moduleId, a]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const STAGES = C.stages.map(s => ({ name: s.name, range: [s.modules[0], s.modules[s.modules.length - 1]], note: s.note }));

  let state = null;       // learner progress, from the store
  const NAME_MAX = 100;
  let profile = null;     // learner profile, from the store

  /* ---------------- content loading ---------------- */
  Course._modules = {};
  Course.registerModule = (m) => { Course._modules[m.id] = m; };
  function loadModule(id) {
    if (Course._modules[id]) return Promise.resolve(Course._modules[id]);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `content/modules/${id}.js`;
      s.onload = () => (Course._modules[id] ? resolve(Course._modules[id]) : reject(new Error("Module content missing")));
      s.onerror = () => reject(new Error(`Could not load content/modules/${id}.js`));
      document.head.appendChild(s);
    });
  }

  /* ---------------- progress helpers ---------------- */
  const readSet = (id) => new Set((state.read && state.read[id]) || []);
  const lessonsRead = (id) => readSet(id).size;
  const allRead = (id) => lessonsRead(id) >= modById[id].lessons.length;
  const cert = (id) => state.certificates && state.certificates[id];
  const attempts = (id) => (state.attempts && state.attempts[id]) || [];
  const bestAttempt = (id) => attempts(id).reduce((b, a) => (!b || a.percent > b.percent ? a : b), null);
  function moduleStatus(id) {
    if (cert(id)) return "passed";
    if (lessonsRead(id) > 0 || attempts(id).length) return "progress";
    return "new";
  }
  const passedCount = () => catalog.filter((m) => cert(m.id)).length;
  const assessmentUnlocked = (id) => !C.requireAllLessonsRead || allRead(id);

  /* ---------------- layout ---------------- */
  function setNav(key) {
    $$(".nav a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === key));
    if (key) $$(".nav a").filter((a) => a.dataset.nav === key).forEach((a) => a.setAttribute("aria-current", "page"));
  }
  // Tell screen-reader users when a link opens in a new tab (WCAG advisory G201).
  function markNewTabLinks(root) {
    root.querySelectorAll('a[target="_blank"]:not([data-newtab])').forEach((a) => {
      a.setAttribute("data-newtab", "");
      a.insertAdjacentHTML("beforeend", '<span class="sr-only"> (opens in a new tab)</span>');
    });
  }
  function render(html, title, navKey) {
    view().innerHTML = html;
    markNewTabLinks(view());
    document.title = `${title ? title + " | " : ""}${C.programmeTitle} | ${C.organisation}`;
    setNav(navKey);
    window.scrollTo(0, 0);
    const h1 = $("h1", view());
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }
  function updateWho() {
    const who = $("#who");
    if (who) who.textContent = profile && profile.fullName ? profile.fullName : "";
  }

  /* ---------------- dashboard ---------------- */
  function satelliteTracking() {
    // Calculate completion % for each learning level based on certificates and progress
    const calcLevelComplete = (moduleIds) => {
      if (!moduleIds.length) return 0;
      const completed = moduleIds.filter(id => cert(id)).length;
      const inProgress = moduleIds.filter(id => !cert(id) && (lessonsRead(id) > 0 || attempts(id).length > 0)).length;
      const pctWithProgress = completed + (inProgress * 0.5); // in-progress modules count as 50%
      return Math.round((pctWithProgress / moduleIds.length) * 100);
    };

    // Rings follow the course stages (up to three); each stage's modules are counted towards its ring.
    const levels = (C.stages || []).slice(0, 3).map((s) => ({ name: s.name, ids: catalog.filter((m) => s.modules.includes(m.number)).map((m) => m.id) }));
    while (levels.length < 3) levels.push({ name: "", ids: [] });
    const [l1Complete, l2Complete, l3Complete] = levels.map((l) => calcLevelComplete(l.ids));
    
    // SVG dimensions
    const cx = 230, cy = 230;
    const r1 = 60, r2 = 120, r3 = 180; // orbit radii for levels 1, 2, 3
    
    // Calculate satellite positions based on progress (0-360°)
    const angle = (pct) => (pct / 100) * 360 * (Math.PI / 180);
    const posOnOrbit = (r, pct) => {
      const a = angle(pct);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    
    const [x1, y1] = posOnOrbit(r1, l1Complete);
    const [x2, y2] = posOnOrbit(r2, l2Complete);
    const [x3, y3] = posOnOrbit(r3, l3Complete);
    
    // Status colors and glow
    const status = (pct) => pct >= 100 ? "complete" : pct > 0 ? "progress" : "idle";
    const glowColor = (st) => st === "complete" ? "#0BB3AD" : st === "progress" ? "#c98200" : "#ccc";
    
    return `<div class="tracking-container">
      <svg class="tracking" viewBox="0 0 460 460" role="img" aria-label="Learning progress: ${levels.map((l, i) => `Level ${i + 1}${l.name ? " " + esc(l.name) : ""} ${Math.round([l1Complete, l2Complete, l3Complete][i])}%`).join(", ")}. ${passedCount()} of ${catalog.length} modules passed.">
      <defs>
        <style>
          @keyframes orbit-l1 {
            from { transform: rotate(0deg); transform-origin: 230px 230px; }
            to { transform: rotate(360deg); transform-origin: 230px 230px; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.8; r: 12; }
            50% { opacity: 1; r: 14; }
          }
          .sat-orbit-l1 { animation: orbit-l1 8s linear infinite; }
          .sat-complete { animation: pulse 2s ease-in-out infinite; }
        </style>
        <filter id="glow-complete"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="glow-progress"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="glow-idle"><feGaussianBlur stdDeviation="1" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      
      <!-- Background gradient -->
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1"/>
          <stop offset="100%" style="stop-color:#0f1419;stop-opacity:1"/>
        </radialGradient>
      </defs>
      
      <!-- Orbits with status-based colors -->
      <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="#0BB3AD" stroke-width="1.5" opacity="0.4"/>
      <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${l2Complete > 0 ? "#F59E0B" : "#D1D5DB"}" stroke-width="1.5" opacity="${l2Complete > 0 ? "0.4" : "0.2"}"/>
      <circle cx="${cx}" cy="${cy}" r="${r3}" fill="none" stroke="${l3Complete > 0 ? "#F59E0B" : "#9CA3AF"}" stroke-width="1.5" opacity="${l3Complete > 0 ? "0.4" : "0.2"}"/>
      
      <!-- Center core -->
      <circle cx="${cx}" cy="${cy}" r="25" fill="#0BB3AD" opacity="0.1"/>
      <circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="#0BB3AD" stroke-width="2" opacity="0.6"/>
      
      <!-- Level labels with status-based colors -->
      <text x="${cx + r1 + 15}" y="${cy}" text-anchor="start" font-size="11" fill="#0BB3AD" font-family="var(--font)" font-weight="600">L1</text>
      <text x="${cx + r2 + 15}" y="${cy}" text-anchor="start" font-size="11" fill="${l2Complete > 0 ? "#F59E0B" : "#9CA3AF"}" font-family="var(--font)" font-weight="600">L2</text>
      <text x="${cx + r3 + 15}" y="${cy}" text-anchor="start" font-size="11" fill="${l3Complete > 0 ? "#F59E0B" : "#9CA3AF"}" font-family="var(--font)" font-weight="600">L3</text>
      
      <!-- Satellites -->
      <!-- Level 1: Continuously orbiting (complete) -->
      <g class="sat-orbit-l1">
        <circle cx="${x1}" cy="${y1}" r="12" fill="${glowColor(status(l1Complete))}" class="sat-body sat-complete" filter="url(#glow-complete)"/>
        <text x="${x1}" y="${y1}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="#000" pointer-events="none">1</text>
      </g>
      
      <!-- Level 2: Stationary at progress point -->
      <circle cx="${x2}" cy="${y2}" r="12" fill="${glowColor(status(l2Complete))}" class="sat-body" filter="${status(l2Complete) === "progress" ? "url(#glow-progress)" : status(l2Complete) === "complete" ? "url(#glow-complete)" : "url(#glow-idle)"}"/>
      <text x="${x2}" y="${y2}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="${l2Complete > 0 ? "#000" : "#999"}" pointer-events="none">2</text>
      <text x="${x2}" y="${y2 + 22}" text-anchor="middle" font-size="8" fill="#aaa">${Math.round(l2Complete)}%</text>
      
      <!-- Level 3: Stationary at start or progress point -->
      <circle cx="${x3}" cy="${y3}" r="12" fill="${glowColor(status(l3Complete))}" class="sat-body" filter="${status(l3Complete) === "progress" ? "url(#glow-progress)" : status(l3Complete) === "complete" ? "url(#glow-complete)" : "url(#glow-idle)"}"/>
      <text x="${x3}" y="${y3}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="${l3Complete > 0 ? "#000" : "#999"}" pointer-events="none">3</text>
      <text x="${x3}" y="${y3 + 22}" text-anchor="middle" font-size="8" fill="#aaa">${Math.round(l3Complete)}%</text>
      
      <!-- Center: Programme status -->
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="9" fill="#0BB3AD" font-weight="600">MISSION</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="14" font-weight="700" fill="#0BB3AD">${passedCount()}/${catalog.length}</text>
    </svg>
    </div>`;
  }

  function dashboard() {
    const passed = passedCount();
    const totalLessons = catalog.reduce((n, m) => n + m.lessons.length, 0);
    const readLessons = catalog.reduce((n, m) => n + Math.min(lessonsRead(m.id), m.lessons.length), 0);
    const next = catalog.find((m) => !cert(m.id));
    const first = profile && profile.fullName ? profile.fullName.split(" ")[0] : "";
    const rows = (from, to) => catalog.filter((m) => m.number >= from && m.number <= to).map((m) => {
      const st = moduleStatus(m.id);
      const read = Math.min(lessonsRead(m.id), m.lessons.length);
      const pct = Math.round((read / m.lessons.length) * 100);
      const c = cert(m.id);
      const tries = attempts(m.id);
      const locked = !assessmentUnlocked(m.id) && allRead(m.id);

      let badge = `<span class="status">Not started</span>`;
      if (c) badge = `<span class="status passed">Passed · ${c.percent}%</span>`;
      else if (tries.length) badge = `<span class="status failed">Not yet passed</span>`;
      else if (allRead(m.id)) badge = `<span class="status progress">Assessment ready</span>`;
      else if (st === "progress") badge = `<span class="status progress">In progress</span>`;

      let actionBtn = '';
      if (c) {
        actionBtn = `<span class="action-btn disabled">Complete</span>`;
      } else if (locked) {
        actionBtn = `<span class="action-btn disabled">Locked</span>`;
      } else if (st === "passed") {
        actionBtn = `<span class="action-btn disabled">Complete</span>`;
      } else {
        const read = readSet(m.id);
        const nextLesson = st === "new" ? m.lessons[0] : m.lessons.find(l => !read.has(l.id));
        const href = nextLesson ? `#/module/${m.id}/lesson/${nextLesson.id}` : `#/module/${m.id}`;
        const label = st === "progress" ? "Continue" : "Get Started";
        actionBtn = `<a href="${href}" class="action-btn">${label}</a>`;
      }

      return `<li class="module-row ${st}">
        <div class="num" aria-hidden="true">${pad(m.number)}</div>
        <div><h3><a href="#/module/${m.id}">${esc(m.title)}</a></h3><p>${m.lessons.length} lessons · 15-question assessment</p></div>
        <div class="m-meter"><div class="meter ${read === m.lessons.length ? "done" : ""}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Lessons read for module ${m.number}"><i style="width:${pct}%"></i></div>
          <div class="meter-label">${read} of ${m.lessons.length} lessons read</div></div>
        <div class="m-status">${badge}${actionBtn}</div></li>`;
    }).join("");
    render(`
      <section class="hero">
        <div>
          <h1>${first ? `${readLessons ? "Welcome back" : "Welcome"}, ${esc(first)}` : esc(C.programmeTitle)}</h1>
          <p class="lead">${C.programmeSubtitle ? esc(C.programmeSubtitle) + ". " : ""}Work through each module at your own pace. Each module ends with an assessment; pass it with ${C.passMark}% or more to earn a certificate.</p>
          <div class="hero-stats">
            <div><b>${passed}/${catalog.length}</b><span>modules passed</span></div>
            <div><b>${readLessons}/${totalLessons}</b><span>lessons read</span></div>
            <div><b>${Object.keys(state.certificates || {}).filter((k) => k !== "programme").length}</b><span>certificates earned</span></div>
          </div>
          <div class="btn-row">
            ${next ? `<a class="btn" href="#/module/${next.id}">${lessonsRead(next.id) ? "Continue" : "Start"} Module ${next.number}</a>` : `<a class="btn lock" href="#/certificate/programme">View programme certificate</a>`}
            <a class="btn secondary" href="#/certificates">Your certificates</a>
          </div>
        </div>
        <div class="skyplot-wrap">${satelliteTracking()}
          <div class="legend" aria-hidden="true"><span><i></i>Not started</span><span><i class="l-progress"></i>In progress</span><span><i class="l-passed"></i>Orbiting</span></div>
        </div>
      </section>
      ${STAGES.map((s) => `<section aria-labelledby="st-${s.range[0]}"><div class="stage-head"><h2 id="st-${s.range[0]}">${s.name}</h2><span>Modules ${s.range[0]}–${s.range[1]}: ${s.note}</span></div>
        <ol class="module-list">${rows(s.range[0], s.range[1])}</ol></section>`).join("")}
    `, "", "home");
  }

  /* ---------------- module pages ---------------- */
  function toc(m, current) {
    const read = readSet(m.id);
    const unlocked = assessmentUnlocked(m.id);
    const items = m.lessons.map((l, i) => `<li><a href="#/module/${m.id}/lesson/${l.id}" class="${read.has(l.id) ? "done" : ""}" ${current === l.id ? 'aria-current="page"' : ""}>
      <span class="tick" aria-hidden="true"></span><span>${esc(l.title)}${read.has(l.id) ? '<span class="sr-only"> (read)</span>' : ""}</span></a></li>`).join("");
    return `<nav class="sidebar" aria-label="Module ${m.number} contents"><details ${window.innerWidth > 960 ? "open" : ""}>
      <summary>Module ${m.number} contents <span class="muted small">${lessonsRead(m.id)}/${m.lessons.length}</span></summary>
      <div class="toc">
        <p class="toc-title">Module ${pad(m.number)}</p>
        <ol><li><a href="#/module/${m.id}" ${current === "overview" ? 'aria-current="page"' : ""}><span class="tick" aria-hidden="true" style="border:0"></span><span>Overview</span></a></li></ol>
        <p class="toc-title">Lessons</p><ol>${items}</ol>
        <p class="toc-title">Check your understanding</p>
        <ol>
          <li><a href="#/module/${m.id}/practice" ${current === "practice" ? 'aria-current="page"' : ""} class="${state.practice && state.practice[m.id] ? "done" : ""}"><span class="tick" aria-hidden="true"></span><span>Practice questions</span></a></li>
          <li><a href="#/module/${m.id}/assessment" ${current === "assessment" ? 'aria-current="page"' : ""} class="${cert(m.id) ? "done" : unlocked ? "" : "locked"}"><span class="tick" aria-hidden="true"></span><span>Assessment${unlocked ? "" : " (read all lessons to unlock)"}</span></a></li>
          ${cert(m.id) ? `<li><a href="#/certificate/${m.id}"><span class="tick" aria-hidden="true" style="border:0"></span><span>Certificate</span></a></li>` : ""}
        </ol>
      </div></details></nav>`;
  }

  async function withModule(id, fn) {
    if (!modById[id]) return notFound();
    view().innerHTML = `<div class="loading" role="status">Loading module…</div>`;
    try {
      fn(await loadModule(id));
    } catch (e) {
      console.error(`Module load error for ${id}:`, e);
      render(`
        <div style="max-width:600px;margin:40px auto">
          <h1>Module Load Error</h1>
          <p class="muted">Sorry, we couldn't load this module. This might be a temporary issue.</p>
          <div class="notice error" style="margin:20px 0">${esc(e.message)}</div>
          <div class="btn-row">
            <button class="btn" onclick="location.reload()">Reload Page</button>
            <a class="btn secondary" href="#/">Back to Modules</a>
          </div>
        </div>
      `, "Error");
    }
  }

  function moduleOverview(m) {
    const meta = modById[m.id];
    const firstUnread = m.lessons.find((l) => !readSet(m.id).has(l.id)) || m.lessons[0];
    const best = bestAttempt(m.id);
    render(`<div class="module-layout">${toc(meta, "overview")}
      <article class="lesson">
        <div class="crumbs"><a href="#/">Modules</a> / Module ${m.number}</div>
        <h1>Module ${m.number}: ${esc(m.title)}</h1>
        ${m.subtitle ? `<p class="lead">${esc(m.subtitle)}</p>` : ""}
        <div class="facts">
          <div><b>${m.lessons.length}</b><span>lessons</span></div>
          <div><b>${lessonsRead(m.id)}</b><span>lessons read</span></div>
          <div><b>${m.practice.length}</b><span>practice questions</span></div>
          <div><b>${cert(m.id) ? cert(m.id).percent + "%" : best ? best.percent + "%" : "–"}</b><span>${cert(m.id) ? "assessment passed" : best ? "best attempt" : "assessment score"}</span></div>
        </div>
        ${m.objectives.length ? `<h2>By the end of this module you should be able to</h2><ul class="objectives">${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
        <div class="btn-row">
          <a class="btn" href="#/module/${m.id}/lesson/${firstUnread.id}">${lessonsRead(m.id) ? "Continue reading" : "Start the first lesson"}</a>
          ${assessmentUnlocked(m.id) ? `<a class="btn secondary" href="#/module/${m.id}/assessment">${cert(m.id) ? "Review assessment" : "Take the assessment"}</a>` : ""}
        </div>
      </article></div>`, `Module ${m.number}`, "home");
  }

  function lessonView(m, lessonId) {
    const idx = m.lessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return notFound();
    const l = m.lessons[idx];
    const prev = m.lessons[idx - 1], next = m.lessons[idx + 1];
    const isRead = readSet(m.id).has(l.id);
    render(`<div class="module-layout">${toc(modById[m.id], l.id)}
      <article class="lesson">
        <div class="crumbs"><a href="#/">Modules</a> / <a href="#/module/${m.id}">Module ${m.number}</a> / Lesson ${idx + 1} of ${m.lessons.length}</div>
        <h1>${esc(l.title)}</h1>
        <div class="lesson-body">${l.html}</div>
        <div class="lesson-nav">
          ${prev ? `<a class="btn secondary" href="#/module/${m.id}/lesson/${prev.id}">Previous lesson</a>` : `<a class="btn secondary" href="#/module/${m.id}">Module overview</a>`}
          <button class="btn ${isRead ? "secondary" : ""}" id="mark-next">${next ? (isRead ? "Next lesson" : "Mark as read and continue") : (isRead ? "Go to practice questions" : "Mark as read and finish")}</button>
        </div>
      </article></div>`, l.title, "home");
    $$(".figure-zoom", view()).forEach((b) => b.addEventListener("click", () => openLightbox($("img", b))));
    $("#mark-next").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      try {
        if (!isRead) { await Course.store.markRead(m.id, l.id); await refreshState(); }
        location.hash = next ? `#/module/${m.id}/lesson/${next.id}` : `#/module/${m.id}/practice`;
      } catch (err) { e.currentTarget.disabled = false; alert(err.message); }
    });
  }

  function openLightbox(img) {
    const d = $("#lightbox");
    $("img", d).src = img.src; $("img", d).alt = img.alt;
    d.showModal();
  }

  /* ---------------- practice ---------------- */
  function practiceView(m) {
    if (!m.practice.length) {
      return render(`<div class="module-layout">${toc(modById[m.id], "practice")}<article class="lesson"><h1>Practice questions</h1><p class="empty">This module has no practice questions.</p></article></div>`, "Practice", "home");
    }
    const qs = m.practice;
    render(`<div class="module-layout">${toc(modById[m.id], "practice")}
      <article class="lesson">
        <div class="crumbs"><a href="#/">Modules</a> / <a href="#/module/${m.id}">Module ${m.number}</a> / Practice</div>
        <h1>Practice questions</h1>
        <p class="lead">These are the knowledge-check questions from the module. Check each answer as you go. Practice results do not count towards your certificate.</p>
        <div id="practice">${qs.map((q, i) => `
          <div class="practice-q question" data-i="${i}"><fieldset>
            <legend>${i + 1}. ${esc(q.prompt)}</legend>
            <p class="qhint">${q.multi ? "Select all that apply" : "Select one answer"}</p>
            <div class="choices">${q.options.map((o) => `<label class="choice"><input type="${q.multi ? "checkbox" : "radio"}" name="p${i}" value="${o.id}"><span>${esc(o.text)}</span></label>`).join("")}</div>
            </fieldset>
            <div class="btn-row" style="margin-top:12px"><button class="btn secondary check">Check answer</button></div>
            <div class="fb" aria-live="polite"></div>
          </div>`).join("")}</div>
        <div class="panel" id="p-summary" hidden></div>
        <div class="lesson-nav">
          <a class="btn secondary" href="#/module/${m.id}">Module overview</a>
          ${assessmentUnlocked(m.id) ? `<a class="btn" href="#/module/${m.id}/assessment">Go to the assessment</a>` : `<span class="muted small">Read all lessons to unlock the assessment.</span>`}
        </div>
      </article></div>`, "Practice", "home");
    const results = {};
    $$(".practice-q", view()).forEach((el) => {
      const i = +el.dataset.i, q = qs[i];
      $(".check", el).addEventListener("click", async () => {
        const chosen = $$("input:checked", el).map((x) => x.value);
        if (!chosen.length) { $(".fb", el).innerHTML = `<div class="feedback bad">Choose an answer first.</div>`; return; }
        const ok = chosen.length === q.answer.length && q.answer.every((a) => chosen.includes(a));
        results[i] = ok;
        $$(".choice", el).forEach((c) => {
          const v = $("input", c).value;
          c.classList.toggle("correct", q.answer.includes(v));
          c.classList.toggle("incorrect", chosen.includes(v) && !q.answer.includes(v));
          $("input", c).disabled = true;
        });
        $(".check", el).remove();
        $(".fb", el).innerHTML = `<div class="feedback ${ok ? "ok" : "bad"}"><b>${ok ? "Correct" : `Not quite. The answer is ${q.answer.join(", ")}.`}</b>${esc(q.rationale)}</div>`;
        if (Object.keys(results).length === qs.length) {
          const score = Object.values(results).filter(Boolean).length;
          const s = $("#p-summary");
          s.hidden = false;
          s.innerHTML = `<h2>You scored ${score} out of ${qs.length}</h2><p class="muted">${score === qs.length ? "Well done." : "Review the rationale for any question you missed."}</p>`;
          try { await Course.store.recordPractice(m.id, score, qs.length); await refreshState(); } catch (e) { /* non-critical */ }
        }
      });
    });
    // label options with letters as in the source documents
    $$(".practice-q", view()).forEach((el) => $$(".choice span", el).forEach((sp, j) => { sp.textContent = `${qs[+el.dataset.i].options[j].id}. ${sp.textContent}`; }));
  }

  /* ---------------- assessment ---------------- */
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function assessmentIntro(m) {
    const a = assessById[m.id];
    const meta = modById[m.id];
    const tries = attempts(m.id);
    const c = cert(m.id);
    const needed = a ? Math.ceil((C.passMark / 100) * a.questions.length) : 0;
    const locked = !assessmentUnlocked(m.id);
    render(`<div class="module-layout">${toc(meta, "assessment")}
      <article class="lesson">
        <div class="crumbs"><a href="#/">Modules</a> / <a href="#/module/${m.id}">Module ${m.number}</a> / Assessment</div>
        <h1>Module ${m.number} assessment</h1>
        ${!a ? `<p class="empty">No assessment has been set up for this module yet.</p>` : `
        <div class="facts">
          <div><b>${a.questions.length}</b><span>questions</span></div>
          <div><b>${C.passMark}%</b><span>pass mark (${needed} correct)</span></div>
          <div><b>${tries.length}</b><span>attempts so far</span></div>
          <div><b>${c ? c.percent + "%" : "–"}</b><span>${c ? "certificate score" : "not yet passed"}</span></div>
        </div>
        <p>Questions and answer options appear in a random order each time. You can move between questions and change your answers before you submit. There is no time limit${C.maxAttempts ? `, and you have up to ${C.maxAttempts} attempts` : " and you can retake the assessment if needed"}.</p>
        ${c ? `<div class="notice ok">You passed this assessment on ${fmtDate(c.issuedAt)}. You can retake it for practice; your certificate will not change.</div>` : ""}
        ${locked ? `<div class="notice">Read all ${meta.lessons.length} lessons to unlock the assessment. You have read ${lessonsRead(m.id)}.</div>` : ""}
        <div class="btn-row">
          <button class="btn" id="start" ${locked ? "disabled" : ""}>${tries.length ? "Start a new attempt" : "Start the assessment"}</button>
          ${c ? `<a class="btn secondary" href="#/certificate/${m.id}">View certificate</a>` : ""}
        </div>`}
      </article></div>`, `Module ${m.number} assessment`, "home");
    const start = $("#start");
    if (start) start.addEventListener("click", () => runAssessment(m));
  }

  function runAssessment(m) {
    const a = assessById[m.id];
    const qs = shuffle(a.questions).map((q) => ({
      ...q,
      options: q.options ? (q.type === "truefalse" ? q.options : shuffle(q.options)) : undefined,
      right: q.right ? shuffle(q.right) : undefined,
      items: q.items ? shuffle(q.items) : undefined,
    }));
    const answers = {};   // qid -> ui state
    qs.forEach((q) => { if (q.type === "order") answers[q.id] = q.items.map((i) => i.id); });
    const orderTouched = new Set();
    let cur = 0;
    let dirty = false;
    const leaveGuard = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", leaveGuard);
    Course._leaveGuard = () => {
      if (dirty && !confirm("Leave the assessment? Your answers will not be saved.")) return false;
      window.removeEventListener("beforeunload", leaveGuard); dirty = false; Course._leaveGuard = null; return true;
    };

    // Always returns true or false. classList.toggle treats undefined as "flip", so a non-boolean
    // result would switch the progress dot on and off on every answer.
    const isAnswered = (q) => {
      const v = answers[q.id];
      if (q.type === "match") return !!v && q.left.every((l) => !!v[l.id]);
      if (q.type === "order") return orderTouched.has(q.id);
      if (q.type === "multi") return !!v && v.length > 0;
      return !!v;
    };
    const canonical = (q) => {
      const v = answers[q.id];
      if (v == null) return "";
      if (q.type === "multi") return v.slice().sort().join(",");
      if (q.type === "match") return q.left.map((l) => l.id).sort().map((l) => `${l}=${v[l] || ""}`).join(";");
      if (q.type === "order") return v.join(">");
      return v;
    };

    function qBody(q) {
      const v = answers[q.id];
      if (q.type === "single" || q.type === "truefalse" || q.type === "multi") {
        const multi = q.type === "multi";
        return `<fieldset><legend class="prompt">${esc(q.prompt)}</legend>
          <p class="qhint">${multi ? "Select all that apply." : q.type === "truefalse" ? "Is this statement true or false?" : "Select one answer."}</p>
          <div class="choices">${q.options.map((o) => `<label class="choice"><input type="${multi ? "checkbox" : "radio"}" name="q" value="${o.id}" ${multi ? (v && v.includes(o.id) ? "checked" : "") : v === o.id ? "checked" : ""}><span>${esc(o.text)}</span></label>`).join("")}</div></fieldset>`;
      }
      if (q.type === "match") {
        return `<div class="prompt" id="qp">${esc(q.prompt)}</div><p class="qhint">Choose the matching item for each row.</p>
          <div role="group" aria-labelledby="qp">${q.left.map((l, i) => `<div class="match-row"><label for="m${i}">${esc(l.text)}</label>
          <select id="m${i}" data-left="${l.id}"><option value="">Choose…</option>${q.right.map((r) => `<option value="${r.id}" ${v && v[l.id] === r.id ? "selected" : ""}>${esc(r.text)}</option>`).join("")}</select></div>`).join("")}</div>`;
      }
      if (q.type === "order") {
        const byId = Object.fromEntries(q.items.map((i) => [i.id, i]));
        return `<div class="prompt" id="qp">${esc(q.prompt)}</div><p class="qhint">Use the arrow buttons to put the items in order, first at the top.</p>
          <ol class="order-list" aria-labelledby="qp">${v.map((id, i) => `<li data-id="${id}"><span>${esc(byId[id].text)}</span><span class="moves">
          <button type="button" data-move="-1" aria-label="Move up: ${esc(byId[id].text)}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-move="1" aria-label="Move down: ${esc(byId[id].text)}" ${i === v.length - 1 ? "disabled" : ""}>↓</button></span></li>`).join("")}</ol>`;
      }
      return "";
    }

    function draw(focusSel) {
      const q = qs[cur];
      render(`<div class="lesson" style="max-width:820px;margin:0 auto">
        <div class="crumbs">Module ${m.number} assessment</div>
        <div class="quiz-head"><h1 style="font-size:24px;margin:0">Question ${cur + 1} of ${qs.length}</h1>
          <div class="qdots" role="navigation" aria-label="Questions">${qs.map((x, i) => `<button type="button" data-go="${i}" class="${isAnswered(x) ? "answered" : ""}" ${i === cur ? 'aria-current="step"' : ""} aria-label="Question ${i + 1}${isAnswered(x) ? ", answered" : ""}">${i + 1}</button>`).join("")}</div></div>
        <div class="panel question">${qBody(q)}</div>
        <div class="lesson-nav">
          <button class="btn secondary" id="prev" ${cur === 0 ? "disabled" : ""}>Previous</button>
          ${cur < qs.length - 1 ? `<button class="btn" id="next">Next question</button>` : `<button class="btn lock" id="review">Review and submit</button>`}
        </div></div>`, `Module ${m.number} assessment`, "home");
      if (focusSel) { const f = $(focusSel, view()); if (f) f.focus(); }
      const panel = $(".question", view());
      panel.addEventListener("change", (e) => {
        dirty = true;
        const t = e.target;
        if (q.type === "multi") answers[q.id] = $$("input:checked", panel).map((x) => x.value);
        else if (q.type === "match") { answers[q.id] = answers[q.id] || {}; answers[q.id][t.dataset.left] = t.value; }
        else answers[q.id] = t.value;
        refreshDots();
      });
      panel.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-move]");
        if (!b) return;
        const li = b.closest("li"), arr = answers[q.id], i = arr.indexOf(li.dataset.id), j = i + (+b.dataset.move);
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        orderTouched.add(q.id); dirty = true;
        draw(`li[data-id="${li.dataset.id}"] button[data-move="${b.dataset.move}"]:not([disabled]), li[data-id="${li.dataset.id}"] button[data-move]:not([disabled])`);
      });
      $$(".qdots button", view()).forEach((b) => b.addEventListener("click", () => { cur = +b.dataset.go; draw(); }));
      $("#prev").addEventListener("click", () => { cur--; draw(); });
      const nx = $("#next"); if (nx) nx.addEventListener("click", () => { if (q.type === "order") orderTouched.add(q.id); cur++; draw(); });
      const rv = $("#review"); if (rv) rv.addEventListener("click", () => { if (q.type === "order") orderTouched.add(q.id); review(); });
    }
    function refreshDots() {
      $$(".qdots button", view()).forEach((b, i) => b.classList.toggle("answered", isAnswered(qs[i]) === true));
    }
    function review() {
      const missing = qs.map((q, i) => (isAnswered(q) ? null : i + 1)).filter(Boolean);
      render(`<div class="lesson" style="max-width:820px;margin:0 auto">
        <div class="crumbs">Module ${m.number} assessment</div>
        <h1>Ready to submit?</h1>
        <p class="lead">You have answered ${qs.length - missing.length} of ${qs.length} questions. You need ${Math.ceil((C.passMark / 100) * qs.length)} correct to pass.</p>
        ${missing.length ? `<div class="notice">Unanswered: question${missing.length > 1 ? "s" : ""} ${missing.join(", ")}. Unanswered questions are marked as incorrect.</div>` : ""}
        <div class="qdots" style="margin:20px 0">${qs.map((x, i) => `<button type="button" data-go="${i}" class="${isAnswered(x) ? "answered" : ""}" aria-label="Go to question ${i + 1}">${i + 1}</button>`).join("")}</div>
        <div class="btn-row"><button class="btn secondary" id="back">Back to questions</button><button class="btn lock" id="submit">Submit answers</button></div>
        <div id="err" aria-live="assertive"></div></div>`, `Module ${m.number} assessment`, "home");
      $$(".qdots button", view()).forEach((b) => b.addEventListener("click", () => { cur = +b.dataset.go; draw(); }));
      $("#back").addEventListener("click", () => draw());
      $("#submit").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = "Submitting…";
        const payload = Object.fromEntries(qs.map((q) => [q.id, canonical(q)]));
        try {
          const res = await Course.store.submitAssessment(m.id, payload);
          dirty = false; window.removeEventListener("beforeunload", leaveGuard); Course._leaveGuard = null;
          await refreshState();
          results(m, qs, answers, res, canonical);
        } catch (err) {
          e.currentTarget.disabled = false; e.currentTarget.textContent = "Submit answers";
          $("#err").innerHTML = `<div class="notice error" style="margin-top:16px">${esc(err.message)}</div>`;
        }
      });
    }
    draw();
  }

  function describeAnswer(q, canon) {
    if (!canon) return "No answer";
    if (q.type === "single" || q.type === "truefalse") return (q.options.find((o) => o.id === canon) || {}).text || "";
    if (q.type === "multi") return canon.split(",").map((id) => (q.options.find((o) => o.id === id) || {}).text).filter(Boolean).join("; ");
    if (q.type === "match") return canon.split(";").map((p) => { const [l, r] = p.split("="); return `${(q.left.find((x) => x.id === l) || {}).text} → ${(q.right.find((x) => x.id === r) || {}).text || "?"}`; }).join("; ");
    if (q.type === "order") return canon.split(">").map((id, i) => `${i + 1}. ${(q.items.find((x) => x.id === id) || {}).text}`).join("  ");
    return canon;
  }

  function results(m, qs, answers, res, canonical) {
    const byId = Object.fromEntries(res.results.map((r) => [r.id, r]));
    const circ = 2 * Math.PI * 50, dash = (res.percent / 100) * circ;
    const showAnswers = res.passed || C.revealAnswersOnFail;
    
    // Generate certificate PDF when assessment is passed
    if (res.passed) {
      (async () => {
        await generateCertificatePDF(m.id);
      })();
    }
    const needed = Math.ceil((C.passMark / 100) * res.total);
    render(`<div class="lesson" style="max-width:860px;margin:0 auto">
      <div class="crumbs"><a href="#/module/${m.id}">Module ${m.number}</a> / Assessment result</div>
      <div class="panel result-banner">
        <svg class="score-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="10"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="${res.passed ? "var(--lock)" : "var(--fault)"}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 60 60)"/>
          <text x="60" y="60" text-anchor="middle" dominant-baseline="central">${res.percent}%</text></svg>
        <div><h1 style="margin-bottom:6px">${res.passed ? "You passed" : "Not passed this time"}</h1>
          <p class="muted" style="margin:0">You answered ${res.score} of ${res.total} correctly. The pass mark is ${C.passMark}% (${needed} correct).</p>
          <div class="btn-row" style="margin-top:16px">
            ${res.passed ? `<a class="btn lock" href="#/certificate/${m.id}">View your certificate</a>` : `<button class="btn" id="retake">Retake the assessment</button><a class="btn secondary" href="#/module/${m.id}">Review the module</a>`}
            ${res.programmeCertificate ? `<a class="btn secondary" href="#/certificate/programme">Programme certificate</a>` : ""}
          </div></div>
      </div>
      ${res.programmeCertificate ? `<div class="notice ok" style="margin-top:16px">You have now passed all ${catalog.length} ${catalog.length === 1 ? "module" : "modules"} and earned the ${C.programmeTitle} certificate.</div>` : ""}
      <div class="panel"><h2>${showAnswers ? "Review your answers" : "Questions to revisit"}</h2>
      ${!showAnswers ? `<p class="muted">Correct answers are shown once you pass. These are the questions you answered incorrectly; revisit the related lessons before you retake the assessment.</p>` : ""}
      ${qs.map((q, i) => {
        const r = byId[q.id] || {};
        if (!showAnswers && r.correct) return "";
        return `<div class="review-item"><h3>${r.correct ? "✓" : "✗"} ${i + 1}. ${esc(q.prompt)}</h3>
          <div class="your">Your answer: ${esc(describeAnswer(q, canonical(q)))}</div>
          ${showAnswers && !r.correct && r.answer ? `<div class="your">Correct answer: ${esc(describeAnswer(q, r.answer))}</div>` : ""}
          ${showAnswers && r.explanation ? `<div class="feedback ${r.correct ? "ok" : "bad"}">${esc(r.explanation)}</div>` : ""}</div>`;
      }).join("")}</div>
    </div>`, "Assessment result", "home");
    const rt = $("#retake");
    if (rt) rt.addEventListener("click", () => runAssessment(m));
  }

  /* ---------------- certificates ---------------- */
  function certificatesView() {
    const programme = cert("programme");
    const passed = passedCount();
    render(`<h1>Your certificates</h1>
      <p class="lead">Pass each module assessment to earn its certificate. When every module is passed, the programme certificate is awarded.</p>
      <div class="level-section">
        <div class="level-grid">
          ${catalog.map((m) => { const c = cert(m.id); return `<div class="cert-card ${c ? "" : "pending"}">
            <span class="muted small">Module ${m.number}</span><h3>${esc(m.title)}</h3>
            ${c ? `<span class="small">Passed ${fmtDate(c.issuedAt)} with ${c.percent}%</span><div><a class="btn lock" href="#/certificate/${m.id}">Open</a></div>` : `<span class="small muted">Not yet earned</span>`}</div>`; }).join("")}
          <div class="cert-card ${programme ? "active" : "pending"}">
            <span class="muted small">Programme</span><h3>${esc(C.programmeTitle)}</h3>
            ${programme ? `<span class="small">Awarded ${fmtDate(programme.issuedAt)}</span><div><a class="btn lock" href="#/certificate/programme">Open</a></div>` : `<span class="small muted">${passed} of ${catalog.length} modules passed</span>`}
          </div>
        </div>
      </div>`, "Certificates", "certs");
  }

  function certGraphic() {
    // GNSS satellite + Earth visualization for certificates
    return `<svg class="cert-graphic" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;right:0;top:0;width:100%;height:100%">
      <defs>
        <radialGradient id="earthGrad" cx="35%" cy="35%">
          <stop offset="0%" style="stop-color:#e8f4f8;stop-opacity:0.4" />
          <stop offset="100%" style="stop-color:#7dd3d8;stop-opacity:0.4" />
        </radialGradient>
      </defs>
      <circle cx="350" cy="280" r="120" fill="url(#earthGrad)" />
      <g stroke="#4a9ba3" stroke-width="0.5" opacity="0.3">
        <circle cx="350" cy="280" r="120" fill="none" />
        <circle cx="350" cy="280" r="80" fill="none" />
        <circle cx="350" cy="280" r="40" fill="none" />
        <line x1="350" y1="160" x2="350" y2="400" />
        <line x1="230" y1="280" x2="470" y2="280" />
      </g>
      <g fill="#4a9ba3" opacity="0.4">
        <rect x="480" y="80" width="30" height="20" rx="2" />
        <rect x="100" y="120" width="28" height="18" rx="2" />
        <rect x="320" y="60" width="26" height="16" rx="2" />
        <circle cx="495" cy="50" r="4" />
        <circle cx="110" cy="85" r="3" />
        <circle cx="330" cy="35" r="3" />
      </g>
      <g stroke="#7dd3d8" stroke-width="0.5" stroke-dasharray="2,1" opacity="0.3">
        <line x1="495" y1="95" x2="380" y2="240" />
        <line x1="110" y1="135" x2="300" y2="260" />
        <line x1="330" y1="75" x2="350" y2="160" />
      </g>
    </svg>`;
  }

  function orbitArt() {
    return `<svg class="orbit" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#6fd6c4" stroke-width=".8">
      <circle cx="100" cy="100" r="95"/><circle cx="100" cy="100" r="63"/><circle cx="100" cy="100" r="31"/>
      <line x1="100" y1="5" x2="100" y2="195"/><line x1="5" y1="100" x2="195" y2="100"/></g>
      <g fill="#6fd6c4"><circle cx="160" cy="60" r="5"/><circle cx="55" cy="45" r="4"/><circle cx="130" cy="150" r="4"/><circle cx="85" cy="120" r="3"/></g></svg>`;
  }

  async function generateProgrammeCertificatePDF(c) {
    const moduleCerts = catalog.map((m) => cert(m.id)).filter(Boolean);
    const averageScore = moduleCerts.length ? moduleCerts.reduce((n, x) => n + (x.percent || 0), 0) / moduleCerts.length : 0;
    const result = await DaintaCert.generate({
      name: c.fullName,
      email: c.email || "",
      heading: C.programmeTitle,
      organisation: C.organisation,
      passMark: C.passMark,
      score: averageScore,
      dateAwarded: new Date(c.issuedAt),
      contentVersion: c.version || C.contentVersion || "0.1",
      certId: c.id
    });
    return result.bytes || result;
  }

  async function generateCertificatePDF(certId) {
    const c = cert(certId);
    if (!c) {
      console.error(`No certificate data found for ${certId}`);
      return null;
    }

    if (!window.DaintaCert) {
      console.error("DaintaCert library not loaded. Check if certificate.js loaded successfully.");
      return null;
    }
    
    if (certId === "programme") {
      try {
        return await generateProgrammeCertificatePDF(c);
      } catch (err) {
        console.error("Failed to generate programme certificate PDF:", err);
        return null;
      }
    }

    try {
      // Extract module number from certId (m01 -> 1, m10 -> 10)
      let moduleNum = null;
      if (certId.startsWith("m") && /^\d+$/.test(certId.slice(1))) {
        moduleNum = parseInt(certId.slice(1), 10);
      }
      
      if (!moduleNum) {
        console.warn(`Cannot generate PDF for non-module cert: ${certId}`);
        return null;
      }
      
      console.log(`Generating certificate for module ${moduleNum}:`, {
        name: c.fullName,
        email: c.email,
        score: c.percent,
        dateAwarded: new Date(c.issuedAt),
        certId: c.id
      });
      
      const result = await DaintaCert.generate({
        name: c.fullName,
        email: c.email || "",
        moduleNumber: moduleNum,
        moduleTitle: (modById[certId] || {}).title,
        organisation: C.organisation,
        courseLabel: C.programmeTitle,
        passMark: C.passMark,
        score: c.percent || 0,
        dateAwarded: new Date(c.issuedAt),
        contentVersion: c.version || "0.1",
        certId: c.id
      });
      
      console.log("Certificate generated successfully, result:", result);
      return result.bytes || result;
    } catch (err) {
      console.error(`Failed to generate certificate PDF for ${certId}:`, err);
      console.error("Stack:", err.stack);
      return null;
    }
  }
  
  async function getPDFDataURL(certId) {
    try {
      const pdfBytes = await generateCertificatePDF(certId);
      if (pdfBytes) {
        return URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      }
    } catch (err) {
      console.error(`Error getting PDF URL for ${certId}:`, err);
    }
    return null;
  }

  async function certificateView(id) {
    const c = cert(id);
    const isProg = id === "programme";
    const m = modById[id];

    if (!c || (!isProg && !m)) {
      const msg = isProg ? `Pass all ${catalog.length} module assessments to earn the programme certificate.` : "Pass this module's assessment to earn its certificate.";
      return render(`<h1>Certificate not available</h1><p class="empty">${msg}</p><div class="btn-row"><a class="btn secondary" href="#/certificates">Back to certificates</a></div>`, "Certificate", "certs");
    }

    const typeLabel = isProg ? C.programmeTitle : `Module ${pad(m.number)}: ${m.title}`;
    
    // Show loading state while PDF is generated
    render(`<div style="max-width:100%;padding:20px 0">
      <div><div class="crumbs"><a href="#/certificates">Certificates</a> / ${typeLabel}</div>
      <h1>${typeLabel}</h1>
      <div class="btn-row" style="margin:0 0 20px"><button class="btn" id="download-cert" disabled>Generating PDF...</button><a class="btn secondary" href="#/certificates">Back to certificates</a></div></div>
      <p class="empty">Loading certificate...</p>
    </div>`, "Certificate", "certs");
    
    // Generate/retrieve PDF
    const pdfUrl = await getPDFDataURL(id);
    
    // Render final view with PDF
    render(`<div style="max-width:100%;padding:20px 0">
      <div><div class="crumbs"><a href="#/certificates">Certificates</a> / ${typeLabel}</div>
      <h1>${typeLabel}</h1>
      <div class="btn-row" style="margin:0 0 20px"><button class="btn" id="download-cert">Download PDF</button><a class="btn secondary" href="#/certificates">Back to certificates</a></div></div>
      ${pdfUrl ? `<iframe id="cert-viewer" title="Certificate PDF: ${esc(typeLabel)}" src="${pdfUrl}" style="width:100%;height:800px;border:1px solid #ddd;border-radius:8px"></iframe>` : `<p class="empty">Certificate PDF not available. Please try again.</p>`}
    </div>`, "Certificate", "certs");
    
    if (pdfUrl) {
      $("#download-cert").addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = `Certificate-${id}-${c.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  }

  /* ---------------- glossary ---------------- */
  function glossaryView() {
    const terms = Course.glossary || [];
    render(`<h1>Glossary</h1><p class="lead">${terms.length} key terms from the module Key Terms sections. The chips show where each term is defined.</p>
      <label class="sr-only" for="gq">Search the glossary</label><input id="gq" class="search" type="search" placeholder="Search terms and definitions">
      <p class="muted small" id="gcount" aria-live="polite"></p>
      <dl class="glossary" id="gl"></dl>`, "Glossary", "glossary");
    const draw = () => {
      const q = $("#gq").value.trim().toLowerCase();
      const hits = terms.filter((t) => !q || t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q));
      $("#gcount").textContent = q ? `${hits.length} matching term${hits.length === 1 ? "" : "s"}` : "";
      $("#gl").innerHTML = hits.map((t) => `<dt>${esc(t.term)}${t.modules.map((n) => `<a class="chip" href="#/module/m${pad(n)}" aria-label="Module ${n}">M${n}</a>`).join("")}</dt><dd>${esc(t.definition)}</dd>`).join("") || `<p class="empty">No terms match your search.</p>`;
    };
    $("#gq").addEventListener("input", draw);
    draw();
  }

  /* Pull title, description and link for each resource out of a Further Learning lesson.
   * Handles both layouts used in the source documents:
   *   <p><strong>Title</strong><br/>Description<br/><a>link</a></p>
   *   <p><strong>Title</strong></p><p>Description</p><p><a>link</a></p>
   *   <h2>Title</h2><p>Description</p><p><a>link</a></p> */
  function extractFurtherLearning(html) {
    const box = document.createElement("div");
    box.innerHTML = html;
    const out = [];
    let title = "", desc = [];
    box.querySelectorAll("h2, h3, h4, p, li").forEach((el) => {
      if (/^H[234]$/.test(el.tagName)) { title = el.textContent.replace(/\s+/g, " ").trim(); desc = []; return; }
      const first = el.firstElementChild;
      const startsWithTitle = first && first.tagName === "STRONG" &&
        !(el.textContent.split(first.textContent)[0] || "").trim();
      if (startsWithTitle) { title = first.textContent.replace(/\s+/g, " ").trim(); desc = []; }
      const rest = el.cloneNode(true);
      if (startsWithTitle) rest.firstElementChild.remove();
      rest.querySelectorAll("a").forEach((a) => a.remove());
      const text = rest.textContent.replace(/\s+/g, " ").trim();
      if (title && text) desc.push(text);
      el.querySelectorAll("a[href]").forEach((a) => {
        out.push({ title: title || a.textContent.trim(), desc: desc.join(" "), url: a.getAttribute("href") });
      });
      if (el.querySelector("a[href]")) { title = ""; desc = []; }
    });
    return out;
  }

  // Normalize URL for deduplication: lowercase, remove protocol/trailing slash/anchors
  function normalizeUrl(url) {
    if (!url) return '';
    return url.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('#')[0];
  }

  async function fillFurtherLearning(fallback) {
    const holder = $("#further-learning");
    if (!holder) return;
    const seenUrls = new Set();  // Track URLs to skip duplicates
    const groups = await Promise.all(catalog.map(async (m) => {
      try {
        const mod = await loadModule(m.id);
        const lesson = mod.lessons.find((l) => /further learning/i.test(l.title));
        const items = lesson ? extractFurtherLearning(lesson.html) : [];
        return { number: m.number, items: items.length ? items : (fallback[m.number] || []) };
      } catch (err) {
        return { number: m.number, items: fallback[m.number] || [], error: true };
      }
    }));
    const target = $("#further-learning");
    if (!target) return;   // learner has left the Resources page

    // Deduplicate resources: filter out URLs we've already seen
    const moduleSections = groups.filter((g) => g.items.length || g.error).map((g) => {
      const uniqueItems = g.items.filter((item) => {
        const normalized = normalizeUrl(item.url);
        if (seenUrls.has(normalized)) return false;
        seenUrls.add(normalized);
        return true;
      });

      // Only render module if it has items or had an error
      if (!uniqueItems.length && !g.error) return '';

      return `
        <div style="margin-bottom:32px">
          <h3 style="margin:16px 0 12px;font-size:16px;font-weight:600">Module ${pad(g.number)}</h3>
          ${g.error ? `<p class="muted small">Could not load this module's further learning. Please refresh the page.</p>` : ""}
          ${uniqueItems.length ? `<div class="resources">
            ${uniqueItems.map((item) => `<div class="resource-card" data-searchable="${esc((item.title + ' ' + (item.desc || '')).toLowerCase())}">
              <h4 style="margin:0 0 8px;font-size:14px;font-weight:500">${esc(item.title)}</h4>
              ${item.desc ? `<p style="font-size:13px;margin:0 0 12px">${esc(item.desc)}</p>` : ""}
              <a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener" style="font-size:12px;padding:6px 12px">Visit Resource</a>
            </div>`).join("")}
          </div>` : ''}
        </div>`;
    }).filter(Boolean).join("");

    target.innerHTML = moduleSections;
    markNewTabLinks(target);
  }

  function resourcesView() {
    // External references and suggested reading come from course.config.json ("resources").
    const external = C.resources || [];
    const furtherLearningFallback = {};

    render(`<h1>Resources</h1>
      <p class="lead">Reference materials for this course, and resources suggested by learners.</p>

      <div style="margin-bottom:32px">
        <button id="suggest-toggle" class="btn secondary" style="margin-bottom:16px">+ Suggest a Resource</button>
        <div id="suggest-form-container" style="display:none;background:var(--surface);border:1px solid var(--line);padding:20px;border-radius:8px;max-width:460px">
          <form id="suggest-form" class="form">
            <label>Resource title<input name="title" required placeholder="e.g. GPS Signal Processing Guide" maxlength="100"></label>
            <label>URL<input name="url" type="url" required placeholder="https://example.com/resource"></label>
            <label>Brief description<textarea name="description" placeholder="Why would this help other learners?" style="resize:vertical;min-height:80px;font-family:inherit;padding:10px 12px;border:1.5px solid var(--line);border-radius:4px;background:var(--paper);font-size:15px"></textarea></label>
            <div class="btn-row" style="margin:0"><button class="btn" type="submit">Copy to Clipboard</button><button class="btn secondary" type="button" id="suggest-close">Close</button></div>
            <div id="suggest-msg" aria-live="polite"></div>
          </form>
        </div>
      </div>
      
      <div style="margin-top:32px;margin-bottom:24px">
        <input id="resource-search" type="text" placeholder="Search resources by title or keyword..." style="width:100%;max-width:480px;padding:12px 14px;border:1.5px solid var(--line);border-radius:4px;background:var(--surface);font-size:15px">
      </div>

      <h2 style="margin-top:32px;margin-bottom:16px;font-size:18px;font-weight:600">External References</h2>
      <div class="resources" id="external-resources">
        ${external.map((r) => `<div class="resource-card" data-searchable="${esc(r.title + ' ' + r.desc).toLowerCase()}">
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.desc)}</p>
          <a class="btn" href="${r.url}" target="_blank" rel="noopener">Read Document</a>
        </div>`).join("")}
      </div>

      <h2 style="margin-top:32px;margin-bottom:16px;font-size:18px;font-weight:600">Further Learning by Module</h2>
      <p class="lead" style="font-size:14px;margin:0 0 16px">Curated further learning resources recommended within each module.</p>
      <div id="further-learning"><p class="loading" role="status">Loading further learning…</p></div>
      
`, "Resources", "resources");

    // Handle resource search/filter
    const searchInput = $("#resource-search");
    if (searchInput) {
      const filterResources = () => {
        const query = searchInput.value.toLowerCase();
        const cards = $$(".resource-card");
        let visibleCount = 0;

        cards.forEach(card => {
          const searchable = card.getAttribute("data-searchable") || "";
          const isMatch = !query || searchable.includes(query);
          card.style.display = isMatch ? "" : "none";
          if (isMatch) visibleCount++;
        });

        // Remove old "no results" message
        const oldMsg = $(".no-results-message");
        if (oldMsg) oldMsg.remove();

        // Show "no results" only if there are no matches and user is searching
        if (visibleCount === 0 && query) {
          searchInput.insertAdjacentHTML("afterend", `<p class="no-results-message muted" style="margin:16px 0">No resources match "${esc(query)}"</p>`);
        }
      };

      searchInput.addEventListener("input", filterResources);
    }

    fillFurtherLearning(furtherLearningFallback);

    // Handle resource suggestion form toggle
    const suggestToggle = $("#suggest-toggle");
    const suggestContainer = $("#suggest-form-container");
    const suggestClose = $("#suggest-close");

    if (suggestToggle && suggestContainer) {
      suggestToggle.addEventListener("click", () => {
        suggestContainer.style.display = suggestContainer.style.display === "none" ? "block" : "none";
        suggestToggle.textContent = suggestContainer.style.display === "none" ? "+ Suggest a Resource" : "− Suggest a Resource";
      });

      if (suggestClose) {
        suggestClose.addEventListener("click", () => {
          suggestContainer.style.display = "none";
          suggestToggle.textContent = "+ Suggest a Resource";
        });
      }
    }

    // Handle resource suggestion form
    const suggestForm = $("#suggest-form");
    if (suggestForm) {
      suggestForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const msg = $("#suggest-msg");
        const btn = e.target.querySelector("button[type='submit']");
        const originalText = btn.textContent;

        btn.disabled = true;
        btn.textContent = "Copying…";
        msg.innerHTML = "";

        try {
          const title = String(fd.get("title")).trim();
          const url = String(fd.get("url")).trim();
          const description = String(fd.get("description")).trim();
          const suggestedBy = profile?.fullName || "Anonymous";

          if (!title || !url || !description) {
            throw new Error("Please fill in all fields.");
          }

          const formatted = `Resource Suggestion\n\nTitle: ${title}\nURL: ${url}\nDescription: ${description}\nSuggested by: ${suggestedBy}`;

          await navigator.clipboard.writeText(formatted);
          msg.innerHTML = `<div class="notice ok">✓ Copied to clipboard. Paste it into an email or message to send it to the course team.</div>`;
          e.target.reset();
          btn.textContent = originalText;
        } catch (err) {
          const errorMsg = err.name === 'NotAllowedError'
            ? 'Clipboard access denied. Please copy manually: ' + err.message
            : esc(err.message);
          msg.innerHTML = `<div class="notice error">${errorMsg}</div>`;
          btn.textContent = originalText;
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  /* ---------------- profile ---------------- */
  function profileView(first) {
    // Progress is stored in this browser only, so the email is entered by the learner.
    render(`<h1>${first ? "Welcome" : "Your details"}</h1>
      <p class="lead">${first ? `Before you start, enter your name as it should appear on your certificates. Your progress and certificates are saved in this browser only.` : "Your name appears on every certificate you earn, including ones already issued."}</p>
      <form class="form" id="pf">
        <label>Full name<input name="fullName" required maxlength="${NAME_MAX}" autocomplete="name" value="${esc(profile.fullName || "")}"></label>
        <label>Work email <span class="hint">Optional. Shown on certificates so your organisation can identify you.</span><input name="email" type="email" autocomplete="email" value="${esc(profile.email || "")}"></label>
        <div class="btn-row" style="margin:0"><button class="btn">${first ? "Start learning" : "Save details"}</button></div>
        <div id="pmsg" aria-live="polite"></div>
      </form>
      ${!first ? `<h2>Progress</h2>
        <p class="muted" style="max-width:62ch">Your progress and certificates are saved in this browser only. Clearing your browser data or using a different browser or device will remove them. Download your certificates as PDFs to keep a permanent copy.</p>` : ""}
      ${!first ? `<div class="btn-row"><button class="btn secondary" id="clear-progress">Clear my progress on this device</button></div>` : ""}`, "Your details", "profile");
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const fullName = String(fd.get("fullName")).trim().replace(/\s+/g, " ");
      if (fullName.length < 2) { $("#pmsg").innerHTML = `<div class="notice error">Enter your full name.</div>`; return; }
      if (fullName.length > NAME_MAX) { $("#pmsg").innerHTML = `<div class="notice error">Your full name must be ${NAME_MAX} characters or fewer.</div>`; return; }
      try {
        await Course.store.saveProfile({ fullName, email: String(fd.get("email") || "").trim() });
        profile = await Course.store.getProfile(); await refreshState(); updateWho();
        if (first) location.hash = "#/"; else $("#pmsg").innerHTML = `<div class="notice ok">Details saved.</div>`;
      } catch (err) { $("#pmsg").innerHTML = `<div class="notice error">${esc(err.message)}</div>`; }
    });
    const clear = $("#clear-progress");
    if (clear) clear.addEventListener("click", async () => {
      if (!confirm("Clear all progress and certificates saved on this device? Your name and email will be kept.")) return;
      await Course.store.resetProgress();
      await refreshState(); updateWho();
      $("#pmsg").innerHTML = `<div class="notice ok">Progress cleared on this device.</div>`;
    });
  }

  /* ---------------- sign in (server builds only) ---------------- */
  function notFound() { render(`<h1>Page not found</h1><p><a href="#/">Go to the modules</a></p>`, "Not found"); }

  async function refreshState() { 
    state = await Course.store.getState(); 
  }
  
  let lastHash = location.hash;
  function route() {
    if (Course._leaveGuard && !Course._leaveGuard()) { history.replaceState(null, "", lastHash); return; }
    lastHash = location.hash;
    if (!profile.fullName && location.hash !== "#/welcome") { location.hash = "#/welcome"; return; }
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [a, b, c, d] = parts;
    if (!a) return dashboard();
    if (a === "welcome") return profileView(true);
    if (a === "profile") return profileView(false);
    if (a === "glossary") return glossaryView();
    if (a === "resources") return resourcesView();
    if (a === "certificates") return certificatesView();
    if (a === "certificate") return certificateView(b || "module");
    if (a === "module" && b) {
      if (!c) return withModule(b, moduleOverview);
      if (c === "lesson") return withModule(b, (m) => lessonView(m, d));
      if (c === "practice") return withModule(b, practiceView);
      if (c === "assessment") return withModule(b, assessmentIntro);
    }
    notFound();
  }

  async function boot() {
    try {
      await Course.store.init();
      document.body.classList.remove("signed-out");
      $("#nav").hidden = false;
      profile = await Course.store.getProfile();
      await refreshState();
      updateWho();
      route();
    } catch (err) {
      view().innerHTML = `<div class="notice error"><b>The app could not start.</b> ${esc(err.message)}</div>`;
    }
  }

  // Dark mode toggle
  function initDarkMode() {
    const toggle = $("#dark-mode-toggle");
    const root = document.documentElement;
    const storageKey = "learning-theme";

    // Initialize from localStorage or system preference
    const saved = localStorage.getItem(storageKey);
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;

    const setTheme = (dark) => {
      root.setAttribute("data-theme", dark ? "dark" : "light");
      localStorage.setItem(storageKey, dark ? "dark" : "light");
      if (toggle) toggle.textContent = dark ? "☀️" : "🌙";
    };

    setTheme(isDark);

    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") === "dark";
        setTheme(!current);
      });
    }
  }

  window.addEventListener("hashchange", () => { if (state) route(); });
  document.addEventListener("DOMContentLoaded", () => {
    initDarkMode();
    $("#lightbox .btn").addEventListener("click", () => $("#lightbox").close());
    $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") e.target.close(); });
    boot();
  });
})();
