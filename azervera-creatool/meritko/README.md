# Stabilní měřítko: V1 a V2

**Azervera CREATOOL, made by lupienskim**

Agent nejdřív čte `PRO-AGENTA.md` v téhle složce. Než měřítko nasadí, zeptá se, jestli web dostane **Měřítko V1** nebo **Měřítko V2**, a počká na odpověď.

| | Složka | Co dělá na počítači |
| --- | --- | --- |
| Měřítko V1 | `v1/` | Původní měřítko, beze změny. Návrh počítače je 1440 px. Užší okno se na něj zmenší, od 1440 px výš se stránka nemění. |
| Měřítko V2 | `v2/` | Měřítko z Meum Dens. Návštěvník dostane nejbližší z 1280, 1440 a 1920 px v přesné velikosti. Širší okno ji nezvětšuje, užší ji zmenší. Okno užší než 500 px je telefon, i když obrazovka hlásí větší šířku. Šířka sloupce se nastaví ještě před prvním vykreslením. |

Telefon a tablet jsou u obou stejné: na výšku 390 px, na šířku a tablet 768 px.

Tři šířky v liště editoru (1280, 1440, 1920) jsou tu vždycky. Platí při úpravě, ať je na webu V1 nebo V2.

Soubor `creatool-meritko.js` v téhle složce je kopie V2 pro ukázku. Instalace bere soubory ze `v1/` nebo `v2/`. Složka `v1/` se nepřepisuje.
