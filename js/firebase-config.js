// ==========================================================================
// Kvilda 202 – konfigurace Firebase (kalendář volných/obsazených termínů)
// ==========================================================================
// TOTO JE NUTNÉ VYPLNIT, aby fungoval kalendář a přihlášení do administrace!
// Postup získání hodnot: viz README.md, kapitola "Nastavení Firebase".
//
// Hodnoty níže NEJSOU tajné (Firebase "web API key" je veřejný identifikátor
// projektu, ne heslo) – klidně je nahrajte i do veřejného GitHub repozitáře.
// Skutečné zabezpečení řeší soubor firestore.rules (kdo smí zapisovat).
// ==========================================================================

window.KVILDA_FIREBASE_CONFIG = {
  apiKey: "VLOZTE_apiKey",
  authDomain: "VLOZTE_authDomain",       // např. kvilda202.firebaseapp.com
  projectId: "VLOZTE_projectId",         // např. kvilda202
  storageBucket: "VLOZTE_storageBucket",
  messagingSenderId: "VLOZTE_messagingSenderId",
  appId: "VLOZTE_appId",
};

// E-mailové adresy, které smí spravovat kalendář (musí odpovídat
// pravidlům v souboru firestore.rules!).
window.KVILDA_ADMIN_EMAILS = [
  "kvilda202@gmail.com",
  "pavla.hraba@gmail.com",
];
