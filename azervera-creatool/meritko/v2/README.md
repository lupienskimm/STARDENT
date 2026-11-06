# Stabilní měřítko

Agent začíná souborem `PRO-AGENTA.md`. Cesty `azervera-creatool/meritko/` níže znamenají tuhle složku.

**Azervera CREATOOL, made by lupienskim**

Co v CREATOOLu navrhneš, platí přesně v náhledových šířkách: **mobil 390 px, tablet 768 px, počítač 1280, 1440 a 1920 px**. Editor zapisuje polohy a velikosti v pixelech. Bez stabilního měřítka se proto kresby a poznámky rozjedou na každém telefonu, který není široký přesně 390 px (iPhone 17 Pro Max má 440 px), a v každém okně počítače, které není na celou obrazovku.

Stabilní měřítko drží každou obrazovku na jedné z náhledových šířek:

| Obrazovka | Stránka se rozvrhne na | A pak |
| --- | --- | --- |
| Telefon na výšku | 390 px | prohlížeč ji zvětší nebo zmenší na displej |
| Telefon na šířku, tablet | 768 px | totéž |
| Okno od 1025 px | nejbližší z 1280, 1440 a 1920 px | přesná velikost uprostřed; užší okno ji zmenší, širší ji nezvětšuje |
| Okno 768–1024 px | 768 px | zvětší se |
| Okno pod 768 px | 390 px | zvětší se |
| Přesně 1280, 1440 nebo 1920 px | ta šířka | beze změny |

Web na telefonu a tabletu vypadá jako náhled, jen větší nebo menší. Na počítači je nejbližší ze tří šířek v přesné velikosti; zmenší se, jen když je okno užší. Okno užší než 500 px je telefon, i když obrazovka hlásí větší šířku. Šířka sloupce se nastaví ještě před prvním vykreslením.

## Co je ve složce

| Soubor | K čemu je |
| --- | --- |
| `creatool-meritko.js` | Skript, který měřítko nastavuje. Musí běžet před prvním vykreslením. |
| `creatool-meritko.ts` | Totéž pro React a Next.js (`creatoolMeritko()` a `creatoolZoom()`), generuje ho `build.mjs`. |
| `postcss-zoom-units.cjs` | PostCSS plugin: `vw` a `vh` v CSS převede na `calc(var(--vw, 1vw) * n)`. |
| `prevest-jednotky.mjs` | Totéž pro weby bez PostCSS: přepíše obyčejné CSS soubory. |

## Proč se převádí `vw` a `vh`

CSS `zoom` zmenší všechno, i jednotky podle okna. Nadpis zadaný jako `7vw` by se v užším okně zmenšil dvakrát: jednou kvůli užšímu oknu, podruhé kvůli zoomu. Proto se každé `vw` a `vh` převede na proměnnou s tou samou výchozí hodnotou. Dokud zoom neběží, je `var(--vw, 1vw)` totéž co `1vw`. Když zoom běží, skript do `--vw` a `--vh` dá hodnoty náhledové šířky, takže všechno sedí.

## Instalace (pro agenta)

1. **Skript před prvním vykreslením**, nikdy `async` ani `defer`:
   - **Next.js (App Router):** zkopíruj `creatool-meritko.ts` do `lib/`. Do kořenového layoutu jako první v `<body>` dej `<script dangerouslySetInnerHTML={{ __html: creatoolMeritko() }} />`. Když má web vlastní stránku 404 s `<html>`, patří tam taky.
   - **Next.js (Pages Router):** totéž v `pages/_document.tsx` v `<Head>`.
   - **Vite, čisté HTML:** do `<head>` hned za `<meta name="viewport">` vlož obsah `creatool-meritko.js` jako inline `<script>`. Jednodušší varianta je zkopírovat soubor do statické složky a dát `<script src="/creatool-meritko.js"></script>` (synchronně, bez `defer`).
   - **Astro:** `<script is:inline>` s obsahem souboru v `<head>` layoutu.
   - **SvelteKit:** inline `<script>` v `src/app.html` v `<head>`.
   - **Nuxt:** `app.head.script` s `innerHTML` a `tagPosition: "head"`.
2. **Nastavení** jen tehdy, když web používá jiné šířky nebo breakpointy než CREATOOL: `window.CreatoolFit = { phone: 390, tablet: 768, desktop: 1440, desktopFrom: 1025 }` před skriptem, v Next.js `creatoolMeritko({ ... })`. Hodnoty musí sedět s `previewWidths` a `breakpoints` v `CreatoolConfig`. Barvu kolem sloupce na počítači skript převezme z pozadí `html`, takže stránka při načítání neproblikne bíle. Když web pozadí na `html` nemá, dej mu ho v `<head>` (`<style>html{background:#…}</style>`) nebo nastav `background: "#…"`.
3. **Převod `vw` a `vh`:**
   - **S PostCSS** (Next.js, Vite, Astro, Nuxt, SvelteKit, Tailwind): zkopíruj `postcss-zoom-units.cjs` do projektu, třeba do `tools/`, a přidej ho do konfigurace PostCSS **za** Tailwind: `plugins: { tailwindcss: {}, "./tools/postcss-zoom-units.cjs": {} }`.
   - **Bez PostCSS:** `node azervera-creatool/meritko/prevest-jednotky.mjs css/style.css …` přepíše soubory na místě. Opakované spuštění nevadí.
   - **Inline styly v komponentách** s `vw` nebo `vh` (třeba `style={{ height: "100vh" }}`) plugin nevidí. Převeď je ručně na `calc(var(--vh, 1vh) * 100)`. Atribut `sizes` u obrázků se nemění.
4. **Media queries** vidí skutečnou šířku okna, takže pořád vybírají správné rozložení. Pravidla, která dolaďují šířky **uvnitř** rozsahu počítače (třeba `@media (max-width: 1280px)` nebo `(min-width: 1025px) and (max-width: 1439px)`), už nejsou potřeba. Okno počítače ukazuje nejbližší z 1280, 1440 a 1920 px, takže je sjednoť s rozsahem počítače (od `desktopFrom`). Totéž platí pro Tailwind `xl:` a `2xl:`: nahraď je `min-[1025px]:`. Pravidla pro tablet a mobil zůstávají. Když se má něco lišit mezi rozloženími 1280, 1440 a 1920 (třeba menší písmo v menu), napiš to přes `html[data-pc="1280"]`, `html[data-pc="1440"]` a `html[data-pc="1920"]`, ne přes `max-width`. Okno 1300 px ukazuje sloupec 1280, ale `@media (max-width: 1280px)` v něm neplatí, takže by se pravidlo minulo se sloupcem a třeba menu by vjelo do loga.
5. **Podmínky podle výšky** (`@media (max-height: …)`, `matchMedia("(max-height: …)")`) by v zoomu počítaly se skutečnou výškou místo výšky rozvržení. Nastav `short: <px>` a místo media query použij `html[data-short]`. V komponentě čti atribut `data-short`, na jeho změnu reaguj přes `MutationObserver`.
6. **Vlastní kód, který měří stránku** (vyhledej `getBoundingClientRect`, `offsetTop`, `offsetHeight`, `useScroll`):
   - **Poloha z `getBoundingClientRect()` zapisovaná zpátky do CSS** (třeba `translate` v px) se musí vydělit zoomem: `creatoolZoom()` nebo `window.CreatoolFit.zoom()`.
   - **`offsetTop`, `offsetHeight` a `offsetWidth`** vracejí hodnoty rozvržení bez zoomu, kdežto `scrollY`, `innerHeight` a `getBoundingClientRect()` jsou zmenšené. Nemíchej je a počítej všechno z `getBoundingClientRect()`.
   - **framer-motion `useScroll({ target })`** počítá z `offsetTop`, takže v zoomu běží ve špatnou chvíli. Postup skrolování spočítej z `getBoundingClientRect()` při scrollu. Pro rozsah `["start start", "end end"]` platí `progress = -box.top / (box.height - innerHeight)`.
   - **Poměry** (poloha kurzoru vůči prvku, posuvníky) fungují beze změny.
7. **Formulářová pole:** když je stránka zmenšená pod 100 % (`html[data-fit-small]`), dej polím písmo aspoň 17 px, jinak je iPhone při psaní přiblíží: `html[data-fit-small] :is(input, select, textarea) { font-size: 17px; }`.
8. **iOS:** do globálního CSS dej `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }`.

## Jak ověřit

- **Okno 1100 px** vypadá jako 1280 px zmenšené: stejné zalomení textu a kresby na svých místech.
- **Emulace iPhonu 17 Pro Max** (440 px, dotyk) má `innerWidth` 390 a vypadá jako náhled Mobil. **Na šířku** má 768.
- **Přesně na 1280, 1440 a 1920 px** je web beze změny. Užší okno nejbližší šířku zmenší, včetně prvků umístěných v pixelech. Širší okno ji nechá uprostřed v přesné velikosti.
- **Tlačítka 1280, 1440 a 1920** v liště ukážou tu šířku v přesných pixelech, dokud je editor otevřený.
- **Nic nejezdí do strany** (`scrollWidth` není větší než `innerWidth`).
- **Otevřený CREATOOL** drží zvolenou šířku v přesných pixelech. Po skrytí editoru se vrátí měřítko pro návštěvníka.
- **Produkční CSS** neobsahuje holé `vw` ani `vh` v hodnotách, kromě výchozích hodnot uvnitř `var(--vw, 1vw)`.
