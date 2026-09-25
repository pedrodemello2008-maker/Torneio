// ---------- Estado global de autenticação ----------
let currentUser = null; // objeto do Firebase Auth
let currentRole = "user"; // 'admin' ou 'user'

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");

// ---------- Alternar entre abas Entrar / Criar conta ----------
const tabEntrar = document.getElementById("tabEntrar");
const tabCadastrar = document.getElementById("tabCadastrar");
const formEntrar = document.getElementById("formEntrar");
const formCadastrar = document.getElementById("formCadastrar");

tabEntrar.addEventListener("click", () => {
  tabEntrar.classList.add("active");
  tabCadastrar.classList.remove("active");
  formEntrar.style.display = "flex";
  formCadastrar.style.display = "none";
});
tabCadastrar.addEventListener("click", () => {
  tabCadastrar.classList.add("active");
  tabEntrar.classList.remove("active");
  formCadastrar.style.display = "flex";
  formEntrar.style.display = "none";
});

// ---------- Login ----------
formEntrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = document.getElementById("loginErro");
  erro.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  try {
    await auth.signInWithEmailAndPassword(email, senha);
    // onAuthStateChanged cuida do resto
  } catch (err) {
    erro.textContent = traduzErro(err);
  }
});

// ---------- Cadastro ----------
formCadastrar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = document.getElementById("cadErro");
  erro.textContent = "";
  const nome = document.getElementById("cadNome").value.trim();
  const email = document.getElementById("cadEmail").value.trim();
  const senha = document.getElementById("cadSenha").value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, senha);
    await cred.user.updateProfile({ displayName: nome });
    // Toda conta nova começa como usuário comum (somente leitura).
    // Um admin existente precisa promover essa conta depois — veja o README.
    await db.collection("users").doc(cred.user.uid).set({
      nome: nome,
      email: email,
      role: "user",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // onAuthStateChanged cuida do resto
  } catch (err) {
    erro.textContent = traduzErro(err);
  }
});

// ---------- Logout ----------
document.getElementById("btnLogout").addEventListener("click", () => {
  auth.signOut();
});

// ---------- Observa o estado de login ----------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    currentRole = "user";
    document.body.classList.remove("admin");
    appScreen.style.display = "none";
    loginScreen.style.display = "flex";
    if (typeof pararSincronizacao === "function") pararSincronizacao();
    return;
  }

  currentUser = user;

  // Busca o papel do usuário na coleção 'users'. Se não existir (ex: conta
  // criada manualmente no console do Firebase), cria como 'user' por padrão.
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    currentRole = snap.data().role === "admin" ? "admin" : "user";
  } else {
    await ref.set({
      nome: user.displayName || "",
      email: user.email,
      role: "user",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentRole = "user";
  }

  document.body.classList.toggle("admin", currentRole === "admin");
  document.getElementById("userInfo").textContent =
    (user.displayName ? user.displayName + " — " : "") +
    user.email +
    (currentRole === "admin" ? " (administrador)" : " (usuário)");

  loginScreen.style.display = "none";
  appScreen.style.display = "block";

  if (typeof iniciarSincronizacao === "function") iniciarSincronizacao();
});

// ---------- Mensagens de erro em português ----------
function traduzErro(err) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Esse e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  };
  return map[err.code] || "Erro: " + err.message;
}
