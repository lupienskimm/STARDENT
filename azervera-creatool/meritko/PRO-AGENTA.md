# Nejdřív se zeptej, které měřítko

Tahle složka má dvě měřítka. Obě tu zůstávají. **Než cokoliv na webu změníš, zeptej se a počkej na odpověď: Měřítko V1, nebo Měřítko V2?** Bez odpovědi měřítko neinstaluj a už nasazené měřítko nepřepisuj.

Tlačítka **1280, 1440 a 1920** v editoru jsou vždycky, u V1 i u V2. Ukážou tu šířku v přesných pixelech. Nejsou to přepínač měřítka.

## Které vzít

| | Měřítko V1 | Měřítko V2 |
| --- | --- | --- |
| Složka | `meritko/v1/` | `meritko/v2/` |
| Počítač pro návštěvníka | jeden návrh, 1440 px | nejbližší z 1280, 1440 a 1920 px |
| Okno 1025–1439 px | zmenší se na 1440 px | nejbližší šířka; užší okno ji zmenší |
| Od 1440 px výš | stránka se nemění | širší okno zvolenou šířku nezvětšuje, nechá ji uprostřed v přesné velikosti |
| Kdy | weby, které už V1 mají | weby, kde má sedět jako na Meum Dens |

Měřítko V2 navíc bere okno užší než 500 px jako telefon, i když obrazovka hlásí větší šířku, a šířku sloupce nastaví ještě před prvním vykreslením.

Když web už měřítko má, poznej ho a **doporuč tu samou verzi**. V1 na V2 nepřepínej, dokud to uživatel výslovně neřekne. Nové V2 na starém webu rozhodí stránky, které byly složené na 1440 px.

Soubory ve `meritko/v1/` neměň. Jsou to původní soubory beze změny.

`meritko/creatool-meritko.js` vedle téhle složky je kopie V2 kvůli ukázce v balíčku. Na cizí web ho sám nekopíruj. Ber jen `meritko/v1/` nebo `meritko/v2/`.

## Až uživatel odpoví

Otevři `PRO-AGENTA.md` ve zvolené složce a postupuj podle něj. Cesty v tom návodu znamenají tu zvolenou složku, ne kořen `meritko/`.
