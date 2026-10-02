// Inicializa o app do Firebase usando a configuração de firebase-config.js
firebase.initializeApp(firebaseConfig);

// Instâncias usadas em todo o app (auth.js e app.js)
const auth = firebase.auth();
const db = firebase.firestore();
