(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), answer = $("#answer"), q = $("#q"), empty = $("#empty");
  const STOP = new Set("how to do i can you make makes build craft crafting use using get a an the in on of for with what is are where find setup set up create recipe guide tutorial mod mods minecraft".split(" "));

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const host = (u) => new URL(u).hostname.replace(/^www\./, "");
  const fill = (tpl, t) => tpl.replace("%s", encodeURIComponent(t));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Strip version tail to get a readable display name used for matching.
  function baseName(file) {
    return file.replace(/^!/, "").replace(/[-_ ](mc)?v?\d.*$/i, "").replace(/[-_]+/g, " ");
  }
  MODS.forEach((m) => {
    m.wikiObj = WIKIS[m.wiki];
    m.key = norm(baseName(m.file));
    m.names = [m.key, norm(m.a)].filter(Boolean);
    m.hay = norm(m.file + " " + m.a);
  });

  // ---- Grid ----
  function render(hits) {
    const set = hits ? new Set(hits) : null;
    grid.innerHTML = MODS.map((m, i) => {
      const w = m.wikiObj, kind = w.kind === "dedicated";
      return `<li data-i="${i}"${set && set.has(i) ? ' class="hit"' : ""}><a href="${w.home}" target="_blank" rel="noopener">
        <span class="file">${esc(m.file)}</span>
        <span class="meta"><span class="tag ${kind ? "d" : "c"}">${kind ? "own wiki" : "community"}</span>${esc(w.label)} (${host(w.home)})</span></a></li>`;
    }).join("");
    $("#count").textContent = `(${MODS.length})`;
  }

  function filterGrid(text) {
    const n = norm(text);
    let shown = 0;
    grid.querySelectorAll("li").forEach((li) => {
      const m = MODS[li.dataset.i];
      const ok = !n || n.split(" ").every((t) => m.hay.includes(t));
      li.hidden = !ok; if (ok) shown++;
    });
    empty.hidden = shown > 0;
  }

  // ---- Search ----
  function findMod(nq) {
    // longest alias phrase contained in the query wins; prefer the base-name match over aliases
    let best = null, bestLen = 0;
    for (const m of MODS) {
      for (const name of m.names) {
        const words = name.split(" ");
        // full phrase, or the main (first two) words of an alias list
        const cands = [name, words.slice(0, 2).join(" "), words[0]].filter((c) => c.length >= 4);
        for (const c of cands) {
          if ((" " + nq + " ").includes(" " + c + " ") && c.length > bestLen) { best = m; bestLen = c.length; }
        }
      }
    }
    return best;
  }

  function topicOf(nq, mod) {
    let rest = " " + nq + " ";
    for (const name of mod.names) {
      const words = name.split(" ");
      [name, words.slice(0, 2).join(" "), words[0]].sort((a, b) => b.length - a.length).forEach((c) => { rest = rest.split(" " + c + " ").join(" "); });
    }
    return rest.split(" ").filter((t) => t && !STOP.has(t)).join(" ");
  }

  function modWikiKey(mod) { return mod.wiki; }

  function directPage(wikiKey, topic) {
    const t = TOPICS[wikiKey];
    if (!t || !topic) return null;
    if (t[topic]) return t[topic];
    for (const k of Object.keys(t)) if (topic.includes(k)) return t[k];
    return null;
  }

  function showAnswer(mod, topic, note) {
    const w = mod.wikiObj;
    const page = directPage(modWikiKey(mod), topic);
    const btns = [];
    if (page && w.page) btns.push(`<a class="btn" href="${w.page}${page}" target="_blank" rel="noopener">Open “${esc(page.replace(/_/g, " "))}” page</a>`);
    if (topic) btns.push(`<a class="btn${page ? " alt" : ""}" href="${fill(w.search, topic)}" target="_blank" rel="noopener">Search “${esc(topic)}” on ${esc(w.label)}</a>`);
    btns.push(`<a class="btn alt" href="${w.home}" target="_blank" rel="noopener">${esc(w.label)} home</a>`);
    if (w.kind === "community" && !topic) btns.unshift(`<a class="btn" href="${fill(w.search, baseName(mod.file))}" target="_blank" rel="noopener">Search ${esc(baseName(mod.file))} on ${esc(w.label)}</a>`);
    answer.innerHTML = `<h3>${esc(mod.file)}</h3><p>${note || (w.kind === "dedicated" ? "This mod has its own wiki." : "No dedicated wiki exists for this mod, so this searches the FTB Wiki.")}</p><div class="btns">${btns.join("")}</div>`;
    const idx = MODS.indexOf(mod);
    render([idx]);
    filterGrid("");
    const li = grid.querySelector(`li[data-i="${idx}"]`);
    if (li) li.scrollIntoView({ block: "nearest" });
  }


  // ---- Deep search: query every wiki's own search API (MediaWiki, CORS-enabled) ----
  const API = {
    mekanism: ["https://wiki.aidancbrady.com/w/api.php", "https://wiki.aidancbrady.com/wiki/"],
    tinkers: ["https://tinkers-construct.fandom.com/api.php", "https://tinkers-construct.fandom.com/wiki/"],
    railcraft: ["https://railcraft.info/w/api.php", "https://railcraft.info/wiki/"],
    projectred: ["https://projectredwiki.com/w/api.php", "https://projectredwiki.com/wiki/"],
    galacticraft: ["https://galacticraftunofficial.miraheze.org/w/api.php", "https://galacticraftunofficial.miraheze.org/wiki/"],
    ftb: ["https://ftb.fandom.com/api.php", "https://ftb.fandom.com/wiki/"]
  };
  let deepToken = 0, deepTimer = 0;
  const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const pageUrl = (base, title) => base + encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/%28/g, "(").replace(/%29/g, ")");

  async function call(api, params) {
    const r = await fetch(api + "?format=json&origin=*&" + new URLSearchParams(params));
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  // Title-prefix matches first ("fusion" -> "Fusion Reactor"), then full-text matches (any page containing the word).
  async function wikiSearch(key, term, limit) {
    const [api, base] = API[key];
    const words = term.split(" ").filter(Boolean);
    const wild = words.map((w, i) => (i === words.length - 1 && w.length > 1 ? w + "*" : w)).join(" ");
    const [pre, full] = await Promise.allSettled([
      call(api, { action: "query", list: "prefixsearch", pssearch: term, pslimit: limit }),
      call(api, { action: "query", list: "search", srsearch: wild, srlimit: limit })
    ]);
    const out = [], seen = new Set();
    const add = (title, snippet) => { if (!seen.has(title)) { seen.add(title); out.push({ title, snippet, url: pageUrl(base, title) }); } };
    if (pre.status === "fulfilled") (pre.value.query.prefixsearch || []).forEach((x) => add(x.title, ""));
    if (full.status === "fulfilled") (full.value.query.search || []).forEach((x) => add(x.title, strip(x.snippet)));
    if (pre.status === "rejected" && full.status === "rejected") throw new Error("down");
    return out.slice(0, limit);
  }

  async function deepSearch(keys, term, mod) {
    const token = ++deepToken;
    const box = document.createElement("div");
    box.className = "deep";
    box.innerHTML = '<p class="deep-status">Searching the wikis\u2026</p>';
    answer.appendChild(box);
    const uniq = [...new Set(keys.filter((k) => API[k]))];
    const lim = (i) => (i === 0 ? 10 : 6);
    const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
    const paint = (res, done) => {
      if (token !== deepToken) return;
      let html = "", total = 0;
      res.forEach((r, i) => {
        if (!r || !r.length) return;
        total += r.length;
        html += `<h4>${esc(WIKIS[uniq[i]].label)}</h4><ul>` + r.map((x) =>
          `<li><a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a>${x.snippet ? `<span>${esc(x.snippet)}</span>` : ""}</li>`).join("") + "</ul>";
      });
      if (!total && done) {
        html = `<p class="deep-status">No page contains \u201c${esc(term)}\u201d on the searchable wikis. <a href="${fill(WIKIS.ftb.search, term)}" target="_blank" rel="noopener">Search the FTB Wiki directly</a>.</p>`;
      } else if (!done) html += '<p class="deep-status">Still searching\u2026</p>';
      box.innerHTML = html || '<p class="deep-status">Searching the wikis\u2026</p>';
      return total;
    };
    const run = async (t) => {
      const res = new Array(uniq.length).fill(null);
      await Promise.all(uniq.map((k, i) => withTimeout(wikiSearch(k, t, lim(i))).catch(() => null).then((r) => { res[i] = r; paint(res, false); })));
      return res;
    };
    let res = await run(term);
    // Nothing for the whole phrase: retry with each word on its own so every query returns something.
    if (res.every((r) => !r || !r.length) && term.includes(" ")) {
      for (const w of term.split(" ").filter((w) => w.length > 2)) {
        res = await run(w);
        if (res.some((r) => r && r.length)) break;
      }
    }
    paint(res, true);
  }

  // The named/guessed mod's wiki goes first, then every other wiki, so any word returns something.
  function deepFor(term, mod) {
    clearTimeout(deepTimer);
    const keys = [mod && mod.wiki, ...Object.keys(API)].filter(Boolean);
    deepTimer = setTimeout(() => deepSearch(keys, term, mod), 250);
  }

  function search(text, live) {
    const nq = norm(text);
    deepToken++; clearTimeout(deepTimer);
    if (!nq) { answer.innerHTML = ""; render(); filterGrid(""); return; }

    let mod = findMod(nq), note = "";
    let topic = mod ? topicOf(nq, mod) : nq.split(" ").filter((t) => !STOP.has(t)).join(" ");
    if (!topic) topic = nq;

    if (!mod) { // infer from topic keywords
      const keys = Object.keys(HINTS).sort((a, b) => b.length - a.length);
      const k = keys.find((k) => (" " + nq + " ").includes(" " + k + " "));
      if (k) {
        mod = MODS.find((m) => m.names.some((n) => n.startsWith(norm(HINTS[k])))) || null;
        if (mod) note = `You didn\u2019t name a mod, so I guessed \u201c${k}\u201d belongs to this one.`;
      }
    }
    if (mod) { const t = findMod(nq) ? topicOf(nq, mod) : topic; showAnswer(mod, t, note); deepFor(t || baseName(mod.file), mod); return; }

    answer.innerHTML = "";
    render(); filterGrid(text);
    if (nq.length >= 2) deepFor(topic, null);
  }

  // ---- Events ----
  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); search(q.value); });
  q.addEventListener("input", () => search(q.value, true));

  // ---- Theme ----
  const btn = $("#themeBtn");
  function syncBtn() {
    const dark = document.documentElement.dataset.theme === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    btn.querySelector(".theme-label").textContent = dark ? "Light" : "Dark";
  }
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    syncBtn();
  });
  syncBtn();
  render();
})();
