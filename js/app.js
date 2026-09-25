// ============================================================
// Cache local (espelha o Firestore) — atualizado pelos listeners
// ============================================================
let teams = []; // [{id, name, group}]
let groupMatches = []; // [{id, group, a, b, scoreA, scoreB, data, local}]
let knockoutDoc = null; // {qualifiersPerGroup, qualifiers:[...], scores:{...}} ou null
let rulesText = "";
let unsubscribers = [];
let regrasCarregadaDoServidor = false;

const regrasText = document.getElementById("regrasText");

// ============================================================
// Sincronização em tempo real
// ============================================================
function iniciarSincronizacao() {
  pararSincronizacao();

  unsubscribers.push(
    db
      .collection("teams")
      .orderBy("criadoEm")
      .onSnapshot((snap) => {
        teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderTimes();
        renderGrupos();
        ensureMataGerado();
      }),
  );

  unsubscribers.push(
    db.collection("matches_group").onSnapshot((snap) => {
      groupMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderGrupos();
    }),
  );

  unsubscribers.push(
    db
      .collection("tournament")
      .doc("knockout")
      .onSnapshot((snap) => {
        knockoutDoc = snap.exists ? snap.data() : null;
        renderMata();
      }),
  );

  unsubscribers.push(
    db
      .collection("tournament")
      .doc("rules")
      .onSnapshot((snap) => {
        rulesText = snap.exists ? snap.data().text || "" : "";
        // Não sobrescreve enquanto o admin está digitando
        if (document.activeElement !== regrasText) {
          regrasText.value = rulesText;
        }
        regrasCarregadaDoServidor = true;
      }),
  );
}
function pararSincronizacao() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}

// ============================================================
// Trava de campos para usuários comuns (a segurança de verdade
// está nas regras do Firestore — isto é só UX)
// ============================================================
function lockInputs() {
  const admin = currentRole === "admin";
  document
    .querySelectorAll(
      "#regrasText, input[data-mid], input[data-key], #nomeTime, #grupoTime, #vagasPorGrupo",
    )
    .forEach((el) => {
      el.disabled = !admin;
    });
}

// ============================================================
// ABAS
// ============================================================
document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("nav.tabs button")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll("main section")
      .forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "mata") ensureMataGerado();
  });
});

// ============================================================
// REGRAS
// ============================================================
document.getElementById("salvarRegras").addEventListener("click", async () => {
  if (currentRole !== "admin") return;
  await db
    .collection("tournament")
    .doc("rules")
    .set({ text: regrasText.value }, { merge: true });
  const s = document.getElementById("regrasStatus");
  s.textContent = "Salvo ✓";
  setTimeout(() => (s.textContent = ""), 1500);
});

// ============================================================
// TIMES
// ============================================================
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function teamName(id) {
  const t = teams.find((x) => x.id === id);
  return t ? t.name : "—";
}

function renderTimes() {
  const box = document.getElementById("listaTimes");
  if (teams.length === 0) {
    box.innerHTML = '<p class="empty">Nenhum time cadastrado ainda.</p>';
    return;
  }
  const groups = {};
  teams.forEach((t) => {
    (groups[t.group || "—"] = groups[t.group || "—"] || []).push(t);
  });
  box.innerHTML = "";
  Object.keys(groups)
    .sort()
    .forEach((g) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="group-title">Grupo ${escapeHtml(g)}</div>`;
      const list = document.createElement("div");
      list.className = "team-list";
      groups[g].forEach((t) => {
        const item = document.createElement("div");
        item.className = "team-item";
        item.innerHTML = `<span>${escapeHtml(t.name)}</span>`;
        const del = document.createElement("button");
        del.className = "danger admin-only";
        del.textContent = "remover";
        del.addEventListener("click", () => removerTime(t.id));
        item.appendChild(del);
        list.appendChild(item);
      });
      wrap.appendChild(list);
      box.appendChild(wrap);
    });
  lockInputs();
}

document.getElementById("addTime").addEventListener("click", async () => {
  if (currentRole !== "admin") return;
  const nomeEl = document.getElementById("nomeTime");
  const grupoEl = document.getElementById("grupoTime");
  const nome = nomeEl.value.trim();
  const grupo = (grupoEl.value.trim() || "A").toUpperCase();
  if (!nome) return;
  await db
    .collection("teams")
    .add({
      name: nome,
      group: grupo,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
  nomeEl.value = "";
  grupoEl.value = "";
});

async function removerTime(id) {
  if (currentRole !== "admin") return;
  await db.collection("teams").doc(id).delete();
  // remove também os jogos da fase de grupos que envolviam esse time
  const batch = db.batch();
  const relacionados = groupMatches.filter((m) => m.a === id || m.b === id);
  relacionados.forEach((m) =>
    batch.delete(db.collection("matches_group").doc(m.id)),
  );
  if (relacionados.length) await batch.commit();
}

// ============================================================
// FASE DE GRUPOS
// ============================================================
document.getElementById("gerarGrupos").addEventListener("click", async () => {
  if (currentRole !== "admin") return;
  const byGroup = {};
  teams.forEach((t) => (byGroup[t.group] = byGroup[t.group] || []).push(t));
  const existingPairs = new Set(groupMatches.map((m) => m.a + "|" + m.b));
  const batch = db.batch();
  let count = 0;
  Object.keys(byGroup).forEach((g) => {
    const list = byGroup[g];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = list[i].id + "|" + list[j].id;
        if (!existingPairs.has(key)) {
          const ref = db.collection("matches_group").doc();
          batch.set(ref, {
            group: g,
            a: list[i].id,
            b: list[j].id,
            scoreA: null,
            scoreB: null,
            data: "",
            local: "",
          });
          count++;
        }
      }
    }
  });
  if (count) await batch.commit();
});

function computeStandings(groupLetter) {
  const groupTeams = teams.filter((t) => t.group === groupLetter);
  const table = {};
  groupTeams.forEach(
    (t) =>
      (table[t.id] = {
        id: t.id,
        name: t.name,
        pj: 0,
        v: 0,
        e: 0,
        d: 0,
        gp: 0,
        gc: 0,
        pts: 0,
      }),
  );
  groupMatches
    .filter((m) => m.group === groupLetter)
    .forEach((m) => {
      if (
        m.scoreA === null ||
        m.scoreA === "" ||
        m.scoreA === undefined ||
        m.scoreB === null ||
        m.scoreB === "" ||
        m.scoreB === undefined
      )
        return;
      const sa = +m.scoreA,
        sb = +m.scoreB;
      const ta = table[m.a],
        tb = table[m.b];
      if (!ta || !tb) return;
      ta.pj++;
      tb.pj++;
      ta.gp += sa;
      ta.gc += sb;
      tb.gp += sb;
      tb.gc += sa;
      if (sa > sb) {
        ta.v++;
        ta.pts += 3;
        tb.d++;
      } else if (sb > sa) {
        tb.v++;
        tb.pts += 3;
        ta.d++;
      } else {
        ta.e++;
        tb.e++;
        ta.pts += 1;
        tb.pts += 1;
      }
    });
  return Object.values(table).sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    const sgx = x.gp - x.gc,
      sgy = y.gp - y.gc;
    if (sgy !== sgx) return sgy - sgx;
    return y.gp - x.gp;
  });
}

function renderGrupos() {
  const box = document.getElementById("grupoConteudo");
  const groups = [...new Set(teams.map((t) => t.group))].sort();
  if (groups.length === 0) {
    box.innerHTML =
      '<p class="empty">Cadastre times para gerar a fase de grupos.</p>';
    return;
  }
  box.innerHTML = "";
  groups.forEach((g) => {
    const block = document.createElement("div");
    block.className = "group-block";
    const standings = computeStandings(g);
    let tableHtml = `<table><thead><tr><th>Time</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr></thead><tbody>`;
    standings.forEach((t) => {
      tableHtml += `<tr><td>${escapeHtml(t.name)}</td><td>${t.pj}</td><td>${t.v}</td><td>${t.e}</td><td>${t.d}</td><td>${t.gp}</td><td>${t.gc}</td><td>${t.gp - t.gc}</td><td><strong>${t.pts}</strong></td></tr>`;
    });
    tableHtml += "</tbody></table>";

    const matches = groupMatches.filter((m) => m.group === g);
    let matchesHtml = matches.length ? '<div class="card">' : "";
    matches.forEach((m) => {
      matchesHtml += `<div class="match-block">
        <div class="match">
          <span>${escapeHtml(teamName(m.a))} <span class="small">vs</span> ${escapeHtml(teamName(m.b))}</span>
          <input type="number" min="0" data-mid="${m.id}" data-side="A" value="${m.scoreA ?? ""}" placeholder="-">
          <span class="small">×</span>
          <input type="number" min="0" data-mid="${m.id}" data-side="B" value="${m.scoreB ?? ""}" placeholder="-">
        </div>
        <div class="match-meta">
          <input type="datetime-local" data-mid="${m.id}" data-field="data" value="${m.data || ""}">
          <input type="text" data-mid="${m.id}" data-field="local" value="${escapeHtml(m.local || "")}" placeholder="Local do jogo">
        </div>
      </div>`;
    });
    if (matches.length) matchesHtml += "</div>";

    block.innerHTML = `<div class="group-title">Grupo ${escapeHtml(g)}</div><div class="card overflow-x">${tableHtml}</div>${matchesHtml}`;
    box.appendChild(block);
  });

  // placar: salva ao sair do campo (blur / Enter), para não sobrecarregar o Firestore a cada tecla
  box.querySelectorAll("input[data-mid][data-side]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      if (currentRole !== "admin") return;
      const field = inp.dataset.side === "A" ? "scoreA" : "scoreB";
      const val = inp.value === "" ? null : inp.value;
      await db
        .collection("matches_group")
        .doc(inp.dataset.mid)
        .update({ [field]: val });
    });
  });
  box.querySelectorAll("input[data-mid][data-field]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      if (currentRole !== "admin") return;
      await db
        .collection("matches_group")
        .doc(inp.dataset.mid)
        .update({ [inp.dataset.field]: inp.value });
    });
  });
  lockInputs();
}

// ============================================================
// MATA-MATA
// ============================================================
function getQualifiers(n) {
  const groups = [...new Set(teams.map((t) => t.group))].sort();
  const ranked = groups.map((g) =>
    computeStandings(g)
      .slice(0, n)
      .map((t) => ({ name: t.name, group: g })),
  );
  const list = [];
  for (let pos = 0; pos < n; pos++) {
    ranked.forEach((arr) => {
      if (arr[pos]) list.push(arr[pos]);
    });
  }
  return list;
}
function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

async function gerarMataDaClassificacao(n) {
  const qualifiers = getQualifiers(n);
  if (qualifiers.length === 0) return;
  const size = nextPow2(qualifiers.length);
  while (qualifiers.length < size)
    qualifiers.push({ name: "BYE", group: null });
  const paired = [];
  for (let i = 0; i < size / 2; i++) {
    paired.push(qualifiers[i]);
    paired.push(qualifiers[size - 1 - i]);
  }
  await db.collection("tournament").doc("knockout").set({
    qualifiersPerGroup: n,
    qualifiers: paired,
    scores: {},
  });
}
function ensureMataGerado() {
  if (currentRole === "admin" && !knockoutDoc && teams.length > 0) {
    gerarMataDaClassificacao(
      +document.getElementById("vagasPorGrupo").value || 2,
    );
  } else {
    renderMata();
  }
}
document.getElementById("gerarMata").addEventListener("click", () => {
  if (currentRole !== "admin") return;
  const n = Math.max(1, +document.getElementById("vagasPorGrupo").value || 2);
  gerarMataDaClassificacao(n);
});

function computeBracketRounds() {
  if (!knockoutDoc || !knockoutDoc.qualifiers) return [];
  const scores = knockoutDoc.scores || {};
  let current = knockoutDoc.qualifiers.map((q) => q.name);
  const rounds = [];
  let roundIdx = 0;
  while (current.length > 1) {
    const roundMatches = [];
    const winners = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i],
        b = current[i + 1];
      const key = roundIdx + "-" + i / 2;
      const sc = scores[key] || {};
      let winner = null;
      if (a === "BYE" && b !== "BYE") winner = b;
      else if (b === "BYE" && a !== "BYE") winner = a;
      else if (
        sc.scoreA !== undefined &&
        sc.scoreB !== undefined &&
        sc.scoreA !== "" &&
        sc.scoreB !== ""
      ) {
        const sa = +sc.scoreA,
          sb = +sc.scoreB;
        if (sa > sb) winner = a;
        else if (sb > sa) winner = b;
      }
      roundMatches.push({
        key,
        a,
        b,
        scoreA: sc.scoreA ?? "",
        scoreB: sc.scoreB ?? "",
        data: sc.data || "",
        local: sc.local || "",
        winner,
      });
      winners.push(winner || "A definir");
    }
    rounds.push(roundMatches);
    current = winners;
    roundIdx++;
  }
  return rounds;
}
function roundLabel(idx, total) {
  const remaining = total - idx;
  if (remaining === 1) return "Final";
  if (remaining === 2) return "Semifinal";
  if (remaining === 3) return "Quartas de final";
  if (remaining === 4) return "Oitavas de final";
  return "Rodada " + (idx + 1);
}
function renderMata() {
  const box = document.getElementById("mataConteudo");
  if (!knockoutDoc) {
    box.innerHTML =
      '<p class="empty">O chaveamento será gerado automaticamente assim que houver times na fase de grupos.</p>';
    return;
  }
  const rounds = computeBracketRounds();
  const wrap = document.createElement("div");
  wrap.className = "bracket";
  rounds.forEach((round, ridx) => {
    const col = document.createElement("div");
    col.className = "round";
    col.innerHTML = `<div class="group-title">${roundLabel(ridx, rounds.length)}</div>`;
    round.forEach((m) => {
      const div = document.createElement("div");
      div.className = "match";
      const rowA = document.createElement("div");
      rowA.className =
        "team-row" + (m.winner === m.a && m.a !== "A definir" ? " winner" : "");
      rowA.innerHTML =
        `<span>${escapeHtml(m.a)}</span>` +
        (m.a !== "BYE" && m.b !== "BYE"
          ? `<input type="number" min="0" data-key="${m.key}" data-side="A" value="${m.scoreA}">`
          : "");
      const rowB = document.createElement("div");
      rowB.className =
        "team-row" + (m.winner === m.b && m.b !== "A definir" ? " winner" : "");
      rowB.innerHTML =
        `<span>${escapeHtml(m.b)}</span>` +
        (m.a !== "BYE" && m.b !== "BYE"
          ? `<input type="number" min="0" data-key="${m.key}" data-side="B" value="${m.scoreB}">`
          : "");
      div.appendChild(rowA);
      div.appendChild(rowB);
      if (m.a !== "BYE" && m.b !== "BYE") {
        const meta = document.createElement("div");
        meta.className = "match-meta";
        meta.innerHTML = `<input type="datetime-local" data-key="${m.key}" data-field="data" value="${m.data}">
          <input type="text" data-key="${m.key}" data-field="local" value="${escapeHtml(m.local)}" placeholder="Local do jogo">`;
        div.appendChild(meta);
      }
      col.appendChild(div);
    });
    wrap.appendChild(col);
  });
  box.innerHTML = "";
  box.appendChild(wrap);

  box.querySelectorAll("input[data-key][data-side]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      if (currentRole !== "admin") return;
      const field = inp.dataset.side === "A" ? "scoreA" : "scoreB";
      await db
        .collection("tournament")
        .doc("knockout")
        .update({ [`scores.${inp.dataset.key}.${field}`]: inp.value });
    });
  });
  box.querySelectorAll("input[data-key][data-field]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      if (currentRole !== "admin") return;
      await db
        .collection("tournament")
        .doc("knockout")
        .update({
          [`scores.${inp.dataset.key}.${inp.dataset.field}`]: inp.value,
        });
    });
  });
  lockInputs();
}
