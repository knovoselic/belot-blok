# 🂡 Belot Blok

Jednostavan PWA blok za belot — bodovi i zvanja bez greške. Cijela aplikacija je jedan `index.html`.

- Podržava 2, 3 ili 4 igrača (timovi 2-na-2)
- Igra do 351 / 501 / 701 / 1001 ili vlastiti cilj
- Automatski računa prolaz/pad, zvanja (broji samo viši), belu i štiglju
- Sprema igrače i timove (2 na 2) te povijest svih igara i ruku — lokalno, u pregledniku
- Statistika: ljestvica, rekordi, zvanja, forma, suigrači i međusobni omjeri
- Izvoz/uvoz podataka (JSON) kao sigurnosna kopija
- Radi offline, instalira se kao aplikacija na mobitel

## Pokretanje
Otvori `index.html` u pregledniku, ili posjeti hostanu verziju (GitHub Pages).

## Testovi
End-to-end test u pravom Chromiumu (Playwright, bez mockova): unos igara i ruku, igrači/timovi, statistika, povijest, izvoz/uvoz, migracija starog formata.

```sh
npm install
npx playwright install chromium
npm test
```
