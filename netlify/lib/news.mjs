// Actualités TOTAL90 : agrégation de flux RSS publics de médias sportifs reconnus.
// Ne consomme aucune requête API-Football. Un flux qui ne répond pas est simplement ignoré
// (et signalé comme indisponible), il ne bloque jamais les autres.
// Pour ajouter ou retirer une source : modifier la liste SOURCES ci-dessous.

export const SOURCES = [
  // cat : catégorie fixe du flux ; "auto" = classement par mots-clés (flux généralistes)
  { name: "Maxifoot", site: "https://www.maxifoot.fr", url: "https://rss.maxifoot.com/football-general.xml", cat: "football", lang: "fr" },
  { name: "Maxifoot", site: "https://www.maxifoot.fr", url: "https://rss.maxifoot.com/football-transfert.xml", cat: "mercato", lang: "fr" },
  { name: "L’Équipe", site: "https://www.lequipe.fr", url: "https://www.lequipe.fr/rss/actu_rss.xml", cat: "auto", lang: "fr" },
  { name: "Franceinfo Sport", site: "https://www.francetvinfo.fr/sports/", url: "https://www.francetvinfo.fr/sports.rss", cat: "auto", lang: "fr" },
  { name: "Le Monde Sport", site: "https://www.lemonde.fr/sport/", url: "https://www.lemonde.fr/sport/rss_full.xml", cat: "auto", lang: "fr" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", cat: "football", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/basketball", url: "https://feeds.bbci.co.uk/sport/basketball/rss.xml", cat: "basketball", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/tennis", url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", cat: "tennis", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/formula1", url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml", cat: "f1", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/athletics", url: "https://feeds.bbci.co.uk/sport/athletics/rss.xml", cat: "athletisme", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/boxing", url: "https://feeds.bbci.co.uk/sport/boxing/rss.xml", cat: "combat", lang: "en" },
  { name: "BBC Sport", site: "https://www.bbc.com/sport/mixed-martial-arts", url: "https://feeds.bbci.co.uk/sport/mixed-martial-arts/rss.xml", cat: "combat", lang: "en" }
];

export const CATEGORIES = ["football", "mercato", "basketball", "tennis", "f1", "athletisme", "combat", "autres"];

// Classement par mots-clés pour les flux généralistes (ordre = priorité)
const RULES = [
  ["mercato", /(mercato|\btransferts?\b|\brecrue|prolongation de contrat|prolonge (?:son contrat|jusqu)|s[’']engage (?:avec|pour|jusqu)|signe (?:à|au|pour|jusqu)|prêt[ée]? (?:à|au) |clause libératoire)/i],
  ["basketball", /\b(basket\w*|nba|euroleague|wembanyama|betclic [ée]lite|lebron|wnba)\b/i],
  ["tennis", /\b(tennis|atp|wta|roland[- ]garros|wimbledon|us open|open d[’']australie|coupe davis|billie jean king|masters 1000|sinner|alcaraz|djokovic)\b/i],
  ["f1", /\b(formule 1|f1|grand prix|gp d[eu’']|verstappen|hamilton|leclerc|ferrari|red bull racing|mclaren|pole position)\b/i],
  ["athletisme", /\b(athl[ée]tisme|marathon|d[ée]cathlon|heptathlon|diamond league|ligue de diamant|sprint|100 ?m|saut à la perche|duplantis)\b/i],
  ["combat", /\b(ufc|mma|boxe|boxeur|boxeuse|judo|karat[ée]|kickboxing|ciryl gane|ngannou)\b/i],
  ["football", /\b(football|foot|ligue [12]|ligue des (?:champions|nations)|ligue europa|premier league|liga|serie a|bundesliga|psg|om|ol|losc|bleus|can 20\d\d|coupe du monde|ballon d[’']or|mbapp[ée]|but|buteur|entra[iî]neur|coupe de france|coupe|match|attaquant|d[ée]fenseur|milieu|gardien|stade|club|lens|nantes|lille|monaco|rennes|nice)\b/i]
];
const classify = text => (RULES.find(([, re]) => re.test(text)) || ["autres"])[0];

const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "’", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", ucirc: "û", icirc: "î", laquo: "«", raquo: "»", ndash: "–", mdash: "—" };
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const cdata = s => (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? cdata(m[1]).trim() : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, "i")); return m ? m[1] : ""; };
const text = html => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const cut = (s, n) => s.length > n ? s.slice(0, s.lastIndexOf(" ", n) > n * .6 ? s.lastIndexOf(" ", n) : n).trim() + "…" : s;
const https = u => u ? decode(u).replace(/^http:\/\//, "https://") : null;

function parse(xml, src) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const title = text(tag(b, "title"));
    let link = tag(b, "link") || attr(b, "link", "href");
    link = decode(link).trim();
    const raw = tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content");
    const image = https(attr(b, "media:content", "url") || attr(b, "media:thumbnail", "url") || (/<enclosure[^>]+type=["']image/i.test(b) ? attr(b, "enclosure", "url") : "") || (decode(raw).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1]);
    const dateStr = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "updated") || tag(b, "published");
    const date = dateStr && !isNaN(new Date(dateStr)) ? new Date(dateStr).toISOString() : null;
    const summary = cut(text(raw), 260);
    if (!title || !/^https?:\/\//.test(link)) return null;
    const category = src.cat === "auto" ? classify(`${title} ${summary}`) : (src.cat === "football" && classify(title) === "mercato" ? "mercato" : src.cat);
    return { id: link, title, summary: summary === title ? "" : summary, image, date, link, source: src.name, sourceSite: src.site, lang: src.lang, category };
  }).filter(Boolean);
}

async function fetchFeed(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(src.url, { signal: ctrl.signal, headers: { "user-agent": "TOTAL90 news reader (+https://total-90.netlify.app)", accept: "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 200).toString("latin1");
    const charset = (head.match(/encoding=["']([\w-]+)["']/i) || (res.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || [])[1] || "utf-8";
    let xml; try { xml = new TextDecoder(charset.toLowerCase()).decode(buf); } catch { xml = buf.toString("utf8"); }
    const items = parse(xml, src);
    return { ok: items.length > 0, items, error: items.length ? null : "flux vide ou illisible" };
  } catch (e) {
    return { ok: false, items: [], error: e.name === "AbortError" ? "délai dépassé" : e.message };
  } finally { clearTimeout(timer); }
}

export async function getNews() {
  const results = await Promise.all(SOURCES.map(fetchFeed));
  const seen = new Set(), seenTitles = new Set();
  const items = results.flatMap(r => r.items).filter(it => {
    const t = it.title.toLowerCase().replace(/\W+/g, "");
    if (seen.has(it.link) || seenTitles.has(t)) return false;
    seen.add(it.link); seenTitles.add(t); return true;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 400);
  return {
    items,
    sources: SOURCES.map((s, i) => ({ name: s.name, site: s.site, category: s.cat, lang: s.lang, ok: results[i].ok, count: results[i].items.length, error: results[i].error }))
  };
}
