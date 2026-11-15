/* Shared by the smart-shelves mockups (shelf.html, shelf-builder.html, shelves-manage.html, shelf-save-dialog.html).
   REFERENCE ONLY — the real app implements the same logic in TypeScript (see docs/SMART_SHELVES_SPEC.md). */

const GAMES = [
  { appId: 504230,  name: "Celeste",               genre: "Platformer",       modes: ["Solo"],         tags: ["Indie","Hard"],                          meta: "46.8 h · Jan 6" },
  { appId: 1145360, name: "Hades",                 genre: "Roguelike",        modes: ["Solo"],         tags: ["Indie","Action","Short sessions"] },
  { appId: 367520,  name: "Hollow Knight",         genre: "Metroidvania",     modes: ["Solo"],         tags: ["Indie","Hard","Exploration"] },
  { appId: 1174180, name: "Red Dead Redemption 2", genre: "Action-adventure", modes: ["Solo","PvP"],   tags: ["Story","Exploration"] },
  { appId: 292030,  name: "The Witcher 3",         genre: "RPG",              modes: ["Solo"],         tags: ["Story","Exploration"] },
  { appId: 413150,  name: "Stardew Valley",        genre: "Simulation",       modes: ["Solo","Coop"],  tags: ["Indie","Chill"] },
  { appId: 730,     name: "Counter-Strike 2",      genre: "FPS",              modes: ["PvP"],          tags: ["Competitive","Short sessions"] },
  { appId: 553850,  name: "Helldivers 2",          genre: "Shooter",          modes: ["Coop"],         tags: ["Action","Short sessions"] },
  { appId: 268910,  name: "Cuphead",               genre: "Platformer",       modes: ["Solo","Coop"],  tags: ["Indie","Hard"] },
  { appId: 220,     name: "Half-Life 2",           genre: "FPS",              modes: ["Solo"],         tags: ["Story"] },
  { appId: 1222140, name: "Detroit: Become Human", genre: "Adventure",        modes: ["Solo"],         tags: ["Story"] },
  { appId: 271590,  name: "Grand Theft Auto V",    genre: "Action-adventure", modes: ["Solo","PvP"],   tags: ["Exploration"] },
  { appId: 8870,    name: "BioShock Infinite",     genre: "FPS",              modes: ["Solo"],         tags: ["Story"] },
  { appId: 105600,  name: "Terraria",              genre: "Sandbox",          modes: ["Solo","Coop"],  tags: ["Indie","Chill","Exploration"] },
  { appId: 1172470, name: "Apex Legends",          genre: "Battle royale",    modes: ["PvP"],          tags: ["Competitive","Action","Short sessions"] }
];

/* Field catalog. `ready: false` = needs Steam data (Phase 4) — shown disabled in the builder. */
const FIELDS = {
  genre: { label: "Genre", ready: true, values: [...new Set(GAMES.map(g => g.genre))], get: g => [g.genre] },
  modes: { label: "Mode",  ready: true, values: ["Solo","Coop","PvP"], get: g => g.modes },
  tags:  { label: "Vibe",  ready: true, values: ["Indie","Hard","Story","Chill","Action","Competitive","Exploration","Short sessions"], get: g => g.tags },
  playtime:   { label: "Playtime",        ready: false },
  lastPlayed: { label: "Last played",     ready: false },
  installed:  { label: "Installed",       ready: false },
  achievementsPct: { label: "Achievements %", ready: false }
};

/* Rule = { match: 'all' | 'any', conditions: [{ field, values: string[] }] }
   A condition passes if the game has ANY of its values. Conditions are combined with `match`.
   Conditions with no values are ignored. */
function matches(game, rule) {
  const active = rule.conditions.filter(c => c.values.length);
  if (!active.length) return true;
  const ok = c => c.values.some(v => FIELDS[c.field].get(game).includes(v));
  return rule.match === "all" ? active.every(ok) : active.some(ok);
}
/* "Almost in": games failing exactly one active condition of an 'all' rule. */
function almost(rule) {
  if (rule.match !== "all") return [];
  const active = rule.conditions.filter(c => c.values.length);
  if (active.length < 2) return [];
  return GAMES.map(g => ({ g, miss: active.filter(c => !c.values.some(v => FIELDS[c.field].get(g).includes(v))) }))
    .filter(x => x.miss.length === 1)
    .map(x => ({ ...x.g, missing: x.miss[0].values.join(" / ") }));
}
function ruleSentence(rule) {
  const active = rule.conditions.filter(c => c.values.length);
  if (!active.length) return "No condition: your whole library.";
  return "Games whose " + active.map(c => `${FIELDS[c.field].label.toLowerCase()} is ${c.values.join(" or ")}`)
    .join(rule.match === "all" ? ", and whose " : ", or whose ") + ".";
}
function ruleLabel(rule) {
  const active = rule.conditions.filter(c => c.values.length);
  return active.map(c => c.values.join(" or ")).join(rule.match === "all" ? " + " : " | ") || "Everything";
}

const SHELVES = [
  { id: "hard-indies", name: "Demanding indies", kind: "smart",  visible: true,  pinned: true,  rule: { match: "all", conditions: [{ field: "tags", values: ["Indie"] }, { field: "tags", values: ["Hard"] }] } },
  { id: "big-stories", name: "Big stories",      kind: "smart",  visible: true,  pinned: false, rule: { match: "all", conditions: [{ field: "tags", values: ["Story"] }] } },
  { id: "online",      name: "Online",           kind: "smart",  visible: true,  pinned: false, rule: { match: "all", conditions: [{ field: "modes", values: ["PvP"] }] } },
  { id: "friends",     name: "Friends night",    kind: "smart",  visible: false, pinned: false, rule: { match: "all", conditions: [{ field: "modes", values: ["Coop","PvP"] }] } },
  { id: "favorites",   name: "Favorites",        kind: "manual", visible: true,  pinned: false, count: 85, covers: [504230, 1145360, 367520] },
  { id: "steam-col",   name: "[Your Steam collection]", kind: "steam", visible: false, pinned: false, count: null, covers: [1222140, 367520, 292030] }
];

const cover = id => `assets/${id}_library_600x900.jpg`;
const hero  = id => `assets/${id}_library_hero.jpg`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const SPARKLE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFD43B" stroke-width="2.4" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';
