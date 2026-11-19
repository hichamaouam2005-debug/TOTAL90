// Backend TOTAL90 : seul endroit qui connaît la clé API.
// Le navigateur appelle /api/..., jamais le fournisseur directement.
import { apiFootball, ProviderError } from "../lib/api-football.mjs";
import { getNews } from "../lib/news.mjs";

const PROVIDERS = { "api-football": apiFootball };
const memo = new Map(); // cache mémoire de l'instance (complété par le cache CDN de Netlify)

const env = name => (globalThis.Netlify?.env?.get?.(name)) ?? process.env[name];
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const isId = s => /^\d{1,9}$/.test(s || "");
const tzOf = p => (/^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(p.get("tz") || "") ? p.get("tz") : "Europe/Paris");
const today = () => new Date().toISOString().slice(0, 10);
// Mode gratuit (par défaut) : l'offre gratuite d'API-Football autorise environ 100 requêtes par jour.
// On garde donc chaque réponse beaucoup plus longtemps en cache. Mettre PLAN=paid pour le direct rapide.
const FREE = () => env("PLAN") !== "paid";
const FREE_MIN = { matches: 1800, live: 1800, match: 1800, search: 86400, leagues: 86400, league: 43200, team: 86400, player: 86400, players: 86400, topscorers: 43200, teamstats: 86400, standings: 43200 };
const PAST_OR_FUTURE = 86400;

// Chaque route : [fonction, durée de cache en secondes]
const ROUTES = {
  news: true, // traité à part plus bas
  async matches(p, prov) {
    const date = isDate(p.get("date")) ? p.get("date") : today();
    const data = await prov.matchesByDate(date, tzOf(p));
    const live = data.some(m => m.status.state === "live");
    const ttl = live ? 20 : Math.abs(new Date(date) - new Date(today())) < 864e5 * 1.5 ? 60 : 3600;
    return [data, ttl];
  },
  async live(p, prov) { return [await prov.live(tzOf(p)), 15]; },
  async match(p, prov, id) {
    if (!isId(id)) throw new ProviderError("bad_request", "Identifiant invalide.");
    const m = await prov.match(id, tzOf(p));
    return [m, m.status.state === "live" ? 20 : m.status.state === "scheduled" ? 300 : 3600];
  },
  async search(p, prov) {
    const q = (p.get("q") || "").slice(0, 60);
    return [await prov.search(q, p.get("full") === "1"), 86400];
  },
  async leagues(p, prov) { return [await prov.leagues(), 86400]; },
  async league(p, prov, id) {
    if (!isId(id)) throw new ProviderError("bad_request", "Identifiant invalide.");
    const season = /^\d{4}$/.test(p.get("season") || "") ? p.get("season") : null;
    return [await prov.league(id, season), 1800];
  },
  async team(p, prov, id) {
    if (!isId(id)) throw new ProviderError("bad_request", "Identifiant invalide.");
    return [await prov.team(Number(id), tzOf(p)), 3600];
  },
  async player(p, prov, id) {
    if (!isId(id)) throw new ProviderError("bad_request", "Identifiant invalide.");
    return [await prov.player(id), 21600];
  },
  async players(p, prov) {
    return [await prov.playerSearch((p.get("q") || "").slice(0, 60)), 86400];
  },
  async topscorers(p, prov) {
    if (!isId(p.get("league")) || !/^\d{4}$/.test(p.get("season") || "")) throw new ProviderError("bad_request", "Paramètres invalides.");
    return [await prov.topScorers(p.get("league"), p.get("season")), 21600];
  },
  async standings(p, prov) {
    if (!isId(p.get("league")) || !/^\d{4}$/.test(p.get("season") || "")) throw new ProviderError("bad_request", "Paramètres invalides.");
    return [await prov.standings(p.get("league"), p.get("season")), 3600];
  },
  async teamstats(p, prov) {
    if (!isId(p.get("team")) || !isId(p.get("league")) || !/^\d{4}$/.test(p.get("season") || "")) throw new ProviderError("bad_request", "Paramètres invalides.");
    return [await prov.teamStats(p.get("team"), p.get("league"), p.get("season")), 21600];
  }
};

const STATUS = { bad_request: 400, not_found: 404, rate_limit: 429, plan: 402, bad_key: 503, not_configured: 503 };
const MESSAGES = {
  rate_limit: "Le quota de requêtes du fournisseur de données est atteint pour le moment.",
  plan: "Ces données ne sont pas incluses dans l’abonnement actuel au fournisseur.",
  bad_key: "La clé du fournisseur de données est refusée.",
  not_configured: "Le fournisseur de données n’est pas encore configuré."
};

function json(body, status, ttl = 0) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" };
  if (ttl > 0) headers["netlify-cdn-cache-control"] = `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}, durable`;
  return new Response(JSON.stringify(body), { status, headers });
}

export default async req => {
  const url = new URL(req.url);
  const [route, id] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const handler = ROUTES[route];
  if (!handler) return json({ error: "not_found", message: "Route inconnue." }, 404);

  // Actualités : flux RSS publics, sans clé API ni quota
  if (route === "news") {
    const hit = memo.get("news");
    if (hit && hit.until > Date.now()) return json(hit.data, 200, Math.round((hit.until - Date.now()) / 1000));
    try {
      const data = await getNews();
      const payload = { data, fetchedAt: new Date().toISOString() };
      memo.set("news", { data: payload, until: Date.now() + 900000 });
      return json(payload, 200, 900);
    } catch (e) { return json({ error: "upstream", message: "Les actualités sont momentanément indisponibles." }, 502); }
  }

  const providerName = env("SPORTS_PROVIDER") || "api-football";
  const key = env("API_FOOTBALL_KEY");
  if (!key || !PROVIDERS[providerName]) return json({ error: "not_configured", message: MESSAGES.not_configured }, 503);

  const cacheKey = url.pathname + url.search;
  const hit = memo.get(cacheKey);
  if (hit && hit.until > Date.now()) return json(hit.data, 200, Math.round((hit.until - Date.now()) / 1000));

  try {
    let [data, ttl] = await handler(url.searchParams, PROVIDERS[providerName](key), id);
    if (FREE()) {
      ttl = Math.max(ttl, FREE_MIN[route] || 3600);
      if (route === "matches" && url.searchParams.get("date") && url.searchParams.get("date") !== today()) ttl = Math.max(ttl, PAST_OR_FUTURE);
    }
    const payload = { data, provider: PROVIDERS[providerName](key).name, plan: FREE() ? "free" : "paid", fetchedAt: new Date().toISOString() };
    memo.set(cacheKey, { data: payload, until: Date.now() + ttl * 1000 });
    if (memo.size > 500) memo.delete(memo.keys().next().value);
    return json(payload, 200, ttl);
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "upstream";
    return json({ error: code, message: MESSAGES[code] || e.message || "Erreur du fournisseur de données." }, STATUS[code] || 502);
  }
};

export const config = { path: "/api/*" };
