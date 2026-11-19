"use strict";
/* TOTAL90 — application front-end.
   Toutes les données viennent de /api (backend), jamais d’un fournisseur directement.
   Rien n’est inventé : si une donnée manque, l’interface le dit. */

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
const LIVE_REFRESH = 30000;

/* Compétitions mises en avant (identifiants API-Football). Les noms affichés viennent de l’API. */
const REGIONS = [
  ["Europe", [2, 3, 848, 5, 39, 140, 78, 135, 61, 88, 94, 144, 179, 203]],
  ["Amériques", [253, 71, 128, 262, 9]],
  ["Afrique", [6, 12, 20, 200, 233, 288]],
  ["Asie et Moyen-Orient", [17, 7, 307, 98, 292, 323, 169]],
  ["Mondial", [1, 15]],
  ["Féminin", [8, 525, 44]]
];
const POPULAR = REGIONS.flatMap(([, ids]) => ids);
const HOME_COMPS = [2, 39, 140, 78, 135, 61, 3, 1, 6, 71, 253, 307];

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const put = (el, ...kids) => { if (el) el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false)); };
const img = (src, cls) => src ? h("img", { src, alt: "", loading: "lazy", class: cls, onerror: e => e.target.style.visibility = "hidden" }) : null;
const ymd = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = () => ymd(new Date());
const hm = iso => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = iso => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const longDate = s => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const place = c => c === "World" ? "International" : c;
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;

/* ---------- API ---------- */
const cache = new Map();
async function api(path, { ttl = 15000, signal } = {}) {
  const url = "/api/" + path + (path.includes("?") ? "&" : "?") + "tz=" + encodeURIComponent(TZ);
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.body;
  let res, body;
  try { res = await fetch(url, { signal }); body = await res.json(); }
  catch (e) { if (e.name === "AbortError") throw e; throw { error: "network", message: "Connexion impossible au serveur TOTAL90." }; }
  if (!res.ok) throw body;
  cache.set(url, { body, until: Date.now() + ttl });
  if (body.provider) $("#foot-src").textContent = `Données : ${body.provider}.`;
  return body;
}

function stateBox(e) {
  if (e && e.error === "not_configured") return h("div", { class: "state setup" },
    h("strong", {}, "Le site est installé, il reste à brancher les données"),
    "Ajoutez votre clé API-Football dans les variables d’environnement Netlify sous le nom ", h("code", {}, "API_FOOTBALL_KEY"),
    ", puis redéployez le site. Le fichier LISEZ-MOI explique la démarche pas à pas.");
  const titles = { rate_limit: "Quota de requêtes atteint", plan: "Données non incluses dans l’abonnement", bad_key: "Clé API refusée", network: "Connexion impossible", not_found: "Introuvable" };
  return h("div", { class: "state err" }, h("strong", {}, titles[e && e.error] || "Données indisponibles"),
    (e && e.message) || "Le fournisseur de données n’a pas répondu. Réessayez dans un instant.");
}
const empty = (title, text) => h("div", { class: "state" }, h("strong", {}, title), text || "");
const skeleton = n => Array.from({ length: n }, () => h("div", { class: "skeleton" }));

/* ---------- favoris ---------- */
const Fav = {
  read() { try { return JSON.parse(localStorage.getItem("t90.fav")) || { teams: [], leagues: [] }; } catch { return { teams: [], leagues: [] }; } },
  write(v) { try { localStorage.setItem("t90.fav", JSON.stringify(v)); } catch {} },
  has(kind, id) { return this.read()[kind].some(x => x.id === id); },
  toggle(kind, item) {
    const v = this.read();
    v[kind] = v[kind].some(x => x.id === item.id) ? v[kind].filter(x => x.id !== item.id) : [...v[kind], item];
    this.write(v);
    return v[kind].some(x => x.id === item.id);
  }
};
function starButton(kind, item) {
  const b = h("button", { type: "button", class: "star", "aria-pressed": String(Fav.has(kind, item.id)) });
  const paint = on => {
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>';
    b.append(on ? "Suivi" : "Suivre");
  };
  paint(Fav.has(kind, item.id));
  b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); paint(Fav.toggle(kind, item)); });
  return b;
}

/* ---------- composants matchs ---------- */
function clock(m) {
  const s = m.status;
  if (s.state === "live") return s.code === "HT" ? "Mi-temps" : s.code === "P" ? "T.a.b." : s.elapsed != null ? `${s.elapsed}${s.extra ? "+" + s.extra : ""}’` : "En cours";
  if (s.state === "finished") return s.code === "FT" ? "Terminé" : s.label;
  if (s.state === "other") return s.label;
  return hm(m.date);
}
function matchRow(m, opts = {}) {
  const favT = Fav.read().teams.map(t => t.id);
  const live = m.status.state === "live", done = m.status.state === "finished";
  const side = t => h("div", { class: "tm" + (t.winner ? " w" : "") + (favT.includes(t.id) ? " fav" : "") }, img(t.logo), h("span", {}, t.name));
  const sc = v => h("span", {}, v ?? (m.status.state === "scheduled" ? "" : "–"));
  return h("a", { class: "row", href: `/match/${m.id}`, "aria-label": `${m.home.name} contre ${m.away.name}` },
    h("span", { class: "when" + (live ? " live" : "") }, opts.showDate && !live && ymd(new Date(m.date)) !== TODAY() ? [dayLabel(m.date), h("br"), done ? clock(m) : hm(m.date)] : clock(m)),
    h("span", { class: "teams" }, side(m.home), side(m.away)),
    h("span", { class: "sc" + (live ? " live" : "") }, sc(m.score.home), sc(m.score.away)));
}
function groupMatches(list) {
  const favL = Fav.read().leagues.map(l => l.id);
  const map = new Map();
  for (const m of list) { if (!map.has(m.league.id)) map.set(m.league.id, { league: m.league, matches: [] }); map.get(m.league.id).matches.push(m); }
  const rank = id => favL.includes(id) ? -1000 + favL.indexOf(id) : POPULAR.includes(id) ? POPULAR.indexOf(id) : 500;
  return [...map.values()].sort((a, b) => rank(a.league.id) - rank(b.league.id) || (a.league.country || "").localeCompare(b.league.country || "", "fr") || a.league.name.localeCompare(b.league.name, "fr"))
    .map(g => (g.matches.sort((a, b) => a.timestamp - b.timestamp), g));
}
function groupBlock(g, opts) {
  const l = g.league;
  return h("section", { class: "group" },
    h("div", { class: "ghead" }, img(l.logo),
      h("div", {}, h("a", { href: `/competition/${l.id}` }, l.name), h("br"), h("small", {}, [place(l.country), l.round].filter(Boolean).join(" · "))),
      starButton("leagues", { id: l.id, name: l.name, logo: l.logo, country: l.country })),
    g.matches.map(m => matchRow(m, opts)));
}
function liveCard(m) {
  return h("a", { class: "lcard", href: `/match/${m.id}` },
    h("div", { class: "lg" }, img(m.league.logo), `${m.league.name} · ${place(m.league.country) || ""}`),
    h("div", { class: "t" }, img(m.home.logo), h("span", {}, m.home.name), h("b", {}, m.score.home ?? 0)),
    h("div", { class: "t" }, img(m.away.logo), h("span", {}, m.away.name), h("b", {}, m.score.away ?? 0)),
    h("div", { class: "min" }, clock(m)));
}
function updatedLine(body) {
  return h("p", { class: "updated", "aria-live": "polite" }, `Données du fournisseur relevées à ${new Date(body.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    body.plan === "free" ? " · Version gratuite : données actualisées moins souvent (scores environ toutes les 30 minutes)." : "");
}

/* ---------- vues ---------- */
async function viewHome(root, ctx) {
  root.append(
    h("div", { class: "hero" }, h("div", {}, h("h1", {}, "Le football du monde entier, en direct"),
      h("p", { class: "sub" }, longDate(TODAY()))), h("div", { class: "count", id: "live-count" })),
    h("div", { id: "home-live" }, skeleton(1)),
    h("div", { class: "grid-2" },
      h("div", {}, h("h2", {}, "Grands matchs du jour", h("a", { class: "more", href: "/football" }, "Tous les matchs")), h("div", { id: "home-big" }, skeleton(3)),
        adSlot("accueil"), h("h2", {}, "Résultats récents", h("a", { class: "more", href: `/football?date=${addDays(TODAY(), -1)}` }, "Hier")), h("div", { id: "home-res" }, skeleton(2))),
      h("aside", {}, h("h2", {}, "Mes favoris", h("a", { class: "more", href: "/favoris" }, "Gérer")), h("div", { id: "home-fav" }),
        h("h2", {}, "Compétitions populaires", h("a", { class: "more", href: "/competitions" }, "Toutes")), h("div", { id: "home-comps" }, skeleton(2)),
        h("h2", {}, "Actualités", h("a", { class: "more", href: "/actualites" }, "Toutes")), h("div", { id: "home-news" }, skeleton(2)),
        h("h2", {}, "Meilleures performances", h("a", { class: "more", href: "/analyses" }, "Analyses")), h("div", { id: "home-perf" })))
  );
  renderHomeComps($("#home-comps", root));
  topPerformers($("#home-perf", root), 61, 5, ctx);
  homeNews($("#home-news", root));
  const load = async () => {
    let today, yesterday;
    try {
      [today, yesterday] = await Promise.all([api(`matches?date=${TODAY()}`, { ttl: 20000 }), api(`matches?date=${addDays(TODAY(), -1)}`, { ttl: 600000 }).catch(() => null)]);
    } catch (e) { if (!ctx.alive()) return; put($("#home-live", root), stateBox(e)); put($("#home-big", root), ); put($("#home-res", root), ); renderFavHome(null); return; }
    if (!ctx.alive()) return;
    const all = today.data;
    const live = all.filter(m => m.status.state === "live");
    put($("#live-count", root), h("b", {}, live.length), ` ${live.length > 1 ? "matchs" : "match"} en direct sur ${plural(all.length, "match")} aujourd’hui`);
    put($("#home-live", root), live.length
      ? h("div", { class: "strip" }, groupMatches(live).flatMap(g => g.matches).slice(0, 12).map(liveCard))
      : empty("Aucun match en cours pour le moment", nextKickoff(all)));
    const upcoming = all.filter(m => m.status.state !== "finished");
    const big = pick(upcoming, 14);
    put($("#home-big", root), ...(big.length ? groupMatches(big).map(g => groupBlock(g)) : [empty("Plus de match à venir aujourd’hui", "Consultez le programme de demain dans la rubrique Football.")]));
    const finished = all.filter(m => m.status.state === "finished");
    const res = pick(finished.length >= 4 ? finished : finished.concat((yesterday?.data || []).filter(m => m.status.state === "finished" && !finished.some(f => f.id === m.id))), 10);
    put($("#home-res", root), ...(res.length ? groupMatches(res).map(g => groupBlock(g, { showDate: true })) : [empty("Pas encore de résultat", "")]), updatedLine(today));
    renderFavHome(all);
  };
  const renderFavHome = all => {
    const box = $("#home-fav", root); if (!box) return;
    const fav = Fav.read();
    if (!fav.teams.length && !fav.leagues.length) { put(box, empty("Suivez vos équipes", "Touchez « Suivre » sur une équipe ou une compétition pour la retrouver ici en priorité.")); return; }
    const mine = (all || []).filter(m => fav.teams.some(t => t.id === m.home.id || t.id === m.away.id));
    put(box, 
      ...(mine.length ? groupMatches(mine).map(g => groupBlock(g)) : [h("div", { class: "panel" }, "Aucun match de vos équipes aujourd’hui.")]),
      h("div", { class: "comps", style: "margin-top:10px" }, fav.teams.slice(0, 6).map(t => h("a", { class: "comp", href: `/equipe/${t.id}` }, img(t.logo), t.name))));
  };
  await load();
  ctx.every(LIVE_REFRESH, load);
}
function pick(list, n) {
  const order = id => { const i = HOME_COMPS.indexOf(id); return i >= 0 ? i : POPULAR.includes(id) ? 50 + POPULAR.indexOf(id) : 999; };
  return [...list].sort((a, b) => order(a.league.id) - order(b.league.id) || a.timestamp - b.timestamp).slice(0, n);
}
function nextKickoff(all) {
  const n = all.filter(m => m.status.state === "scheduled").sort((a, b) => a.timestamp - b.timestamp)[0];
  return n ? `Prochain coup d’envoi à ${hm(n.date)} : ${n.home.name} – ${n.away.name} (${n.league.name}).` : "Les matchs de demain sont dans la rubrique Football.";
}
async function renderHomeComps(box) {
  try {
    const { data } = await api("leagues", { ttl: 3600000 });
    const byId = new Map(data.map(l => [l.id, l]));
    put(box, h("div", { class: "comps" }, HOME_COMPS.map(id => byId.get(id)).filter(Boolean).slice(0, 10).map(compTile)));
  } catch (e) { put(box, stateBox(e)); }
}
const compTile = l => h("a", { class: "comp", href: `/competition/${l.id}` }, img(l.logo), h("span", {}, l.name, h("small", {}, place(l.country))));
function soonPanel(step, text) {
  return h("div", { class: "panel soon" }, h("span", { class: "step" }, `Étape ${step}`), h("div", {}, text));
}

async function viewLive(root, ctx) {
  root.append(h("h1", {}, "En direct"), h("p", { class: "sub" }, "Les scores se mettent à jour automatiquement, sans recharger la page."), h("div", { id: "live-list" }, skeleton(4)));
  const load = async () => {
    try {
      const body = await api(`matches?date=${TODAY()}`, { ttl: 20000 });
      if (!ctx.alive()) return;
      const g = groupMatches(body.data.filter(m => m.status.state === "live"));
      put($("#live-list", root), ...(g.length ? g.map(x => groupBlock(x)) : [empty("Aucun match en cours", "Revenez plus tard ou consultez le programme du jour.")]), updatedLine(body));
    } catch (e) { if (ctx.alive()) put($("#live-list", root), stateBox(e)); }
  };
  await load();
  ctx.every(LIVE_REFRESH, load);
}

async function viewFootball(root, ctx, params) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : TODAY();
  let filter = params.get("f") || "all", text = "";
  const go = d => { navigate(`/football?date=${d}`); };
  const filters = [["all", "Tous"], ["live", "En direct"], ["finished", "Terminés"], ["scheduled", "À venir"], ["fav", "Mes favoris"]];
  const chips = h("div", { class: "bar" });
  const search = h("input", { class: "field", type: "search", placeholder: "Filtrer : pays, compétition, équipe", "aria-label": "Filtrer les matchs", oninput: e => { text = e.target.value.toLowerCase(); draw(); } });
  root.append(
    h("h1", {}, "Football"), h("p", { class: "sub" }, longDate(date)),
    h("div", { class: "bar" },
      h("button", { class: "chip", type: "button", onclick: () => go(addDays(date, -1)) }, "← Veille"),
      ["Hier", "Aujourd’hui", "Demain"].map((l, i) => { const d = addDays(TODAY(), i - 1); return h("a", { class: "chip" + (d === date ? " on" : ""), href: `/football?date=${d}` }, l); }),
      h("button", { class: "chip", type: "button", onclick: () => go(addDays(date, 1)) }, "Lendemain →"),
      h("input", { class: "field", type: "date", value: date, "aria-label": "Choisir une date", onchange: e => e.target.value && go(e.target.value) })),
    chips, h("div", { class: "bar" }, search), h("div", { id: "fx" }, skeleton(5)));
  let data = [], body = null;
  const draw = () => {
    put(chips, ...filters.map(([k, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(filter === k), onclick: () => { filter = k; draw(); } }, l)));
    const fav = Fav.read();
    const list = data.filter(m => {
      if (filter === "fav") { if (!fav.teams.some(t => t.id === m.home.id || t.id === m.away.id) && !fav.leagues.some(l => l.id === m.league.id)) return false; }
      else if (filter !== "all" && m.status.state !== filter) return false;
      if (text && !`${m.league.name} ${m.league.country} ${m.home.name} ${m.away.name}`.toLowerCase().includes(text)) return false;
      return true;
    });
    const g = groupMatches(list);
    put($("#fx", root), h("p", { class: "updated" }, `${plural(list.length, "match")} dans ${plural(g.length, "compétition")}`),
      ...(g.length ? g.map(x => groupBlock(x)) : [empty("Aucun match ne correspond", filter === "fav" ? "Suivez des équipes ou des compétitions pour remplir ce filtre." : "Essayez un autre filtre ou une autre date.")]),
      body ? updatedLine(body) : null);
  };
  const load = async () => {
    try { body = await api(`matches?date=${date}`, { ttl: 20000 }); if (!ctx.alive()) return; data = body.data; draw(); }
    catch (e) { if (ctx.alive()) put($("#fx", root), stateBox(e)); }
  };
  draw(); put($("#fx", root), ...skeleton(5));
  await load();
  if (date === TODAY()) ctx.every(LIVE_REFRESH, load);
}

async function viewMatch(root, ctx, params, id) {
  root.append(h("div", { id: "mx" }, skeleton(4)));
  let tab = params.get("onglet") || "resume";
  const load = async () => {
    let body;
    try { body = await api(`match/${id}`, { ttl: 15000 }); } catch (e) { if (ctx.alive()) put($("#mx", root), stateBox(e)); return; }
    if (!ctx.alive()) return;
    const m = body.data, live = m.status.state === "live";
    const teamLink = t => h("a", { href: `/equipe/${t.id}` }, img(t.logo), t.name);
    const score = m.status.state === "scheduled" ? h("div", { class: "big" }, hm(m.date)) : h("div", { class: "big" + (live ? " live" : "") }, `${m.score.home ?? 0} – ${m.score.away ?? 0}`);
    const head = h("section", { class: "mhead" },
      h("div", { class: "meta" }, h("a", { href: `/competition/${m.league.id}` }, m.league.name), m.league.round ? h("span", {}, m.league.round) : null,
        h("span", {}, new Date(m.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · " + hm(m.date))),
      h("div", { class: "duel" }, teamLink(m.home), h("div", {}, score, m.penalties ? h("div", { class: "mstatus" }, `T.a.b. ${m.penalties.home} – ${m.penalties.away}`) : null), teamLink(m.away)),
      h("div", { class: "mstatus" + (live ? " live" : "") }, live ? clock(m) + " · " + m.status.label : m.status.label),
      h("div", { class: "meta", style: "margin-top:8px" }, m.venue?.name ? h("span", {}, `${m.venue.name}${m.venue.city ? ", " + m.venue.city : ""}`) : null, m.referee ? h("span", {}, `Arbitre : ${m.referee}`) : null));
    const tabs = [["resume", "Résumé"], ["stats", "Statistiques"], ["compos", "Compositions"], ["h2h", "Face-à-face"], ["proba", "Probabilités"]];
    const content = h("div", { class: "panel" });
    const tabBar = h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(tab === k), onclick: () => { tab = k; render(); } }, l)));
    const render = () => {
      tabBar.querySelectorAll(".tab").forEach((b, i) => b.setAttribute("aria-selected", String(tabs[i][0] === tab)));
      put(content, ...({ resume: () => timeline(m), stats: () => statsBlock(m), compos: () => lineupsBlock(m), h2h: () => h2hBlock(m), proba: () => { probaBlock(m).then(kids => { if (tab === "proba") put(content, kids); }); return skeleton(3); } }[tab])());
    };
    render();
    put($("#mx", root), head, tabBar, content, adSlot("match"), updatedLine(body));
    setMeta(`${m.home.name} – ${m.away.name}`, `${m.home.name} contre ${m.away.name} (${m.league.name}) : score, buteurs, statistiques, compositions et probabilités.`);
    return live;
  };
  const live = await load();
  if (live) ctx.every(LIVE_REFRESH, load);
}
function timeline(m) {
  const ev = (m.events || []).filter(e => ["goal", "missed_penalty", "yellow", "red", "sub", "var"].includes(e.type));
  if (!ev.length) return [m.status.state === "scheduled" ? empty("Le match n’a pas commencé", "Les buts, cartons et remplacements s’afficheront ici en direct.") : empty("Aucun événement disponible", "Le fournisseur ne propose pas le détail des événements pour ce match.")];
  const icon = e => e.type === "goal" ? "⚽ " : e.type === "missed_penalty" ? "✕ " : e.type === "yellow" ? h("i", { class: "ic yellow", "aria-label": "Carton jaune" }) : e.type === "red" ? h("i", { class: "ic red", "aria-label": "Carton rouge" }) : e.type === "sub" ? "⇄ " : "VAR ";
  const body = e => h("div", { class: "ev" }, icon(e), h("b", {}, e.player || ""), e.detail ? ` (${e.detail})` : "",
    e.type === "sub" && e.assist ? h("small", {}, `Changement avec ${e.assist}`) : e.type === "goal" && e.assist ? h("small", {}, `Passe : ${e.assist}`) : e.type === "missed_penalty" ? h("small", {}, "Penalty manqué") : null);
  return [h("ol", { class: "timeline" }, ev.map(e => {
    const home = e.teamId === m.home.id;
    return h("li", {}, h("div", { class: "h" }, home ? body(e) : ""), h("div", { class: "m" }, `${e.minute ?? ""}${e.extra ? "+" + e.extra : ""}’`), h("div", {}, home ? "" : body(e)));
  }))];
}
function statsBlock(m) {
  if (!m.statistics?.length) return [empty("Statistiques indisponibles", m.status.state === "scheduled" ? "Elles apparaîtront pendant le match." : "Le fournisseur ne propose pas de statistiques pour ce match.")];
  const num = v => parseFloat(String(v).replace("%", "")) || 0;
  return [h("div", { class: "statrow" }, h("div", { class: "lab" }, h("span", {}, m.home.name), h("span", {}), h("span", {}, m.away.name))),
    ...m.statistics.map(s => {
      const a = num(s.home), b = num(s.away), t = a + b || 1;
      return h("div", { class: "statrow" }, h("div", { class: "lab" }, h("span", {}, s.home), h("span", {}, s.label), h("span", {}, s.away)),
        h("div", { class: "bars" }, h("i", { style: `--p:${(a / t) * 100}%` }), h("i", { style: `--p:${(b / t) * 100}%` })));
    })];
}
function lineupsBlock(m) {
  if (!m.lineups?.length) return [empty("Compositions pas encore publiées", "Les compositions officielles sont en général disponibles environ une heure avant le coup d’envoi.")];
  const team = id => id === m.home.id ? m.home : m.away;
  return [h("div", { class: "lineups" }, m.lineups.map(l => h("div", {},
    h("h3", {}, team(l.teamId).name, l.formation ? ` · ${l.formation}` : ""),
    l.coach ? h("p", { class: "updated" }, `Entraîneur : ${l.coach}`) : null,
    h("h4", {}, "Titulaires"), h("ol", {}, l.startXI.map(p => h("li", {}, h("b", {}, p.number ?? ""), p.id ? h("a", { href: `/joueur/${p.id}` }, p.name) : p.name))),
    l.subs.length ? [h("h4", {}, "Remplaçants"), h("ol", {}, l.subs.map(p => h("li", {}, h("b", {}, p.number ?? ""), p.id ? h("a", { href: `/joueur/${p.id}` }, p.name) : p.name)))] : null)))];
}
function h2hBlock(m) {
  if (m.h2h == null) return [empty("Historique indisponible", "Le fournisseur n’a pas renvoyé les confrontations directes.")];
  const past = m.h2h.filter(x => x.status.state === "finished").sort((a, b) => b.timestamp - a.timestamp);
  if (!past.length) return [empty("Première confrontation", "Aucun match précédent entre ces deux équipes dans les données du fournisseur.")];
  let a = 0, d = 0, b = 0;
  past.forEach(x => { const hs = x.score.home, as = x.score.away; const homeIsA = x.home.id === m.home.id; if (hs === as) d++; else if ((hs > as) === homeIsA) a++; else b++; });
  return [h("div", { class: "kpis" }, h("div", { class: "kpi" }, h("b", {}, a), h("span", {}, `Victoires ${m.home.name}`)), h("div", { class: "kpi" }, h("b", {}, d), h("span", {}, "Matchs nuls")), h("div", { class: "kpi" }, h("b", {}, b), h("span", {}, `Victoires ${m.away.name}`))),
    h("p", { class: "updated" }, past.length > 1 ? `Sur les ${past.length} derniers matchs entre les deux équipes.` : "Sur le dernier match entre les deux équipes."),
    h("div", { class: "group" }, past.map(x => matchRow(x, { showDate: true })))];
}

function resultFor(m, teamId) {
  if (m.status.state !== "finished" || m.score.home == null) return null;
  const mine = m.home.id === teamId ? m.score.home : m.score.away, other = m.home.id === teamId ? m.score.away : m.score.home;
  return mine > other ? "W" : mine < other ? "L" : "D";
}
async function viewTeam(root, ctx, params, id) {
  root.append(h("div", { id: "tx" }, skeleton(5)));
  let body;
  try { body = await api(`team/${id}`, { ttl: 300000 }); } catch (e) { if (ctx.alive()) put($("#tx", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const d = body.data, t = d.team, tid = Number(id);
  setMeta(t.name, `${t.name} : forme, résultats, calendrier, classement, effectif et statistiques avancées.`);
  const last = (d.last || []).filter(m => m.status.state === "finished").sort((a, b) => b.timestamp - a.timestamp);
  const res = last.map(m => resultFor(m, tid)).filter(Boolean);
  const gf = last.reduce((s, m) => s + (m.home.id === tid ? m.score.home : m.score.away), 0);
  const ga = last.reduce((s, m) => s + (m.home.id === tid ? m.score.away : m.score.home), 0);
  const form5 = res.slice(0, 5).reverse();
  const LBL = { W: "V", D: "N", L: "D" };
  const kpis = last.length ? h("div", { class: "kpis" },
    [[res.filter(r => r === "W").length, "Victoires"], [res.filter(r => r === "D").length, "Nuls"], [res.filter(r => r === "L").length, "Défaites"],
     [gf, "Buts marqués"], [ga, "Buts encaissés"], [(gf / last.length).toFixed(1).replace(".", ","), "Buts par match"]]
      .map(([v, l]) => h("div", { class: "kpi" }, h("b", {}, v), h("span", {}, l)))) : null;
  const posFR = { Goalkeeper: "Gardiens", Defender: "Défenseurs", Midfielder: "Milieux", Attacker: "Attaquants" };
  const squad = d.squad == null ? empty("Effectif indisponible", "Le fournisseur n’a pas renvoyé l’effectif.") :
    Object.entries(posFR).map(([k, l]) => { const ps = d.squad.filter(p => p.position === k); return ps.length ? [h("h3", { style: "margin-top:14px" }, l), h("div", { class: "squad" }, ps.map(p => h("a", { class: "player", href: `/joueur/${p.id}` }, img(p.photo), h("div", {}, h("b", {}, p.name), h("small", {}, [p.number != null ? `N° ${p.number}` : null, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · "))))))] : null; });
  put($("#tx", root), 
    h("section", { class: "panel" },
      h("div", { class: "thead" }, img(t.logo),
        h("div", {}, h("h1", {}, t.name), h("div", { class: "meta" }, t.country ? h("span", {}, t.national ? `Sélection nationale · ${t.country}` : t.country) : null,
          t.founded ? h("span", {}, `Fondé en ${t.founded}`) : null, d.venue?.name ? h("span", {}, `${d.venue.name}${d.venue.capacity ? ` · ${d.venue.capacity.toLocaleString("fr-FR")} places` : ""}`) : null)),
        starButton("teams", { id: t.id, name: t.name, logo: t.logo })),
      form5.length ? h("div", { style: "margin-top:14px" }, h("p", { class: "updated" }, "Forme sur les 5 derniers matchs (du plus ancien au plus récent)"),
        h("div", { class: "form" }, form5.map(r => h("span", { class: r, title: { W: "Victoire", D: "Nul", L: "Défaite" }[r] }, LBL[r])))) : null,
      kpis ? [h("p", { class: "updated", style: "margin-top:14px" }, last.length > 1 ? `Bilan des ${last.length} derniers matchs` : "Bilan du dernier match"), kpis] : null),
    h("div", { class: "grid-2" },
      h("div", {},
        h("h2", {}, "Prochains matchs"), d.next == null ? stateBox({}) : d.next.length ? h("div", { class: "group" }, d.next.filter(m => m.status.state !== "finished").map(m => matchRow(m, { showDate: true }))) : empty("Aucun match programmé", ""),
        h("h2", {}, "Derniers résultats"), d.last == null ? stateBox({}) : last.length ? h("div", { class: "group" }, last.map(m => matchRow(m, { showDate: true }))) : empty("Aucun résultat récent", ""),
        h("h2", {}, "Statistiques avancées"), h("div", { id: "team-adv" }),
        h("h2", {}, "Effectif"), h("div", { class: "panel" }, squad)),
      h("aside", {},
        h("h2", {}, "Classement"), d.standing ? standingTable(d.standing.rows, tid, d.standing.league) : empty("Classement indisponible", "Pas de championnat en cours trouvé pour cette équipe."),
        d.competitions?.length ? [h("h2", {}, "Compétitions"), h("div", { class: "comps" }, d.competitions.map(compTile))] : null,
        
        h("h2", {}, "Actualités du club"), h("div", { id: "team-news" }))),
    updatedLine(body));
  teamAdvanced($("#team-adv", root), d, tid);
  teamNews($("#team-news", root), t.name);
}
function standingTable(rows, highlight, league) {
  return h("div", { class: "panel table-wrap" },
    league ? h("p", { class: "updated", style: "margin-top:0" }, h("a", { href: `/competition/${league.id}` }, league.name), ` · saison ${league.season}/${String(league.season + 1).slice(2)}`) : null,
    h("table", { class: "standings" },
      h("thead", {}, h("tr", {}, ["#", "Équipe", "J", "G", "N", "P", "Diff", "Pts"].map(x => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows.map(r => h("tr", { class: r.team.id === highlight ? "me" : null },
        h("td", {}, r.rank), h("td", {}, h("a", { href: `/equipe/${r.team.id}` }, img(r.team.logo), r.team.name)),
        h("td", {}, r.played), h("td", {}, r.win), h("td", {}, r.draw), h("td", {}, r.lose), h("td", {}, r.diff > 0 ? "+" + r.diff : r.diff), h("td", { class: "pts" }, r.points))))));
}

async function viewLeague(root, ctx, params, id) {
  root.append(h("div", { id: "lx" }, skeleton(5)));
  const season = params.get("saison");
  let body;
  try { body = await api(`league/${id}${season ? "?season=" + season : ""}`, { ttl: 300000 }); } catch (e) { if (ctx.alive()) put($("#lx", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const d = body.data, l = d.league;
  setMeta(l.name, `${l.name} : classement, résultats et prochains matchs.`);
  const seasons = [...(l.seasons || [])].sort((a, b) => b - a);
  const groups = d.standings;
  put($("#lx", root), 
    h("section", { class: "panel" }, h("div", { class: "thead" }, img(l.logo),
      h("div", {}, h("h1", {}, l.name), h("div", { class: "meta" }, h("span", {}, l.country === "World" ? "International" : l.country), h("span", {}, l.type === "Cup" ? "Coupe" : "Championnat"))),
      starButton("leagues", { id: l.id, name: l.name, logo: l.logo, country: l.country })),
      seasons.length > 1 ? h("div", { class: "bar", style: "margin:14px 0 0" }, h("label", { for: "season" }, "Saison "),
        h("select", { id: "season", class: "field", onchange: e => { navigate(`/competition/${id}?saison=${e.target.value}`); } },
          seasons.map(s => { const o = h("option", { value: s }, `${s}/${String(s + 1).slice(2)}`); if (String(s) === String(d.season)) o.selected = true; return o; }))) : null),
    h("div", { class: "grid-2" },
      h("div", {}, h("h2", {}, "Classement"),
        groups ? groups.map(g => [groups.length > 1 && g[0]?.group ? h("h3", { style: "margin:14px 0 6px" }, g[0].group) : null, standingTable(g)]) :
          d.standingsError === "plan" ? stateBox({ error: "plan", message: "Le classement de cette saison n’est pas inclus dans l’abonnement actuel au fournisseur." }) : empty("Pas de classement", "Cette compétition n’a pas de classement pour cette saison (coupe à élimination, par exemple).")),
      h("aside", {},
        h("h2", {}, "Prochains matchs"), d.next?.length ? h("div", { class: "group" }, d.next.map(m => matchRow(m, { showDate: true }))) : empty("Aucun match programmé", ""),
        h("h2", {}, "Derniers résultats"), d.last?.length ? h("div", { class: "group" }, d.last.map(m => matchRow(m, { showDate: true }))) : empty("Aucun résultat", ""))),
    updatedLine(body));
}

async function viewCompetitions(root, ctx, params) {
  const country = params.get("pays");
  root.append(h("h1", {}, country ? `Compétitions : ${country === "World" ? "International" : country}` : "Compétitions"),
    h("p", { class: "sub" }, country ? h("a", { href: "/competitions" }, "← Tous les pays") : "Les compétitions phares, puis tous les championnats par pays, y compris féminins."),
    h("div", { id: "cx" }, skeleton(4)));
  let body;
  try { body = await api("leagues", { ttl: 3600000 }); } catch (e) { if (ctx.alive()) put($("#cx", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const all = body.data, byId = new Map(all.map(l => [l.id, l]));
  if (country) {
    const list = all.filter(l => l.country === country).sort((a, b) => (a.type === "League" ? 0 : 1) - (b.type === "League" ? 0 : 1) || a.name.localeCompare(b.name, "fr"));
    const women = list.filter(l => /women|femin|frauen|wsl|w-league|dames/i.test(l.name));
    const men = list.filter(l => !women.includes(l));
    put($("#cx", root), 
      h("h2", {}, "Championnats et coupes"), men.length ? h("div", { class: "comps" }, men.map(compTile)) : empty("Aucune compétition", ""),
      women.length ? [h("h2", {}, "Compétitions féminines"), h("div", { class: "comps" }, women.map(compTile))] : null);
    return;
  }
  const counts = new Map(); all.forEach(l => l.country && counts.set(l.country, (counts.get(l.country) || 0) + 1));
  const flags = new Map(all.map(l => [l.country, l.flag]));
  let text = "";
  const grid = h("div", { class: "countries" });
  const drawCountries = () => put(grid, ...[...counts.keys()].filter(c => c.toLowerCase().includes(text)).sort((a, b) => (a === "World" ? -1 : b === "World" ? 1 : a.localeCompare(b, "fr")))
    .map(c => h("a", { class: "country", href: `/competitions?pays=${encodeURIComponent(c)}` }, flags.get(c) ? img(flags.get(c)) : h("span", {}, "🌐"), c === "World" ? "International" : c, h("small", {}, counts.get(c)))));
  drawCountries();
  put($("#cx", root), 
    ...REGIONS.map(([name, ids]) => { const ls = ids.map(i => byId.get(i)).filter(Boolean); return ls.length ? [h("h2", {}, name), h("div", { class: "comps" }, ls.map(compTile))] : null; }),
    h("h2", {}, "Par pays"), h("div", { class: "bar" }, h("input", { class: "field", type: "search", placeholder: "Chercher un pays (en anglais : France, Spain, Brazil…)", "aria-label": "Chercher un pays", oninput: e => { text = e.target.value.toLowerCase(); drawCountries(); } })),
    grid);
}

async function viewSearch(root, ctx, params) {
  const q = (params.get("q") || "").trim();
  root.append(h("h1", {}, q ? `Résultats pour « ${q} »` : "Recherche"), h("div", { id: "sx" }, q.length >= 3 ? skeleton(4) : empty("Tapez au moins 3 lettres", "Recherchez un club, une sélection, un joueur, un entraîneur ou une compétition.")));
  if (q.length < 3) return;
  let body;
  try { body = await api(`search?q=${encodeURIComponent(q)}&full=1`, { ttl: 600000 }); } catch (e) { if (ctx.alive()) put($("#sx", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const d = body.data;
  const section = (title, list, render, missing) => [h("h2", {}, title, list ? h("small", { class: "updated" }, String(list.length)) : null),
    list == null ? empty("Indisponible", missing) : list.length ? render(list) : h("p", { class: "updated" }, "Aucun résultat.")];
  put($("#sx", root), 
    ...section("Clubs et sélections", d.teams, l => h("div", { class: "comps" }, l.slice(0, 30).map(t => h("a", { class: "comp", href: `/equipe/${t.id}` }, img(t.logo), h("span", {}, t.name, h("small", {}, t.national ? `Sélection · ${t.country}` : t.country))))), "La recherche d’équipes n’a pas répondu."),
    ...section("Compétitions", d.leagues, l => h("div", { class: "comps" }, l.slice(0, 20).map(compTile)), "La recherche de compétitions n’a pas répondu."),
    ...section("Joueurs", d.players, l => h("div", { class: "squad" }, l.slice(0, 30).map(p => h("a", { class: "player", href: `/joueur/${p.id}` }, img(p.photo), h("div", {}, h("b", {}, p.name), h("small", {}, [p.position, p.nationality, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")))))), "La recherche de joueurs n’est pas disponible avec l’abonnement actuel."),
    ...section("Entraîneurs", d.coaches, l => h("div", { class: "squad" }, l.slice(0, 20).map(c => h(c.team ? "a" : "div", { class: "player", href: c.team ? `/equipe/${c.team.id}` : null, style: "text-decoration:none" }, img(c.photo), h("div", {}, h("b", {}, c.name), h("small", {}, [c.team?.name, c.nationality].filter(Boolean).join(" · ")))))), "La recherche d’entraîneurs n’a pas répondu."),
    h("p", { class: "updated", style: "margin-top:16px" }, "Touchez un joueur pour voir sa fiche détaillée, sa note TOTAL90 et le comparer."));
}

async function viewFavorites(root, ctx) {
  const fav = Fav.read();
  root.append(h("h1", {}, "Mes favoris"), h("p", { class: "sub" }, "Vos favoris sont enregistrés sur cet appareil."));
  if (!fav.teams.length && !fav.leagues.length) { root.append(empty("Aucun favori pour l’instant", "Ouvrez la page d’une équipe ou d’une compétition et touchez « Suivre ».")); return; }
  root.append(
    h("h2", {}, "Équipes suivies"), fav.teams.length ? h("div", { class: "comps" }, fav.teams.map(t => h("a", { class: "comp", href: `/equipe/${t.id}` }, img(t.logo), t.name))) : h("p", { class: "updated" }, "Aucune équipe."),
    h("h2", {}, "Compétitions suivies"), fav.leagues.length ? h("div", { class: "comps" }, fav.leagues.map(compTile)) : h("p", { class: "updated" }, "Aucune compétition."),
    h("h2", {}, "Leurs matchs aujourd’hui"), h("div", { id: "fv" }, skeleton(2)));
  try {
    const body = await api(`matches?date=${TODAY()}`, { ttl: 20000 });
    if (!ctx.alive()) return;
    const mine = body.data.filter(m => fav.teams.some(t => t.id === m.home.id || t.id === m.away.id) || fav.leagues.some(l => l.id === m.league.id));
    put($("#fv", root), ...(mine.length ? groupMatches(mine).map(g => groupBlock(g)) : [empty("Pas de match aujourd’hui", "")]));
  } catch (e) { if (ctx.alive()) put($("#fv", root), stateBox(e)); }
}

const SOON = {
  basketball: ["Basketball", 5, "NBA, EuroLeague et championnats nationaux : matchs en direct, résultats, classements et fiches d’équipes, via un fournisseur de données basket."],
  tennis: ["Tennis", 5, "Tournois ATP et WTA, Grand Chelem, résultats en direct et classements, via un fournisseur spécialisé tennis."],
  "autres-sports": ["Autres sports", 5, "Formule 1, sports de combat, rugby, athlétisme… avec des fournisseurs de données dédiés à chaque discipline."],
};
function viewSoon(root, ctx, params, key) {
  const [title, step, text] = SOON[key];
  root.append(h("h1", {}, title), h("p", { class: "sub" }, "Cette rubrique est en construction."), soonPanel(step, text),
    h("p", { class: "updated", style: "margin-top:14px" }, "En attendant, le football est déjà disponible en direct dans les rubriques Live et Football."));
}
function viewNotFound(root) { root.append(empty("Page introuvable", "Revenez à l’accueil.")); }

/* ================= ÉTAPE 2 : ANALYSES ================= */

/* Note TOTAL90 (sur 10), calculée uniquement à partir des statistiques réelles du joueur.
   Chaque critère est ramené sur 90 minutes, comparé à une plage de référence propre au poste
   (0 = bas de la plage, 1 = haut), puis pondéré. Note = 4 + 6 × moyenne pondérée.
   Un critère sans donnée est ignoré ; si moins de la moitié du poids est disponible, pas de note. */
const POS_FR = { Goalkeeper: "Gardien", Defender: "Défenseur", Midfielder: "Milieu", Attacker: "Attaquant" };
function t90Rating(t) {
  if (!t || t.minutes < 90) return null;
  const p90 = v => (v / t.minutes) * 90;
  const c = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const duel = t.duels >= 10 ? (t.duelsWon / t.duels) * 100 : null;
  const acc = t.passAcc;
  const def = p90(t.tackles + t.interceptions);
  const cards = p90(t.yellow + 3 * t.red);
  let parts;
  if (t.position === "Goalkeeper") {
    const faced = t.saves + t.conceded;
    parts = [["Arrêts réussis", faced >= 10 ? c((t.saves / faced) * 100, 55, 80) : null, .55], ["Buts encaissés", c(1.8 - p90(t.conceded), 0, 1.3), .35], ["Jeu au pied", acc != null ? c(acc, 55, 85) : null, .10]];
  } else if (t.position === "Defender") {
    parts = [["Actions défensives", c(def, 1, 4.5), .30], ["Duels gagnés", duel != null ? c(duel, 40, 65) : null, .25], ["Précision des passes", acc != null ? c(acc, 70, 90) : null, .20], ["Buts et passes décisives", c(p90(t.goals + t.assists), 0, .25), .10], ["Discipline", c(.6 - cards, 0, .6), .15]];
  } else if (t.position === "Midfielder") {
    parts = [["Buts", c(p90(t.goals), 0, .35), .15], ["Passes décisives", c(p90(t.assists), 0, .3), .20], ["Passes clés", c(p90(t.keyPasses), 0, 2.5), .20], ["Précision des passes", acc != null ? c(acc, 70, 90) : null, .15], ["Dribbles réussis", c(p90(t.dribblesWon), 0, 1.5), .10], ["Récupérations", c(def, 0, 3), .10], ["Duels gagnés", duel != null ? c(duel, 40, 60) : null, .10]];
  } else {
    parts = [["Buts", c(p90(t.goals), 0, .7), .35], ["Passes décisives", c(p90(t.assists), 0, .3), .15], ["Tirs cadrés", c(p90(t.shotsOn), 0, 1.6), .10], ["Dribbles réussis", c(p90(t.dribblesWon), 0, 1.5), .10], ["Passes clés", c(p90(t.keyPasses), 0, 2), .10], ["Duels gagnés", duel != null ? c(duel, 30, 55) : null, .10], ["Précision des passes", acc != null ? c(acc, 60, 85) : null, .10]];
  }
  const ok = parts.filter(p => p[1] != null), w = ok.reduce((a, p) => a + p[2], 0);
  if (w < .5) return null;
  const score = ok.reduce((a, p) => a + p[1] * p[2], 0) / w;
  return { note: Math.round((4 + 6 * score) * 10) / 10, parts: parts.map(([label, v, weight]) => ({ label, v, weight })), reliable: t.minutes >= 450 };
}
const noteColor = x => x >= 8 ? "var(--green)" : x >= 6.5 ? "#7BD88F" : x >= 5.5 ? "#F5C518" : "#FF8A5B";
function noteBadge(r, big) {
  if (!r) return h("span", { class: "note none" + (big ? " big" : ""), title: "Pas assez de minutes ou de données pour calculer une note" }, "–");
  return h("span", { class: "note" + (big ? " big" : "") + (r.reliable ? "" : " low"), style: `--nc:${noteColor(r.note)}`, title: r.reliable ? "Note TOTAL90" : "Note TOTAL90, peu fiable (moins de 450 minutes jouées)" }, r.note.toFixed(1).replace(".", ","));
}
function ratingDoc() {
  return h("details", { class: "panel doc" }, h("summary", {}, "Comment est calculée la note TOTAL90 ?"),
    h("p", {}, "La note est calculée par TOTAL90 à partir des seules statistiques fournies par API-Football, sans avis humain. Chaque statistique est ramenée sur 90 minutes, comparée à une plage de référence propre au poste, puis pondérée :"),
    h("ul", {},
      h("li", {}, "Attaquant : buts 35 %, passes décisives 15 %, tirs cadrés, dribbles, passes clés, duels et précision des passes 10 % chacun."),
      h("li", {}, "Milieu : passes décisives 20 %, passes clés 20 %, buts 15 %, précision des passes 15 %, dribbles, récupérations et duels 10 % chacun."),
      h("li", {}, "Défenseur : actions défensives (tacles et interceptions) 30 %, duels 25 %, précision des passes 20 %, discipline 15 %, buts et passes décisives 10 %."),
      h("li", {}, "Gardien : pourcentage d’arrêts 55 %, buts encaissés par match 35 %, jeu au pied 10 %.")),
    h("p", {}, "Note = 4 + 6 × score pondéré, de 4 (bas de la plage partout) à 10 (haut de la plage partout). Une statistique absente est ignorée. Sous 90 minutes jouées, aucune note ; sous 450 minutes, la note est affichée en pointillés car peu fiable. C’est un indicateur statistique, pas un jugement définitif."));
}

/* ---------- graphiques SVG (sans bibliothèque) ---------- */
const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); kids.flat().forEach(k => k != null && el.append(k.nodeType ? k : document.createTextNode(String(k)))); return el; }
function barChart({ labels, series, fmt = v => v, height = 220 }) {
  const W = 640, H = height, L = 50, B = 30, T = 18, R = 8;
  const max = Math.max(1, ...series.flatMap(x => x.values.map(v => v || 0)));
  const step = (W - L - R) / labels.length, bw = Math.min(46, (step * .72) / series.length);
  const y = v => T + (H - T - B) * (1 - v / max);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": series.map(x => x.name).join(", ") });
  [0, .5, 1].forEach(f => { const v = max * f; svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "axis" }, fmt(Math.round(v * 10) / 10))); });
  labels.forEach((lab, i) => {
    const cx = L + step * i + step / 2;
    series.forEach((se, j) => {
      const v = se.values[i] || 0, x = cx - (bw * series.length) / 2 + j * bw;
      const r = s("rect", { x: x + 1, y: y(v), width: bw - 2, height: Math.max(0, H - B - y(v)), rx: 3, fill: se.color, class: "bar" + (se.highlight?.[i] ? " hl" : "") }, s("title", {}, `${lab} · ${se.name} : ${fmt(v)}`));
      svg.append(r);
      if (series.length === 1 && labels.length <= 12) svg.append(s("text", { x: x + bw / 2, y: y(v) - 5, "text-anchor": "middle", class: "val" }, fmt(v)));
    });
    svg.append(s("text", { x: cx, y: H - 10, "text-anchor": "middle", class: "axis" }, lab));
  });
  return h("div", { class: "chart-wrap" }, svg, series.length > 1 ? h("div", { class: "legend" }, series.map(x => h("span", {}, h("i", { style: `background:${x.color}` }), x.name))) : null);
}
function radar(axes, sets) {
  const W = 440, C = 220, Rr = 120, nA = axes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / nA; return [C + Math.cos(a) * Rr * v, C + Math.sin(a) * Rr * v]; };
  const svg = s("svg", { viewBox: `0 0 ${W} ${W}`, class: "chart radar", role: "img", "aria-label": "Comparaison des profils" });
  [.25, .5, .75, 1].forEach(f => svg.append(s("polygon", { points: axes.map((_, i) => pt(i, f).join(",")).join(" "), class: "grid" })));
  axes.forEach((a, i) => { const [x, y] = pt(i, 1.16); svg.append(s("line", { x1: C, y1: C, x2: pt(i, 1)[0], y2: pt(i, 1)[1], class: "grid" }), s("text", { x, y: y + 4, "text-anchor": x < C - 5 ? "end" : x > C + 5 ? "start" : "middle", class: "axis" }, a)); });
  sets.forEach(st => svg.append(s("polygon", { points: st.values.map((v, i) => pt(i, Math.max(.03, v ?? 0)).join(",")).join(" "), fill: st.color, "fill-opacity": .22, stroke: st.color, "stroke-width": 2 }, s("title", {}, st.name))));
  return h("div", { class: "chart-wrap" }, svg, h("div", { class: "legend" }, sets.map(x => h("span", {}, h("i", { style: `background:${x.color}` }), x.name))));
}
const fr = (v, d = 0) => v == null || isNaN(v) ? "–" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const seasonLabel = y => `${y}/${String(Number(y) + 1).slice(2)}`;

/* ---------- recherche de joueur réutilisable ---------- */
function playerPicker(onPick, placeholder) {
  const input = h("input", { class: "field wide", type: "search", placeholder: placeholder || "Nom d’un joueur (au moins 3 lettres)", "aria-label": "Rechercher un joueur" });
  const list = h("div", { class: "pick-list" });
  let timer, ctrl;
  input.addEventListener("input", () => {
    clearTimeout(timer); const q = input.value.trim();
    if (q.length < 3) { put(list); return; }
    timer = setTimeout(async () => {
      ctrl?.abort(); ctrl = new AbortController();
      put(list, h("p", { class: "updated" }, "Recherche…"));
      try {
        const { data } = await api(`players?q=${encodeURIComponent(q)}`, { ttl: 600000, signal: ctrl.signal });
        put(list, data.length ? data.slice(0, 12).map(p => h("button", { type: "button", class: "player pick", onclick: () => onPick(p) }, img(p.photo), h("div", {}, h("b", {}, p.name), h("small", {}, [POS_FR[p.position] || p.position, p.nationality, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · "))))) : h("p", { class: "updated" }, "Aucun joueur trouvé."));
      } catch (e) { if (e.name !== "AbortError") put(list, stateBox(e)); }
    }, 400);
  });
  return h("div", { class: "picker" }, input, list);
}

/* ---------- fiche joueur ---------- */
async function viewPlayer(root, ctx, params, id) {
  const vs = /^\d+$/.test(params.get("vs") || "") ? params.get("vs") : null;
  root.append(h("div", { id: "px" }, skeleton(5)));
  let a, b;
  try { [a, b] = await Promise.all([api(`player/${id}`, { ttl: 600000 }), vs ? api(`player/${vs}`, { ttl: 600000 }) : null]); }
  catch (e) { if (ctx.alive()) put($("#px", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const P = a.data, seasons = P.seasons;
  setMeta(P.player.name, `${P.player.name} : statistiques, note TOTAL90, évolution et comparaison.`);
  let sel = params.get("saison") && seasons.find(x => String(x.season) === params.get("saison")) ? params.get("saison") : String(seasons[0]?.season);
  const box = $("#px", root);
  const draw = () => {
    const cur = seasons.find(x => String(x.season) === sel);
    const t = cur?.total, r = t90Rating(t);
    const mainComp = cur?.competitions.slice().sort((x, y) => y.minutes - x.minutes)[0];
    const pl = P.player;
    const head = h("section", { class: "panel" }, h("div", { class: "thead" }, img(pl.photo, "round"),
      h("div", {}, h("h1", {}, pl.name), h("div", { class: "meta" },
        t?.position ? h("span", {}, POS_FR[t.position] || t.position) : null, pl.nationality ? h("span", {}, pl.nationality) : null,
        pl.age ? h("span", {}, `${pl.age} ans`) : null, pl.height ? h("span", {}, pl.height) : null, pl.weight ? h("span", {}, pl.weight) : null,
        mainComp?.team ? h("a", { href: `/equipe/${mainComp.team.id}` }, mainComp.team.name) : null)),
      h("div", { class: "note-box" }, noteBadge(r, true), h("small", {}, `Note TOTAL90 · ${seasonLabel(sel)}`))),
      h("div", { class: "bar", style: "margin:14px 0 0" }, seasons.map(x => h("button", { type: "button", class: "chip", "aria-pressed": String(String(x.season) === sel), onclick: () => { sel = String(x.season); draw(); } }, seasonLabel(x.season)))),
      P.seasonsBlocked ? h("p", { class: "updated" }, `${P.seasonsBlocked} saison(s) récente(s) non incluse(s) dans l’abonnement actuel.`) : null);
    if (!t) { put(box, head, empty("Pas de statistiques pour cette saison", "")); return; }
    const gk = t.position === "Goalkeeper";
    const kpi = (v, l) => h("div", { class: "kpi" }, h("b", {}, v), h("span", {}, l));
    const kpis = h("div", { class: "kpis" },
      kpi(fr(t.apps), "Matchs joués"), kpi(fr(t.starts), "Titularisations"), kpi(fr(t.minutes), "Minutes jouées"),
      gk ? [kpi(fr(t.saves), "Arrêts"), kpi(fr(t.conceded), "Buts encaissés"), kpi(t.saves + t.conceded ? fr((t.saves / (t.saves + t.conceded)) * 100) + " %" : "–", "Arrêts réussis")]
         : [kpi(fr(t.goals), "Buts"), kpi(fr(t.assists), "Passes décisives"), kpi(`${fr(t.shotsOn)} / ${fr(t.shots)}`, "Tirs cadrés / tirs")],
      kpi(t.passAcc != null ? fr(t.passAcc) + " %" : "–", `Passes réussies (${fr(t.passes)} passes)`), kpi(fr(t.keyPasses), "Passes clés"),
      kpi(`${fr(t.dribblesWon)} / ${fr(t.dribbles)}`, "Dribbles réussis / tentés"), kpi(t.duels ? `${fr(t.duelsWon)} (${fr((t.duelsWon / t.duels) * 100)} %)` : "–", "Duels gagnés"),
      kpi(fr(t.tackles + t.interceptions), "Tacles et interceptions"), kpi(`${fr(t.yellow)} / ${fr(t.red)}`, "Cartons jaunes / rouges"),
      t.minutes ? kpi(fr(((t.goals + t.assists) / t.minutes) * 90, 2), "Buts + passes déc. par 90 min") : null);
    const comps = h("div", { class: "panel table-wrap" }, h("table", { class: "standings" },
      h("thead", {}, h("tr", {}, ["", "Compétition", "MJ", "Min", "Buts", "PD", "Note"].map(x => h("th", {}, x)))),
      h("tbody", {}, cur.competitions.map(c => h("tr", {}, h("td", {}, img(c.league?.logo)), h("td", {}, h("a", { href: c.league ? `/competition/${c.league.id}` : "/" }, c.league?.name || "–"), h("small", { class: "updated" }, c.team ? " · " + c.team.name : "")),
        h("td", {}, c.apps), h("td", {}, fr(c.minutes)), h("td", {}, c.goals), h("td", {}, c.assists), h("td", {}, noteBadge(t90Rating({ ...c, position: t.position }))))))));
    // évolution
    const asc = seasons.slice().sort((x, y) => x.season - y.season);
    const metrics = [["Note TOTAL90", x => t90Rating(x.total)?.note ?? 0, v => fr(v, 1)], ["Buts", x => x.total.goals], ["Passes décisives", x => x.total.assists], ["Minutes", x => x.total.minutes], ["Tirs cadrés", x => x.total.shotsOn], ["Dribbles réussis", x => x.total.dribblesWon], ["Duels gagnés", x => x.total.duelsWon]];
    let mIdx = 0;
    const chartBox = h("div", {});
    const metricBar = h("div", { class: "bar" });
    const drawChart = () => {
      put(metricBar, metrics.map((m, i) => h("button", { type: "button", class: "chip", "aria-pressed": String(i === mIdx), onclick: () => { mIdx = i; drawChart(); } }, m[0])));
      const m = metrics[mIdx];
      put(chartBox, barChart({ labels: asc.map(x => seasonLabel(x.season)), series: [{ name: m[0], values: asc.map(m[1]), color: "#00C875" }], fmt: m[2] || (v => fr(v)) }));
    };
    drawChart();
    const breakdown = r ? h("div", { class: "panel" }, r.parts.map(p => h("div", { class: "statrow" },
      h("div", { class: "lab" }, h("span", {}, p.label), h("span", {}, `poids ${Math.round(p.weight * 100)} %`), h("span", {}, p.v == null ? "n.d." : fr(p.v * 100) + " / 100")),
      h("div", { class: "meter" }, h("i", { style: `--p:${(p.v ?? 0) * 100}%` }))))) : empty("Note indisponible", "Pas assez de minutes jouées ou de statistiques sur cette saison.");
    put(box, head,
      h("h2", {}, "Statistiques de la saison"), kpis,
      h("div", { class: "grid-2" },
        h("div", {}, h("h2", {}, "Évolution"), h("div", { class: "panel" }, metricBar, chartBox, h("p", { class: "updated" }, "Survolez ou touchez une barre pour voir la valeur exacte.")),
          h("h2", {}, "Par compétition"), comps),
        h("aside", {}, h("h2", {}, "Détail de la note"), breakdown, ratingDoc(),
          h("h2", {}, "Comparer avec un autre joueur"), h("div", { class: "panel" }, playerPicker(p => { navigate(`/joueur/${id}?vs=${p.id}`); })))),
      b ? compareBlock(P, b.data, sel) : null,
      updatedLine(a));
    if (b) setTimeout(() => $("#compare", root)?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  draw();
}
function compareBlock(A, B, selA) {
  const ta = (A.seasons.find(x => String(x.season) === selA) || A.seasons[0])?.total;
  const sb = B.seasons[0], tb = sb?.total;
  if (!ta || !tb) return h("section", { id: "compare" }, h("h2", {}, "Comparaison"), empty("Comparaison impossible", "Un des deux joueurs n’a pas de statistiques disponibles."));
  const ra = t90Rating(ta), rb = t90Rating(tb);
  const p90 = (t, v) => t.minutes ? (v / t.minutes) * 90 : 0;
  const rows = [
    ["Note TOTAL90", ra?.note, rb?.note, 1], ["Matchs", ta.apps, tb.apps], ["Minutes", ta.minutes, tb.minutes],
    ["Buts", ta.goals, tb.goals], ["Passes décisives", ta.assists, tb.assists], ["Buts par 90 min", p90(ta, ta.goals), p90(tb, tb.goals), 2],
    ["Passes déc. par 90 min", p90(ta, ta.assists), p90(tb, tb.assists), 2], ["Tirs cadrés par 90 min", p90(ta, ta.shotsOn), p90(tb, tb.shotsOn), 2],
    ["Passes clés par 90 min", p90(ta, ta.keyPasses), p90(tb, tb.keyPasses), 2], ["Dribbles réussis par 90 min", p90(ta, ta.dribblesWon), p90(tb, tb.dribblesWon), 2],
    ["Duels gagnés (%)", ta.duels ? (ta.duelsWon / ta.duels) * 100 : null, tb.duels ? (tb.duelsWon / tb.duels) * 100 : null], ["Précision des passes (%)", ta.passAcc, tb.passAcc],
    ["Tacles + interceptions par 90", p90(ta, ta.tackles + ta.interceptions), p90(tb, tb.tackles + tb.interceptions), 2]
  ];
  const c = (v, hi) => Math.max(0, Math.min(1, (v || 0) / hi));
  const prof = t => [c(p90(t, t.goals), .8), c(p90(t, t.assists), .4), c(p90(t, t.shotsOn), 2), c(p90(t, t.keyPasses), 3), c(p90(t, t.dribblesWon), 2), c(p90(t, t.tackles + t.interceptions), 4), c(t.duels ? (t.duelsWon / t.duels) * 100 : 0, 70)];
  return h("section", { id: "compare" }, h("h2", {}, `Comparaison : ${A.player.name} et ${B.player.name}`),
    h("p", { class: "updated" }, `${A.player.name} : saison ${seasonLabel(selA)} · ${B.player.name} : saison ${seasonLabel(sb.season)}. `, h("a", { href: `/joueur/${B.player.id}` }, `Voir la fiche de ${B.player.name}`)),
    h("div", { class: "grid-2" },
      h("div", { class: "panel table-wrap" }, h("table", { class: "standings cmp" },
        h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, A.player.name), h("th", {}, B.player.name))),
        h("tbody", {}, rows.map(([l, x, y, d]) => h("tr", {}, h("td", {}, l), h("td", { class: x != null && y != null && x > y ? "best" : "" }, fr(x, d || 0)), h("td", { class: x != null && y != null && y > x ? "best" : "" }, fr(y, d || 0))))))),
      h("div", { class: "panel" }, radar(["Buts", "Passes déc.", "Tirs cadrés", "Passes clés", "Dribbles", "Récupérations", "Duels"],
        [{ name: A.player.name, values: prof(ta), color: "#00C875" }, { name: B.player.name, values: prof(tb), color: "#9299A5" }]),
        h("p", { class: "updated" }, "Profil par 90 minutes, chaque axe ramené sur une échelle commune."))));
}

/* ---------- meilleures performances (meilleurs buteurs d'une compétition, notés) ---------- */
async function topPerformers(box, leagueId, limit, ctx) {
  put(box, skeleton(2));
  try {
    const leagues = (await api("leagues", { ttl: 3600000 })).data;
    const lg = leagues.find(l => l.id === leagueId);
    if (!lg?.season) { put(box, empty("Compétition indisponible", "")); return; }
    const body = await api(`topscorers?league=${leagueId}&season=${lg.season}`, { ttl: 600000 });
    if (ctx && !ctx.alive()) return;
    const rows = body.data.map(x => ({ ...x, r: t90Rating(x.total) })).filter(x => x.r).sort((a, b) => b.r.note - a.r.note).slice(0, limit);
    put(box, rows.length ? h("div", { class: "group" }, rows.map((x, i) => h("a", { class: "row perf", href: `/joueur/${x.player.id}` },
      h("span", { class: "when" }, i + 1), h("span", { class: "tm" }, img(x.player.photo, "round"), h("span", {}, h("b", {}, x.player.name), h("small", { class: "updated" }, ` · ${x.team?.name || ""} · ${x.total.goals} buts, ${x.total.assists} passes déc.`))), noteBadge(x.r))))
      : empty("Pas encore de données", "Les statistiques de la saison ne sont pas disponibles."),
      h("p", { class: "updated" }, `Parmi les meilleurs buteurs de ${lg.name} ${seasonLabel(lg.season)}, classés par note TOTAL90.`));
  } catch (e) { put(box, stateBox(e)); }
}

/* ---------- rubrique Analyses ---------- */
async function viewAnalyses(root, ctx, params) {
  const leagueId = Number(params.get("ligue")) || 61;
  const choices = [61, 39, 140, 78, 135, 2, 88, 94, 307, 71, 253, 200];
  const sel = h("select", { class: "field", "aria-label": "Compétition", onchange: e => { navigate(`/analyses?ligue=${e.target.value}`); } });
  const top = h("div", {});
  root.append(h("h1", {}, "Analyses"), h("p", { class: "sub" }, "Statistiques détaillées des joueurs, note TOTAL90, comparaisons et analyses des équipes, à partir de données réelles."),
    h("div", { class: "grid-2" },
      h("div", {}, h("h2", {}, "Match Analysis : probabilités des grands matchs"), h("div", { id: "ma-list" }), h("h2", {}, "Meilleures performances"), h("div", { class: "bar" }, sel), top),
      h("aside", {}, h("h2", {}, "Analyser un joueur"), h("div", { class: "panel" }, playerPicker(p => { navigate(`/joueur/${p.id}`); })),
        h("h2", {}, "Analyser une équipe"), h("div", { class: "panel" }, "Recherchez un club ou une sélection avec la barre en haut de page : sa fiche affiche forme, bilan domicile et extérieur, buts par période de jeu et comparaison avec les autres équipes du championnat."),
        h("h2", {}, "Comparer deux joueurs"), h("div", { class: "panel" }, "Ouvrez la fiche d’un joueur, puis utilisez « Comparer avec un autre joueur »."),
        ratingDoc())));
  try {
    const leagues = (await api("leagues", { ttl: 3600000 })).data;
    put(sel, choices.map(id => leagues.find(l => l.id === id)).filter(Boolean).map(l => { const o = h("option", { value: l.id }, `${l.name} (${place(l.country)})`); if (l.id === leagueId) o.selected = true; return o; }));
  } catch {}
  topPerformers(top, leagueId, 20, ctx);
  matchAnalysisList($("#ma-list", root), ctx);
}

/* ---------- statistiques avancées d'équipe ---------- */
async function teamAdvanced(box, d, tid) {
  const lg = d.standing?.league || d.competitions?.find(c => c.type === "League") || d.competitions?.[0];
  if (!lg) { put(box, empty("Statistiques avancées indisponibles", "Aucune compétition en cours trouvée pour cette équipe.")); return; }
  put(box, skeleton(2));
  let s;
  try { s = (await api(`teamstats?team=${tid}&league=${lg.id}&season=${lg.season}`, { ttl: 600000 })).data; }
  catch (e) { put(box, stateBox(e)); return; }
  const kpi = (v, l) => h("div", { class: "kpi" }, h("b", {}, v), h("span", {}, l));
  const pct = (a, b) => b ? fr((a / b) * 100) + " %" : "–";
  const split = h("div", { class: "panel table-wrap" }, h("table", { class: "standings split" },
    h("thead", {}, h("tr", {}, ["", "J", "V", "N", "D", "BP", "BC", "Moy. BP", "Moy. BC"].map(x => h("th", {}, x)))),
    h("tbody", {}, [["Domicile", "home"], ["Extérieur", "away"], ["Total", "total"]].map(([l, k]) => h("tr", {}, h("td", {}, l),
      ...[s.played[k], s.wins[k], s.draws[k], s.loses[k], s.goalsFor[k], s.goalsAgainst[k]].map(v => h("td", {}, v)), h("td", {}, fr(s.avgFor[k], 1)), h("td", {}, fr(s.avgAgainst[k], 1)))))));
  const slots = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90", "91-105", "106-120"].filter(k => !["91-105", "106-120"].includes(k) || (s.minutesFor[k] || 0) + (s.minutesAgainst[k] || 0) > 0);
  const rows = d.standing?.rows || [];
  const leagueAvg = (f) => rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : null;
  const gfpm = r => r.played ? r.gf / r.played : 0, gapm = r => r.played ? r.ga / r.played : 0;
  const avgF = leagueAvg(gfpm), avgA = leagueAvg(gapm);
  const offIdx = avgF ? (s.avgFor.total / avgF) * 100 : null, defIdx = avgA && s.avgAgainst.total ? (avgA / s.avgAgainst.total) * 100 : null;
  put(box,
    h("p", { class: "updated" }, `${s.league.name} · saison ${seasonLabel(s.league.season)}`),
    h("div", { class: "kpis" },
      kpi(fr(s.avgFor.total, 1), "Buts marqués par match"), kpi(fr(s.avgAgainst.total, 1), "Buts encaissés par match"),
      kpi(pct(s.cleanSheet.total, s.played.total), `Matchs sans encaisser (${s.cleanSheet.total})`), kpi(pct(s.failedToScore.total, s.played.total), `Matchs sans marquer (${s.failedToScore.total})`),
      offIdx != null ? kpi(fr(offIdx) , "Efficacité offensive (100 = moyenne du championnat)") : null,
      defIdx != null ? kpi(fr(defIdx), "Solidité défensive (100 = moyenne du championnat)") : null,
      s.biggest.streakWins ? kpi(s.biggest.streakWins, "Plus longue série de victoires") : null),
    h("h3", { style: "margin:18px 0 8px" }, "Domicile et extérieur"), split,
    h("h3", { style: "margin:18px 0 8px" }, "Buts par période de jeu"),
    h("div", { class: "panel" }, barChart({ labels: slots.map(k => k + "’"), series: [{ name: "Marqués", values: slots.map(k => s.minutesFor[k] || 0), color: "#00C875" }, { name: "Encaissés", values: slots.map(k => s.minutesAgainst[k] || 0), color: "#9299A5" }] })),
    rows.length > 2 ? [h("h3", { style: "margin:18px 0 8px" }, "Comparaison avec les autres équipes"),
      h("div", { class: "panel" }, barChart({ labels: rows.map(r => r.team.name.length > 9 ? r.team.name.slice(0, 8) + "…" : r.team.name), series: [{ name: "Buts marqués par match", values: rows.map(gfpm), color: "#00C875", highlight: rows.map(r => r.team.id === tid) }, { name: "Buts encaissés par match", values: rows.map(gapm), color: "#9299A5", highlight: rows.map(r => r.team.id === tid) }], fmt: v => fr(v, 1), height: 240 }),
        h("p", { class: "updated" }, "Survolez une barre pour voir l’équipe et la valeur."))] : null,
    s.formations.length ? h("p", { class: "updated", style: "margin-top:12px" }, "Systèmes utilisés : " + s.formations.slice(0, 4).map(f => `${f.formation} (${f.played})`).join(", ")) : null,
    h("p", { class: "updated" }, "La possession moyenne sur la saison n’est pas fournie par le fournisseur ; elle est visible sur chaque fiche de match."));
}

/* ================= ÉTAPE 3 : ACTUALITÉS ================= */
const NEWS_CATS = [["all", "Tout"], ["foryou", "Pour vous"], ["football", "Football"], ["mercato", "Mercato"], ["basketball", "Basketball"], ["tennis", "Tennis"], ["f1", "Formule 1"], ["athletisme", "Athlétisme"], ["combat", "Sports de combat"], ["autres", "Autres sports"]];
const CAT_LABEL = Object.fromEntries(NEWS_CATS);
const CAT_ICON = { football: "⚽", mercato: "⇄", basketball: "🏀", tennis: "🎾", f1: "🏎", athletisme: "🏃", combat: "🥊", autres: "🏅" };
function ago(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l’instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 60 * 24) return `il y a ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + hm(iso);
}
function favTerms() {
  const f = Fav.read();
  return [...f.teams.map(t => t.name), ...f.leagues.map(l => l.name)].map(n => n.toLowerCase()).filter(n => n.length >= 3);
}
const matchesTerms = (it, terms) => { const t = `${it.title} ${it.summary}`.toLowerCase(); return terms.some(x => t.includes(x)); };
function newsCard(it, big) {
  const visual = it.image ? h("img", { src: it.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(h("div", { class: "news-ph" }, CAT_ICON[it.category] || "🏅")) }) : h("div", { class: "news-ph" }, CAT_ICON[it.category] || "🏅");
  return h("a", { class: "news" + (big ? " big" : ""), href: it.link, target: "_blank", rel: "noopener noreferrer" },
    h("div", { class: "news-img" }, visual, h("span", { class: "news-cat" }, CAT_LABEL[it.category] || "Sport")),
    h("div", { class: "news-body" },
      h("h3", {}, it.title),
      it.summary ? h("p", {}, it.summary) : null,
      h("div", { class: "news-meta" }, h("b", {}, it.source), it.lang === "en" ? h("span", { class: "lang" }, "EN") : null, h("span", {}, ago(it.date)), h("span", { class: "out" }, "Lire l’article ↗"))));
}
async function loadNews() { return (await api("news", { ttl: 300000 })).data; }

async function viewNews(root, ctx, params) {
  let cat = NEWS_CATS.some(c => c[0] === params.get("cat")) ? params.get("cat") : "all", text = "";
  const chips = h("div", { class: "bar news-chips" });
  const list = h("div", {}, skeleton(4));
  const srcBox = h("div", {});
  root.append(h("h1", {}, "Actualités"), h("p", { class: "sub" }, "Les dernières informations sportives, récupérées automatiquement auprès de médias reconnus. Chaque article renvoie vers sa source."),
    chips, h("div", { class: "bar" }, h("input", { class: "field wide", type: "search", placeholder: "Filtrer : club, joueur, compétition…", "aria-label": "Filtrer les actualités", oninput: e => { text = e.target.value.toLowerCase().trim(); draw(); } })),
    list, adSlot("actualites"), h("h2", {}, "Sources"), srcBox);
  let data = null, body = null;
  const draw = () => {
    put(chips, NEWS_CATS.map(([k, l]) => h("button", { type: "button", class: "chip", "aria-pressed": String(cat === k), onclick: () => { cat = k; draw(); } }, l)));
    if (!data) return;
    const terms = favTerms();
    let items = data.items;
    if (cat === "foryou") items = terms.length ? items.filter(it => matchesTerms(it, terms)) : [];
    else if (cat !== "all") items = items.filter(it => it.category === cat);
    if (text) items = items.filter(it => `${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(text));
    if (cat === "foryou" && !terms.length) { put(list, empty("Votre fil personnalisé est vide", "Suivez des équipes ou des compétitions (bouton « Suivre ») : les actualités qui les mentionnent apparaîtront ici.")); return; }
    if (!items.length) { put(list, empty("Aucune actualité dans cette catégorie pour le moment", cat === "foryou" ? "Aucun article récent ne mentionne vos équipes ou compétitions suivies." : "Essayez une autre catégorie.")); return; }
    const [first, ...rest] = items;
    put(list, h("div", { class: "news-grid" }, newsCard(first, true), rest.slice(0, 59).map(it => newsCard(it))), updatedLine(body));
  };
  draw();
  try { data = await loadNews(); body = { fetchedAt: new Date().toISOString() }; } catch (e) { if (ctx.alive()) put(list, stateBox(e)); return; }
  if (!ctx.alive()) return;
  draw();
  put(srcBox, h("div", { class: "panel" }, h("ul", { class: "sources" }, data.sources.map(s => h("li", {},
    h("span", { class: "dot2 " + (s.ok ? "ok" : "ko") }), h("a", { href: s.site, target: "_blank", rel: "noopener noreferrer" }, s.name), ` · ${CAT_LABEL[s.category] || "Généraliste"}${s.lang === "en" ? " (en anglais)" : ""} · `,
    s.ok ? `${s.count} articles` : "indisponible pour le moment")))),
    h("p", { class: "updated" }, "Les titres et résumés proviennent des flux RSS publics de ces médias ; l’article complet se lit sur leur site. Les actualités sont rafraîchies toutes les 15 minutes."));
  ctx.every(900000, async () => { try { cache.clear(); data = await loadNews(); draw(); } catch {} });
}

async function homeNews(box) {
  try {
    const d = await loadNews();
    const terms = favTerms();
    const mine = terms.length ? d.items.filter(it => matchesTerms(it, terms)).slice(0, 2) : [];
    const top = [...mine, ...d.items.filter(it => !mine.includes(it) && it.lang === "fr")].slice(0, 5);
    put(box, top.length ? h("div", { class: "news-list" }, top.map(it => h("a", { class: "news-line", href: it.link, target: "_blank", rel: "noopener noreferrer" },
      it.image ? h("img", { src: it.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.remove() }) : null,
      h("div", {}, h("b", {}, it.title), h("small", {}, `${CAT_LABEL[it.category]} · ${it.source} · ${ago(it.date)}`))))) : empty("Pas d’actualité pour le moment", ""));
  } catch (e) { put(box, stateBox(e)); }
}
async function teamNews(box, teamName) {
  try {
    const d = await loadNews();
    const n = teamName.toLowerCase();
    const items = d.items.filter(it => `${it.title} ${it.summary}`.toLowerCase().includes(n)).slice(0, 6);
    put(box, items.length ? h("div", { class: "news-list" }, items.map(it => h("a", { class: "news-line", href: it.link, target: "_blank", rel: "noopener noreferrer" },
      h("div", {}, h("b", {}, it.title), h("small", {}, `${it.source} · ${ago(it.date)}`))))) : empty("Pas d’actualité récente", `Aucun article récent de nos sources ne mentionne ${teamName}.`));
  } catch (e) { put(box, stateBox(e)); }
}

/* ================= ÉTAPE 4 : MATCH ANALYSIS ================= */
/* Modèle TOTAL90 (documenté sur le site) :
   1. Moyennes de la compétition : buts marqués par match à domicile (μH) et à l’extérieur (μA), tirées du classement.
   2. Forces de chaque équipe dans la compétition : attaque à domicile/extérieur et défense à domicile/extérieur,
      rapportées à ces moyennes et « rétrécies » vers 1 quand l’échantillon est petit (K = 4 matchs fictifs moyens).
   3. Forme : léger ajustement (±10 % max) selon les points pris sur les 5 derniers matchs comparés à la saison.
   4. Buts attendus : λ dom = μH × attaque dom × défense ext adverse × forme ; λ ext = μA × attaque ext × défense dom adverse × forme.
   5. Probabilités de chaque score par loi de Poisson, corrigées pour les petits scores (Dixon-Coles, ρ = −0,08). */
const PRED_K = 4, PRED_RHO = -0.08, PRED_MAX = 8;
const poisson = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
function formPoints(form, n) { const f = (form || "").slice(-n); return f.length ? [...f].reduce((a, c) => a + (c === "W" ? 3 : c === "D" ? 1 : 0), 0) / f.length : null; }
function predictMatch(sh, sa, rows) {
  const ok = x => x && x.played && x.played.total > 0;
  if (!ok(sh) || !ok(sa)) return null;
  const r = (rows || []).filter(x => x.hp > 0 && x.ap > 0);
  const sum = k => r.reduce((a, x) => a + (x[k] || 0), 0);
  let muH, muA, base;
  if (sum("hp") >= 10 && sum("ap") >= 10) { muH = sum("hgf") / sum("hp"); muA = sum("agf") / sum("ap"); base = "classement de la compétition"; }
  else {
    const g = (sh.goalsFor.total + sh.goalsAgainst.total + sa.goalsFor.total + sa.goalsAgainst.total) / (2 * (sh.played.total + sa.played.total));
    muH = g * 1.1; muA = g * 0.9; base = "matchs des deux équipes (avantage du terrain par défaut de 10 %)";
  }
  if (!(muH > 0) || !(muA > 0)) return null;
  const shrink = (goals, n, mu) => n > 0 ? (goals / mu + PRED_K) / (n + PRED_K) : 1;
  const attH = shrink(sh.goalsFor.home, sh.played.home, muH), defA = shrink(sa.goalsAgainst.away, sa.played.away, muH);
  const attA = shrink(sa.goalsFor.away, sa.played.away, muA), defH = shrink(sh.goalsAgainst.home, sh.played.home, muA);
  const formAdj = s => { const f = formPoints(s.form, 5), season = (3 * s.wins.total + s.draws.total) / s.played.total; return f == null ? 1 : 1 + 0.1 * Math.max(-1, Math.min(1, (f - season) / 1.5)); };
  const fH = formAdj(sh), fA = formAdj(sa);
  const clamp = v => Math.max(0.15, Math.min(5, v));
  const lH = clamp(muH * attH * defA * fH), lA = clamp(muA * attA * defH * fA);
  const tau = (i, j) => i === 0 && j === 0 ? 1 - lH * lA * PRED_RHO : i === 0 && j === 1 ? 1 + lH * PRED_RHO : i === 1 && j === 0 ? 1 + lA * PRED_RHO : i === 1 && j === 1 ? 1 - PRED_RHO : 1;
  const grid = []; let tot = 0;
  for (let i = 0; i <= PRED_MAX; i++) for (let j = 0; j <= PRED_MAX; j++) { const p = poisson(i, lH) * poisson(j, lA) * tau(i, j); grid.push([i, j, p]); tot += p; }
  grid.forEach(c => c[2] /= tot);
  const P = f => grid.filter(f).reduce((a, c) => a + c[2], 0);
  const n = Math.min(sh.played.home, sa.played.away);
  const confidence = n >= 6 && base.startsWith("classement") ? "Élevé" : n >= 3 ? "Moyen" : "Faible";
  return {
    home: P(([i, j]) => i > j), draw: P(([i, j]) => i === j), away: P(([i, j]) => i < j),
    btts: P(([i, j]) => i > 0 && j > 0), over25: P(([i, j]) => i + j >= 3),
    scores: grid.slice().sort((a, b) => b[2] - a[2]).slice(0, 6),
    lH, lA, muH, muA, attH, attA, defH, defA, fH, fA, base, n, confidence
  };
}
const pc = (v, d = 0) => fr(v * 100, d) + " %";
async function probaBlock(m) {
  if (m.status.state !== "scheduled") return [empty("Estimation avant-match uniquement", m.status.state === "finished" ? "Le match est terminé : les probabilités ne sont calculées que pour les rencontres à venir." : "Le match a commencé : les probabilités ne sont calculées qu’avant le coup d’envoi.")];
  let sh, sa, st;
  try {
    [sh, sa, st] = await Promise.all([
      api(`teamstats?team=${m.home.id}&league=${m.league.id}&season=${m.league.season}`, { ttl: 600000 }),
      api(`teamstats?team=${m.away.id}&league=${m.league.id}&season=${m.league.season}`, { ttl: 600000 }),
      api(`standings?league=${m.league.id}&season=${m.league.season}`, { ttl: 600000 }).catch(() => ({ data: [] }))
    ]);
  } catch (e) { return [stateBox(e)]; }
  const rows = st.data.flat();
  const p = predictMatch(sh.data, sa.data, rows);
  if (!p) return [empty("Pas assez de données pour une estimation", "Les deux équipes doivent avoir joué au moins un match dans cette compétition. TOTAL90 préfère ne rien afficher plutôt qu’une estimation sans fondement.")];
  const H = m.home.name, A = m.away.name, S = sh.data, T = sa.data;
  const f5 = s => formPoints(s.form, 5);
  const h2h = (m.h2h || []).filter(x => x.status.state === "finished");
  let hw = 0, dw = 0, aw = 0; h2h.forEach(x => { const homeIsH = x.home.id === m.home.id; if (x.score.home === x.score.away) dw++; else if ((x.score.home > x.score.away) === homeIsH) hw++; else aw++; });
  const factor = (title, text) => h("li", {}, h("b", {}, title), " ", text);
  const winH = S.played.home ? S.wins.home / S.played.home : null, winA = T.played.away ? T.wins.away / T.played.away : null;
  return [
    h("div", { class: "proba-head" }, h("span", { class: "conf conf-" + p.confidence.normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase() }, `Niveau de confiance : ${p.confidence}`),
      h("span", { class: "updated" }, `Calculé le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}, d’après les données relevées le ${new Date(sh.fetchedAt).toLocaleDateString("fr-FR")}`)),
    h("div", { class: "three" },
      [[H, p.home, "var(--green)"], ["Match nul", p.draw, "var(--grey)"], [A, p.away, "#4D9DE0"]].map(([l, v, c]) => h("div", { class: "three-col" }, h("b", { style: `color:${c}` }, pc(v)), h("span", {}, l)))),
    h("div", { class: "three-bar", role: "img", "aria-label": `${H} ${pc(p.home)}, nul ${pc(p.draw)}, ${A} ${pc(p.away)}` },
      h("i", { style: `width:${p.home * 100}%;background:var(--green)` }), h("i", { style: `width:${p.draw * 100}%;background:var(--grey)` }), h("i", { style: `width:${p.away * 100}%;background:#4D9DE0` })),
    h("div", { class: "kpis" },
      h("div", { class: "kpi" }, h("b", {}, pc(p.btts)), h("span", {}, "Les deux équipes marquent")),
      h("div", { class: "kpi" }, h("b", {}, pc(p.over25)), h("span", {}, "Plus de 2,5 buts")),
      h("div", { class: "kpi" }, h("b", {}, pc(1 - p.over25)), h("span", {}, "Moins de 2,5 buts")),
      h("div", { class: "kpi" }, h("b", {}, `${p.scores[0][0]} – ${p.scores[0][1]}`), h("span", {}, `Score le plus probable (${pc(p.scores[0][2])})`)),
      h("div", { class: "kpi" }, h("b", {}, `${fr(p.lH, 2)} – ${fr(p.lA, 2)}`), h("span", {}, "Buts attendus par le modèle"))),
    h("h3", { style: "margin:18px 0 8px" }, "Scores les plus probables"),
    barChart({ labels: p.scores.map(s => `${s[0]}-${s[1]}`), series: [{ name: "Probabilité", values: p.scores.map(s => Math.round(s[2] * 1000) / 10), color: "#00C875" }], fmt: v => fr(v, 1) + " %", height: 180 }),
    h("h3", { style: "margin:18px 0 8px" }, "Les facteurs de l’estimation"),
    h("ul", { class: "factors" },
      factor("Forme récente :", `${H} ${f5(S) != null ? fr(f5(S), 1) + " pt/match" : "n.d."} sur ses 5 derniers matchs (${[...(S.form || "").slice(-5)].map(c => ({ W: "V", D: "N", L: "D" })[c] || c).join("") || "n.d."}), ${A} ${f5(T) != null ? fr(f5(T), 1) + " pt/match" : "n.d."}. Effet sur les buts attendus : ${p.fH >= 1 ? "+" : ""}${fr((p.fH - 1) * 100)} % et ${p.fA >= 1 ? "+" : ""}${fr((p.fA - 1) * 100)} %.`),
      factor("Avantage du terrain :", `dans cette compétition, on marque en moyenne ${fr(p.muH, 2)} but(s) à domicile contre ${fr(p.muA, 2)} à l’extérieur. ${H} gagne ${winH != null ? pc(winH) : "n.d."} de ses matchs à domicile, ${A} ${winA != null ? pc(winA) : "n.d."} de ses matchs à l’extérieur.`),
      factor("Attaque :", `${H} à domicile ${fr(p.attH * 100)} (100 = moyenne), ${A} à l’extérieur ${fr(p.attA * 100)}.`),
      factor("Défense :", `buts concédés par ${H} à domicile ${fr(p.defH * 100)}, par ${A} à l’extérieur ${fr(p.defA * 100)} (100 = moyenne, plus bas = plus solide).`),
      factor("Confrontations directes :", h2h.length ? `${hw} victoire(s) de ${H}, ${dw} nul(s), ${aw} victoire(s) de ${A} sur les ${h2h.length} dernières rencontres. Affiché pour contexte, non utilisé dans le calcul (échantillon trop petit et souvent ancien).` : "aucune rencontre récente dans les données."),
      factor("Base de calcul :", `${p.base} ; ${p.n} match(s) minimum par équipe dans le contexte domicile/extérieur utilisé.`)),
    h("p", { class: "disclaimer" }, "Ces probabilités sont des estimations statistiques, pas des résultats garantis. Le football reste imprévisible : blessures, suspensions, rotations et météo ne sont pas pris en compte."),
    h("details", { class: "panel doc" }, h("summary", {}, "Comment fonctionne le modèle ?"),
      h("ol", {},
        h("li", {}, "On calcule la moyenne de buts marqués à domicile et à l’extérieur dans la compétition, à partir du classement."),
        h("li", {}, "On mesure la force offensive et défensive de chaque équipe à domicile et à l’extérieur, par rapport à ces moyennes. Quand une équipe a joué peu de matchs, sa force est ramenée vers la moyenne (comme si elle avait aussi joué 4 matchs « moyens »), pour éviter les conclusions hâtives."),
        h("li", {}, "On ajuste légèrement (10 % au maximum) selon la forme sur les 5 derniers matchs."),
        h("li", {}, "On en déduit le nombre de buts attendus de chaque équipe, puis la probabilité de chaque score avec une loi de Poisson, corrigée pour les petits scores (méthode de Dixon et Coles, 1997)."),
        h("li", {}, "En additionnant les probabilités de tous les scores, on obtient victoire, nul, défaite, « les deux équipes marquent » et « plus ou moins de 2,5 buts »."),
        h("li", {}, "Niveau de confiance : élevé si chaque équipe a joué au moins 6 matchs dans le contexte utilisé et que le classement est disponible, moyen à partir de 3 matchs, faible en dessous.")))
  ];
}

async function matchAnalysisList(box, ctx) {
  put(box, skeleton(2));
  try {
    const [t, d] = await Promise.all([api(`matches?date=${TODAY()}`, { ttl: 60000 }), api(`matches?date=${addDays(TODAY(), 1)}`, { ttl: 600000 })]);
    if (ctx && !ctx.alive()) return;
    const up = [...t.data, ...d.data].filter((m, i, all) => m.status.state === "scheduled" && all.findIndex(x => x.id === m.id) === i);
    const big = pick(up, 12);
    put(box, big.length ? [h("div", {}, groupMatches(big).map(g => groupBlock(g, { showDate: true }))),
      h("p", { class: "updated" }, "Touchez un match puis l’onglet « Probabilités » pour voir l’analyse complète.")] : empty("Aucun grand match à venir d’ici demain", "Consultez la rubrique Football pour choisir un autre jour."));
    box.querySelectorAll("a.row").forEach(a => a.href = a.getAttribute("href") + "?onglet=proba");
  } catch (e) { put(box, stateBox(e)); }
}

/* ================= ÉTAPE 5 : BASKETBALL, TENNIS, AUTRES SPORTS ================= */
const espnNote = () => h("p", { class: "updated" }, "Source : données publiques d’ESPN (gratuites, sans quota). Elles ne sont pas officiellement documentées : si ESPN les modifie, la section concernée s’affichera comme indisponible le temps de l’adapter.");
function dateBar(date, base) {
  return h("div", { class: "bar" },
    ["Hier", "Aujourd’hui", "Demain"].map((l, i) => { const d = addDays(TODAY(), i - 1); return h("a", { class: "chip" + (d === date ? " on" : ""), href: `/${base}?date=${d}` }, l); }),
    h("input", { class: "field", type: "date", value: date, "aria-label": "Choisir une date", onchange: e => e.target.value && (navigate(`/${base}?date=${e.target.value}`)) }));
}
const sportClock = g => g.state === "scheduled" ? hm(g.date) : g.state === "live" ? (trFR(g.detail) || "En cours") : g.state === "finished" ? "Terminé" : trFR(g.detail);

const TR_RULES = [
  [/Men's Singles/i, "Simple messieurs"], [/Women's Singles/i, "Simple dames"], [/Men's Doubles/i, "Double messieurs"], [/Women's Doubles/i, "Double dames"], [/Mixed Doubles/i, "Double mixte"],
  [/^Round Robin$/i, "Phase de groupes"], [/^Quarterfinals?$/i, "Quart de finale"], [/^Semifinals?$/i, "Demi-finale"], [/^Finals?$/i, "Finale"],
  [/^Round of 16$/i, "Huitièmes de finale"], [/^Round of 32$/i, "Seizièmes de finale"], [/^Round 1$/i, "1er tour"], [/^Round (\d+)$/i, "$1e tour"], [/^Qualifying/i, "Qualifications"],
  [/(\d)(?:st|nd|rd|th) Set/i, (m, n) => n === "1" ? "1er set" : `${n}e set`], [/^Halftime$/i, "Mi-temps"], [/End of (\d)(?:st|nd|rd|th)/i, (m, n) => n === "1" ? "Fin du 1er QT" : `Fin du ${n}e QT`], [/^Q(\d)\b/, "QT$1"], [/^OT\b/, "Prol."],
  [/Decision - Unanimous/i, "Décision unanime"], [/Decision - Split/i, "Décision partagée"], [/Decision - Majority/i, "Décision majoritaire"], [/Submission/i, "Soumission"],
  [/Women's (.+)/i, "$1 féminin"], [/Light Heavyweight/i, "Poids mi-lourds"], [/Heavyweight/i, "Poids lourds"], [/Middleweight/i, "Poids moyens"], [/Welterweight/i, "Poids welters"],
  [/Lightweight/i, "Poids légers"], [/Featherweight/i, "Poids plumes"], [/Bantamweight/i, "Poids coqs"], [/Flyweight/i, "Poids mouches"], [/Strawweight/i, "Poids pailles"], [/Catchweight/i, "Poids convenu"]
];
const trFR = v => v ? TR_RULES.reduce((a, [re, to]) => a.replace(re, to), String(v)) : v;

/* Données ESPN : d'abord via le serveur TOTAL90 (cache partagé), sinon directement depuis le navigateur. */
let espnModule = null;
async function espnGet(job, path, args, ttl) {
  try { return await api(path, { ttl }); }
  catch (e) {
    if (e && e.name === "AbortError") throw e;
    const key = "direct:" + path, hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.body;
    espnModule = espnModule || await import("/assets/espn.mjs?v=6");
    try {
      const body = { data: await espnModule[job](...args), fetchedAt: new Date().toISOString() };
      cache.set(key, { body, until: Date.now() + (ttl || 30000) });
      return body;
    } catch (e2) { throw { error: "upstream", message: (e2 && e2.message) || "Données momentanément indisponibles." }; }
  }
}

/* ---------- Basketball ---------- */
function nbaCard(g) {
  const live = g.state === "live", done = g.state === "finished";
  const line = t => h("div", { class: "bk-team" + (done && t.winner ? " w" : "") }, img(t.logo), h("span", {}, t.name, t.record ? h("small", {}, ` (${t.record})`) : null), h("b", {}, g.state === "scheduled" ? "" : t.score ?? "–"));
  const card = h("button", { type: "button", class: "game bk", "aria-expanded": "false", style: "--c:#C9082A" },
    h("div", { class: "bk-head" }, h("span", { class: "when" + (live ? " live" : "") }, sportClock(g)), g.broadcast ? h("small", {}, g.broadcast) : null),
    line(g.away), line(g.home),
    h("span", { class: "meta" }, g.venue ? `${g.venue}${g.city ? ", " + g.city : ""}` : "", g.topScorer?.name ? h("span", {}, `Meilleur marqueur : ${g.topScorer.name} (${g.topScorer.value})`) : null));
  card.addEventListener("click", () => {
    const open = card.getAttribute("aria-expanded") === "true"; card.setAttribute("aria-expanded", String(!open));
    card.querySelector(".qt")?.remove();
    if (!open && g.home.quarters.length) {
      const n = Math.max(g.home.quarters.length, g.away.quarters.length);
      card.append(h("table", { class: "standings qt" }, h("thead", {}, h("tr", {}, h("th", {}, ""), ...Array.from({ length: n }, (_, i) => h("th", {}, i < 4 ? `Q${i + 1}` : `Prol. ${i - 3}`)), h("th", {}, "Total"))),
        h("tbody", {}, [g.away, g.home].map(t => h("tr", {}, h("td", {}, t.short || t.name), ...Array.from({ length: n }, (_, i) => h("td", {}, t.quarters[i] ?? "")), h("td", { class: "pts" }, t.score ?? ""))))));
    }
  });
  return card;
}
async function viewBasketball(root, ctx, params) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : TODAY();
  const list = h("div", {}, skeleton(3)), table = h("div", {}, skeleton(2));
  root.append(h("h1", {}, "Basketball"), h("p", { class: "sub" }, `NBA · ${longDate(date)}. Les horaires sont à l’heure de votre appareil : la plupart des matchs NBA se jouent la nuit en Europe.`),
    dateBar(date, "basketball"), h("div", { class: "grid-2" }, h("div", {}, h("h2", {}, "Matchs NBA"), list), h("aside", {}, h("h2", {}, "Classement NBA"), table)), espnNote());
  const load = async () => {
    try {
      // La journée NBA américaine chevauche deux dates européennes : on prend la veille et le jour même, puis on filtre sur la date locale.
      const [a, b] = await Promise.all([espnGet("basketball", `espn/basketball?date=${addDays(date, -1)}`, [addDays(date, -1)], 30000), espnGet("basketball", `espn/basketball?date=${date}`, [date], 30000)]);
      if (!ctx.alive()) return;
      const games = [...a.data, ...b.data].filter((g, i, all) => all.findIndex(x => x.id === g.id) === i && ymd(new Date(g.date)) === date).sort((x, y) => x.date.localeCompare(y.date));
      put(list, games.length ? h("div", { class: "games" }, games.map(nbaCard)) : empty("Aucun match NBA ce jour-là", "Essayez une autre date."), h("p", { class: "updated" }, "Touchez un match pour le score par quart-temps."), updatedLine(b));
    } catch (e) { if (ctx.alive()) put(list, stateBox(e)); }
  };
  await load();
  ctx.every(LIVE_REFRESH * 2, load);
  try {
    const st = await espnGet("nbaStandings", "espn/nba-standings", [], 600000);
    if (!ctx.alive()) return;
    put(table, st.data.length ? st.data.map(c => [h("h3", { style: "margin:12px 0 6px" }, c.name), h("div", { class: "panel table-wrap" }, h("table", { class: "standings" },
      h("thead", {}, h("tr", {}, ["#", "Équipe", "V", "D", "%", "Écart"].map(x => h("th", {}, x)))),
      h("tbody", {}, c.rows.map((r, i) => h("tr", {}, h("td", {}, r.seed ?? i + 1), h("td", {}, h("span", { class: "tm-inline" }, img(r.logo), r.team)), h("td", {}, r.w ?? "–"), h("td", {}, r.l ?? "–"), h("td", {}, r.pct ?? "–"), h("td", {}, r.gb ?? "–"))))))]) : empty("Classement indisponible", ""));
  } catch (e) { put(table, stateBox(e)); }
}

/* ---------- Tennis ---------- */
function tennisRow(m) {
  const live = m.state === "live";
  const maxSets = Math.max(0, ...m.players.map(p => p.sets.length));
  return h("div", { class: "tn" + (live ? " live" : "") },
    h("div", { class: "tn-head" }, h("span", { class: "when" + (live ? " live" : "") }, sportClock(m)), m.round ? h("small", {}, trFR(m.round)) : null, m.court ? h("small", {}, m.court) : null),
    m.players.map(p => h("div", { class: "tn-p" + (p.winner ? " w" : "") }, p.flag ? h("img", { src: p.flag, alt: "", class: "flag", loading: "lazy" }) : h("span", { class: "flag" }),
      h("span", { class: "nm" }, p.name, p.seed ? h("small", {}, ` (${p.seed})`) : null),
      h("span", { class: "sets" }, Array.from({ length: maxSets }, (_, i) => { const s = p.sets[i]; return h("b", {}, s ? s.v ?? "" : "", s?.tb != null ? h("sup", {}, s.tb) : null); })))));
}
async function viewTennis(root, ctx, params) {
  const tour = params.get("circuit") === "wta" ? "wta" : "atp";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : TODAY();
  const list = h("div", {}, skeleton(3)), rk = h("div", {}, skeleton(3));
  root.append(h("h1", {}, "Tennis"), h("p", { class: "sub" }, `${tour.toUpperCase()} · ${longDate(date)}`),
    h("div", { class: "bar" }, ["atp", "wta"].map(t => h("a", { class: "chip" + (t === tour ? " on" : ""), href: `/tennis?circuit=${t}&date=${date}` }, t === "atp" ? "ATP (messieurs)" : "WTA (dames)"))),
    h("div", { class: "bar" }, ["Hier", "Aujourd’hui", "Demain"].map((l, i) => { const d = addDays(TODAY(), i - 1); return h("a", { class: "chip" + (d === date ? " on" : ""), href: `/tennis?circuit=${tour}&date=${d}` }, l); })),
    h("div", { class: "grid-2" }, h("div", {}, h("h2", {}, "Matchs"), list), h("aside", {}, h("h2", {}, `Classement ${tour.toUpperCase()}`), rk)), espnNote());
  const load = async () => {
    try {
      const b = await espnGet("tennis", `espn/tennis?tour=${tour}&date=${date}`, [tour, date], 30000);
      if (!ctx.alive()) return;
      put(list, b.data.length ? b.data.map(t => h("section", { class: "group" }, h("div", { class: "ghead" }, h("div", {}, h("b", {}, t.name), h("br"), h("small", {}, [t.venue, t.start ? `${dayLabel(t.start)}${t.end ? " – " + dayLabel(t.end) : ""}` : null].filter(Boolean).join(" · ")))),
        t.groups.map(g => [h("div", { class: "tn-group" }, trFR(g.name)), g.matches.map(tennisRow)]))) : empty("Aucun match ce jour-là sur ce circuit", "Hors saison ou jour de repos : essayez une autre date ou l’autre circuit."), updatedLine(b));
    } catch (e) { if (ctx.alive()) put(list, stateBox(e)); }
  };
  await load();
  ctx.every(LIVE_REFRESH * 2, load);
  try {
    const r = await espnGet("tennisRankings", `espn/tennis-rankings?tour=${tour}`, [tour], 600000);
    if (!ctx.alive()) return;
    put(rk, r.data.rows.length ? h("div", { class: "panel table-wrap" }, h("table", { class: "standings" },
      h("thead", {}, h("tr", {}, ["#", "Joueur", "Points", ""].map(x => h("th", {}, x)))),
      h("tbody", {}, r.data.rows.slice(0, 50).map(p => h("tr", {}, h("td", {}, p.rank), h("td", {}, h("span", { class: "tm-inline" }, p.flag ? h("img", { src: p.flag, alt: "", class: "flag" }) : null, p.name)), h("td", {}, p.points != null ? fr(p.points) : "–"),
        h("td", { class: p.previous && p.rank < p.previous ? "up" : p.previous && p.rank > p.previous ? "down" : "" }, p.previous && p.previous !== p.rank ? (p.rank < p.previous ? `▲ ${p.previous - p.rank}` : `▼ ${p.rank - p.previous}`) : "")))))) : empty("Classement indisponible", ""));
  } catch (e) { put(rk, stateBox(e)); }
}

/* ---------- Autres sports : F1 et UFC ---------- */
async function viewOtherSports(root, ctx) {
  const f1Box = h("div", {}, skeleton(3)), ufcBox = h("div", {}, skeleton(3));
  root.append(h("h1", {}, "Autres sports"), h("p", { class: "sub" }, "Formule 1 et UFC en données réelles. Pour l’athlétisme, le rugby, le cyclisme et les autres disciplines, retrouvez les dernières informations dans les Actualités."),
    h("div", { class: "grid-2" }, h("div", {}, h("h2", {}, "Formule 1"), f1Box), h("aside", {}, h("h2", {}, "UFC"), ufcBox)),
    h("div", { class: "bar", style: "margin-top:18px" }, h("a", { class: "chip", href: "/actualites?cat=f1" }, "Actualités F1"), h("a", { class: "chip", href: "/actualites?cat=combat" }, "Sports de combat"), h("a", { class: "chip", href: "/actualites?cat=athletisme" }, "Athlétisme"), h("a", { class: "chip", href: "/actualites?cat=autres" }, "Autres sports")),
    espnNote());
  const upcomingCal = cal => cal.filter(c => new Date(c.end || c.start) >= new Date(Date.now() - 864e5)).slice(0, 6);
  try {
    const { data } = await espnGet("f1", "espn/f1", [], 60000);
    if (!ctx.alive()) return;
    const ev = data.events[0];
    put(f1Box,
      ev ? h("section", { class: "group" }, h("div", { class: "ghead" }, h("div", {}, h("b", {}, ev.name), h("br"), h("small", {}, [ev.circuit, ev.start ? dayLabel(ev.start) + (ev.end ? " – " + dayLabel(ev.end) : "") : null].filter(Boolean).join(" · ")))),
        ev.sessions.map(s => h("div", { class: "f1s" }, h("div", { class: "tn-group" }, `${({ FP1: "Essais libres 1", FP2: "Essais libres 2", FP3: "Essais libres 3", Qual: "Qualifications", Race: "Course", Sprint: "Sprint", SS: "Qualifications sprint" })[s.type] || s.type} · ${s.state === "scheduled" ? dayLabel(s.date) + " " + hm(s.date) : s.state === "live" ? "En cours" : s.state === "finished" ? "Terminé" : s.detail}`),
          s.results.length && s.state !== "scheduled" ? h("ol", { class: "f1r" }, s.results.slice(0, 10).map(r => h("li", { class: r.pos === 1 ? "w" : "" }, h("b", {}, r.pos ?? ""), r.flag ? h("img", { src: r.flag, alt: "", class: "flag" }) : h("span", { class: "flag" }), h("span", {}, r.name), r.team ? h("small", {}, r.team) : null))) : null)))
        : empty("Pas de Grand Prix en cours", "La saison est peut-être terminée : consultez le calendrier."),
      upcomingCal(data.calendar).length ? [h("h3", { style: "margin:16px 0 8px" }, "Prochains rendez-vous"), h("div", { class: "group" }, upcomingCal(data.calendar).map(c => h("div", { class: "row cal" }, h("span", { class: "when" }, dayLabel(c.start)), h("span", {}, c.name), h("span", {}))))] : null);
  } catch (e) { put(f1Box, stateBox(e)); }
  try {
    const { data } = await espnGet("mma", "espn/mma", [], 60000);
    if (!ctx.alive()) return;
    const ev = data.events[0];
    put(ufcBox,
      ev ? h("section", { class: "group" }, h("div", { class: "ghead" }, h("div", {}, h("b", {}, ev.name), h("br"), h("small", {}, [ev.venue, ev.date ? dayLabel(ev.date) + " " + hm(ev.date) : null].filter(Boolean).join(" · ")))),
        ev.fights.map(f => h("div", { class: "fight" }, h("div", { class: "tn-head" }, h("span", { class: "when" + (f.state === "live" ? " live" : "") }, f.state === "finished" ? "Terminé" : f.state === "live" ? "En cours" : ""), f.category ? h("small", {}, trFR(f.category)) : null),
          f.fighters.map(p => h("div", { class: "tn-p" + (p.winner ? " w" : "") }, p.flag ? h("img", { src: p.flag, alt: "", class: "flag" }) : h("span", { class: "flag" }), h("span", { class: "nm" }, p.name, p.record ? h("small", {}, ` (${p.record})`) : null), p.winner ? h("b", { class: "win-tag" }, "Vainqueur") : h("span", {}))),
          f.state === "finished" && f.result ? h("small", { class: "updated" }, trFR(f.result)) : null)))
        : empty("Pas de gala UFC en cours", ""),
      upcomingCal(data.calendar).length ? [h("h3", { style: "margin:16px 0 8px" }, "Prochains galas"), h("div", { class: "group" }, upcomingCal(data.calendar).map(c => h("div", { class: "row cal" }, h("span", { class: "when" }, dayLabel(c.start)), h("span", {}, c.name), h("span", {}))))] : null);
  } catch (e) { put(ufcBox, stateBox(e)); }
}

/* ================= ÉTAPE 6 : PAGES LÉGALES, CONSENTEMENT, PUBLICITÉ ================= */
const CFG = () => window.T90_CONFIG || {};
const todo = v => v ? v : h("mark", { class: "todo" }, "[à compléter dans assets/config.js]");
function legalPage(root, title, ...sections) { root.append(h("article", { class: "legal" }, h("h1", {}, title), ...sections, h("p", { class: "updated" }, "Dernière mise à jour : 19 novembre 2026. Ce texte est un modèle à vérifier ; il ne remplace pas l’avis d’un juriste."))); }
const sec = (t, ...k) => h("section", {}, h("h2", {}, t), ...k);

function viewLegal(root) {
  const e = CFG().editor || {}, host = CFG().host || {};
  legalPage(root, "Mentions légales",
    sec("Éditeur du site",
      h("p", {}, "Le site ", h("b", {}, CFG().siteName || "TOTAL90"), " (", CFG().siteUrl || location.origin, ") est édité par : ", todo(e.status === "entreprise" ? e.company : e.name), "."),
      e.status === "entreprise" ? h("p", {}, "Adresse du siège : ", todo(e.address), ".") : h("p", {}, e.address ? `Adresse : ${e.address}.` : "Éditeur non professionnel : conformément à l’article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004, ses coordonnées complètes ont été communiquées à l’hébergeur."),
      h("p", {}, "Contact : ", e.email ? h("a", { href: `mailto:${e.email}` }, e.email) : todo(""), "."),
      h("p", {}, "Directeur de la publication : ", todo(e.publicationDirector || e.name), ".")),
    sec("Hébergeur", h("p", {}, host.name || "Netlify, Inc.", ", ", host.address || "", " – ", h("a", { href: host.website || "https://www.netlify.com", target: "_blank", rel: "noopener" }, host.website || "www.netlify.com"), ".")),
    sec("Données affichées",
      h("p", {}, "Les résultats, statistiques et classements proviennent de fournisseurs tiers (API-Football, ESPN). Les actualités sont des titres et résumés issus des flux RSS publics des médias cités, avec un lien vers l’article original ; leurs contenus restent la propriété de leurs auteurs. Les logos des clubs et compétitions appartiennent à leurs détenteurs respectifs."),
      h("p", {}, "Les notes TOTAL90 et les probabilités de victoire sont des estimations statistiques fournies à titre informatif. Elles ne constituent ni une garantie ni un conseil de pari.")),
    sec("Propriété intellectuelle", h("p", {}, "La marque, le logo et la mise en page de TOTAL90 sont la propriété de l’éditeur. La police Archivo est distribuée sous licence SIL Open Font License 1.1.")));
}
function viewPrivacy(root) {
  const e = CFG().editor || {};
  legalPage(root, "Politique de confidentialité",
    sec("En résumé", h("p", {}, "TOTAL90 ne demande aucun compte, ne collecte ni nom ni e-mail, n’utilise aucun cookie publicitaire et aucune mesure d’audience. Vos équipes favorites restent sur votre appareil.")),
    sec("Données enregistrées sur votre appareil", h("p", {}, "Vos favoris (équipes et compétitions suivies) et, le cas échéant, votre choix concernant les cookies sont enregistrés dans le stockage local de votre navigateur. Ils ne sont jamais envoyés à TOTAL90. Vous pouvez les effacer à tout moment en vidant les données du site dans votre navigateur.")),
    sec("Données techniques", h("p", {}, "Comme tout site web, l’hébergeur (Netlify) traite techniquement votre adresse IP et les informations de connexion pour afficher les pages et assurer la sécurité. Base légale : intérêt légitime au bon fonctionnement du site.")),
    sec("Contenus de sites tiers", h("p", {}, "Pour afficher les logos, les photos des joueurs, les images des actualités et certaines données sportives (basket, tennis, F1, UFC), votre navigateur se connecte directement aux serveurs de ces fournisseurs (API-Sports, ESPN, médias cités). Ils reçoivent alors votre adresse IP, comme lors de toute visite d’un site. Certains de ces serveurs peuvent être situés hors de l’Union européenne.")),
    sec("Vos droits", h("p", {}, "Vous disposez d’un droit d’accès, de rectification, d’effacement et d’opposition. TOTAL90 ne détenant aucune donnée personnelle vous concernant en dehors des données techniques de l’hébergeur, vous pouvez nous écrire à ", e.email ? h("a", { href: `mailto:${e.email}` }, e.email) : todo(""), ". Vous pouvez aussi saisir la CNIL (www.cnil.fr).")));
}
function viewCookies(root) {
  const ads = CFG().ads?.enabled, ana = CFG().analytics?.enabled;
  legalPage(root, "Cookies et traceurs",
    sec("Ce que TOTAL90 utilise aujourd’hui", h("p", {}, "Aucun cookie. Le site enregistre seulement vos favoris dans le stockage local de votre navigateur, à votre demande : ce stockage est strictement nécessaire au service que vous utilisez et ne demande donc pas de consentement.")),
    ads || ana ? sec("Publicité et mesure d’audience", h("p", {}, "Des cookies de publicité ou de mesure d’audience peuvent être déposés uniquement si vous les acceptez. Vous pouvez modifier votre choix à tout moment."),
      h("button", { type: "button", class: "chip on", onclick: () => Consent.open(true) }, "Modifier mes choix")) :
      sec("Publicité et mesure d’audience", h("p", {}, "Désactivées. Si elles sont activées un jour, une fenêtre vous demandera votre accord avant tout dépôt de cookie, avec un choix « Tout refuser » aussi simple que « Tout accepter ».")));
}
function viewAbout(root) {
  legalPage(root, "À propos des données",
    sec("Football", h("p", {}, "Matchs, scores, événements, compositions, classements, statistiques d’équipes et de joueurs : API-Football (API-Sports). Avec l’offre gratuite, les scores sont relevés environ toutes les 30 minutes.")),
    sec("Basketball, tennis, Formule 1, UFC", h("p", {}, "Points d’accès publics d’ESPN, gratuits mais non officiels : ils peuvent changer sans préavis, auquel cas la section concernée s’affiche comme indisponible.")),
    sec("Actualités", h("p", {}, "Flux RSS publics de Maxifoot, L’Équipe, Franceinfo, Le Monde et BBC Sport. Seuls le titre, un court résumé et l’image d’illustration sont repris, avec un lien vers l’article complet sur le site du média.")),
    sec("Calculs TOTAL90", h("p", {}, "La note des joueurs et les probabilités de victoire sont calculées par TOTAL90 à partir de ces données, selon des méthodes expliquées sur les pages concernées. Aucune donnée n’est inventée : quand une information manque, le site l’indique.")));
}

/* ---------- Consentement (actif seulement si publicité ou mesure d’audience sont activées) ---------- */
const Consent = {
  key: "t90.consent",
  read() { try { return JSON.parse(localStorage.getItem(this.key)); } catch { return null; } },
  save(v) { try { localStorage.setItem(this.key, JSON.stringify({ ...v, date: new Date().toISOString() })); } catch {} document.getElementById("consent")?.remove(); applyConsent(); },
  // Avec AdSense en Europe, Google impose sa propre fenêtre de consentement certifiée (cmp: "google") : la nôtre ne s’affiche alors que pour la mesure d’audience.
  needed() { const a = CFG().ads; return !!((a?.enabled && a.cmp !== "google") || CFG().analytics?.enabled); },
  open(force) {
    if (!this.needed() || (!force && this.read())) return;
    document.getElementById("consent")?.remove();
    const cur = this.read() || {};
    const adsBox = h("input", { type: "checkbox", id: "c-ads" }); adsBox.checked = !!cur.ads;
    const anaBox = h("input", { type: "checkbox", id: "c-ana" }); anaBox.checked = !!cur.analytics;
    const details = h("div", { class: "consent-details", hidden: true },
      CFG().ads?.enabled ? h("label", {}, adsBox, " Publicité personnalisée") : null,
      CFG().analytics?.enabled ? h("label", {}, anaBox, " Mesure d’audience") : null,
      h("button", { type: "button", class: "chip", onclick: () => this.save({ ads: adsBox.checked, analytics: anaBox.checked }) }, "Enregistrer mes choix"));
    document.body.append(h("div", { id: "consent", role: "dialog", "aria-label": "Vos choix concernant les cookies" },
      h("p", {}, "TOTAL90 est gratuit grâce à la publicité. Avec votre accord, nos partenaires peuvent déposer des cookies pour afficher des publicités et mesurer l’audience. ", h("a", { href: "/cookies" }, "En savoir plus")),
      h("div", { class: "consent-btns" },
        h("button", { type: "button", class: "chip", onclick: () => this.save({ ads: false, analytics: false }) }, "Tout refuser"),
        h("button", { type: "button", class: "chip", onclick: () => { details.hidden = !details.hidden; } }, "Personnaliser"),
        h("button", { type: "button", class: "chip", onclick: () => this.save({ ads: true, analytics: true }) }, "Tout accepter")),
      details));
  }
};
function applyConsent() {
  const c = Consent.read(), a = CFG().ads;
  if (!a?.enabled || !a.client || document.getElementById("adsense-js")) return;
  // Annonces non personnalisées si l’utilisateur a refusé (ou pas encore choisi)
  window.adsbygoogle = window.adsbygoogle || [];
  if (a.cmp !== "google" && !c?.ads) window.adsbygoogle.requestNonPersonalizedAds = 1;
  const sc = document.createElement("script");
  sc.id = "adsense-js"; sc.async = true; sc.crossOrigin = "anonymous";
  sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(a.client)}`;
  document.head.append(sc);
}
/* Emplacement publicitaire : n’affiche rien tant que la publicité est désactivée. */
function adSlot(name) {
  const a = CFG().ads;
  if (!a?.enabled || !a.client) return null;
  const ins = h("ins", { class: "adsbygoogle", style: "display:block", "data-ad-client": a.client, "data-ad-format": "auto", "data-full-width-responsive": "true" });
  setTimeout(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {} }, 0);
  return h("aside", { class: "ad", "aria-label": "Publicité" }, h("small", {}, "Publicité"), ins);
}

/* ---------- routeur ---------- */
const ROUTES = [
  [/^\/$/, viewHome, null, null],
  [/^\/live$/, viewLive, "Matchs en direct", "Tous les matchs de football en cours dans le monde, scores mis à jour automatiquement."],
  [/^\/football$/, viewFootball, "Football : matchs et résultats du jour", "Programme et résultats de football de toutes les compétitions du monde, jour par jour."],
  [/^\/match\/(\d+)$/, viewMatch, "Fiche match", "Score, buteurs, statistiques, compositions, face-à-face et probabilités du match."],
  [/^\/equipe\/(\d+)$/, viewTeam, "Fiche équipe", "Forme, résultats, calendrier, classement, effectif et statistiques avancées de l’équipe."],
  [/^\/competition\/(\d+)$/, viewLeague, "Compétition", "Classement, résultats et prochains matchs de la compétition."],
  [/^\/competitions$/, viewCompetitions, "Compétitions du monde entier", "Tous les championnats et compétitions de football par pays et par continent, y compris féminins."],
  [/^\/recherche$/, viewSearch, "Recherche", null],
  [/^\/favoris$/, viewFavorites, "Mes favoris", null],
  [/^\/joueur\/(\d+)$/, viewPlayer, "Fiche joueur", "Statistiques détaillées, note TOTAL90 sur 10, évolution et comparaison du joueur."],
  [/^\/analyses$/, viewAnalyses, "Analyses et Match Analysis", "Notes des joueurs, meilleures performances et probabilités de victoire des grands matchs."],
  [/^\/actualites$/, viewNews, "Actualités sportives", "Les dernières actualités du football, du mercato, du basket, du tennis, de la F1 et des sports de combat."],
  [/^\/basketball$/, viewBasketball, "Basketball : NBA en direct", "Matchs NBA du jour, scores par quart-temps et classements."],
  [/^\/tennis$/, viewTennis, "Tennis : ATP et WTA", "Matchs ATP et WTA du jour, scores set par set et classements mondiaux."],
  [/^\/autres-sports$/, viewOtherSports, "Formule 1 et UFC", "Grand Prix de Formule 1, résultats des séances, galas UFC et calendriers."],
  [/^\/mentions-legales$/, viewLegal, "Mentions légales", null],
  [/^\/confidentialite$/, viewPrivacy, "Politique de confidentialité", null],
  [/^\/cookies$/, viewCookies, "Cookies et traceurs", null],
  [/^\/a-propos$/, viewAbout, "À propos des données", null]
];
let current = null;
const META_DESC = "TOTAL90 : matchs en direct, résultats, classements, statistiques, analyses et probabilités de victoire, football et autres sports du monde entier.";
function setMeta(title, desc) {
  document.title = title ? `${title} · TOTAL90` : "TOTAL90 — The world of sports";
  const m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute("content", desc || META_DESC);
  const c = document.querySelector('link[rel="canonical"]'); if (c) c.setAttribute("href", (window.T90_CONFIG?.siteUrl || location.origin) + location.pathname);
}
function navigate(to) { history.pushState(null, "", to); router(); }
function router() {
  // anciennes adresses en « #/… » : on les convertit
  if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(location.search);
  if (current) current.stop();
  const timers = [];
  const token = {};
  current = token;
  const ctx = { alive: () => current === token, every: (ms, fn) => timers.push(setInterval(() => { if (document.visibilityState === "visible" && ctx.alive()) fn(); }, ms)) };
  token.stop = () => timers.forEach(clearInterval);
  const main = $("#main");
  main.replaceChildren();
  const navKey = "/" + (path.split("/")[1] || "");
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === navKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  for (const [re, view, title, desc] of ROUTES) {
    const m = path.match(re);
    if (m) {
      setMeta(title, desc);
      Promise.resolve(view(main, ctx, params, m[1])).catch(e => { if (e?.name !== "AbortError") main.replaceChildren(stateBox(e)); });
      window.scrollTo(0, 0); return;
    }
  }
  setMeta("Page introuvable"); viewNotFound(main);
}
// Les liens internes changent de page sans recharger le site
document.addEventListener("click", e => {
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.getAttribute("href"), location.href);
  if (url.origin !== location.origin || /^\/(api|assets)\//.test(url.pathname) || (url.hash && url.pathname === location.pathname && !url.hash.startsWith("#/"))) return;
  e.preventDefault();
  if (url.pathname + url.search !== location.pathname + location.search) navigate(url.pathname + url.search); else router();
});

/* ---------- recherche avec suggestions ---------- */
function setupSearch() {
  const input = $("#q"), box = $("#suggest");
  let timer, ctrl, items = [], sel = -1;
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); sel = -1; };
  const open = () => { box.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const mark = () => items.forEach((el, i) => el.setAttribute("aria-selected", String(i === sel)));
  const full = () => { const q = input.value.trim(); if (q) { close(); navigate(`/recherche?q=${encodeURIComponent(q)}`); } };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    if (q.length < 3) { put(box, h("div", { class: "sug-msg" }, "Tapez au moins 3 lettres…")); items = []; open(); return; }
    timer = setTimeout(async () => {
      ctrl?.abort(); ctrl = new AbortController();
      put(box, h("div", { class: "sug-msg" }, "Recherche…")); open();
      try {
        const { data } = await api(`search?q=${encodeURIComponent(q)}`, { ttl: 600000, signal: ctrl.signal });
        const teams = (data.teams || []).slice(0, 6), leagues = (data.leagues || []).slice(0, 4);
        const link = (href, logo, name, extra) => h("a", { class: "sug", role: "option", href, onclick: close }, img(logo), h("span", {}, name), h("small", {}, extra || ""));
        put(box, 
          ...(teams.length ? [h("h6", {}, "Clubs et sélections"), ...teams.map(t => link(`/equipe/${t.id}`, t.logo, t.name, t.national ? "Sélection" : t.country))] : []),
          ...(leagues.length ? [h("h6", {}, "Compétitions"), ...leagues.map(l => link(`/competition/${l.id}`, l.logo, l.name, l.country === "World" ? "International" : l.country))] : []),
          !teams.length && !leagues.length ? h("div", { class: "sug-msg" }, "Aucun club ni compétition trouvé.") : null,
          h("a", { class: "sug-all", href: `/recherche?q=${encodeURIComponent(q)}`, onclick: close }, "Voir tous les résultats (joueurs, entraîneurs…)"));
        items = [...box.querySelectorAll(".sug")]; sel = -1;
      } catch (e) { if (e.name !== "AbortError") { put(box, h("div", { class: "sug-msg" }, e.message || "Recherche indisponible.")); items = []; } }
    }, 350);
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0) { navigate(items[sel].getAttribute("href")); close(); } else full(); }
    else if (e.key === "Escape") close();
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) close(); });
  $("#tab-search").addEventListener("click", () => { window.scrollTo(0, 0); input.focus(); });
}

window.addEventListener("popstate", router);
Consent.open();
applyConsent();
setupSearch();
router();
