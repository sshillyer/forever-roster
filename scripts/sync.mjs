// Pulls WoW Forever characters from Blizzard's Profile API and writes data/characters.json.
// Needs BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in the environment (GitHub Actions secrets).
// The Forever namespaces (profile-forever-{region}) are live but undocumented, so every field is read defensively.
// Characters show up only from level 10, after they have logged out once; anything else is recorded as not found.
import { readFile, writeFile } from 'node:fs/promises';

const ROSTER = new URL('../data/roster.json', import.meta.url);
const OUT = new URL('../data/characters.json', import.meta.url);
const { region = 'us', characters: names = [] } = JSON.parse(await readFile(ROSTER, 'utf8'));
const NS = `profile-forever-${region}`;
const API = `https://${region}.api.blizzard.com`;
const slug = s => s.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const id = process.env.BLIZZARD_CLIENT_ID, secret = process.env.BLIZZARD_CLIENT_SECRET;
if (!id || !secret) { console.error('Missing BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET'); process.exit(1); }

async function token() {
  const r = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error(`Token request failed: HTTP ${r.status}`);
  return (await r.json()).access_token;
}
const TOKEN = await token();

async function get(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}namespace=${NS}&locale=en_US`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) return { _status: r.status };
    return r.json();
  }
  return { _status: 'retry-failed' };
}

const name = x => (x && (x.name || (typeof x === 'string' ? x : null))) || null;

function professions(p) {
  if (!p || p._status) return [];
  const one = (e, kind) => {
    const tiers = e.tiers && e.tiers.length ? e.tiers : [e];
    const t = tiers[tiers.length - 1];
    return { name: name(e.profession), kind, skill: t.skill_points ?? null, max: t.max_skill_points ?? null, tier: name(t.tier) };
  };
  return [...(p.primaries || []).map(e => one(e, 'primary')), ...(p.secondaries || []).map(e => one(e, 'secondary'))];
}

function equipment(e) {
  if (!e || e._status) return [];
  return (e.equipped_items || []).map(i => ({
    slot: name(i.slot) || (i.slot && i.slot.type), id: i.item && i.item.id, name: i.name,
    quality: i.quality && i.quality.type, ilvl: i.level && i.level.value
  }));
}

function specs(s) {
  if (!s || s._status) return null;
  if (s.active_specialization) return { active: name(s.active_specialization), trees: [] };
  const groups = s.specialization_groups || [];
  const g = groups.find(x => x.is_active) || groups[0];
  const trees = ((g && g.specializations) || []).map(t => ({ name: t.specialization_name || name(t.specialization), points: t.spent_points ?? null }));
  const top = trees.filter(t => t.points).sort((a, b) => b.points - a.points)[0];
  return { active: top ? top.name : null, trees };
}

const out = [];
for (const n of names) {
  const s = slug(n);
  const base = `/profile/wow/character/${encodeURIComponent(s)}`;
  const p = await get(base);
  if (p._status) { out.push({ name: n, slug: s, ok: false, status: p._status }); await sleep(200); continue; }
  const [eq, pr, sp, media] = [await get(base + '/equipment'), await get(base + '/professions'), await get(base + '/specializations'), await get(base + '/character-media')];
  const avatar = media && !media._status && (media.assets || []).find(a => a.key === 'avatar');
  out.push({
    name: n, slug: s, ok: true,
    level: p.level ?? null,
    race: name(p.race), class: name(p.character_class), faction: name(p.faction), gender: name(p.gender),
    ruleset: name(p.ruleset), guild: name(p.guild),
    ilvl: p.equipped_item_level ?? null, ilvl_avg: p.average_item_level ?? null,
    last_login: p.last_login_timestamp ?? null,
    spec: specs(sp), professions: professions(pr), equipment: equipment(eq),
    avatar: avatar ? avatar.value : null
  });
  await sleep(200);
}

// Only rewrite the file when character data changed, so the scheduled job doesn't commit every run.
let old = null;
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const same = old && JSON.stringify(old.characters) === JSON.stringify(out);
const now = new Date().toISOString();
if (same) { console.log('No changes.'); process.exit(0); }
await writeFile(OUT, JSON.stringify({ region, updated_at: now, characters: out }, null, 2) + '\n');
console.log(`Wrote ${out.length} characters (${out.filter(c => c.ok).length} found).`);
for (const c of out) console.log(c.ok ? `  ${c.name}: level ${c.level}, ilvl ${c.ilvl ?? '?'}` : `  ${c.name}: not found (${c.status})`);
