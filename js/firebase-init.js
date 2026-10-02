let auth, db;
try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
} catch (e) {
  console.error("Falha ao iniciar o Firebase:", e);
  alert("Falha ao iniciar o Firebase: " + e.message);
}
