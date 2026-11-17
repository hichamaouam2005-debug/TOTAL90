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
  return h("a", { class: "row", href: `#/match/${m.id}`, "aria-label": `${m.home.name} contre ${m.away.name}` },
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
      h("div", {}, h("a", { href: `#/competition/${l.id}` }, l.name), h("br"), h("small", {}, [place(l.country), l.round].filter(Boolean).join(" · "))),
      starButton("leagues", { id: l.id, name: l.name, logo: l.logo, country: l.country })),
    g.matches.map(m => matchRow(m, opts)));
}
function liveCard(m) {
  return h("a", { class: "lcard", href: `#/match/${m.id}` },
    h("div", { class: "lg" }, img(m.league.logo), `${m.league.name} · ${place(m.league.country) || ""}`),
    h("div", { class: "t" }, img(m.home.logo), h("span", {}, m.home.name), h("b", {}, m.score.home ?? 0)),
    h("div", { class: "t" }, img(m.away.logo), h("span", {}, m.away.name), h("b", {}, m.score.away ?? 0)),
    h("div", { class: "min" }, clock(m)));
}
function updatedLine(body) {
  return h("p", { class: "updated", "aria-live": "polite" }, `Mis à jour à ${new Date(body.fetchedAt).toLocaleTimeString("fr-FR")}`);
}

/* ---------- vues ---------- */
async function viewHome(root, ctx) {
  root.append(
    h("div", { class: "hero" }, h("div", {}, h("h1", {}, "Le football du monde entier, en direct"),
      h("p", { class: "sub" }, longDate(TODAY()))), h("div", { class: "count", id: "live-count" })),
    h("div", { id: "home-live" }, skeleton(1)),
    h("div", { class: "grid-2" },
      h("div", {}, h("h2", {}, "Grands matchs du jour", h("a", { class: "more", href: "#/football" }, "Tous les matchs")), h("div", { id: "home-big" }, skeleton(3)),
        h("h2", {}, "Résultats récents", h("a", { class: "more", href: `#/football?date=${addDays(TODAY(), -1)}` }, "Hier")), h("div", { id: "home-res" }, skeleton(2))),
      h("aside", {}, h("h2", {}, "Mes favoris", h("a", { class: "more", href: "#/favoris" }, "Gérer")), h("div", { id: "home-fav" }),
        h("h2", {}, "Compétitions populaires", h("a", { class: "more", href: "#/competitions" }, "Toutes")), h("div", { id: "home-comps" }, skeleton(2)),
        h("h2", {}, "Actualités"), soonPanel(3, "Les dernières actualités de sources reconnues, avec titre, image, résumé, source et lien vers l’article."),
        h("h2", {}, "Meilleures performances"), soonPanel(2, "Les joueurs les mieux notés du moment, calculés à partir de leurs statistiques réelles.")))
  );
  renderHomeComps($("#home-comps", root));
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
      h("div", { class: "comps", style: "margin-top:10px" }, fav.teams.slice(0, 6).map(t => h("a", { class: "comp", href: `#/equipe/${t.id}` }, img(t.logo), t.name))));
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
const compTile = l => h("a", { class: "comp", href: `#/competition/${l.id}` }, img(l.logo), h("span", {}, l.name, h("small", {}, place(l.country))));
function soonPanel(step, text) {
  return h("div", { class: "panel soon" }, h("span", { class: "step" }, `Étape ${step}`), h("div", {}, text));
}

async function viewLive(root, ctx) {
  root.append(h("h1", {}, "En direct"), h("p", { class: "sub" }, "Scores mis à jour automatiquement toutes les 30 secondes, sans recharger la page."), h("div", { id: "live-list" }, skeleton(4)));
  const load = async () => {
    try {
      const body = await api("live", { ttl: 10000 });
      if (!ctx.alive()) return;
      const g = groupMatches(body.data);
      put($("#live-list", root), ...(g.length ? g.map(x => groupBlock(x)) : [empty("Aucun match en cours", "Revenez plus tard ou consultez le programme du jour.")]), updatedLine(body));
    } catch (e) { if (ctx.alive()) put($("#live-list", root), stateBox(e)); }
  };
  await load();
  ctx.every(LIVE_REFRESH, load);
}

async function viewFootball(root, ctx, params) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : TODAY();
  let filter = params.get("f") || "all", text = "";
  const go = d => { location.hash = `#/football?date=${d}`; };
  const filters = [["all", "Tous"], ["live", "En direct"], ["finished", "Terminés"], ["scheduled", "À venir"], ["fav", "Mes favoris"]];
  const chips = h("div", { class: "bar" });
  const search = h("input", { class: "field", type: "search", placeholder: "Filtrer : pays, compétition, équipe", "aria-label": "Filtrer les matchs", oninput: e => { text = e.target.value.toLowerCase(); draw(); } });
  root.append(
    h("h1", {}, "Football"), h("p", { class: "sub" }, longDate(date)),
    h("div", { class: "bar" },
      h("button", { class: "chip", type: "button", onclick: () => go(addDays(date, -1)) }, "← Veille"),
      ["Hier", "Aujourd’hui", "Demain"].map((l, i) => { const d = addDays(TODAY(), i - 1); return h("a", { class: "chip" + (d === date ? " on" : ""), href: `#/football?date=${d}` }, l); }),
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
    const teamLink = t => h("a", { href: `#/equipe/${t.id}` }, img(t.logo), t.name);
    const score = m.status.state === "scheduled" ? h("div", { class: "big" }, hm(m.date)) : h("div", { class: "big" + (live ? " live" : "") }, `${m.score.home ?? 0} – ${m.score.away ?? 0}`);
    const head = h("section", { class: "mhead" },
      h("div", { class: "meta" }, h("a", { href: `#/competition/${m.league.id}` }, m.league.name), m.league.round ? h("span", {}, m.league.round) : null,
        h("span", {}, new Date(m.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · " + hm(m.date))),
      h("div", { class: "duel" }, teamLink(m.home), h("div", {}, score, m.penalties ? h("div", { class: "mstatus" }, `T.a.b. ${m.penalties.home} – ${m.penalties.away}`) : null), teamLink(m.away)),
      h("div", { class: "mstatus" + (live ? " live" : "") }, live ? clock(m) + " · " + m.status.label : m.status.label),
      h("div", { class: "meta", style: "margin-top:8px" }, m.venue?.name ? h("span", {}, `${m.venue.name}${m.venue.city ? ", " + m.venue.city : ""}`) : null, m.referee ? h("span", {}, `Arbitre : ${m.referee}`) : null));
    const tabs = [["resume", "Résumé"], ["stats", "Statistiques"], ["compos", "Compositions"], ["h2h", "Face-à-face"], ["proba", "Probabilités"]];
    const content = h("div", { class: "panel" });
    const tabBar = h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { class: "tab", role: "tab", type: "button", "aria-selected": String(tab === k), onclick: () => { tab = k; render(); } }, l)));
    const render = () => {
      tabBar.querySelectorAll(".tab").forEach((b, i) => b.setAttribute("aria-selected", String(tabs[i][0] === tab)));
      put(content, ...({ resume: () => timeline(m), stats: () => statsBlock(m), compos: () => lineupsBlock(m), h2h: () => h2hBlock(m), proba: () => [soonPanel(4, "Probabilités de victoire, de match nul, des deux équipes qui marquent, de plus ou moins de 2,5 buts et score le plus probable, calculés par un modèle statistique documenté, avec date de calcul, niveau de confiance et facteurs. Ce seront des estimations, jamais des certitudes.")] }[tab])());
    };
    render();
    put($("#mx", root), head, tabBar, content, updatedLine(body));
    document.title = `${m.home.name} – ${m.away.name} · TOTAL90`;
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
    h("h4", {}, "Titulaires"), h("ol", {}, l.startXI.map(p => h("li", {}, h("b", {}, p.number ?? ""), p.name))),
    l.subs.length ? [h("h4", {}, "Remplaçants"), h("ol", {}, l.subs.map(p => h("li", {}, h("b", {}, p.number ?? ""), p.name)))] : null)))];
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
  document.title = `${t.name} · TOTAL90`;
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
    Object.entries(posFR).map(([k, l]) => { const ps = d.squad.filter(p => p.position === k); return ps.length ? [h("h3", { style: "margin-top:14px" }, l), h("div", { class: "squad" }, ps.map(p => h("div", { class: "player" }, img(p.photo), h("div", {}, h("b", {}, p.name), h("small", {}, [p.number != null ? `N° ${p.number}` : null, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · "))))))] : null; });
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
        h("h2", {}, "Effectif"), h("div", { class: "panel" }, squad)),
      h("aside", {},
        h("h2", {}, "Classement"), d.standing ? standingTable(d.standing.rows, tid, d.standing.league) : empty("Classement indisponible", "Pas de championnat en cours trouvé pour cette équipe."),
        d.competitions?.length ? [h("h2", {}, "Compétitions"), h("div", { class: "comps" }, d.competitions.map(compTile))] : null,
        h("h2", {}, "Statistiques avancées"), soonPanel(2, "Possession, efficacité offensive, solidité défensive, performances à domicile et à l’extérieur, comparaison avec les autres équipes et graphiques."),
        h("h2", {}, "Actualités du club"), soonPanel(3, "Les dernières informations sur le club, issues de sources reconnues."))),
    updatedLine(body));
}
function standingTable(rows, highlight, league) {
  return h("div", { class: "panel table-wrap" },
    league ? h("p", { class: "updated", style: "margin-top:0" }, h("a", { href: `#/competition/${league.id}` }, league.name), ` · saison ${league.season}/${String(league.season + 1).slice(2)}`) : null,
    h("table", { class: "standings" },
      h("thead", {}, h("tr", {}, ["#", "Équipe", "J", "G", "N", "P", "Diff", "Pts"].map(x => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows.map(r => h("tr", { class: r.team.id === highlight ? "me" : null },
        h("td", {}, r.rank), h("td", {}, h("a", { href: `#/equipe/${r.team.id}` }, img(r.team.logo), r.team.name)),
        h("td", {}, r.played), h("td", {}, r.win), h("td", {}, r.draw), h("td", {}, r.lose), h("td", {}, r.diff > 0 ? "+" + r.diff : r.diff), h("td", { class: "pts" }, r.points))))));
}

async function viewLeague(root, ctx, params, id) {
  root.append(h("div", { id: "lx" }, skeleton(5)));
  const season = params.get("saison");
  let body;
  try { body = await api(`league/${id}${season ? "?season=" + season : ""}`, { ttl: 300000 }); } catch (e) { if (ctx.alive()) put($("#lx", root), stateBox(e)); return; }
  if (!ctx.alive()) return;
  const d = body.data, l = d.league;
  document.title = `${l.name} · TOTAL90`;
  const seasons = [...(l.seasons || [])].sort((a, b) => b - a);
  const groups = d.standings;
  put($("#lx", root), 
    h("section", { class: "panel" }, h("div", { class: "thead" }, img(l.logo),
      h("div", {}, h("h1", {}, l.name), h("div", { class: "meta" }, h("span", {}, l.country === "World" ? "International" : l.country), h("span", {}, l.type === "Cup" ? "Coupe" : "Championnat"))),
      starButton("leagues", { id: l.id, name: l.name, logo: l.logo, country: l.country })),
      seasons.length > 1 ? h("div", { class: "bar", style: "margin:14px 0 0" }, h("label", { for: "season" }, "Saison "),
        h("select", { id: "season", class: "field", onchange: e => { location.hash = `#/competition/${id}?saison=${e.target.value}`; } },
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
    h("p", { class: "sub" }, country ? h("a", { href: "#/competitions" }, "← Tous les pays") : "Les compétitions phares, puis tous les championnats par pays, y compris féminins."),
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
    .map(c => h("a", { class: "country", href: `#/competitions?pays=${encodeURIComponent(c)}` }, flags.get(c) ? img(flags.get(c)) : h("span", {}, "🌐"), c === "World" ? "International" : c, h("small", {}, counts.get(c)))));
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
    ...section("Clubs et sélections", d.teams, l => h("div", { class: "comps" }, l.slice(0, 30).map(t => h("a", { class: "comp", href: `#/equipe/${t.id}` }, img(t.logo), h("span", {}, t.name, h("small", {}, t.national ? `Sélection · ${t.country}` : t.country))))), "La recherche d’équipes n’a pas répondu."),
    ...section("Compétitions", d.leagues, l => h("div", { class: "comps" }, l.slice(0, 20).map(compTile)), "La recherche de compétitions n’a pas répondu."),
    ...section("Joueurs", d.players, l => h("div", { class: "squad" }, l.slice(0, 30).map(p => h("div", { class: "player" }, img(p.photo), h("div", {}, h("b", {}, p.name), h("small", {}, [p.position, p.nationality, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")))))), "La recherche de joueurs n’est pas disponible avec l’abonnement actuel."),
    ...section("Entraîneurs", d.coaches, l => h("div", { class: "squad" }, l.slice(0, 20).map(c => h(c.team ? "a" : "div", { class: "player", href: c.team ? `#/equipe/${c.team.id}` : null, style: "text-decoration:none" }, img(c.photo), h("div", {}, h("b", {}, c.name), h("small", {}, [c.team?.name, c.nationality].filter(Boolean).join(" · ")))))), "La recherche d’entraîneurs n’a pas répondu."),
    h("p", { class: "updated", style: "margin-top:16px" }, "Les fiches détaillées des joueurs (statistiques, note sur 10, graphiques) arrivent à l’étape 2."));
}

async function viewFavorites(root, ctx) {
  const fav = Fav.read();
  root.append(h("h1", {}, "Mes favoris"), h("p", { class: "sub" }, "Vos favoris sont enregistrés sur cet appareil."));
  if (!fav.teams.length && !fav.leagues.length) { root.append(empty("Aucun favori pour l’instant", "Ouvrez la page d’une équipe ou d’une compétition et touchez « Suivre ».")); return; }
  root.append(
    h("h2", {}, "Équipes suivies"), fav.teams.length ? h("div", { class: "comps" }, fav.teams.map(t => h("a", { class: "comp", href: `#/equipe/${t.id}` }, img(t.logo), t.name))) : h("p", { class: "updated" }, "Aucune équipe."),
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
  actualites: ["Actualités", 3, "Football, mercato, basket, tennis, F1, athlétisme, sports de combat : titre, image, résumé, date, source et lien vers l’article original, récupérés automatiquement depuis des médias reconnus."],
  analyses: ["Analyses", 2, "Fiches joueurs (matchs, buts, passes, minutes, tirs cadrés, passes réussies, dribbles, duels, cartons), note sur 10 calculée à partir des statistiques, comparaisons et graphiques interactifs, puis analyses d’équipes et probabilités de victoire (étape 4)."]
};
function viewSoon(root, ctx, params, key) {
  const [title, step, text] = SOON[key];
  root.append(h("h1", {}, title), h("p", { class: "sub" }, "Cette rubrique est en construction."), soonPanel(step, text),
    h("p", { class: "updated", style: "margin-top:14px" }, "En attendant, le football est déjà disponible en direct dans les rubriques Live et Football."));
}
function viewNotFound(root) { root.append(empty("Page introuvable", "Revenez à l’accueil.")); }

/* ---------- routeur ---------- */
const ROUTES = [
  [/^\/$/, viewHome], [/^\/live$/, viewLive], [/^\/football$/, viewFootball], [/^\/match\/(\d+)$/, viewMatch],
  [/^\/equipe\/(\d+)$/, viewTeam], [/^\/competition\/(\d+)$/, viewLeague], [/^\/competitions$/, viewCompetitions],
  [/^\/recherche$/, viewSearch], [/^\/favoris$/, viewFavorites], [/^\/(basketball|tennis|autres-sports|actualites|analyses)$/, viewSoon]
];
let current = null;
function router() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  if (current) current.stop();
  const timers = [];
  const token = {};
  current = token;
  const ctx = { alive: () => current === token, every: (ms, fn) => timers.push(setInterval(() => { if (document.visibilityState === "visible" && ctx.alive()) fn(); }, ms)) };
  token.stop = () => timers.forEach(clearInterval);
  const main = $("#main");
  put(main, );
  document.title = "TOTAL90 — The world of sports";
  const navKey = "/" + (path.split("/")[1] || "");
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === navKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  for (const [re, view] of ROUTES) {
    const m = path.match(re);
    if (m) { Promise.resolve(view(main, ctx, params, m[1])).catch(e => { if (e?.name !== "AbortError") put(main, stateBox(e)); }); window.scrollTo(0, 0); return; }
  }
  viewNotFound(main);
}

/* ---------- recherche avec suggestions ---------- */
function setupSearch() {
  const input = $("#q"), box = $("#suggest");
  let timer, ctrl, items = [], sel = -1;
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); sel = -1; };
  const open = () => { box.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const mark = () => items.forEach((el, i) => el.setAttribute("aria-selected", String(i === sel)));
  const full = () => { const q = input.value.trim(); if (q) { close(); location.hash = `#/recherche?q=${encodeURIComponent(q)}`; } };
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
          ...(teams.length ? [h("h6", {}, "Clubs et sélections"), ...teams.map(t => link(`#/equipe/${t.id}`, t.logo, t.name, t.national ? "Sélection" : t.country))] : []),
          ...(leagues.length ? [h("h6", {}, "Compétitions"), ...leagues.map(l => link(`#/competition/${l.id}`, l.logo, l.name, l.country === "World" ? "International" : l.country))] : []),
          !teams.length && !leagues.length ? h("div", { class: "sug-msg" }, "Aucun club ni compétition trouvé.") : null,
          h("a", { class: "sug-all", href: `#/recherche?q=${encodeURIComponent(q)}`, onclick: close }, "Voir tous les résultats (joueurs, entraîneurs…)"));
        items = [...box.querySelectorAll(".sug")]; sel = -1;
      } catch (e) { if (e.name !== "AbortError") { put(box, h("div", { class: "sug-msg" }, e.message || "Recherche indisponible.")); items = []; } }
    }, 350);
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" && items.length) { e.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0) { location.hash = items[sel].getAttribute("href"); close(); } else full(); }
    else if (e.key === "Escape") close();
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) close(); });
  $("#tab-search").addEventListener("click", () => { window.scrollTo(0, 0); input.focus(); });
}

window.addEventListener("hashchange", router);
setupSearch();
router();
