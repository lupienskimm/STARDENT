# Nasazení Star-Dent

Ostrá verze je větev `main` a doména stardent.azervera.cz. Testovací verze je větev `testing` a adresa stardent-roan.vercel.app. Obě jedou ze stejného GitHub repozitáře. CREATOOL se zapne jen na testovací adrese. Ostrý web jeho skript nenačítá.

Měřítko z CREATOOLU na webu není. Stránka se přizpůsobuje šířce okna sama a pevné měřítko by ji na různých obrazovkách rozbilo.

## Běžná práce

1. Přepni se na testing: `git checkout testing`
2. Udělej změny a pushni: `git push origin testing`
3. Otevři stardent-roan.vercel.app. Dole vpravo je tlačítko CREATOOL.
4. Až je verze v pořádku, přenes ji na ostrou: `git checkout main`, `git merge testing`, `git push origin main`
5. Vrať se na testing: `git checkout testing`

Push na testing se dělá rovnou. Na main jen po odsouhlasení, nebo když o to výslovně jde.

## CREATOOL

Proměnná ve Vercelu není potřeba. Web je statický a editor se rozhoduje podle adresy v `js/creatool-boot.js`.

- stardent-roan.vercel.app, localhost a 127.0.0.1: tlačítko je ve footeru, `creatool.js` se stáhne až po kliknutí.
- stardent.azervera.cz a každá jiná adresa: tlačítko se nevloží a `creatool.js` se nenačte.

Nezapínej editor query parametrem ani úpravou v prohlížeči na ostré doméně. Na produkci nemá být vůbec.

Úpravy z editoru jsou koncept v prohlížeči. Do kódu se dostanou přes export a zápis do souborů. Ten zápis pak jde mergem z testing do main. Samotné zapnutí editoru se mergem na produkci nepřenese, protože ho řídí adresa, ne větev.

## Vercel

- Projekt napojený na stardent-roan.vercel.app má produkční větev `testing`.
- Projekt napojený na stardent.azervera.cz má produkční větev `main`.
- U domény stardent.azervera.cz nastav DNS podle toho, co Vercel ukáže po přidání domény.

## Co nedělat

- Nepřidávej `creatool.js` do HTML. Načítá ho až kliknutí na testing adrese.
- Neměň `js/creatool-boot.js` tak, aby editor běžel i na stardent.azervera.cz.
- Nedej na ostrou větev značku `noindex`. Tu má jen testovací adresa, v `vercel.json` podle hostname.
