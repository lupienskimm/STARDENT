---
name: creatool-instalace
description: Přidá do webového projektu vizuální editor Azervera CREATOOL (made by lupienskim) pro úpravu textů, písem, rozměrů, tvarů, vzhledu, akcí, animací, přidávání textu a kreseb z knihovny přímo na webu s exportem změn do JSON. Editor se při načtení nenačítá. Zapíná ho tlačítko CREATOOL úplně dole vpravo ve footeru. Otázka na export písem čeká na zapnutí editoru.
disable-model-invocation: true
---

# Instalace Azervera CREATOOL

Přidej do tohoto projektu vizuální editor **Azervera CREATOOL** (made by lupienskim). Slouží mně: přímo na webu upravím texty, písma, rozměry, tvary, vzhled, přidám nebo smažu prvky, přidám text a kresby z knihovny, nastavím akce a animace. Změny stáhnu jako JSON a ten pak zapíšeme do kódu.

## Krok 0: najdi balíček

Balíček je složka `azervera-creatool/` v kořeni projektu. Obsahuje:
- `creatool.js` (samotný editor),
- `prvky/` (knihovna Dirty Enough: 304 kreseb ve 26 kategoriích),
- `knihovna.mjs` (převod složky ikonek na knihovnu),
- `sablony/` (zapnutí ve footeru `creatool-zapnuti.js` a registr akcí),
- `meritko/` (stabilní měřítko: web vypadá na každém telefonu, tabletu i v okně počítače jako náhled v editoru),
- `moje-ikonky/` a `moje-fonty/` (co mi uživatel přidal),
- `ukazka/`, `README.md` a `ZACNI-TADY.md`.

Když složka chybí, ale vedle tohoto `SKILL.md` leží `creatool.js` (obvykle `~/.cursor/skills/creatool-instalace/`), řekni mi, že pro knihovnu kreseb, šablonu tlačítka a převod ikonek potřebuješ celou složku z `azervera-creatool.zip`. Zeptej se, jestli ji dodám, nebo jestli stačí samotný editor.

## Krok 1: prozkoumej projekt (zatím nic neměň)

Zjisti:
- framework a jeho složku statických souborů (`public/`, `static/`, `src/assets/`…),
- kde jsou hlavička, menu (i burger menu) a patička,
- obal obsahu stránek (`<main>` nebo jiný),
- breakpointy,
- z-index fixní hlavičky,
- barvy webu jako CSS proměnné na `:root`,
- načtená písma,
- navigaci (seznam stránek),
- jestli web neposílá X-Frame-Options nebo CSP frame-ancestors, které by zablokovaly náhled Tablet a Mobil,
- co je ve složkách `azervera-creatool/moje-ikonky/` a `azervera-creatool/moje-fonty/` (počet souborů, formáty),
- pro stabilní měřítko: jestli web používá PostCSS, kde jsou `vw` a `vh` (i v inline stylech), media queries uvnitř rozsahu počítače (1025–1439 px, Tailwind `xl:` a `2xl:`), podmínky podle výšky (`max-height`) a kód, který měří stránku (`getBoundingClientRect`, `offsetTop`, framer-motion `useScroll`).

## Krok 2: zeptej se (a počkej na odpovědi)

Než cokoliv změníš, polož mi tyto otázky najednou, v jedné zprávě. U každé napiš svůj doporučený návrh podle toho, co jsi v projektu našel, abych mohl jen potvrdit. **Dokud neodpovím, nic neimplementuj.**

1. **Knihovna kreseb:**
   - přidat sadu Dirty Enough (304 ručně kreslených kreseb: šipky, kroužky, podtržení, zvýrazňovače, smajlíci, design, foto a video, přehrávač, jídlo, web, cestování…)?
   - převést moje ikonky z `moje-ikonky/`? Napiš, kolik jich tam je a v jakém formátu. Když je prázdná, řekni mi, že je tam můžu dát i později.
2. **Barvy pro kresby a přidaný text:** navrhni 3 (až 5) barev z CSS proměnných webu, s názvy (například Černá, Oranžová, Bílá). Když web proměnné nemá, navrhni barvy z jeho CSS.
3. **Fonty z `moje-fonty/`** (jen když tam něco je): přidat? Mají být jen k dispozici v editoru, nebo je rovnou použít na webu, a kde?
4. **Stránky pro akci „Odkaz na stránku“:** navrhni seznam z navigace.
5. **Registr akcí a animací** (co vytvoříme slovy, půjde příště vybrat ze seznamu): vytvořit? Doporuč ano.
6. **Technické** (navrhni sám, stačí mi potvrdit): obal obsahu (`mainSelector`), breakpointy, `addedLayerZ` pod z-index hlavičky, `storageKey` podle názvu projektu.
7. **Měřítko:** V1, nebo V2? Dokud neodpovím, měřítko neinstaluj a už nasazené měřítko neměň.
   - **V1** (`meritko/v1/`): původní měřítko beze změny. Počítač má návrh 1440 px. Okno 1025–1439 px se na něj zmenší. Od 1440 px výš se stránka nemění. Tohle nech na webech, které V1 už mají. Složku `meritko/v1/` nepřepisuj.
   - **V2** (`meritko/v2/`): měřítko z Meum Dens. Návštěvník dostane nejbližší z 1280, 1440 a 1920 px v přesné velikosti. Širší okno ji nezvětšuje, užší ji zmenší. Okno užší než 500 px je telefon, i když obrazovka hlásí větší šířku. Šířka sloupce se nastaví ještě před prvním vykreslením.
   - Tlačítka 1280, 1440 a 1920 v editoru jsou vždy, u obou měřítek. Nejsou to volba V1/V2.
   - Když web už měřítko má, poznej verzi podle skriptu a doporuč tu samou. V1 na V2 nepřepínej, dokud to výslovně neřeknu.
   - Kopíruj jen soubory z `meritko/v1/` nebo `meritko/v2/`. Soubor `meritko/creatool-meritko.js` je kopie V2 pro ukázku v balíčku; na cizí web ho sám nedávej.

Na zapínání editoru se neptej. Při načtení stránky se CREATOOL nenačítá a nezobrazuje. Zapínání je tlačítko **CREATOOL** úplně dole ve footeru, u pravého kraje obrazovky. Kliknutí teprve načte `creatool.js` a editor ukáže. Otázka na export písem a barev se při načtení stránky neukáže. Objeví se až se zapnutým editorem a se skrytím zase zmizí, dokud na ni není odpověď.

## Krok 3: implementuj podle odpovědí

1. **Editor:** zkopíruj `azervera-creatool/creatool.js` BEZE ZMĚN do statické složky, aby byl na adrese `/creatool.js`:
   - Next.js, Vite, Astro, Remix, Nuxt: `public/creatool.js`
   - SvelteKit: `static/creatool.js`
   - Angular: `src/assets/creatool.js` (adresa `/assets/creatool.js`)
   - čisté HTML: vedle `index.html`
2. **Načítání** (vždy): `creatool.js` do HTML nevkládej. Při načtení stránky se nesmí stáhnout. `window.CreatoolConfig` na stránce být může, skript ne. Načtení dělá `sablony/creatool-zapnuti.js` až po kliknutí na tlačítko ve footeru.
3. **Nastavení** `window.CreatoolConfig` vlož na stránku (inline skript, bez `creatool.js`):
   - `startHidden: true`, `forceHidden: true`, `hiddenPill: false`,
   - `storageKey`, `siteName`, `mainSelector`, `breakpoints`, `pages`, `registryUrl`,
   - `libraryUrl: "/creatool/prvky/prvky.json"` (jen s knihovnou), `artColors: [{ name, value }]` (value klidně `"token:jmeno-promenne"`), `addedLayerZ`.

   Co není potřeba, vynech. Ty tři příznaky zapnutí nevynechávej.
4. **Tlačítko** (vždy, na každé stránce): poslední prvek footeru, úplně dole, u pravého kraje obrazovky. Text je `CREATOOL`. Footer je na celou šířku okna; když je patička zároveň sloupcem obsahu, obsah nech ve sloupci a tlačítko dej až za něj. Přidej `azervera-creatool/sablony/creatool-zapnuti.js` a CSS z jeho hlavičky. U Next.js a podobně nastav `data-creatool-src="/creatool.js"`. Pilulku v rohu, tlačítko v menu ani skript při startu stránky nepoužívej.
5. **Knihovna kreseb:**
   - Dirty Enough: zkopíruj celý obsah `azervera-creatool/prvky/` do `<statická složka>/creatool/prvky/`.
   - Moje ikonky: spusť `node azervera-creatool/knihovna.mjs <statická složka>/creatool/prvky moje-ikonky=azervera-creatool/moje-ikonky`. Až po zkopírování Dirty Enough, aby se sady spojily v jednom `prvky.json`. Vypiš, kolik ikonek prošlo a které se přeskočily a proč.
6. **Fonty:**
   - zkopíruj je do `<statická složka>/fonts/` a přidej `@font-face` (`font-display: swap`, správné `font-weight` a `font-style` podle řezu) do globálního CSS,
   - název rodiny odvoď z názvu souboru a nejasnosti si ověř se mnou,
   - na webu je použij jen tam, kde jsem řekl. V editoru se objeví samy.
7. **Registr:** zkopíruj `azervera-creatool/sablony/creatool.registry.json` do `<statická složka>/creatool.registry.json`.
8. **Náhled zařízení:** když web posílá X-Frame-Options: DENY nebo CSP frame-ancestors 'none', povol tam, kde editor běží, `'self'`.
9. **Stabilní měřítko** (až po odpovědi na otázku 7): otevři `PRO-AGENTA.md` ve složce `meritko/v1/` nebo `meritko/v2/`, podle toho, co jsem zvolil, a postupuj podle něj. Měřítko běží na webu i když se editor nenačítá. Když jsem neodpověděl, tenhle krok přeskoč a měřítko nesahej. Už nasazené V1 nenahrazuj za V2.

**Pravidla:**
- Nic dalšího na webu neměň (kromě zapnutí ve footeru a úprav pro stabilní měřítko podle `meritko/README.md`) a `creatool.js` neupravuj.
- Složku `azervera-creatool/` nech v projektu: je v ní `knihovna.mjs` pro další ikonky a návody.

## Krok 4: ověř a napiš mi výsledek

Ověř:
- po načtení stránky se `creatool.js` nestáhne a otázka na export písem se neukáže,
- tlačítko **CREATOOL** je úplně dole ve footeru u pravého kraje obrazovky, kliknutí editor zapne (lišta vlevo dole) a teprve potom se může ukázat otázka na písma, další kliknutí editor i otázku schová,
- **+ Přidat** ukáže knihovnu se sadami a barvami, jaké jsem chtěl, a nahoře **Nahrát GLB** (3D model se přidá kliknutím na stránku; jde ho i přetáhnout),
- lišta a panel jsou zbarvené podle barev webu,
- nové fonty jsou v seznamu písem u textu,
- **Mobil** ukáže stránku v šířce 390 px,
- lišta má tlačítka 1280, 1440 a 1920 a zvolená šířka se ukáže v přesných pixelech,
- měřítko sedí s verzí, kterou jsem zvolil: u V1 okno 1100 px vypadá jako 1440 px zmenšené a od 1440 px se web nemění; u V2 okno 1100 px vypadá jako 1280 px zmenšené, přesně na 1280, 1440 a 1920 px je web beze změny a širší okno zvolenou šířku nezvětšuje,
- nic nepřetéká do strany,
- při kliknutí na jinou stránku se nic neposune, ani na šířkách mezi 1280, 1440 a 1920 px (třeba 1300, 1536, 1700): sloupec je uprostřed hned od prvního vykreslení a menu ani obsah neuskočí,
- v konzoli nejsou chyby (ani hydratační),
- HTML na `creatool.js` neodkazuje. Skript se stáhne až po kliknutí na tlačítko ve footeru.

Napiš mi krátce:
- že tlačítko **CREATOOL** je úplně dole ve footeru u pravého kraje a že jím editor otevřu i schovám,
- kam dám další ikonky: `azervera-creatool/moje-ikonky/` a věta „Přidej ikonky z azervera-creatool/moje-ikonky do knihovny CREATOOL“,
- jak zapíšu změny do kódu: **Stáhnout export**, pak nový chat, `/creatool-zapsat` nebo `azervera-creatool/prompty/2-zapsani-zmen.md`, a přetáhnout export,
- že editor se při načtení nespouští a otázka na písma čeká na jeho zapnutí.
