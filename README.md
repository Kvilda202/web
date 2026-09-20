# Kvilda 202 – webové stránky apartmánu

Statický web (žádný server, žádné placené služby) pro prezentaci a rezervaci
apartmánu **Kvilda 202** na Šumavě. Obsahuje:

- prezentaci apartmánu s fotogalerií,
- ceník (sezóna / mimo sezónu),
- vlastní stylizovanou mapu okolí s turistickými/cyklo trasami a zimními
  sjezdovkami/běžkami,
- tipy na výlety a gastronomii v okolí,
- odkazy na aktuality obcí Kvilda a Horská Kvilda,
- rezervační formulář, který posílá poptávky e-mailem na **kvilda202@gmail.com**,
- **živý kalendář volných/obsazených termínů** (Firebase) + zabezpečenou
  administraci pro úpravu termínů (`admin.html`), přístupnou jen z e-mailů
  `kvilda202@gmail.com` a `pavla.hraba@gmail.com`,
- připravenou strukturu pro přidání dalšího apartmánu (2., pak 3.).

---

## 1. Jak si web prohlédnout lokálně (nepovinné)

Web je čistě statický (HTML/CSS/JS), takže `index.html` jde otevřít přímo
v prohlížeči. Kalendář obsazenosti ale používá moduly (`type="module"`),
které prohlížeč z bezpečnostních důvodů z `file://` neumí spustit – proto je
v repozitáři jednoduchý lokální server:

```powershell
powershell -ExecutionPolicy Bypass -File _devserver.ps1 -Port 8080
```

a pak otevřít `http://localhost:8080`. Tento skript se nikam nenahrává,
slouží jen k náhledu na vašem počítači.

---

## 2. Nasazení zdarma – GitHub Pages (doporučeno)

1. Založte si (pokud ještě nemáte) účet na [github.com](https://github.com) –
   zdarma.
2. Vytvořte nový **veřejný** repozitář, např. `kvilda202-web`.
3. Nahrajte do něj **veškerý obsah této složky** (`index.html`, `admin.html`,
   `css/`, `js/`, `assets/`, `firestore.rules`, tento `README.md`…):
   - nejjednodušší cesta: na stránce repozitáře klikněte na **„uploading an
     existing file"** a přetáhněte tam celou složku/soubory z Průzkumníka
     Windows,
   - nebo přes Git: `git init`, `git add .`, `git commit -m "web"`,
     `git branch -M main`, `git remote add origin <adresa repozitáře>`,
     `git push -u origin main`.
4. V repozitáři jděte do **Settings → Pages**.
5. U „Build and deployment" zvolte **Deploy from a branch**, větev `main`,
   složku `/ (root)` → **Save**.
6. Po minutě bude web dostupný na adrese
   `https://<vase-uzivatelske-jmeno>.github.io/kvilda202-web/`.
7. (Volitelné) Pokud budete mít vlastní doménu (např. `kvilda202.cz`), přidáte
   ji v tom samém nastavení do pole **Custom domain** a u registrátora domény
   nastavíte DNS záznam dle nápovědy GitHubu.

### Alternativa – ještě jednodušší: Netlify Drop
Pokud nechcete řešit GitHub, jděte na **app.netlify.com/drop** a přetáhněte
tam celou složku webu myší – Netlify ji okamžitě nasadí na veřejnou adresu
zdarma. Nevýhoda: bez účtu se web hůř spravuje/aktualizuje (dá se ale založit
účet zdarma a napojit na stejnou složku).

---

## 3. Rezervační formulář (e-mail) – FormSubmit

Formulář v sekci „Rezervace" posílá data přímo na **kvilda202@gmail.com** přes
bezplatnou službu [FormSubmit.co](https://formsubmit.co) – **bez nutnosti
zakládat další účet**.

**Jediný krok, který musíte udělat:** po nasazení webu jednou vyplňte a
odešlete formulář (např. testovací poptávku). FormSubmit pošle na
`kvilda202@gmail.com` aktivační e-mail s odkazem „**Activate Form**" – po
kliknutí na něj bude formulář trvale aktivní a všechny další poptávky budou
chodit rovnou do schránky.

---

## 4. Živý kalendář obsazenosti a administrace – nastavení Firebase (zdarma)

Kalendář, který na webu vidí návštěvníci, a chráněná administrace v
`admin.html` běží na **Firebase** (služba Google) – konkrétně:
- **Firestore** – malá databáze s obsazenými termíny,
- **Authentication (přihlášení přes Google)** – ověří, že úpravy dělá jen
  majitel.

Firebase má trvale bezplatný tarif „Spark", který na tento účel bohatě stačí
(nevyžaduje platební kartu).

### 4.1 Založení projektu
1. Jděte na [console.firebase.google.com](https://console.firebase.google.com)
   a přihlaste se účtem **kvilda202@gmail.com**.
2. **Add project** → pojmenujte např. `kvilda202` → dokončete průvodce
   (Google Analytics není potřeba, můžete vypnout).

### 4.2 Firestore (databáze termínů)
1. V levém menu **Build → Firestore Database → Create database**.
2. Zvolte režim **Production mode** a libovolný region (např. `eur3
   (europe-west)`).
3. Po vytvoření jděte na záložku **Rules** a nahraďte obsah přesně obsahem
   souboru [`firestore.rules`](./firestore.rules) z tohoto repozitáře →
   **Publish**.

### 4.3 Přihlašování přes Google
1. V levém menu **Build → Authentication → Get started**.
2. Záložka **Sign-in method** → povolte poskytovatele **Google** → uložit.
3. Záložka **Settings → Authorized domains** → přidejte doménu, na které web
   běží (např. `vase-jmeno.github.io`, případně vlastní doménu).

### 4.4 Propojení webu s Firebase projektem
1. V přehledu projektu klikněte na ikonu **„</>" (Web app)** a zaregistrujte
   novou webovou aplikaci (stačí zadat název, hosting přes Firebase
   nezapínejte).
2. Firebase vám zobrazí blok `firebaseConfig = { apiKey: "...", ... }`.
   Zkopírujte tyto hodnoty do souboru **`js/firebase-config.js`** v tomto
   projektu, na místo `VLOZTE_...`.
3. Uložte, nahrajte změnu zpět na GitHub (viz krok 2) – klidně přímo úpravou
   souboru v GitHub webovém rozhraní (tužka/ikonka edit u souboru).

Tyto hodnoty **nejsou tajné** – Google je určil k tomu, aby byly veřejně
vidět v kódu webu. Skutečné zabezpečení (kdo smí zapisovat termíny) hlídá
soubor `firestore.rules` z kroku 4.2.

### 4.5 Přidání/odebrání správců kalendáře
Výchozí správci jsou `kvilda202@gmail.com` a `pavla.hraba@gmail.com`. Pro
změnu upravte **na dvou místech** (musí se shodovat):
- `js/firebase-config.js` → pole `KVILDA_ADMIN_EMAILS`,
- `firestore.rules` → seznam e-mailů v `request.auth.token.email in [...]`
  (a znovu publikujte v konzoli Firebase, krok 4.2.3).

### 4.6 Používání administrace
Otevřete `https://<vase-adresa>/admin.html`, klikněte na „Přihlásit se přes
Google" a přihlaste se účtem `kvilda202@gmail.com` nebo `pavla.hraba@gmail.com`.

V administraci jsou dvě sekce:
- **Apartmány** – zde přidáváte nové apartmány (stačí název, tlačítkem
  „Zveřejnit/Skrýt" určíte, jestli se má nabízet na webu). **První apartmán
  („Apartmán Kvilda 202") je potřeba přidat zde jednorázově po nastavení
  Firebase** – do té doby web zobrazuje vestavěný výchozí apartmán, aby
  formulář fungoval i bez zásahu.
- **Blokované termíny** – přidávání a mazání obsazených termínů pro
  vybraný apartmán. Veřejný kalendář na hlavní stránce (sekce Rezervace)
  se aktualizuje okamžitě, v reálném čase, pro kohokoliv, kdo má web
  otevřený.

---

## 5. Mapa okolí

Mapa používá tyto bezplatné veřejné vrstvy (není potřeba žádný API klíč):
- **OpenStreetMap** – podkladová mapa,
- **Waymarked Trails** – turistické a cyklistické trasy (letní režim),
- **OpenSnowMap** – sjezdovky a běžecké trasy (zimní režim).

Barvy mapy jsou jemně stylizované pomocí CSS filtru (viz `css/style.css`,
třída `.leaflet-tile-pane`), aby ladily s barevností webu. Seznam bodů zájmu
(POI) i jejich souřadnice upravíte v souboru **`js/map.js`** (pole `POIS`).

---

## 6. Aktuality z okolí

Oficiální weby Kvildy (`obeckvilda.cz`) a Horské Kvildy (`horskakvilda.eu`)
bohužel nenabízí RSS kanál ani veřejné API, takže automatické stahování
novinek by bylo nespolehlivé (mohlo by se kdykoliv rozbít). Sekce
„Aktuality" proto obsahuje přímé odkazy na živé stránky obcí, NP Šumava a
skiareálu Zadov – vždy tedy zobrazují aktuální obsah, jen jedním kliknutím
navíc. Pokud by obce v budoucnu RSS přidaly, stačí do `index.html` doplnit
JS `fetch()` na jejich feed.

---

## 7. Přidání dalšího apartmánu (fáze 2 a 3)

Seznam apartmánů se **nespravuje v kódu, ale přímo v administraci**
(`admin.html`, sekce „Apartmány") – přihlásíte se jako správce a tlačítkem
„Přidat apartmán" založíte nový (stačí název, dostupnost přepnete tlačítkem
„Zveřejnit/Skrýt"). Nově přidaný apartmán se ihned objeví ve výběru v
rezervačním formuláři i v kalendáři na hlavní stránce – bez úpravy kódu.

Co administrace **nezvládá** a co je i nadále potřeba doladit ručně v kódu,
až bude druhý/třetí apartmán reálně k dispozici:
- vlastní fotogalerie a popis apartmánu (zkopírujte sekce **„O apartmánu"**
  a **„Galerie"** v `index.html`, dejte jim nové `id`, např. `#o-apartmanu-2`,
  `#galerie-2`, a nahrajte fotky do `assets/img/`, ideálně s předponou
  `apt2-...`),
- jeho vlastní ceník, pokud se má lišit od prvního apartmánu.

Než tohle doplníte, nově přidaný apartmán bude fungovat aspoň pro rezervaci
a zobrazování obsazenosti (i to je užitečné, např. při přípravě předprodeje).

---

## 8. Úprava základních údajů

| Co změnit | Kde |
|---|---|
| Cena, sezóny | `index.html`, sekce `#cenik` |
| Kapacita, vybavení | `index.html`, sekce `#o-apartmanu` |
| Telefon / e-mail | hledejte `606080413` a `kvilda202@gmail.com` v `index.html` |
| Fotky | `assets/img/` (názvy souborů popisují obsah) |
| Body zájmu na mapě | `js/map.js`, pole `POIS` |
| Barvy webu | `css/style.css`, sekce `:root` nahoře |

---

## 9. Použité bezplatné služby – přehled

| Účel | Služba | Nutný účet? |
|---|---|---|
| Hosting webu | GitHub Pages (nebo Netlify Drop) | Ano, zdarma |
| E-mail z formuláře | FormSubmit.co | Ne (jen potvrzení e-mailem) |
| Kalendář + admin přihlášení | Firebase (Firestore + Authentication) | Ano, zdarma (tarif Spark) |
| Mapové podklady | OpenStreetMap / Waymarked Trails / OpenSnowMap | Ne |
