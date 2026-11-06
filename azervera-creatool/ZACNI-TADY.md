# Azervera CREATOOL: začni tady

**made by lupienskim**

**Verze 4.7.2.**

CREATOOL je prázdný univerzální editor, který přidáš do jakéhokoliv webu. Přímo na stránce upravíš texty, písma, rozměry, tvary a barvy. Přidáš nový text nebo kresbu z knihovny, jakýkoliv prvek smažeš, nahradíš nebo otočíš myší, nastavíš akce a animace. Všechno se ukládá jako koncept v tvém prohlížeči. Na web se to dostane, až agent export zapíše do kódu.

## Co je v ZIPu

| Soubor / složka | K čemu je |
| --- | --- |
| `ZACNI-TADY.md` | Tento návod. |
| `creatool.js` | Samotný editor (jeden soubor bez závislostí). |
| `prompty/1-instalace.md` | Postup pro agenta: instalace do projektu. |
| `prompty/2-zapsani-zmen.md` | Postup pro agenta: zapsání tvých úprav do kódu. |
| `cursor-skills/` | Totéž jako skilly `/creatool-instalace` a `/creatool-zapsat` (nepovinné). |
| `prvky/` | Knihovna Dirty Enough: 304 ručně kreslených kreseb ve 26 kategoriích (šipky, kroužky, podtržení, liška, design, foto a video, přehrávač, jídlo, web…). |
| `moje-ikonky/` | **Sem dej svoje ikonky** (SVG nebo PNG s průhledným pozadím). |
| `moje-fonty/` | **Sem dej svoje fonty** (WOFF2, WOFF, TTF, OTF). |
| `knihovna.mjs` | Převede složku ikonek na knihovnu pro CREATOOL (spouští agent). |
| `sablony/` | Zapnutí editoru ve footeru (`creatool-zapnuti.js`) a prázdný registr akcí. |
| `meritko/` | Stabilní měřítko ve dvou verzích. `v1/` je původní a nemění se. `v2/` je měřítko z Meum Dens. Agent se před nasazením zeptá, které použít. |
| `ukazka/` | Malý web na vyzkoušení. |
| `README.md` | Úplný popis všech funkcí a nastavení. |

## Nový projekt ve 4 krocích

1. **Rozbal ZIP** a složku `azervera-creatool` dej do kořene projektu (vedle `package.json` nebo `index.html`).
2. **Volitelně:** ikonky dej do `azervera-creatool/moje-ikonky/`, fonty do `azervera-creatool/moje-fonty/`. Jde to i kdykoliv později.
3. **V Cursoru napiš:** „Nainstaluj CREATOOL podle azervera-creatool/prompty/1-instalace.md.“ Se skilly stačí `/creatool-instalace`.
4. **Odpověz agentovi na otázky** (viz níže). Až potom začne cokoliv měnit. Na konci ti napíše, kde je tlačítko a jak editor otevřeš.

## Na co se tě agent zeptá

Agent nejdřív projde web a pak se zeptá najednou, u každé otázky se svým návrhem, ať stačí potvrdit:

1. **Knihovna kreseb:** přidat Dirty Enough? Převést tvoje ikonky z `moje-ikonky/`?
2. **Barvy** pro kresby a přidaný text: navrhne 3 až 5 barev z barev webu.
3. **Fonty** z `moje-fonty/`: jen do editoru, nebo je rovnou použít na webu (a kde)?
4. **Stránky** pro akci „Odkaz na stránku“.
5. **Registr akcí a animací** (doporučeno ano).
6. **Technické věci** (obal obsahu, breakpointy, vrstva nad hlavičkou): navrhne sám, ty jen potvrdíš.
7. **Měřítko:** V1, nebo V2? V1 je původní měřítko (počítač 1440 px) a nechává se na webech, které ho už mají. V2 je měřítko z Meum Dens (1280, 1440 a 1920 px). Okno užší než 500 px je telefon, i když obrazovka hlásí větší šířku. Šířka sloupce se nastaví ještě před prvním vykreslením. Agent počká na odpověď a už nasazené V1 sám nepřepne.

Na zapínání se neptá. Při načtení stránky se CREATOOL nenačítá. Tlačítko **CREATOOL** je úplně dole ve footeru, u pravého kraje obrazovky. Otázka na export písem a barev se ukáže až po zapnutí editoru.

Tři šířky v liště (1280, 1440, 1920) jsou v editoru vždycky. Měřítko pro návštěvníka je zvlášť: V1, nebo V2.

## Jak to funguje

- **Tlačítko:** při načtení stránky se editor nenačítá. Zapne ho tlačítko **CREATOOL** úplně dole ve footeru, u pravého kraje obrazovky. Další kliknutí ho schová. Alt+Shift+R ho taky otevře, když už skript běží.
- **Fonty:** CREATOOL nabízí všechna písma, která web načítá, sám si je přečte. Nový font do editoru nenahráváš: dáš ho do `moje-fonty/`, agent ho přidá do webu a v editoru se objeví sám.
- **Barvy:** editor si sám přečte barvy webu, pokud jsou zapsané jako CSS proměnné (třeba `--color-accent`). Jsou v panelu pod **Tokeny** a jde na ně napojit barvu prvku. Když web proměnné nemá, tokeny si vytvoříš v panelu, nebo je agent do webu doplní. Sadu tokenů jde uložit a použít na jiném webu. Barvy pro kresby a text nastaví agent při instalaci (otázka 2).
- **Knihovna ikonek a kreseb:** je v **+ Přidat**. Sada Dirty Enough je tam vždy, když je nastavená `libraryUrl`. **Moje kresby** jsou SVG nahraná tlačítkem Nahrát kresbu a zůstávají v prohlížeči i na dalších stránkách. **Písma** nad knihovnou jsou písma stránky, dřív uložená písma a nahraná písma.
- **3D modely:** v **+ Přidat** dej **Nahrát GLB**, nebo soubor `.glb` přetáhni na stránku. Je to prvek jako kresba: klikneš, kam ho dát, tažením ho otáčíš ve 3D (Shift otáčí kolem osy), lištou ho posouváš a úchyty měníš velikost. Do exportu jede celý soubor.
- **Fonty a barvy webu:** otázka na jejich export se při načtení stránky neukáže. Objeví se až po zapnutí editoru a po souhlasu stáhne ZIP s písmy a barvami na počítač. Barvy pak jde dát na text i prvky.
- **Režim 3D:** v liště vedle Prvků. Teprve v něm se 3D model vybírá a upravuje, na počítači i v náhledu tabletu a mobilu.
- **Zastávky 3D:** u modelu **Přidat pozici** / **Odebrat pozici**. Model se při scrollu zastaví na každé z nich. Pořadí je podle polohy na stránce, shora dolů. Roh **⤡** mění velikost jen té zastávky. Čára **odjezd** u zastávky říká, kdy se má pohnout: až zajede za horní okraj okna. Dvojklik ji zruší. Přepínač **Pohyb se scrollem** / **Pohyb automaticky** a zámeček **Přichytávání na střed** jsou v liště pořád, nejen v režimu 3D.
- **Část, která se nehýbe:** u prvku nakreslíš tužkou část, která zůstane na místě, zatímco zbytek animace jede.
- **Rohy:** u boxu nebo tlačítka v režimu Prvky, část **Rohy**. Počítač je hlavní verze, tablet a mobil jen pro sebe.
- **Velikost v procentech:** box, který už má šířku nebo výšku v `%`, `vw` nebo `vh`, po tažení za roh v té jednotce zůstane a dál se mění s obrázkem.
- **Víc domén, jedna stránka:** `CreatoolConfig.pageKey(location)` vrátí stejný název stránky, i když se adresa liší jen doménou (třeba jazyk na vlastní doméně). Úpravy se pak ukládají pod jeden klíč.
- **Barvy editoru:** lišta a panel se samy zbarví podle barev webu. Nic nenastavuješ.
- **Úpravy:** všechno je koncept jen v tvém prohlížeči; ostatní návštěvníci nic nevidí. **Stáhnout export** vytvoří JSON, agent ho zapíše do kódu a teprve potom se změní skutečný web.

## Ikonky a fonty později

- **Ikonky:** dej je do `azervera-creatool/moje-ikonky/`. Jedna barva, jedna ikonka na soubor, název souboru je název v knihovně, podsložky jsou skupiny. Pak napiš: **„Přidej ikonky z azervera-creatool/moje-ikonky do knihovny CREATOOL.“** Víc je v `moje-ikonky/SEM-DEJ-IKONKY.md`.
- **Fonty:** dej je do `azervera-creatool/moje-fonty/` a napiš: **„Přidej fonty z azervera-creatool/moje-fonty do webu, ať jsou v CREATOOL.“** Řekni, jestli je chceš i použít na webu.

## Zápis úprav do kódu

1. V editoru **Koncept → Zveřejnit**. Zazálohuje předchozí verzi a stáhne export `creatool-….json`. Stačí i **Stáhnout export** v liště.
2. Nový chat v Cursoru: **„Zapiš změny z CREATOOL podle azervera-creatool/prompty/2-zapsani-zmen.md“** a přetáhni tam export. Se skilly stačí `/creatool-zapsat`.
3. Agent nejdřív udělá zálohu (commit `backup: pred-zmenami`), k úpravám popsaným slovy napíše plán a otázky a pak změny zapíše a ověří na počítači, tabletu i mobilu.
4. Po nasazení dej v editoru **Koncept → Změny jsou zapsané v kódu**, aby se úpravy neuplatnily dvakrát.

## Nová verze a odstranění

- **Nová verze CREATOOL:** nahraď složku `azervera-creatool` novou a napiš: „Aktualizuj CREATOOL ze složky azervera-creatool.“ Agent zkopíruje nový `creatool.js` (a knihovnu, když se změnila). Tvoje `moje-ikonky/` a `moje-fonty/` si předtím nech stranou.
- **Před spuštěním webu:** když se editor načítá jen při vývoji, na ostrém webu není a nic dělat nemusíš. Jinak řekni agentovi: „Vypni CREATOOL na ostrém webu.“

## Skilly v Cursoru (nepovinné)

Zkopíruj obě složky z `cursor-skills/` do `C:\Users\<jméno>\.cursor\skills\` (na Macu `~/.cursor/skills/`) a restartuj Cursor. Pak v každém projektu fungují `/creatool-instalace` a `/creatool-zapsat`. Složku `azervera-creatool` do projektu dej i tak, jsou v ní knihovna, šablony a tvoje ikonky.
