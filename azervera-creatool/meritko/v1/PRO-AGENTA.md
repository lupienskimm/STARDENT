# Úkol: nasaď stabilní měřítko

Tenhle zip je kompletní. CREATOOL ani původní web nepotřebuješ. Nejdřív si přečti tenhle soubor, potom `README.md`, a teprve potom upravuj projekt.

## Co to dělá

Každá obrazovka se nejdřív rozvrhne přesně na jednu návrhovou šířku a teprve potom se zvětší nebo zmenší. Rukou umístěné pixely se proto nepřeskupí, když má telefon jinou šířku než návrh, nebo když je okno počítače užší než 1440 px.

| Obrazovka | Stránka se rozvrhne na | A pak |
| --- | --- | --- |
| Telefon na výšku | 390 px | prohlížeč ji přizpůsobí displeji |
| Telefon na šířku, tablet | 768 px | totéž |
| Okno 1025–1439 px | 1440 px | CSS `zoom` dolů |
| Okno 768–1024 px | 768 px | CSS `zoom` |
| Okno pod 768 px | 390 px | CSS `zoom` |
| 1440 px a víc | beze změny | — |

Telefon a tablet: skript přepíše `<meta name="viewport">` na pevnou šířku. Počítač viewport ignoruje, takže tam skript nastaví `zoom`. Media queries pořád vidí skutečnou šířku okna a vybírají rozložení.

Výchozí šířky: telefon 390, tablet 768, počítač od 1025, návrh počítače 1440. Když tenhle projekt kreslí na jiné šířky, nastav je v `window.CreatoolFit` (nebo v `creatoolMeritko({ ... })`) tak, aby seděly s jeho breakpointy. Jinak nech výchozí.

## Soubory v tomhle zipu

| Soubor | Kam s ním |
| --- | --- |
| `creatool-meritko.js` | Samotný skript. Inline do `<head>` hned za viewport, nebo jako první věc v `<body>`. Nikdy `async` ani `defer`. |
| `creatool-meritko.ts` | Totéž pro React a Next.js: `creatoolMeritko()` a `creatoolZoom()`. |
| `postcss-zoom-units.cjs` | PostCSS plugin. Zkopíruj ho (třeba do `tools/`) a zapoj **za** Tailwind. |
| `prevest-jednotky.mjs` | Pro projekt bez PostCSS. Nech ho ve stejné složce jako `postcss-zoom-units.cjs` a spusť na CSS soubory. |
| `doplnky.css` | Dvě pravidla do globálního CSS. Vlož je, nepřepisuj jimi zbytek stylů. |
| `README.md` | Podrobný návod. Cesty `azervera-creatool/meritko/` v něm znamenají tuhle složku. |

## Postup

1. Zjisti, čím je projekt postavený (Next.js App Router, Pages Router, Vite, Astro, SvelteKit, Nuxt, nebo čisté HTML) a jestli má PostCSS.
2. Skript musí běžet před prvním vykreslením.
   - **Next.js App Router:** zkopíruj `creatool-meritko.ts` do `lib/`. Do kořenového layoutu jako první dítě `<body>` dej `<script dangerouslySetInnerHTML={{ __html: creatoolMeritko() }} />`. Když má 404 vlastní `<html>`, patří tam taky.
   - **Next.js Pages Router:** totéž v `pages/_document.tsx` v `<Head>`.
   - **Vite nebo čisté HTML:** obsah `creatool-meritko.js` jako inline `<script>` v `<head>` hned za `<meta name="viewport">`.
   - **Astro:** `<script is:inline>` s obsahem souboru v `<head>` layoutu.
   - **SvelteKit:** inline `<script>` v `src/app.html` v `<head>`.
   - **Nuxt:** `app.head.script` s `innerHTML` a `tagPosition: "head"`.
3. Zapoj převod `vw` a `vh`.
   - **S PostCSS:** `plugins: { tailwindcss: {}, "./tools/postcss-zoom-units.cjs": {} }`. Plugin musí být až za Tailwind.
   - **Bez PostCSS:** `node prevest-jednotky.mjs cesta/ke/stylu.css` (další soubory za mezerou). Přepisuje na místě a jde spustit znovu.
   - **Inline styly**, které plugin nevidí (`style={{ height: "100vh" }}`), převeď ručně na `calc(var(--vh, 1vh) * 100)`. Atribut `sizes` u obrázků neměň.
4. Vlož obsah `doplnky.css` do globálního CSS.
5. Projdi CSS podle bodů 4 a 5 v `README.md`. Media query, které dolaďují šířky uvnitř rozsahu počítače (`max-width: 1280px`, Tailwind `xl:` a `2xl:`), sjednoť s rozsahem od `desktopFrom` (1025). Pravidla pro tablet a mobil nech. Podmínky podle výšky (`max-height`) nahraď `html[data-short]`: před skript nastav `short` (na původním webu 700) a v komponentě čti atribut `data-short`.
6. Vyhledej `getBoundingClientRect`, `offsetTop`, `offsetHeight`, `offsetWidth` a `useScroll`.
   - Polohu z `getBoundingClientRect()`, kterou zapisuješ zpátky do CSS, vyděl `creatoolZoom()` nebo `window.CreatoolFit.zoom()`.
   - `offsetTop`, `offsetHeight` a `offsetWidth` jsou bez zoomu. `scrollY`, `innerHeight` a `getBoundingClientRect()` jsou zmenšené. Nemíchej je. Počítej z `getBoundingClientRect()`.
   - `useScroll({ target })` z framer-motion v zoomu běží ve špatnou chvíli. Postup skrolování počítej z `getBoundingClientRect()`. Pro rozsah `["start start", "end end"]` platí `progress = -box.top / (box.height - innerHeight)`.
   - Poměry (kurzor vůči prvku, posuvníky) nech.

## Čemu se vyhnout

- Nepiš `calc(Npx * 100cqi / ref)`. Jsou to dvě délky a prohlížeč takové pravidlo zahodí. Kresby piš v px na návrhové šířce.
- Nenačítej skript s `async` nebo `defer`.
- Nepřidávej editor CREATOOL. Tenhle zip je jen měřítko.
- Neměň vzhled, texty ani rozložení návrhu. Mění se jen to, na jaké šířce se stránka skládá a jak se pak zmenší.

## Ověření

- Okno 1100 px vypadá jako návrh 1440 px zmenšený asi na 76 %: stejné zalomení, kresby na svých místech.
- Emulace telefonu širšího než 390 (třeba 440 px, zapnutý dotyk) má `innerWidth` 390. Na šířku má 768.
- Při 1440 px a víc je stránka beze změny, `html` nemá `data-zoom`.
- `document.documentElement.scrollWidth` není větší než `innerWidth`.
- Ve výsledném CSS nejsou holé `vw` ani `vh` v hodnotách, kromě výchozí hodnoty uvnitř `var(--vw, 1vw)` a `var(--vh, 1vh)`.
