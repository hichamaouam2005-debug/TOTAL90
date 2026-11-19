// Basketball, tennis, Formule 1 et UFC via les points d'accès JSON publics d'ESPN.
// Gratuits et sans clé, mais NON officiels et non documentés : ESPN peut les modifier à tout moment.
// Chaque fonction lit les champs de façon défensive ; si la structure change, la route renvoie
// une erreur propre et le site affiche « indisponible » au lieu de données fausses.

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const V2 = "https://site.api.espn.com/apis/v2/sports";

export class EspnError extends Error { constructor(m) { super(m); this.code = "upstream"; } }

// Ce fichier fonctionne côté serveur (fonction Netlify) ET dans le navigateur :
// si ESPN refuse les serveurs, le site interroge ESPN directement depuis le navigateur du visiteur.
const IN_BROWSER = typeof window !== "undefined";
const HEADERS = IN_BROWSER ? {} : {
  accept: "application/json, text/plain, */*",
  "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  referer: "https://www.espn.com/", origin: "https://www.espn.com"
};
async function getOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: HEADERS });
    if (!r.ok) throw new EspnError(`La source de données a répondu ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (e instanceof EspnError) throw e;
    throw new EspnError(e.name === "AbortError" ? "La source de données ne répond pas." : "Source de données injoignable.");
  } finally { clearTimeout(t); }
}
// Deux adresses ESPN équivalentes : si la première refuse, on essaie la seconde.
async function get(url) {
  try { return await getOnce(url); }
  catch (e) { return await getOnce(url.replace("https://site.api.espn.com", "https://site.web.api.espn.com")); }
}

const ymd = d => String(d || "").replace(/-/g, "");
const num = v => v == null || v === "" ? null : isNaN(Number(v)) ? v : Number(v);
const state = s => {
  const st = s?.type?.state;
  return { state: st === "in" ? "live" : st === "post" ? "finished" : st === "pre" ? "scheduled" : "other",
    detail: s?.type?.shortDetail || s?.type?.detail || s?.type?.description || "", completed: !!s?.type?.completed, clock: s?.displayClock || null, period: s?.period ?? null };
};
const logo = t => t?.logo || t?.logos?.[0]?.href || null;
const flag = a => a?.flag?.href || null;

/* ---------- Basketball (NBA) ---------- */
export async function basketball(date) {
  const d = await get(`${SITE}/basketball/nba/scoreboard${date ? `?dates=${ymd(date)}` : ""}`);
  return (d.events || []).map(ev => {
    const c = ev.competitions?.[0] || {};
    const side = ha => {
      const x = (c.competitors || []).find(k => k.homeAway === ha) || {};
      return { name: x.team?.displayName || x.team?.name || "?", short: x.team?.abbreviation || "", logo: logo(x.team), score: num(x.score), winner: !!x.winner,
        record: x.records?.[0]?.summary || null, quarters: (x.linescores || []).map(l => num(l.value ?? l.displayValue)) };
    };
    const leaders = (c.leaders || []).find(l => l.name === "points" || /points/i.test(l.displayName || ""));
    return {
      id: ev.id, date: ev.date, name: ev.name, ...state(ev.status || c.status),
      home: side("home"), away: side("away"),
      venue: c.venue?.fullName || null, city: c.venue?.address?.city || null,
      broadcast: (c.broadcasts || []).flatMap(b => b.names || []).join(", ") || null,
      topScorer: leaders?.leaders?.[0] ? { name: leaders.leaders[0].athlete?.displayName, value: leaders.leaders[0].displayValue } : null
    };
  });
}
export async function nbaStandings() {
  const d = await get(`${V2}/basketball/nba/standings`);
  const stat = (e, ...names) => { const s = (e.stats || []).find(x => names.includes(x.name) || names.includes(x.abbreviation) || names.includes(x.type)); return s ? (s.displayValue ?? s.value) : null; };
  return (d.children || []).map(conf => ({
    name: conf.name || conf.abbreviation,
    rows: (conf.standings?.entries || []).map(e => ({
      team: e.team?.displayName, logo: logo(e.team), w: num(stat(e, "wins", "W")), l: num(stat(e, "losses", "L")),
      pct: stat(e, "winPercent", "PCT"), gb: stat(e, "gamesBehind", "GB"), streak: stat(e, "streak", "STRK"),
      seed: num(stat(e, "playoffSeed", "seed"))
    })).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || (b.w ?? 0) - (a.w ?? 0))
  }));
}

/* ---------- Tennis (ATP / WTA) ---------- */
function tennisMatch(c) {
  const players = (c.competitors || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => ({
    name: p.athlete?.displayName || p.roster?.displayName || p.team?.displayName || (p.athletes || []).map(a => a.displayName).join(" / ") || "?",
    flag: flag(p.athlete) || flag(p.athletes?.[0]), winner: !!p.winner, seed: p.seed || p.curatedRank?.current || null,
    sets: (p.linescores || []).map(l => ({ v: num(l.value ?? l.displayValue), tb: num(l.tiebreak) }))
  }));
  return { id: c.id, date: c.date || c.startDate, round: c.round?.displayName || null, court: c.venue?.court || c.venue?.fullName || null, ...state(c.status), players };
}
export async function tennis(tour, date) {
  const d = await get(`${SITE}/tennis/${tour}/scoreboard${date ? `?dates=${ymd(date)}` : ""}`);
  const day = date ? String(date) : null;
  return (d.events || []).map(ev => {
    const groups = ev.groupings?.length
      ? ev.groupings.map(g => ({ name: g.grouping?.displayName || g.displayName || "Tableau", matches: (g.competitions || []).map(tennisMatch) }))
      : [{ name: "Matchs", matches: (ev.competitions || []).map(tennisMatch) }];
    groups.forEach(g => {
      if (day) g.matches = g.matches.filter(m => !m.date || m.date.slice(0, 10) === day || m.state === "live");
      g.matches.sort((a, b) => (a.state === "live" ? -1 : 0) - (b.state === "live" ? -1 : 0) || String(a.date).localeCompare(String(b.date)));
    });
    return { id: ev.id, name: ev.name || ev.shortName, start: ev.date, end: ev.endDate || null, venue: ev.venue?.fullName || null, groups: groups.filter(g => g.matches.length) };
  }).filter(t => t.groups.length);
}
export async function tennisRankings(tour) {
  const d = await get(`${SITE}/tennis/${tour}/rankings`);
  const list = d.rankings?.[0]?.ranks || d.ranks || [];
  return { name: d.rankings?.[0]?.name || null, date: d.rankings?.[0]?.date || null,
    rows: list.slice(0, 100).map(r => ({ rank: num(r.current), previous: num(r.previous), points: num(r.points), trend: r.trend || null, name: r.athlete?.displayName || "?", flag: flag(r.athlete) })) };
}

/* ---------- Formule 1 ---------- */
export async function f1() {
  const d = await get(`${SITE}/racing/f1/scoreboard`);
  const calendar = (d.leagues?.[0]?.calendar || []).map(c => ({ name: c.label, start: c.startDate, end: c.endDate }));
  const events = (d.events || []).map(ev => ({
    id: ev.id, name: ev.name || ev.shortName, start: ev.date, end: ev.endDate || null,
    circuit: ev.circuit?.fullName || ev.competitions?.[0]?.venue?.fullName || null,
    sessions: (ev.competitions || []).map(c => ({
      type: c.type?.abbreviation || c.type?.text || "Session", date: c.date, ...state(c.status),
      results: (c.competitors || []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).slice(0, 20).map(p => ({
        pos: num(p.order), name: p.athlete?.displayName || "?", flag: flag(p.athlete), team: p.team?.displayName || p.vehicle?.manufacturer || null, winner: !!p.winner
      }))
    }))
  }));
  return { events, calendar };
}

/* ---------- UFC ---------- */
export async function mma() {
  const d = await get(`${SITE}/mma/ufc/scoreboard`);
  const calendar = (d.leagues?.[0]?.calendar || []).map(c => ({ name: c.label, start: c.startDate, end: c.endDate }));
  const events = (d.events || []).map(ev => ({
    id: ev.id, name: ev.name || ev.shortName, date: ev.date, venue: ev.competitions?.[0]?.venue?.fullName || ev.venues?.[0]?.fullName || null,
    fights: (ev.competitions || []).map(c => ({
      id: c.id, date: c.date, category: c.type?.abbreviation || c.type?.text || c.note || null, ...state(c.status),
      fighters: (c.competitors || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => ({ name: p.athlete?.displayName || "?", flag: flag(p.athlete), record: p.records?.[0]?.summary || null, winner: !!p.winner })),
      result: c.status?.result?.displayName || c.status?.type?.detail || null
    })).reverse()
  }));
  return { events, calendar };
}
