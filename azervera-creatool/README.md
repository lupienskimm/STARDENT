# Azervera CREATOOL 4.7.2

**made by lupienskim**

> **Nový projekt? Začni souborem [`ZACNI-TADY.md`](ZACNI-TADY.md):** kam dát složku, ikonky a fonty, co napsat agentovi a na co se tě zeptá.

Vizuální editor, který připojíš k jakémukoliv webu. Přímo na stránce upravíš texty, písma, rozměry, tvary, barvy, efekty, akce a animace, přidáš kresby z knihovny, text nebo 3D model (GLB), nebo kresbou nahradíš existující prvky. Lišta a panel se samy zbarví podle barev webu. Všechno se ukládá jako data v prohlížeči a stáhne se jako jeden JSON, podle kterého Cursor změny zapíše do skutečného kódu.

Když je v náhledu tabletu nebo mobilu prvek mimo rámeček, na okraji rámu je úchyt „mimo“. Táhni jím a prvek se vrátí do zobrazení. Počítačové úpravy se tím nemění.

Je to jeden soubor `creatool.js` bez závislostí. Funguje v Next.js, Reactu, Vite, Vue, Svelte, Astru, Nuxtu, Angularu i v čistém HTML. Nástupce Review Lab 1.0; exporty z Review Lab umí načíst.

## Co je v balíčku

| Soubor / složka | K čemu je |
| --- | --- |
| `ZACNI-TADY.md` | Krátký návod pro nový projekt. |
| `creatool.js` | Samotný editor (sestavený soubor). |
| `src/` a `build.mjs` | Zdrojové části a skript, který je spojí do `creatool.js` (`node build.mjs`). |
| `prvky/` | Knihovna Dirty Enough: 304 ručně kreslených kreseb ve 26 kategoriích (`prvky/dirty-enough/<kategorie>/`) a seznam `prvky.json`. |
| `knihovna.mjs` | Ze složky ikonek (SVG nebo PNG) udělá knihovnu pro CREATOOL (pojmenuje, seskupí, zapíše `prvky.json`). |
| `moje-ikonky/`, `moje-fonty/` | Sem dáš vlastní ikonky a fonty; agent je při instalaci přidá. |
| `sablony/` | Zapnutí editoru (`creatool-zapnuti.js`: tlačítko dole vpravo ve footeru) a prázdný registr akcí. |
| `meritko/` | Dvě stabilní měřítka. `meritko/v1/` je původní a nesmí se přepsat. `meritko/v2/` je měřítko z Meum Dens. Agent se před instalací zeptá, které web dostane. Tři šířky 1280, 1440 a 1920 jsou v editoru vždy. |
| `ukazka/` | Malý web na vyzkoušení (`ukazka/index.html`). |
| `cursor-skills/` | Skilly pro Cursor: `/creatool-instalace` a `/creatool-zapsat`. |
| `prompty/` | Stejné postupy jako prompty k vložení do chatu. |

## Vyzkoušej hned

Ukázku otevři přes jednoduchý server (náhled zařízení potřebuje http, ne soubor z disku):

```bash
cd azervera-creatool
python3 -m http.server 8080
# otevři http://localhost:8080/ukazka/index.html
```

## Nastavení Cursoru (jednou)

Zkopíruj obě složky z `cursor-skills/` do `~/.cursor/skills/` (Windows: `C:\Users\<jméno>\.cursor\skills\`) a restartuj Cursor. Pak v každém projektu fungují `/creatool-instalace` a `/creatool-zapsat`. Novou verzi `creatool.js` přepiš ve složce `creatool-instalace`.

## Postup na každém webu

1. **Přidat editor:** složku `azervera-creatool` dej do kořene projektu a napiš „Nainstaluj CREATOOL podle azervera-creatool/prompty/1-instalace.md“ (nebo `/creatool-instalace`). Editor se při načtení nenačítá. Zapíná ho tlačítko **CREATOOL** úplně dole vpravo ve footeru. Agent se zeptá na knihovnu, barvy a fonty.
2. **Upravovat:** spusť web, v liště vyber režim. Stránky si nejdřív projdi v režimu **Čísla**, texty se očíslují.
3. **Zveřejnit:** v panelu **Koncept → Zveřejnit**. Editor zazálohuje předchozí verzi a stáhne export `creatool-<web>.json`. Stačí i jen **Stáhnout export** v liště (funguje i během úprav).
4. **Zapsat do kódu:** nový chat, `/creatool-zapsat` a přetáhni export (nebo `prompty/2-zapsani-zmen.md`). Agent nejdřív udělá zálohu (`backup: pred-zmenami`), napíše plán k požadavkům popsaným slovy a teprve pak mění kód.
5. **Vyčistit koncept:** po nasazení dej **Koncept → Změny jsou zapsané v kódu**, jinak se úpravy v náhledu uplatní dvakrát.

## Lišta

| Tlačítko | Co dělá |
| --- | --- |
| **Procházet** | normální web; fungují odkazy i přiřazené akce a animace |
| **Čísla** | ukáže čísla, která editor při otevření sám dal textům (T1…) a prvkům (P1…); klik na číslo otevře panel |
| **Texty** | klik na text: přepis, velikost písma, font |
| **Prvky** | klik na cokoliv: posun, rozměr, tvar, vzhled, rohy, odsazení, akce, animace |
| **Komentáře** | klik na prvek: poznámka připnutá k prvku |
| **+ Přidat** | otevře knihovnu kreseb: vybereš barvu a kresbu a klikneš na stránku, kam ji přidat |
| **+ Text** | klikni kamkoliv na stránku a přidáš nový text; v panelu ho přepíšeš a nastavíš písmo, velikost, barvu, tučnost, zarovnání |
| **Počítač / Tablet / Mobil** | náhled ve skutečné šířce (1440 / 768 / 390 px, jde změnit) |
| **↶ ↷** | zpět a vpřed (Ctrl+Z, Ctrl+Shift+Z), historie přežije obnovení stránky |
| **Panel** | seznam, koncept, zařízení, tokeny, média, komponenty, požadavky, komentáře, nastavení |
| **Koncept** | tečka = koncept se liší od zveřejněné verze |
| **Stáhnout export / Načíst** | export a import (i exporty z Review Lab 1.0). V exportu jedou i nahrané 3D modely. |
| **Skrýt** | schová editor (Alt+Shift+R ho vrátí) |

## Co umí panel prvku

- **Text a písmo:** přepis po částech, velikost v % původní, výběr ze všech písem, která stránka načítá.
- **Smazat prvek:** tlačítko v panelu nebo klávesa Delete (v režimu Prvky i Backspace) smaže jakýkoliv prvek webu i přidanou kresbu nebo text. Prvek webu se jen skryje: **Obnovit prvek** ho vrátí, smazané prvky stránky jsou i v **Seznamu**. Na tabletu a mobilu jde prvek **skrýt jen na tom zařízení**.
- **Poloha a rozměr:** posun X/Y v px, otočení (i myší za tečku nad rámečkem, Shift po 15°, dvojklik vrátí 0°), lupa. Samostatná **šířka a výška** (px, %, vw/vh, auto), **zámek poměru stran**, min/max rozměr. Kolem vybraného prvku je **8 úchytů** a nad ním **tečka pro otáčení**: boční mění šířku, horní a dolní výšku, rohy obojí. Shift zamkne poměr, Alt mění od středu, Ctrl vypne přichytávání. Když se obsah nevejde, nabídne se: zmenšit obsah, zalomit, skrýt, posouvat. Nastavená šířka je viditelná šířka (včetně odsazení).
- **Tvar:** **Upravit tvar** ukáže body v rozích; táhni je, nebo zadej X/Y v %. **Ořez tvaru** (clip-path, obsah zůstává rovný) nebo **Deformace obsahu** (matrix3d, jako perspektiva). Dvojklik na hranu přidá bod (mnohoúhelník), Delete ho smaže. **Obnovit obdélník**. U ořezu se ztrácí stín a rámeček, editor nabídne náhradu stínu přes drop-shadow na nadřazeném prvku.
- **Vzhled:** pozadí (barva, lineární a kruhový přechod se zastávkami, obrázek, průhledné), **frosted glass** (rozostření, průhlednost, sytost, barva; kde prohlížeč neumí backdrop-filter, použije poloprůhlednou barvu), průhlednost prvku, stín (vnější i vnitřní), rámeček (i každá strana zvlášť), míchání barev.
- **Rohy:** ostré, zaoblené, pilulka, kruh; každý roh zvlášť; eliptické rohy.
- **Odsazení a zarovnání:** padding po stranách (při najetí se zvýrazní zeleně), zarovnání vodorovně a svisle, mezera mezi prvky.
- **Nahradit kresbou z knihovny:** prvek (obrázek, SVG, text, blok) se zobrazí jako vybraná kresba ve zvolené barvě, na stejném místě, ve stejné velikosti a s jeho animacemi. **Vrátit původní prvek** ho obnoví.
- **Obrázek:** nahrazení (i přetažením souboru na obrázek na stránce), převod do WebP, zmenšení podle typu (1920 / 1600 / 600 px), ořez s poměrem stran (volně, 1:1, 4:3, 16:9, 3:4), ohnisko, povinný alt text. Originál zůstává, ořez jde kdykoli změnit.
- **Akce po kliknutí:** odkaz na stránku, posun na sekci, zavolat, napsat e-mail, externí odkaz; uložené akce z registru; **+ Nová akce (popsat slovy)**. Původní funkce prvku se nahradí jen po potvrzení.
- **Animace:** vstupní (načtení a scroll), při najetí, po kliknutí; trvání, zpoždění, křivka, náhled hned v editoru; **+ Nová (popsat slovy)**.
- **Část, která se nehýbe:** tužkou nakreslíš část prvku, která zůstane na místě, zatímco zbytek animace jede. Jde víc tahů, tloušťka čáry, Hotovo nebo Enter uloží, Esc kresbu zahodí. Starší obdélníkové označení pořád platí.
- **Přichytávání, klient, komponenty:** přichytávání u prvku, zámek pro klienta, uložit jako komponentu, vložit komponentu.
- **Komentáře** s vláknem odpovědí a stavem otevřený / vyřešený.

## Knihovna kreseb: přidat a nahradit

Knihovna je v panelu pod záložkou **Knihovna** (nebo tlačítkem **+ Přidat** v liště). Nahoře vybereš barvu: **Černá**, **Oranžová**, **Bílá** (nebo barvy webu z `artColors`) a vlastní barvu kapátkem. Kresby jdou filtrovat podle sady a skupiny (šipky, květiny, smajlíci, kroužky, podtržení, zvýrazňovače…) a hledat podle názvu.

- **Přidat text:** **+ Text** v liště (nebo **Aa · Přidat text** v knihovně) a klik na stránku. Text „Nový text“ je hned označený v panelu, stačí psát. Písmo (všechna písma webu), velikost, barva (stejné barvy jako kresby, výchozí podle okolního textu), tučnost, kurzíva, velká písmena, zarovnání, řádkování a šířka řádku. Na užší sekci se úměrně zmenší (nejméně na 12 px). V režimu Texty ho vybereš kliknutím.
- **Přidat:** klikni na kresbu a pak na stránku. Kresba se připne k sekci, kartě nebo sloupci pod kurzorem (ukáže se v rámečku „Kresba se připne k…“) a posouvá se s ní na každé šířce obrazovky; na užší sekci se úměrně zmenší (nejvýš na polovinu). Se Shiftem přidáš víc kusů za sebou, Esc přidávání zruší. Přidaná kresba je normální prvek: táhneš ji, úchyty mění velikost, v panelu je otočení, lupa, průhlednost, animace (i nová **Nakreslení**), barva, **Vyměnit kresbu…**, **Duplikovat** a **Odebrat prvek** (nebo klávesa Delete). Kresby v hlavičce a patičce se ukážou na všech stránkách, ostatní jen na své stránce.
- **Nahradit:** vyber prvek v režimu Prvky a v panelu **Nahradit kresbou z knihovny → Vybrat kresbu…**. Původní obsah se skryje (jde vrátit) a prvek ukáže kresbu. Barvu jde nastavit i zvlášť pro tablet nebo mobil.
- Přidané kresby žijí v jedné vrstvě na konci `<body>` (`#creatool-added`, z-index `addedLayerZ`), mimo kód webu. V exportu jsou v `addedElements` (sekce, poloha v %, šířka, soubor, barva), nahrazené prvky mají vlastnost `art`. Agent je zapíše do kódu podle `/creatool-zapsat`.

**Vlastní knihovna:** složka jednobarevných ikonek, SVG (vyplněné i obrysové, klidně z Figmy) nebo PNG s průhledným pozadím; podsložky jsou kategorie (číslo na začátku, třeba `01 Šipky`, jen určuje jejich pořadí). `node knihovna.mjs public/creatool/prvky moje-sada=cesta/ke/slozce` u vyplněných kreseb ořízne plátno na obrys, pojmenuje je česky, zařadí do skupiny a zapíše `prvky.json`; sady se stejným id nahradí, ostatní nechá. Webu pak stačí `libraryUrl: "/creatool/prvky/prvky.json"`.

## 3D modely

GLB je obyčejný prvek, stejně jako kresba. V **+ Přidat** (záložka Knihovna) je nahoře **Nahrát GLB**. Soubor můžeš i přetáhnout na stránku. Klik na náhled v knihovně a pak na stránku ho přidá. Bere se jen `.glb` (do 40 MB).

Režim **3D** v liště, hned vedle Prvků, je způsob, jak 3D model vybrat a upravit. Funguje na počítači, v náhledu tabletu i mobilu. V ostatních režimech se 3D prvek nevybírá.

- Tažením přímo za model ho otáčíš ve 3D (osy X a Y). Shift nebo pravé tlačítko otáčí kolem osy Z.
- Lišta nad modelem ho posouvá, úchyty rámečku mění velikost, v panelu jsou stupně otočení, **Vrátit otočení** a **Duplikovat**.
- Model se ukládá v prohlížeči (IndexedDB) a do exportu jede celý soubor (`models[]`, data URL) spolu s umístěním (`addedElements` s `kind: "model"`).

## Zapnutí

Při načtení stránky se `creatool.js` nenačítá a editor se nezobrazuje. Zapínání je tlačítko **CREATOOL** úplně dole ve footeru, u pravého kraje obrazovky. Kliknutí teprve skript načte a editor ukáže, další kliknutí ho schová. Postup je v `sablony/creatool-zapnuti.js`. V nastavení k tomu patří `startHidden: true`, `forceHidden: true` a `hiddenPill: false`.

## Fonty a barvy webu

Otázka na export písem a barev se při načtení stránky neukáže. Objeví se až po zapnutí editoru, poprvé na daném webu. Souhlas stáhne ZIP `creatool-kolekce-<web>.zip` do počítače (složka `moje-fonty/` a `barvy.json`) a písma i barvy zůstanou v kolekci editoru. Barvy pak jdou vybrat u textu i u barev prvku. Skrytí editoru otázku zase schová, dokud na ni není odpověď. Nic se neukládá, dokud není souhlas.

## Zastávky 3D animace

U 3D modelu v panelu **Přidat pozici** vloží další místo, kde se má model při scrollu zastavit, **Odebrat pozici** ho zruší. Zapnutý editor ukáže všechny zastávky, skrytý mezi nimi modelem přejíždí. U každé zastávky kromě poslední je vodorovná čára **odjezd**. Dokud ji neposuneš, model se mezi pozicemi přesouvá jako dřív. Když ji zatáhneš, model v té pozici zůstane, dokud čára nezajede za horní okraj okna. V liště je přepínač pořád vidět, nejen v režimu 3D: **Pohyb automaticky** (po čáře sám dojede na další pozici) nebo **Pohyb se scrollem** (dál ho posouváš scrollováním). Zámeček vedle něj, **Přichytávání na střed**, přichytí 3D objekt na střed stránky nebo prvku. Volba zůstane v prohlížeči. Dvojklik čáru zruší. Skrytí na tabletu nebo mobilu schová model jen tam. Počítač je hlavní verze.

## Barvy rozhraní

Lišta, panel, tlačítka, posuvníky i knihovna se při startu zbarví podle webu. Editor si přečte CSS proměnné, barvu pozadí a textu a barvu tlačítka. Tmavá značková barva je podklad, nejsytější barva je akcent (zvýrazněné tlačítko a posuvníky), světlá barva je text. Když web barvy nemá, zůstane výchozí vzhled. Barvy kreseb (`artColors`) se tím nemění.

## Stránka nebo celý web

Každý prvek je na každé stránce samostatný. Hlavička, menu a patička (vše mimo `<main>`, nebo s `data-creatool-shared`) jsou na více stránkách: po první úpravě vlastnosti se editor zeptá **Jen na této stránce** (výchozí) nebo **Na celém webu**. Volba se pamatuje pro každou skupinu vlastností zvlášť (třeba barva celý web, poloha jen tady). U lokální úpravy je značka **jen zde** a tlačítko **Vrátit na společnou verzi**. Když změníš společnou verzi, editor vypíše stránky, kterých se to netýká.

## Zařízení

Český počítač je základ: změna se propíše do ostatních jazyků a na tablet i mobil, dokud to zobrazení nemá vlastní hodnotu. Úprava na českém mobilu platí na mobilu ve všech jazycích, počítač zůstane. Stejně tablet. Anglická, slovenská a polská úprava zůstane v tom jazyce a na tom zařízení, na kterém vznikla, a do češtiny se nepropíše. Už upravená vlastnost jiného jazyka zůstane, i když se česká verze později změní. Nový prvek přidaný na české stránce se na ostatních jazycích té samé stránky jen přidá. Text, který už na stránce je, se mezi jazyky nepřepisuje. Text přidaný nástrojem **+ Text** se na ostatní jazyky propíše i se slovy.

Skrytí nebo smazání na mobilu platí jen na mobilu. Na tabletu jen na tabletu. Počítač zůstane a prvek jde na tom zařízení znovu zobrazit. Smazání na počítači prvek vezme ze všech zařízení.

Posuny a šířky z počítače se na menších zařízeních přepočítají poměrně (šířka rodiče, `max-width: 100%`), běžný text na mobilu neklesne pod 16 px. U vlastností upravených pro zařízení je značka a **↺ Vrátit na verzi z počítače**. **Panel → Zařízení** ukáže všechny vlastní úpravy a zkontroluje přetečení, překryvy a dotykové cíle pod 44 × 44 px.

Pořadí vyhodnocení: stránka a zařízení > stránka a počítač > celý web a zařízení > celý web a počítač.

### Stabilní měřítko

Editor měří a zapisuje v náhledových šířkách: mobil 390 px, tablet 768 px, počítač 1440 px. Stabilní měřítko není funkce v liště. Nasadí se samo s každou instalací CREATOOLu, ze složky `meritko/`, a na webu zůstane i když se editor nenačítá.

- **Telefony a tablety** se rozvrhnou na 390 nebo 768 px a prohlížeč stránku zvětší nebo zmenší na displej. iPhone 17 Pro Max (440 px) tak ukáže přesně náhled Mobil.
- **Užší okno počítače** (1025–1439 px) se rozvrhne jako 1440 px a zmenší se. Okna 768–1024 px ukážou tablet a užší okna mobil.
- **Od 1440 px** se nic nemění.
- **Otevřený editor** měřítko vypne, aby měřil skutečnou stránku. Po jeho skrytí se měřítko vrátí.

Podrobnosti a postup instalace jsou v `meritko/README.md`.

## Magnetické přichytávání

Při tažení a změně rozměru se prvek přichytává ke středu a okrajům rodiče, k okrajům a středům ostatních prvků a k rovnoměrným rozestupům. Ukáže se růžové vodítko a vzdálenost v px. Vypnutí: u prvku (v jeho panelu, trvale), dočasně Ctrl, globálně v Nastavení. Volitelná mřížka s přichytáváním. Šipky posunou o 1 px, Shift a šipky o 10 px.

## Koncept, zveřejnění, záloha

Úpravy se dělají v konceptu. **Zveřejnit** uloží koncept jako zveřejněnou verzi, předtím zazálohuje tu dosavadní (vždy jen jedna záloha, verze o jedna zpět) a stáhne export. Bez zálohy se nezveřejní. **Zahodit koncept** vrátí koncept na zveřejněnou verzi. **Předchozí verze** jde zobrazit jako designový náhled (odkazy, formuláře a akce nefungují, stránky a zařízení jdou přepínat) a **Obnovit**. Skutečný web se změní až zapsáním exportu do kódu.

## Tokeny, média, komponenty, požadavky

- **Tokeny:** pojmenované barvy, písma, velikosti, rozestupy, rohy, stíny, trvání. Editor načte i CSS proměnné webu z `:root`. Barvu prvku jde napojit na token. Změna tokenu se propíše všude, editor ukáže počet prvků. Sadu jde uložit do souboru a použít na jiném webu. Exportují se jako CSS proměnné. (Knihovna stylů z předchozích webů se napojí později.)
- **Média:** knihovna obrázků webu s hledáním, informací, kde je obrázek použitý, a varováním při mazání použitého obrázku.
- **Komponenty:** sekci ulož jako komponentu (název, kategorie, náhled). Knihovnu ulož do souboru a přidej na jiném webu. Vložení vytvoří požadavek pro agenta (samostatná nebo propojená kopie, rozsah stránka / web); chybějící akce vzniknou jako další požadavky.
- **Požadavky:** vše popsané slovy (akce, animace, komponenty, otevřené komentáře). Prvek má značku **čeká na implementaci** a chová se jako dosud. V exportu jsou v sekci `pendingRequests`.

## Klientský režim (ukázka)

**Panel → Nastavení → Zobrazit jako klient.** Klient vidí jen prvky se zámkem **Upravitelné klientem** (texty a obrázky), jednoduché rozhraní a komentáře. Úpravy jdou do konceptu. Přihlašování a e-maily zatím nejsou; kód je na ně připravený (`store.settings.role`).

## Nastavení (nepovinné)

Před načtením skriptu může web nastavit `window.CreatoolConfig`:

```js
window.CreatoolConfig = {
  storageKey: "creatool:muj-web",           // klíč úložiště (výchozí podle domény)
  mainSelector: "main",                     // obal obsahu stránky; co je mimo, je sdílené
  breakpoints: { tablet: 768, desktop: 1025 }, // od kolika px je tablet a počítač
  previewWidths: { desktop: 1440, tablet: 768, mobile: 390 },
  startHidden: true,                        // editor je skrytý, dokud ho nezapne tlačítko ve footeru
  forceHidden: true,                        // uložené „otevřeno“ z minula ho při načtení neotevře
  hiddenPill: false,                        // pilulka v rohu se nepoužívá, zapíná footer
  registryUrl: "/creatool.registry.json",   // registr akcí a animací, který udržuje agent
  pages: [{ path: "/", label: "Domů" }],     // stránky pro akci „Odkaz na stránku“
  libraryUrl: "/creatool/prvky/prvky.json", // knihovna kreseb pro „+ Přidat“ a „Nahradit kresbou“
  artColors: [{ name: "Oranžová", value: "token:color-accent" }], // barvy kreseb (výchozí černá, oranžová, bílá)
  addedLayerZ: 40,                          // z-index přidaných kreseb, pod fixní hlavičkou webu
  extraFonts: ["Inter"],
  pageKey: (location) => location.pathname, // volitelné: stejná stránka na víc doménách (jazyk na doménu) dostane jeden klíč
};
```

Atributy v HTML: `data-creatool-id="nazev"` (stabilní jméno prvku, očísluje se předem), `data-creatool-label="popis"`, `data-creatool-ignore` (editor na prvek nesahá), `data-creatool-shared` (prvek je sdílený mezi stránkami), `data-action="id"` (prvek má akci z registru).

API pro web: `window.Creatool.show()`, `.hide()`, `.toggle()`, `.visible`, `.download()`, `.exportData()`, `.models` (nahrání a vložení GLB); události `creatool:ready` a `creatool:visibility`. Volitelně `window.CreatoolExportExtras = () => ({ ... })` přidá do exportu vlastní data (třeba uložené pózy).

## Co editor dělá a nedělá

- Nemění strukturu stránky: prvky webu z DOM nemaže ani nepřesouvá (smazaný prvek se jen skryje přes display: none). Mění jen text v existujících textových uzlech, atributy a inline styly, které si pamatuje a umí vrátit. Přidané kresby jsou v jedné vlastní vrstvě na konci `<body>`, mimo stromy Reactu. Proto je bezpečný pro React a Next.js. Lišta a panel žijí v Shadow DOM.
- Všechno jsou data, ne vygenerovaný kód. Text uživatele se nikdy nevkládá jako HTML; barvy a adresy se kontrolují.
- Náhled zařízení otevírá stránku v rámu na stejné doméně, uvnitř běží odlehčená kopie editoru.
- Obrázky a 3D modely jsou v IndexedDB tohoto prohlížeče, úpravy v localStorage. Přenos mezi prohlížeči je přes export a Načíst.

## Stará verze

Review Lab 1.0 zůstává beze změny ve složce `review-lab/` a v `review-lab.zip`. Kdyby cokoliv v nové verzi nefungovalo, můžeš se k ní kdykoli vrátit.
