# 🏆 Painel do Torneio — versão com login (Firebase)

Site para organizar um torneio esportivo: regras, cadastro de times, fase de
grupos com tabela automática e mata-mata gerado a partir dos classificados —
agora com **login real** e **dados compartilhados em tempo real** entre todos
que acessarem o site, usando o [Firebase](https://firebase.google.com/) do
Google (gratuito no plano Spark para esse tamanho de uso).

## Estrutura de arquivos

```
torneio-firebase/
├── index.html          → estrutura da página (login + app)
├── css/
│   └── style.css        → toda a estilização
├── js/
│   ├── firebase-config.js  → suas credenciais do Firebase (você edita)
│   ├── firebase-init.js    → inicializa o Firebase
│   ├── auth.js              → login, cadastro, logout, papéis (admin/usuário)
│   └── app.js                → times, fase de grupos, mata-mata (tempo real)
└── README.md            → este arquivo
```

## Papéis de usuário

- **Usuário comum**: qualquer pessoa que criar uma conta consegue **ver** as
  regras, os times, a tabela da fase de grupos e o mata-mata — mas não pode
  editar nada.
- **Administrador**: pode cadastrar/remover times, gerar os jogos, lançar
  placares, editar horário/local e escrever as regras.

Toda conta nova entra como usuário comum por padrão. Promover alguém a
administrador é feito manualmente (passo 5 abaixo) — isso evita que qualquer
pessoa que crie uma conta vire admin sozinha.

---

## Passo a passo: configurando o Firebase

### 1. Crie um projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com/)
   e clique em **Adicionar projeto**.
2. Dê um nome (ex: `torneio-2026`) e siga o assistente (pode desativar o
   Google Analytics, não é necessário).

### 2. Ative a Autenticação por e-mail/senha

1. No menu lateral, vá em **Build > Authentication**.
2. Clique em **Vamos começar** (Get started).
3. Na aba **Sign-in method**, ative o provedor **E-mail/senha**.

### 3. Crie o banco de dados Firestore

1. No menu lateral, vá em **Build > Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha **modo de produção** (production mode) e a região mais próxima
   (ex: `southamerica-east1` para o Brasil).

### 4. Configure as regras de segurança do Firestore

Na aba **Regras** do Firestore, substitua o conteúdo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function estaLogado() {
      return request.auth != null;
    }
    function ehAdmin() {
      return estaLogado() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Qualquer pessoa logada pode ler os dados do torneio.
    // Só administradores podem escrever.
    match /teams/{teamId} {
      allow read: if estaLogado();
      allow write: if ehAdmin();
    }
    match /matches_group/{matchId} {
      allow read: if estaLogado();
      allow write: if ehAdmin();
    }
    match /tournament/{docId} {
      allow read: if estaLogado();
      allow write: if ehAdmin();
    }

    // Cada usuário pode ler/criar o próprio documento (com role "user"),
    // mas só um admin pode alterar o campo "role" de alguém.
    match /users/{userId} {
      allow read: if estaLogado();
      allow create: if request.auth.uid == userId && request.resource.data.role == 'user';
      allow update: if ehAdmin();
    }
  }
}
```

Clique em **Publicar**.

### 5. Pegue as credenciais do app web

1. No console, clique na engrenagem ⚙️ > **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone `</>` (Web) para registrar um app.
3. Dê um apelido (ex: `torneio-web`) e clique em **Registrar app**.
4. Copie o objeto `firebaseConfig` mostrado na tela.
5. Cole esses valores em `js/firebase-config.js`, substituindo os textos
   `"SUA_API_KEY"`, `"SEU_PROJETO"`, etc.

### 6. Crie o primeiro administrador

Como toda conta nova entra como usuário comum, você precisa promover a sua
manualmente na primeira vez:

1. Abra o site (veja "Como rodar" abaixo) e **crie sua conta normalmente**
   pela aba "Criar conta".
2. No console do Firebase, vá em **Firestore Database > Dados**.
3. Abra a coleção `users` e encontre o documento com o seu e-mail.
4. Edite o campo `role` de `"user"` para `"admin"`.
5. Volte ao site, saia e entre de novo (ou apenas recarregue a página) — o
   modo administrador estará liberado.

Depois disso, você (como admin) pode promover outras pessoas do mesmo jeito,
direto pelo console.

---

## Como rodar o site

O Firebase Authentication **não funciona abrindo o `index.html` direto no
navegador** (protocolo `file://`) — é preciso servir os arquivos por
`http://`. Duas opções simples:

**Opção A — testar localmente (rápido):**
```bash
cd torneio-firebase
npx serve .
```
Depois abra o endereço que aparecer no terminal (ex: `http://localhost:3000`)
no computador ou no celular (se estiverem na mesma rede Wi-Fi, use o IP local
mostrado pelo comando).

**Opção B — publicar de verdade com Firebase Hosting (recomendado):**
```bash
npm install -g firebase-tools
firebase login
cd torneio-firebase
firebase init hosting
# Quando perguntar a pasta pública, use a pasta atual (.)
# Configure como single-page app: Não é necessário (No)
firebase deploy
```
Ao final, o Firebase mostra um link (`https://SEU_PROJETO.web.app`) que
funciona em qualquer celular, sem precisar instalar nada.

---

## Limitações deste protótipo

- É um protótipo funcional, não um produto finalizado: não há recuperação de
  senha, verificação de e-mail, nem painel dedicado para gerenciar usuários
  (a promoção a admin é manual, pelo console do Firebase).
- O chaveamento do mata-mata evita repetir confrontos do mesmo grupo apenas
  parcialmente (usa "seeding" por colocação, não uma regra rígida).
- No plano gratuito (Spark) do Firebase, os limites de leitura/escrita do
  Firestore são generosos para o uso de um torneio comum, mas vale
  acompanhar o uso no console se o site for usado por muita gente.
