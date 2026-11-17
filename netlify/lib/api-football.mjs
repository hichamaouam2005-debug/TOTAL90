// Adaptateur API-Football (v3). Toute la logique propre au fournisseur est ici :
// pour changer de fournisseur, on écrit un autre fichier qui expose les mêmes méthodes
// et renvoie les mêmes formats normalisés.

const BASE = "https://v3.football.api-sports.io";

export class ProviderError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

async function call(path, params, key) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  let res;
  try {
    res = await fetch(`${BASE}/${path}?${qs}`, { headers: { "x-apisports-key": key } });
  } catch {
    throw new ProviderError("network", "Le fournisseur de données est injoignable.");
  }
  if (res.status === 429) throw new ProviderError("rate_limit");
  if (!res.ok) throw new ProviderError("upstream", `Erreur du fournisseur (${res.status}).`);
  const body = await res.json();
  const errs = body.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
    const keys = Array.isArray(errs) ? [] : Object.keys(errs);
    const text = (Array.isArray(errs) ? errs : Object.values(errs)).join(" ");
    if (keys.includes("token") || /token|key/i.test(text)) throw new ProviderError("bad_key", text);
    if (keys.includes("requests") || keys.includes("rateLimit") || /limit/i.test(text)) throw new ProviderError("rate_limit", text);
    if (keys.includes("plan") || /plan|season/i.test(text)) throw new ProviderError("plan", text);
    throw new ProviderError("upstream", text);
  }
  return body.response || [];
}

const LIVE = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
const DONE = ["FT", "AET", "PEN"];
const OTHER = ["PST", "CANC", "ABD", "AWD", "WO"];
const STATUS_FR = {
  TBD: "Horaire à confirmer", NS: "À venir", "1H": "1re mi-temps", HT: "Mi-temps", "2H": "2e mi-temps",
  ET: "Prolongation", BT: "Pause", P: "Tirs au but", SUSP: "Suspendu", INT: "Interrompu", LIVE: "En cours",
  FT: "Terminé", AET: "Après prol.", PEN: "Après t.a.b.", PST: "Reporté", CANC: "Annulé", ABD: "Abandonné",
  AWD: "Sur tapis vert", WO: "Forfait"
};

function status(s = {}) {
  const code = s.short || "NS";
  const state = LIVE.includes(code) ? "live" : DONE.includes(code) ? "finished" : OTHER.includes(code) ? "other" : "scheduled";
  return { code, state, elapsed: s.elapsed ?? null, extra: s.extra ?? null, label: STATUS_FR[code] || s.long || code };
}

const team = t => t ? { id: t.id, name: t.name, logo: t.logo, winner: t.winner ?? null } : null;

function match(f) {
  return {
    id: f.fixture.id,
    date: f.fixture.date,
    timestamp: f.fixture.timestamp,
    status: status(f.fixture.status),
    venue: f.fixture.venue ? { name: f.fixture.venue.name, city: f.fixture.venue.city } : null,
    referee: f.fixture.referee || null,
    league: { id: f.league.id, name: f.league.name, country: f.league.country, logo: f.league.logo, flag: f.league.flag, round: f.league.round, season: f.league.season },
    home: team(f.teams.home),
    away: team(f.teams.away),
    score: { home: f.goals.home, away: f.goals.away },
    penalties: f.score?.penalty?.home != null ? { home: f.score.penalty.home, away: f.score.penalty.away } : null
  };
}

const STAT_FR = {
  "Ball Possession": "Possession", "Total Shots": "Tirs", "Shots on Goal": "Tirs cadrés", "Shots off Goal": "Tirs non cadrés",
  "Blocked Shots": "Tirs contrés", "Corner Kicks": "Corners", Fouls: "Fautes", Offsides: "Hors-jeu",
  "Yellow Cards": "Cartons jaunes", "Red Cards": "Cartons rouges", "Goalkeeper Saves": "Arrêts du gardien",
  "Total passes": "Passes", "Passes accurate": "Passes réussies", "Passes %": "Précision des passes",
  expected_goals: "Buts attendus (xG)"
};
const STAT_ORDER = ["Ball Possession", "expected_goals", "Total Shots", "Shots on Goal", "Corner Kicks", "Fouls", "Offsides", "Yellow Cards", "Red Cards", "Goalkeeper Saves", "Total passes", "Passes %"];

function event(e) {
  let type = "other";
  if (e.type === "Goal") type = e.detail === "Missed Penalty" ? "missed_penalty" : "goal";
  else if (e.type === "Card") type = /red|second yellow/i.test(e.detail) ? "red" : "yellow";
  else if (e.type === "subst") type = "sub";
  else if (e.type === "Var") type = "var";
  return {
    minute: e.time?.elapsed ?? null, extra: e.time?.extra ?? null, teamId: e.team?.id, type,
    player: e.player?.name || null, assist: e.assist?.name || null,
    detail: e.detail === "Own Goal" ? "c.s.c." : e.detail === "Penalty" ? "pén." : null
  };
}

function lineup(l) {
  const p = x => ({ id: x.player.id, name: x.player.name, number: x.player.number, pos: x.player.pos });
  return { teamId: l.team?.id, formation: l.formation, coach: l.coach?.name || null, startXI: (l.startXI || []).map(p), subs: (l.substitutes || []).map(p) };
}

function standingRow(r) {
  return {
    rank: r.rank, team: team(r.team), points: r.points, diff: r.goalsDiff, group: r.group, form: r.form || "",
    description: r.description || null, played: r.all?.played, win: r.all?.win, draw: r.all?.draw, lose: r.all?.lose,
    gf: r.all?.goals?.for, ga: r.all?.goals?.against
  };
}

function league(l) {
  const current = (l.seasons || []).find(s => s.current) || (l.seasons || []).slice(-1)[0] || null;
  return {
    id: l.league.id, name: l.league.name, type: l.league.type, logo: l.league.logo,
    country: l.country?.name || null, flag: l.country?.flag || null,
    season: current ? current.year : null,
    seasons: (l.seasons || []).map(s => s.year)
  };
}

const clean = q => q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const settle = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, e }));

export function apiFootball(key) {
  return {
    name: "API-Football",

    async matchesByDate(date, tz) {
      return (await call("fixtures", { date, timezone: tz }, key)).map(match);
    },

    async live(tz) {
      return (await call("fixtures", { live: "all", timezone: tz }, key)).map(match);
    },

    async match(id, tz) {
      const [f] = await call("fixtures", { id, timezone: tz }, key);
      if (!f) throw new ProviderError("not_found", "Match introuvable.");
      const m = match(f);
      m.events = (f.events || []).map(event);
      m.lineups = (f.lineups || []).map(lineup);
      const stats = f.statistics || [];
      if (stats.length === 2) {
        const val = (arr, t) => (arr.find(s => s.type === t) || {}).value;
        m.statistics = STAT_ORDER
          .filter(t => val(stats[0].statistics, t) != null || val(stats[1].statistics, t) != null)
          .map(t => ({ label: STAT_FR[t] || t, home: val(stats[0].statistics, t) ?? 0, away: val(stats[1].statistics, t) ?? 0 }));
      } else m.statistics = [];
      const h2h = await settle(call("fixtures/headtohead", { h2h: `${m.home.id}-${m.away.id}`, last: 6, timezone: tz }, key));
      m.h2h = h2h.ok ? h2h.v.map(match) : null;
      return m;
    },

    async search(q, full) {
      const term = clean(q);
      if (term.length < 3) return { teams: [], leagues: [], players: [], coaches: [] };
      const jobs = [settle(call("teams", { search: term }, key)), settle(call("leagues", { search: term }, key))];
      if (full) jobs.push(settle(call("players/profiles", { search: term }, key)), settle(call("coachs", { search: term }, key)));
      const [t, l, p, c] = await Promise.all(jobs);
      if (!t.ok && !l.ok) throw t.e;
      return {
        teams: t.ok ? t.v.map(x => ({ id: x.team.id, name: x.team.name, logo: x.team.logo, country: x.team.country, national: x.team.national })) : null,
        leagues: l.ok ? l.v.map(league) : null,
        players: !full ? [] : p.ok ? p.v.map(x => ({ id: x.player.id, name: x.player.name, photo: x.player.photo, age: x.player.age, nationality: x.player.nationality, position: x.player.position })) : null,
        coaches: !full ? [] : c.ok ? c.v.map(x => ({ id: x.id, name: x.name, photo: x.photo, age: x.age, nationality: x.nationality, team: x.team ? { id: x.team.id, name: x.team.name, logo: x.team.logo } : null })) : null
      };
    },

    async leagues() {
      return (await call("leagues", {}, key)).map(league);
    },

    async league(id, season) {
      const [l] = await call("leagues", { id }, key);
      if (!l) throw new ProviderError("not_found", "Compétition introuvable.");
      const info = league(l);
      const s = season || info.season;
      const [st, next, last] = await Promise.all([
        settle(call("standings", { league: id, season: s }, key)),
        settle(call("fixtures", { league: id, season: s, next: 10 }, key)),
        settle(call("fixtures", { league: id, season: s, last: 10 }, key))
      ]);
      const groups = st.ok && st.v[0] ? st.v[0].league.standings.map(g => g.map(standingRow)) : null;
      return {
        league: info, season: s,
        standings: groups, standingsError: st.ok ? null : st.e.code,
        next: next.ok ? next.v.map(match) : null,
        last: last.ok ? last.v.map(match).reverse() : null
      };
    },

    async team(id, tz) {
      const [t] = await call("teams", { id }, key);
      if (!t) throw new ProviderError("not_found", "Équipe introuvable.");
      const [last, next, squad, leagues] = await Promise.all([
        settle(call("fixtures", { team: id, last: 10, timezone: tz }, key)),
        settle(call("fixtures", { team: id, next: 5, timezone: tz }, key)),
        settle(call("players/squads", { team: id }, key)),
        settle(call("leagues", { team: id, current: "true" }, key))
      ]);
      const comps = leagues.ok ? leagues.v.map(league) : [];
      const main = comps.find(c => c.type === "League") || null;
      let standing = null;
      if (main) {
        const st = await settle(call("standings", { league: main.id, season: main.season }, key));
        if (st.ok && st.v[0]) {
          const group = st.v[0].league.standings.find(g => g.some(r => r.team.id === id)) || [];
          standing = { league: main, rows: group.map(standingRow) };
        }
      }
      return {
        team: { id: t.team.id, name: t.team.name, code: t.team.code, country: t.team.country, founded: t.team.founded, national: t.team.national, logo: t.team.logo },
        venue: t.venue ? { name: t.venue.name, city: t.venue.city, capacity: t.venue.capacity } : null,
        last: last.ok ? last.v.map(match) : null,
        next: next.ok ? next.v.map(match) : null,
        squad: squad.ok && squad.v[0] ? squad.v[0].players.map(p => ({ id: p.id, name: p.name, age: p.age, number: p.number, position: p.position, photo: p.photo })) : null,
        competitions: comps,
        standing
      };
    }
  };
}
