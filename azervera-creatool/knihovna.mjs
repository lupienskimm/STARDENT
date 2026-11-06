// Builds the element library CREATOOL offers under "Knihovna" (add to the page, or replace an existing element).
// A pack is a folder of single-colour icons or drawings: SVG (any shapes, filled or outlined) or PNG with a transparent
// background. An svg/ subfolder is used when present; files in subfolders are grouped by the subfolder name.
// CREATOOL paints them in the chosen colour through a CSS mask, so only their shape counts (a multi-colour icon turns
// into one-colour silhouette). Filled path-only SVGs get a viewBox cropped to the drawing, so an underline gets a wide
// box and a flower a square one; other SVGs keep their own viewBox.
// Usage: node knihovna.mjs <output-dir> <pack-id>=<folder> [<pack-id>=<folder> ...]
// Packs with the same id are replaced; others already in <output-dir>/prvky.json stay.
import fs from "node:fs";
import path from "node:path";

const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || !specs.length) {
  console.error("Usage: node knihovna.mjs <output-dir> <pack-id>=<folder> [...]");
  process.exit(1);
}

const WORDS = {
  akcent: "akcent", blesk: "blesk", bublina: "bublina", carky: "čárky", checkbox: "zaškrtávátko", cikcak: "cikcak", cip: "cíp", cmaranice: "čmáranice", ctyrlistek: "čtyřlístek",
  dest: "déšť", doleva: "doleva", doprava: "doprava", dolu: "dolů", doodle: "doodle", duha: "duha", dvakrat: "dvakrát", dvojita: "dvojitá", dvojite: "dvojité", dvojity: "dvojitý",
  fajfka: "fajfka", hrnek: "hrnek", hranate: "hranaté", hvezdice: "hvězdice", hvezdicka: "hvězdička", hvezdicky: "hvězdičky", jazyk: "jazyk", jednim: "jedním", kafe: "kafe", kapka: "kapka",
  klicka: "klička", klubko: "klubko", kolem: "kolem", koruna: "koruna", krivka: "křivka", krizek: "křížek", krizove: "křížové", krouzek: "kroužek", kruhova: "kruhová", kulate: "kulaté",
  kulaty: "kulatý", kvetina: "květina", leva: "levá", lupa: "lupa", mala: "malá", mesic: "měsíc", mracek: "mráček", mrak: "mrak", mrk: "mrk", mysleni: "myšlení", nacrt: "náčrt", nahoru: "nahoru",
  neutral: "neutrál", nota: "nota", obdelnik: "obdélník", oblicejem: "obličejem", oblouk: "oblouk", ocaskem: "ocáskem", oddelovac: "oddělovač", odznak: "odznak", ohen: "oheň", oko: "oko",
  otaznik: "otazník", otevreny: "otevřený", otocka: "otočka", palec: "palec", pet: "pět", platku: "plátků", prvky: "prvky", plny: "plný", plus: "plus", podtrzeni: "podtržení", prava: "pravá", prekrizeny: "překřížený",
  prekvapeny: "překvapený", preskrtnuti: "přeškrtnutí", pul: "půl", raketa: "raketa", ramecek: "rámeček", rec: "řeč", rohy: "rohy", roh: "roh", rostlinka: "rostlinka", rovne: "rovně",
  roztreseny: "roztřesený", s: "s", se: "se", sedmikraska: "sedmikráska", sikmy: "šikmý", sipem: "šípem", sipka: "šipka", skok: "skok", slova: "slova", slovo: "slovo", sluncem: "sluncem",
  slunicko: "sluníčko", smajlik: "smajlík", smutny: "smutný", smycky: "smyčky", spirala: "spirála", spodni: "spodní", srafy: "šrafy", srdce: "srdce", stetcem: "štětcem", stitek: "štítek",
  stonkem: "stonkem", svih: "švih", tah: "tah", tahem: "tahem", tahy: "tahy", tecky: "tečky", trojice: "trojice", trojity: "trojitý", trpytka: "třpytka", trpytky: "třpytky", tulipan: "tulipán",
  usmev: "úsměv", velky: "velký", vlevo: "vlevo", vlnka: "vlnka", vlnovka: "vlnovka", volny: "volný", vpravo: "vpravo", vybarvene: "vybarvené", vykricnik: "vykřičník", vykricniky: "vykřičníky",
  x: "x", zaobleny: "zaoblený", zare: "záře", zarovka: "žárovka", zaskrtnuty: "zaškrtnutý", zatacka: "zatáčka", zavorka: "závorka", zavorky: "závorky", zakrouzkovani: "zakroužkování",
  zlomene: "zlomené", zuzujici: "zužující", zvonek: "zvonek", zvyrazneni: "zvýraznění", zvyraznovac: "zvýrazňovač", na: "na", k: "k", ok: "OK", u: "U", banner: "banner", asterisk: "hvězdička",
};
const GROUPS = {
  kvetina: "Květiny", smajlik: "Smajlíci", sipka: "Šipky", slunicko: "Slunce a mraky", mracek: "Slunce a mraky", hvezdicka: "Hvězdičky", srdce: "Srdce",
  podtrzeni: "Podtržení", zakrouzkovani: "Kroužky", krouzek: "Kroužky", zvyrazneni: "Zvýrazňovače", zvyraznovac: "Zvýrazňovače", preskrtnuti: "Přeškrtnutí",
  ramecek: "Rámečky", stitek: "Rámečky", zavorka: "Rámečky", bublina: "Bubliny", akcent: "Akcenty", oddelovac: "Oddělovače",
  fajfka: "Značky", krizek: "Značky", checkbox: "Značky", plus: "Značky", vykricnik: "Značky", otaznik: "Značky",
};
const NAMES = {
  "hvezdicka-6-cip-asterisk": "Hvězdička · šesticípá", "checkbox-zaskrtnuty": "Zaškrtnuté políčko", "krizek-x": "Křížek", "palec-nahoru-ok": "Palec nahoru",
  "klubko-scribble": "Klubko", "zvyrazneni-scribble": "Zvýraznění · čmáranice", "hrnek-kafe": "Hrnek kafe", "spirala-doodle": "Spirála", "stitek-banner": "Štítek",
  "sipka-15-s-krivka": "Šipka · esíčko",
  "cloud-upload": "Nahrát do cloudu", "globus-web": "Globus · web", "graf-rust": "Graf · růst", "hodnoceni-5-hvezd": "Hodnocení 5 hvězd", "horkovzdusny-balon": "Horkovzdušný balón",
  "kocici-hlava": "Kočičí hlava", "kurzor-klik": "Kurzor · klik", "like-srdce-bublina": "Like · srdce v bublině", "mince-kc": "Mince · Kč", "mince-stoh": "Mince · stoh",
  "nakupni-kosik": "Nákupní košík", "nakupni-taska": "Nákupní taška", "notifikace-1": "Notifikace", "ozubene-kolo": "Ozubené kolo", "paleta-barev": "Paleta barev",
  "papirova-vlastovka": "Papírová vlaštovka", "pes-hlava": "Pes · hlava", "pin-lokace": "Pin · místo", "podani-rukou": "Podání rukou", "prasatko-pokladnicka": "Prasátko pokladnička",
  "procenta-sleva": "Procenta · sleva", "qr-kod": "QR kód", "sklenice-vina": "Sklenice vína", "webova-stranka-wireframe": "Webová stránka · wireframe", "zavinac-email": "Zavináč · e-mail",
  "zdravotni-krizek": "Zdravotní křížek", "liska-01-logo-obrys": "Liška · obrys loga", "liska-02-logo-jednim-tahem": "Liška · logo jedním tahem", "liska-03-s-oblicejem": "Liška · s obličejem",
  "liska-04-v-kruhu": "Liška · v kruhu", "liska-05-hlava-mini-ikona": "Liška · malá ikona", "liska-06-sraf": "Liška · šrafovaná", "ufo": "UFO", "wifi": "Wi-Fi",
  "play": "Play · v kruhu", "play-trojuhelnik": "Play · trojúhelník", "pauza": "Pauza", "pauza-v-kruhu": "Pauza v kruhu", "stop": "Stop", "stop-v-kruhu": "Stop v kruhu",
  "pretocit-zpet": "Přetočit zpět", "pretocit-dopredu": "Přetočit dopředu", "dalsi-skladba": "Další skladba", "opakovat": "Opakovat", "nahodne-shuffle": "Náhodně",
  "prehravac-lista": "Lišta přehrávače", "reproduktor": "Reproduktor", "ztlumit": "Ztlumit", "kamera-video": "Videokamera", "kamera-retro": "Kamera · retro",
  "fotak-zrcadlovka": "Foťák · zrcadlovka", "fotak-polaroid": "Foťák · polaroid", "polaroid-fotka": "Polaroidová fotka", "obrazek": "Obrázek", "galerie": "Galerie",
  "klapka": "Filmová klapka", "filmovy-pas": "Filmový pás", "televize": "Televize", "video-okno": "Video okno", "nahravani-rec": "Nahrávání REC", "fullscreen": "Celá obrazovka",
  "design-bezier-krivka": "Bézierova křivka", "design-kostka-3d": "3D kostka", "design-kouzelna-hulka": "Kouzelná hůlka", "design-monitor": "Monitor",
  "design-mrizka-layout": "Mřížka layoutu", "design-mys-kurzor": "Myš", "design-orez-crop": "Ořez", "design-pero-hrot": "Pero · hrot", "design-pipeta": "Pipeta",
  "design-pravitko-tuzka": "Pravítko a tužka", "design-tablet-stylus": "Tablet se stylusem", "design-tvary": "Tvary", "design-typografie-aa": "Typografie Aa",
  "design-vrstvy": "Vrstvy", "design-vzorky-barev": "Vzorník barev", "lajk-palec-dolu": "Palec dolů", "oko-preskrtnute": "Oko · přeškrtnuté",
  "presypaci-hodiny": "Přesýpací hodiny", "stopky": "Stopky",
};
Object.assign(WORDS, {
  auto: "auto", avokado: "avokádo", balonek: "balónek", banan: "banán", bankovka: "bankovka", baterie: "baterie", batoh: "batoh", bryle: "brýle", burger: "burger", cenovka: "cenovka",
  chat: "chat", citron: "citron", croissant: "croissant", darek: "dárek", destnik: "deštník", diamant: "diamant", dokument: "dokument", donut: "donut", dort: "dort", duch: "duch",
  dum: "dům", fotoaparat: "fotoaparát", gamepad: "gamepad", hashtag: "hashtag", hodinky: "hodinky", hodiny: "hodiny", hory: "hory", houba: "houba", jablko: "jablko", kaktus: "kaktus",
  kalendar: "kalendář", klic: "klíč", kniha: "kniha", kod: "kód", koktejl: "koktejl", kolo: "kolo", kompas: "kompas", kostka: "kostka", kotva: "kotva", kriz: "kříž",
  ksiltovka: "kšiltovka", kufr: "kufr", kytara: "kytara", lahev: "láhev", laptop: "laptop", letadlo: "letadlo", list: "list", megafon: "megafon", meloun: "meloun", mikina: "mikina",
  mikrofon: "mikrofon", motyl: "motýl", muslicka: "mušlička", nuzky: "nůžky", obalka: "obálka", palma: "palma", penezenka: "peněženka", pirko: "pírko", pivo: "pivo", pizza: "pizza",
  plachetnice: "plachetnice", play: "play", pohar: "pohár", prohlizec: "prohlížeč", prsten: "prsten", ptacek: "ptáček", puzzle: "puzzle", responzivni: "responzivní", robot: "robot",
  rybka: "rybka", slozka: "složka", sluchatka: "sluchátka", snek: "šnek", sova: "sova", stahnout: "stáhnout", stan: "stan", stetec: "štětec", strom: "strom", svicka: "svíčka",
  telefon: "telefon", teniska: "teniska", terc: "terč", tlapka: "tlapka", tricko: "tričko", tuzka: "tužka", tym: "tým", uzivatel: "uživatel", vcela: "včela", vlajka: "vlajka",
  vlna: "vlna", vlocka: "vločka", zamek: "zámek", zmrzlina: "zmrzlina", zub: "zub", zvon: "zvon",
});
const words = (slug) => slug.split("-").filter((w) => !/^\d+$/.test(w)).map((w) => WORDS[w] || w);
function prettyName(slug) {
  if (NAMES[slug]) return NAMES[slug];
  const parts = words(slug);
  const number = (slug.match(/-(\d+)(?:-|$)/) || [])[1];
  const head = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : slug;
  const rest = parts.slice(1).join(" ");
  return rest ? `${head} · ${rest}` : number && Number(number) > 1 ? `${head} ${Number(number)}` : head;
}
const groupOf = (slug, packId) => GROUPS[slug.split("-")[0]] || (packId.startsWith("dirty-enough") ? "Symboly" : "Ikony");
const ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "prvek";
/** A file named like a sentence ("Šipka doprava.svg") keeps its wording; a slug ("sipka-05-doprava") is prettified. */
const nameOf = (base) => (/[\s\u00C0-\u024F]/.test(base) ? base.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase()) : prettyName(base));
/** Subfolders are groups; a leading number ("01 Šipky") only sets their order. */
const groupLabel = (folder) => nameOf(folder.replace(/^\d+[\s._-]+/, ""));

function sanitize(svgInner) {
  return svgInner
    .replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->/gi, "")
    .replace(/<(script|foreignObject|title|desc|metadata)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/\s(fill|stroke)="(?!none|currentColor|url\(|transparent)[^"]*"/gi, ' $1="currentColor"')
    .replace(/(fill|stroke)\s*:\s*(?!none|currentColor|url\(|transparent)[^;"']+/gi, "$1:currentColor")
    .trim();
}
const KEEP_ROOT = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "fill-rule", "clip-rule", "style"];
function iconFromSvg(text) {
  const root = text.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!root) return null;
  const attr = (name) => (root[1].match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i")) || [])[1];
  const inner = sanitize(root[2]);
  const shapes = inner.match(/<(path|circle|ellipse|rect|line|polyline|polygon|use|image|text)\b/gi) || [];
  if (!shapes.length) return null;
  let vb = (attr("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) vb = [0, 0, parseFloat(attr("width")) || 24, parseFloat(attr("height")) || 24];
  const stroked = /\sstroke="(?!none)/i.test(root[1] + inner) || /stroke\s*:\s*(?!none)/i.test(root[1] + inner);
  const pathsOnly = shapes.every((s) => s.toLowerCase() === "<path") && !/\stransform=/i.test(inner) && !stroked;
  if (pathsOnly) {
    const paths = [...inner.matchAll(/<path\b([^>]*?)\/?>/g)].map((m) => m[1]);
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const attrs of paths) {
      const b = pathBox((attrs.match(/\sd="([^"]*)"/) || [])[1] || "");
      box.x0 = Math.min(box.x0, b.x0); box.y0 = Math.min(box.y0, b.y0);
      box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1);
    }
    if (Number.isFinite(box.x0) && box.x1 > box.x0 && box.y1 > box.y0) {
      const pad = Math.max(1, Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.02);
      const crop = [box.x0 - pad, box.y0 - pad, box.x1 - box.x0 + pad * 2, box.y1 - box.y0 + pad * 2];
      const body = paths.map((attrs) => `<path${attrs.replace(/\sfill="[^"]*"/, "")} fill="currentColor"/>`).join("");
      const rule = attr("fill-rule") ? ` fill-rule="${attr("fill-rule")}"` : "";
      return { vb: crop, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.map(fmt).join(" ")}" width="${fmt(crop[2])}" height="${fmt(crop[3])}"${rule}>${body}</svg>\n` };
    }
  }
  const keep = KEEP_ROOT.map((n) => [n, attr(n)]).filter(([, v]) => v !== undefined).map(([n, v]) => ` ${n}="${sanitize(` ${n}="${v}"`).match(/="([^"]*)"/)[1]}"`).join("");
  const xlink = /xlink:/.test(inner) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : "";
  return { vb, svg: `<svg xmlns="http://www.w3.org/2000/svg"${xlink} viewBox="${vb.map(fmt).join(" ")}" width="${fmt(vb[2])}" height="${fmt(vb[3])}"${keep}>${inner}</svg>\n` };
}
function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(dir, entry.name))) out.push({ file: path.join(dir, entry.name, f), group: entry.name });
    } else out.push({ file: path.join(dir, entry.name), group: null });
  }
  const other = out.filter((f) => /\.(jpe?g|webp|gif|avif|bmp)$/i.test(f.file));
  if (other.length) console.warn(`Přeskočeno (umím jen SVG a PNG s průhledným pozadím): ${other.map((f) => path.basename(f.file)).join(", ")}`);
  return out.filter((f) => /\.(svg|png)$/i.test(f.file)).sort((a, b) => a.file.localeCompare(b.file));
}

/** Bounding box of every coordinate in the path data (control points included, which is close enough for a crop). */
function pathBox(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = "M", i = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (px, py) => {
    box.x0 = Math.min(box.x0, px); box.y0 = Math.min(box.y0, py);
    box.x1 = Math.max(box.x1, px); box.y1 = Math.max(box.y1, py);
  };
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") { x = sx; y = sy; continue; }
    const pairs = { M: 1, L: 1, T: 1, C: 3, S: 2, Q: 2 }[C];
    if (pairs) {
      let px = x, py = y;
      for (let k = 0; k < pairs; k++) {
        px = n() + (rel ? x : 0);
        py = n() + (rel ? y : 0);
        add(px, py);
      }
      x = px; y = py;
      if (C === "M") { sx = x; sy = y; cmd = rel ? "l" : "L"; }
    } else if (C === "H") { x = n() + (rel ? x : 0); add(x, y); }
    else if (C === "V") { y = n() + (rel ? y : 0); add(x, y); }
    else if (C === "A") { i += 5; x = n() + (rel ? x : 0); y = n() + (rel ? y : 0); add(x, y); }
    else i++;
  }
  return box;
}
const fmt = (v) => String(Math.round(v * 10) / 10);

const manifestPath = path.join(outDir, "prvky.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { name: "Knihovna prvků", packs: [] };
fs.mkdirSync(outDir, { recursive: true });

for (const spec of specs) {
  const [id, src] = spec.split("=");
  if (!/^[a-z0-9-]+$/.test(id || "") || !src) throw new Error(`Bad pack "${spec}", use id=folder`);
  const dir = fs.existsSync(path.join(src, "svg")) ? path.join(src, "svg") : src;
  const files = listFiles(dir);
  fs.rmSync(path.join(outDir, id), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, id), { recursive: true });
  const items = [];
  const used = new Set();
  const skipped = [];
  for (const { file, group } of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, path.extname(file));
    let slug = ascii(base);
    while (used.has(slug)) slug += "-2";
    const label = group ? groupLabel(group) : groupOf(slug, id);
    const rel = group ? `${ascii(label)}/${slug}${ext}` : `${slug}${ext}`;
    fs.mkdirSync(path.dirname(path.join(outDir, id, rel)), { recursive: true });
    let size;
    if (ext === ".svg") {
      const icon = iconFromSvg(fs.readFileSync(file, "utf8"));
      if (!icon) {
        skipped.push(path.basename(file));
        continue;
      }
      fs.writeFileSync(path.join(outDir, id, rel), icon.svg);
      size = [icon.vb[2], icon.vb[3]];
    } else {
      const buf = fs.readFileSync(file);
      size = pngSize(buf);
      if (!size) {
        skipped.push(path.basename(file));
        continue;
      }
      fs.writeFileSync(path.join(outDir, id, rel), buf);
    }
    used.add(slug);
    items.push({ id: `${id}/${slug}`, name: nameOf(base), group: label, src: `${id}/${rel}`, w: Math.round(size[0] * 10) / 10, h: Math.round(size[1] * 10) / 10 });
  }
  if (skipped.length) console.warn(`${id}: přeskočeno (žádný tvar nebo vadný soubor): ${skipped.join(", ")}`);
  const rest = id.replace(/^dirty-enough-?/, "").split("-").map((w) => WORDS[w] || w).join(" ");
  const name = id.startsWith("dirty-enough") ? `Dirty Enough${rest ? " · " + rest : ""}` : rest.replace(/^./, (c) => c.toUpperCase());  const pack = { id, name, items };
  const at = manifest.packs.findIndex((p) => p.id === id);
  if (at >= 0) manifest.packs[at] = pack;
  else manifest.packs.push(pack);
  console.log(`${id}: ${items.length} prvků`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(`${manifestPath}: ${manifest.packs.reduce((n, p) => n + p.items.length, 0)} prvků v ${manifest.packs.length} sadách`);
