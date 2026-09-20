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
  apiKey: "AIzaSyDRi1Y-pcYHxk3yYQZDgBoMKMcbpJR7wDA",
  authDomain: "kvilda202-68aab.firebaseapp.com",       // např. kvilda202.firebaseapp.com
  projectId: "kvilda202-68aab",         // např. kvilda202
  storageBucket: "kvilda202-68aab.firebasestorage.app",
  messagingSenderId: "902867227317",
  appId: "1:902867227317:web:eb09b479fc31d25a8ee4fc",
};

// E-mailové adresy, které smí spravovat kalendář (musí odpovídat
// pravidlům v souboru firestore.rules!).
window.KVILDA_ADMIN_EMAILS = [
  "kvilda202@gmail.com",
  "pavla.hraba@gmail.com",
];
