"use strict";
/* =====================================================================
   RoboSapiens 2026 — Robô Estoura Balão
   Aplicação estática (index.html + style.css + script.js), dados no
   localStorage do navegador. O "Telão" pode ser aberto numa segunda
   janela (index.html#telao), que acompanha tudo em tempo real.
   ===================================================================== */

const KEY = "robosapiens_estoura_baloes_v3";
const OLD_KEY = "robosapiens_estoura_baloes_v2";
const TELAO_WINDOW = location.hash === "#telao";

/* ---------- Regras (Regulamento RoboSapiens 2026, seção 5) ---------- */
const FREE_EVENTS = [
  { pts: 50, label: "Balão de outra cor", short: "+50", icon: "🎈", cls: "good" },
  { pts: -50, label: "Balão da própria cor", short: "−50", icon: "💥", cls: "bad" },
  { pts: -30, label: "Saiu da arena", short: "−30", icon: "↗", cls: "bad" }
];
const MATCH_EVENTS = [
  { pts: 100, label: "Estourou balão adversário", short: "+100", icon: "🎈" },
  { pts: 30, label: "Adversário saiu da arena", short: "+30", icon: "↗" }
];
const ROUND1_SECONDS = 120, BREAK_SECONDS = 120, ROUND2_SECONDS = 60;
const WIN_PTS = 3, DRAW_PTS = 1, LOSS_PTS = 0;

const TIEBREAKS = {
  direto: { label: "Confronto direto", desc: "Pontos nos jogos entre as equipes empatadas" },
  saldo: { label: "Saldo de pontos", desc: "Pontos marcados − pontos sofridos nos confrontos" },
  pro: { label: "Pontos marcados", desc: "Total de pontos marcados nos confrontos" },
  vitorias: { label: "Número de vitórias", desc: "Mais vitórias na fase preliminar" },
  arena: { label: "Resultado da Arena Livre", desc: "Pontuação na classificação da Arena Livre" },
  sorteio: { label: "Numeração do sorteio", desc: "Menor número sorteado fica à frente" }
};

const DEFAULT_COLORS = [
  ["Vermelho", "#e53935"], ["Azul", "#1e88e5"], ["Verde", "#43a047"], ["Amarelo", "#fdd835"],
  ["Laranja", "#fb8c00"], ["Roxo", "#8e24aa"], ["Rosa", "#ec407a"], ["Ciano", "#26c6da"]
];

const INITIAL_TEAMS = [
  { id: "byte-force", number: 1, name: "Byte Force", school: "Senai RS", robot: "Gaara", members: "Antônia Pires Beckenkamp · Pietro Chiele Ott · Samuel Appolo · Sarah Zamin Sant'Anna", professor: "Francisco da Silva Brandão" },
  { id: "metalbots", number: 2, name: "MetalBots", school: "Senai RS", robot: "Zóio", members: "Isaque da Silva Simon · Braian de Oliveira Pereira · Vitor Scapin · Yasmin Borges Bittencort", professor: "Renata Taís Lunkes" },
  { id: "equipe-decio", number: 3, name: "Equipe Décio", school: "CME Dr. Décio Gomes Pereira - UEB", robot: "Gladiador", members: "Lucas Matheus Sartori da Silva · Peterson Phorlan Blankenhiem Alves · Asafe Junior Mendez dos Reis Schoenardie · Want Arthur Haag", professor: "Marco Joel Berghan" },
  { id: "ayrton-bots", number: 4, name: "Ayrton Bots", school: "CME Ayrton Senna - UEB", robot: "Gladiador", members: "Rebecca Karloh Soares · Luiz Henrique dos Santos Pescador · Miguel Abbady Flôr Machado · Brayan Gustavo Soares dos Santos", professor: "Elci Uylson Farias Ferreira" },
  { id: "robotech-pastor3", number: 5, name: "RoboTech Pastor3", school: "EMEB Pastor Rodolfo Saenger", robot: "RoboTech Pastor3", members: "Eduarda Deobald Girelli · Felipe Wauskiez Schimitt · Gustavo Lupschinski Wendling · Mateus Gabriel Kuhn Blaszczekievicz", professor: "Eliana Kuhn Blaszczekievicz" },
  { id: "robotech-pastor1", number: 6, name: "RoboTech Pastor1", school: "EMEB Pastor Rodolfo Saenger", robot: "RoboTech Pastor1", members: "João Affonso Felin · Gustavo Mendes dos Reis · Murilo Eduardo Gabriele · Victor Trintin Petry", professor: "Eliana Kuhn Blaszczekievicz" },
  { id: "robotech-pastor2", number: 7, name: "RoboTech Pastor2", school: "EMEB Pastor Rodolfo Saenger", robot: "RoboTech Pastor2", members: "Artur Traichel Hendges · Pyetro Augusto Siebert Wiedemann · Leonardo Bergmann Garcia Oliveira · Gabriel da Silva Gulart", professor: "Eliana Kuhn Blaszczekievicz" }
];

/* ============================ ESTADO ============================ */
function uid() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* segue */ }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function defaultColors() { return DEFAULT_COLORS.map(([name, hex], i) => ({ id: uid(), number: i + 1, name, hex })); }
function defaultSettings() {
  return {
    freeRounds: 4, freeSeconds: 30, freeRankMode: "soma", freeMinZero: false,
    tiebreak: [{ key: "direto", on: true }, { key: "saldo", on: true }, { key: "pro", on: true },
      { key: "vitorias", on: false }, { key: "arena", on: false }, { key: "sorteio", on: false }]
  };
}
function fresh(teamsList) {
  return {
    version: 3,
    view: "inicio",
    teams: (teamsList || INITIAL_TEAMS).map(t => ({ ...t })),
    colors: defaultColors(),
    settings: defaultSettings(),
    free: { current: null, attempts: [] },
    cup: { matches: [], liveId: null, manualOrder: [] },
    display: { mode: "auto", reveal: false }
  };
}
const str = v => (v === undefined || v === null) ? "" : String(v).trim();
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

function normTeam(t, i) {
  return {
    id: str(t.id) || uid(), number: Math.max(1, Math.round(num(t.number, i + 1))),
    name: str(t.name) || `Equipe ${String(i + 1).padStart(2, "0")}`, school: str(t.school),
    robot: str(t.robot), professor: str(t.professor), members: str(t.members)
  };
}
function normTimer(t, dur) {
  t = t || {};
  const status = ["idle", "running", "paused", "over"].includes(t.status) ? t.status : "idle";
  return { status, duration: num(t.duration, dur), remaining: num(t.remaining, dur), endsAt: num(t.endsAt, 0) };
}
function normEvents(list) {
  return (Array.isArray(list) ? list : []).filter(e => e && Number.isFinite(Number(e.pts)))
    .map(e => ({ id: str(e.id) || uid(), pts: Number(e.pts), label: str(e.label) || "Pontuação", t: str(e.t) || "00:00", side: e.side === "b" ? "b" : e.side === "a" ? "a" : undefined, seq: num(e.seq, 0) }));
}
function normalize(raw) {
  const base = fresh([]);
  const s = { ...base, ...(raw && typeof raw === "object" ? raw : {}) };
  s.version = 3;
  s.teams = (Array.isArray(s.teams) ? s.teams : []).filter(t => t && typeof t === "object").map(normTeam);
  s.colors = (Array.isArray(s.colors) && s.colors.length ? s.colors : defaultColors())
    .filter(c => c && typeof c === "object")
    .map((c, i) => ({ id: str(c.id) || uid(), number: Math.max(1, Math.round(num(c.number, i + 1))), name: str(c.name) || `Cor ${i + 1}`, hex: /^#[0-9a-f]{6}$/i.test(str(c.hex)) ? str(c.hex) : "#9e9e9e" }));
  const st = { ...defaultSettings(), ...(s.settings || {}) };
  st.freeRounds = Math.min(4, Math.max(1, Math.round(num(st.freeRounds, 4))));
  st.freeSeconds = Math.min(600, Math.max(5, Math.round(num(st.freeSeconds, 30))));
  st.freeRankMode = st.freeRankMode === "melhor" ? "melhor" : "soma";
  st.freeMinZero = !!st.freeMinZero;
  const tb = Array.isArray(st.tiebreak) ? st.tiebreak.filter(x => x && TIEBREAKS[x.key]) : [];
  Object.keys(TIEBREAKS).forEach(k => { if (!tb.some(x => x.key === k)) tb.push({ key: k, on: false }); });
  st.tiebreak = tb.map(x => ({ key: x.key, on: !!x.on }));
  s.settings = st;
  const ids = new Set(s.teams.map(t => t.id));
  const f = s.free && typeof s.free === "object" ? s.free : {};
  s.free = {
    attempts: (Array.isArray(f.attempts) ? f.attempts : []).filter(a => a && ids.has(a.teamId)).map(a => ({
      id: str(a.id) || uid(), teamId: a.teamId, round: Math.max(1, Math.round(num(a.round, 1))),
      color: normColorSnap(a.color), events: normEvents(a.events), at: str(a.at)
    })),
    current: null
  };
  if (f.current && ids.has(f.current.teamId)) {
    s.free.current = { id: str(f.current.id) || uid(), teamId: f.current.teamId, round: Math.max(1, Math.round(num(f.current.round, 1))), color: normColorSnap(f.current.color), events: normEvents(f.current.events), timer: normTimer(f.current.timer, st.freeSeconds) };
  }
  const c = s.cup && typeof s.cup === "object" ? s.cup : {};
  s.cup = {
    matches: (Array.isArray(c.matches) ? c.matches : []).filter(m => m && ["prelim", "semi", "final"].includes(m.stage)).map(m => ({
      id: str(m.id) || uid(), stage: m.stage, order: Math.round(num(m.order, 1)),
      a: ids.has(m.a) ? m.a : null, b: ids.has(m.b) ? m.b : null,
      status: ["pending", "live", "done"].includes(m.status) ? m.status : "pending",
      phase: ["r1", "break", "r2", "review"].includes(m.phase) ? m.phase : "r1",
      timer: normTimer(m.timer, ROUND1_SECONDS),
      rounds: { 1: { events: normEvents(m.rounds?.[1]?.events) }, 2: { events: normEvents(m.rounds?.[2]?.events) } },
      winner: m.winner === "draw" || ids.has(m.winner) ? m.winner : null,
      pick: ids.has(m.pick) ? m.pick : null, byDecision: !!m.byDecision,
      _backup: typeof m._backup === "string" ? m._backup : undefined
    })).filter(m => m.a && m.b),
    liveId: str(c.liveId) || null,
    manualOrder: (Array.isArray(c.manualOrder) ? c.manualOrder : []).filter(id => ids.has(id))
  };
  if (!s.cup.matches.some(m => m.id === s.cup.liveId && m.status === "live")) {
    s.cup.liveId = null;
    s.cup.matches.forEach(m => { if (m.status === "live") m.status = "pending"; });
  }
  s.display = { mode: ["auto", "arena", "cup", "bracket"].includes(s.display?.mode) ? s.display.mode : "auto", reveal: !!s.display?.reveal };
  s.view = ["inicio", "equipes", "cores", "arena", "confrontos", "telao", "config"].includes(s.view) ? s.view : "inicio";
  return s;
}
function normColorSnap(c) {
  if (!c || typeof c !== "object") return null;
  return { id: str(c.id), number: Math.round(num(c.number, 0)), name: str(c.name) || "Cor", hex: /^#[0-9a-f]{6}$/i.test(str(c.hex)) ? str(c.hex) : "#9e9e9e" };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    // Migração da versão anterior: aproveita apenas o cadastro das equipes
    // (pontuações antigas acumuladas eram a origem de valores como −140).
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      if (Array.isArray(o.teams) && o.teams.length) return normalize(fresh(o.teams.map(t => ({ id: t.id, number: t.number, name: t.name, school: t.school, robot: t.robot, professor: t.professor, members: t.members }))));
    }
  } catch (e) { console.warn("Falha ao ler dados salvos", e); }
  return normalize(fresh());
}
let state = load();
function save() {
  if (TELAO_WINDOW) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Não foi possível salvar no navegador"); }
}

/* Ocultar/revelar pontuação (sempre começa oculto) */
let reveal = false;
if (!TELAO_WINDOW) { state.display.reveal = false; save(); }
let reviewRound = 2;

/* ============================ UTILITÁRIOS ============================ */
function esc(s) { return str(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function signed(n) { n = num(n); return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0"; }
function pad2(n) { return String(Math.max(0, Math.round(num(n)))).padStart(2, "0"); }
function fmt(sec) { sec = Math.max(0, Math.ceil(num(sec))); return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`; }
let toastTimer = null;
function toast(msg) {
  const e = document.getElementById("toast"); if (!e) return;
  e.textContent = msg; e.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => e.classList.remove("show"), 2400);
}
function beep() {
  if (TELAO_WINDOW) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext; const c = new C();
    const o = c.createOscillator(), g = c.createGain(); o.type = "square"; o.frequency.value = 880;
    o.connect(g); g.connect(c.destination); g.gain.value = 0.08; o.start(); o.stop(c.currentTime + 0.7);
  } catch (e) { /* sem áudio */ }
}
function textOn(hex) {
  const h = str(hex).replace("#", ""); if (h.length !== 6) return "#111";
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#111" : "#fff";
}
const main = () => document.getElementById("main");

/* Timers baseados em horário: sobrevivem a recarregar a página e
   sincronizam com a janela do telão. */
function left(t) { if (!t) return 0; return t.status === "running" ? Math.max(0, (t.endsAt - Date.now()) / 1000) : Math.max(0, t.remaining); }
function newTimer(sec) { return { status: "idle", duration: sec, remaining: sec, endsAt: 0 }; }
function tStart(t) { if (t.status === "running" || t.status === "over") return; t.endsAt = Date.now() + t.remaining * 1000; t.status = "running"; }
function tPause(t) { if (t.status !== "running") return; t.remaining = left(t); t.status = "paused"; }
function elapsed(t) { return fmt(t.duration - left(t)); }

/* ============================ EQUIPES / CORES ============================ */
const teams = () => state.teams;
const sortedTeams = () => [...state.teams].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
const findTeam = id => state.teams.find(t => t.id === id) || null;
const teamName = (id, fb = "A definir") => findTeam(id)?.name || fb;
const schoolText = t => t && t.school ? t.school : "Escola não informada";
const teamNo = t => `Equipe ${pad2(t?.number)}`;
const sortedColors = () => [...state.colors].sort((a, b) => a.number - b.number);
function colorChip(c, big = false) {
  if (!c) return `<span class="muted">Sem cor</span>`;
  return `<span class="cchip ${big ? "big" : ""}" style="--c:${esc(c.hex)};--t:${textOn(c.hex)}"><i>${esc(c.number)}</i><span>${esc(c.name)}</span></span>`;
}
function teamCell(t, extra = "") {
  return `<div class="tcell"><b>${esc(t?.name || "A definir")}</b><small>${esc(t ? schoolText(t) : "")}</small>${extra}</div>`;
}
const hide = (v, cls = "") => reveal ? `<b class="${cls}">${v}</b>` : `<span class="score-hidden" aria-label="Oculto">••</span>`;
function eyeBtn() {
  return `<button class="btn eye ${reveal ? "on" : ""}" onclick="toggleReveal()" aria-pressed="${reveal}" title="${reveal ? "Ocultar" : "Revelar"} pontuação">${reveal ? "🙈 Ocultar pontuação" : "👁️ Pontuação"}</button>`;
}
function toggleReveal() { reveal = !reveal; render(); }

/* ============================ NAVEGAÇÃO ============================ */
function nav(view) { state.view = view; save(); render(); window.scrollTo({ top: 0 }); }
function render() {
  if (TELAO_WINDOW) { renderTelaoWindow(); return; }
  const v = state.view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  ({ inicio, equipes, cores, arena, confrontos, telao, config })[v]();
  updateTimers();
}
function head(title, sub, action = "") {
  return `<div class="page-head"><div><div class="eyebrow">RoboSapiens 2026 · IFSul Sapiranga</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${action ? `<div class="head-actions">${action}</div>` : ""}</div>`;
}

/* ============================ INÍCIO ============================ */
function inicio() {
  const fs = freeSummary(), cs = cupSummary(), champ = champion();
  const cur = state.free.current, live = liveMatch();
  let now = `<div class="empty-sm">Nada em andamento.</div>`;
  if (cur) now = `<div class="now-item"><span class="tag arena">ARENA LIVRE</span><b>${esc(teamName(cur.teamId))}</b><span>Rodada ${cur.round} · ${colorChip(cur.color)}</span><button class="btn primary" onclick="nav('arena')">Abrir Arena Livre</button></div>`;
  else if (live) now = `<div class="now-item"><span class="tag cup">CONFRONTO DIRETO</span><b>${esc(teamName(live.a))} × ${esc(teamName(live.b))}</b><span>${esc(matchLabel(live))}</span><button class="btn primary" onclick="nav('confrontos')">Abrir Confrontos</button></div>`;
  const nf = nextFree(), nm = nextMatch();
  main().innerHTML = head("Central da Competição", "Modalidade Robô Estoura Balão · Ensino Fundamental") +
    (champ ? `<div class="champion-banner"><div class="trophy">🏆</div><div><div class="eyebrow">CAMPEÃO</div><h2>${esc(champ.name)}</h2><p>${esc(schoolText(champ))}</p></div></div>` : "") +
    `<div class="grid g4">
      ${stat("Equipes", teams().length, "👥", "cadastradas")}
      ${stat("Cores", state.colors.length, "🎨", "de balões")}
      ${stat("Arena Livre", `${fs.done}/${fs.total}`, "🎈", "tentativas realizadas")}
      ${stat("Confrontos", `${cs.done}/${cs.total}`, "⚔️", cs.stageText)}
    </div>
    <div class="grid g2 mt">
      <div class="card"><h3>Agora</h3>${now}</div>
      <div class="card"><h3>Próximos</h3>
        <div class="next-list">
          <div><span class="tag arena">ARENA LIVRE</span> ${nf ? `<b>${esc(teamName(nf.teamId))}</b> · Rodada ${nf.round}` : `<span class="muted">${fs.total ? "Concluída ✓" : "Cadastre equipes"}</span>`}</div>
          <div><span class="tag cup">CONFRONTO</span> ${nm ? `<b>${esc(teamName(nm.a))} × ${esc(teamName(nm.b))}</b> · ${esc(matchLabel(nm))}` : `<span class="muted">${cs.total ? (champ ? "Competição encerrada ✓" : "Aguardando próxima fase") : "Gere a fase preliminar"}</span>`}</div>
        </div>
      </div>
    </div>
    <div class="steps mt">
      <button class="step" onclick="nav('equipes')"><i>1</i><b>Equipes</b><span>Confira nomes e escolas</span></button>
      <button class="step" onclick="nav('cores')"><i>2</i><b>Cores</b><span>Cores 1 a 8 dos balões</span></button>
      <button class="step" onclick="nav('arena')"><i>3</i><b>Arena Livre</b><span>Uma equipe por vez · até ${state.settings.freeRounds} rodadas</span></button>
      <button class="step" onclick="nav('confrontos')"><i>4</i><b>Confrontos</b><span>Preliminar → Semifinais → Final</span></button>
      <button class="step" onclick="nav('telao')"><i>📺</i><b>Telão</b><span>Tela para o público</span></button>
    </div>
    <div class="card mt"><h3>Regras essenciais</h3>
      <div class="grid g2">
        <div class="notice"><b>🎈 Arena Livre</b> — 2,70 × 2,70 m · uma equipe por vez · ${state.settings.freeSeconds} s por tentativa · +50 balão de outra cor · −50 balão da própria cor · −30 saída da arena</div>
        <div class="notice cup"><b>⚔️ Confronto Direto</b> — 1,20 × 1,20 m · Round 1 até 2 min · intervalo até 2 min · Round 2 até 1 min · +100 por balão adversário · +30 quando o adversário sai</div>
      </div>
      <p class="muted small mt-s">A Arena Livre e o Confronto Direto têm classificações separadas.</p>
    </div>`;
}
function stat(label, value, icon, sub) { return `<div class="card stat"><div class="icon">${icon}</div><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`; }

/* ============================ TELA: EQUIPES ============================ */
function equipes() {
  const started = state.free.attempts.length || state.free.current || state.cup.matches.length;
  const cards = sortedTeams().map(t => `<div class="card team-card">
      <div class="team-top"><span class="team-num">${teamNo(t)}</span></div>
      <div class="team-name">${esc(t.name)}</div>
      <div class="team-school"><span class="school-label">ESCOLA</span>${esc(schoolText(t))}</div>
      ${t.robot || t.professor ? `<div class="team-meta">${t.robot ? `<span>🤖 Robô: ${esc(t.robot)}</span>` : ""}${t.professor ? `<span>👨‍🏫 ${esc(t.professor)}</span>` : ""}</div>` : ""}
      ${t.members ? `<div class="team-members"><span class="school-label">INTEGRANTES</span>${esc(t.members)}</div>` : ""}
      <div class="team-actions"><button class="btn small" onclick="editTeam('${esc(t.id)}')">✏️ Editar</button><button class="btn small danger" onclick="deleteTeam('${esc(t.id)}')">🗑 Excluir</button></div>
    </div>`).join("");
  main().innerHTML = head("Equipes", `${teams().length} equipes cadastradas.`,
    `<button class="btn" onclick="drawNumbers()">🎲 Sortear numeração</button><button class="btn primary" onclick="teamForm()">+ Nova equipe</button>`) +
    (started ? `<div class="notice warn mb">A competição já começou. Alterar nomes é seguro; excluir equipes ou refazer o sorteio pode exigir reiniciar etapas.</div>` : "") +
    `<div class="grid g3">${cards || `<div class="empty span-all">Nenhuma equipe cadastrada. Clique em <b>+ Nova equipe</b>.</div>`}</div>`;
}
function teamForm(id) {
  const t = id ? findTeam(id) : null;
  openModal(`<h2>${t ? "Editar equipe" : "Nova equipe"}</h2>
    <form id="teamF"><div class="form-grid">
      <div><label>Nome da equipe *</label><input name="name" required maxlength="60" value="${esc(t?.name)}"></div>
      <div><label>Escola *</label><input name="school" required maxlength="90" value="${esc(t?.school)}"></div>
      <div><label>Robô</label><input name="robot" maxlength="60" value="${esc(t?.robot)}"></div>
      <div><label>Professor(a) orientador(a)</label><input name="professor" maxlength="80" value="${esc(t?.professor)}"></div>
      <div class="full"><label>Integrantes (separe por · ou vírgula)</label><input name="members" maxlength="400" value="${esc(t?.members)}"></div>
      <div><label>Numeração</label><input name="number" type="number" min="1" max="99" value="${t ? t.number : nextNumber()}"></div>
    </div>
    <div class="actions mt"><button class="btn primary big">Salvar</button><button type="button" class="btn big" onclick="closeModal()">Cancelar</button></div></form>`);
  document.getElementById("teamF").onsubmit = e => {
    e.preventDefault(); const f = new FormData(e.target);
    const data = { name: str(f.get("name")), school: str(f.get("school")), robot: str(f.get("robot")), professor: str(f.get("professor")), members: str(f.get("members")), number: Math.max(1, Math.round(num(f.get("number"), nextNumber()))) };
    if (!data.name || !data.school) return toast("Informe o nome da equipe e da escola.");
    if (teams().some(x => x !== t && x.name.toLowerCase() === data.name.toLowerCase())) return toast("Já existe uma equipe com esse nome.");
    if (teams().some(x => x !== t && x.number === data.number)) return toast(`A numeração ${pad2(data.number)} já está em uso.`);
    if (t) Object.assign(t, data); else state.teams.push({ id: uid(), ...data });
    save(); closeModal(); toast(t ? "Equipe atualizada" : "Equipe adicionada"); render();
  };
}
const editTeam = id => teamForm(id);
function nextNumber() { return Math.max(0, ...teams().map(t => t.number)) + 1; }
function deleteTeam(id) {
  const t = findTeam(id); if (!t) return;
  if (state.free.current?.teamId === id) return toast("A equipe está na arena agora. Cancele a tentativa antes.");
  if (state.cup.matches.some(m => m.a === id || m.b === id)) return toast("A equipe está nos confrontos. Reinicie os confrontos em Configurações para excluí-la.");
  const n = state.free.attempts.filter(a => a.teamId === id).length;
  if (!confirm(`Excluir a equipe "${t.name}"?${n ? `\n\nAs ${n} tentativa(s) dela na Arena Livre também serão apagadas.` : ""}`)) return;
  state.teams = state.teams.filter(x => x.id !== id);
  state.free.attempts = state.free.attempts.filter(a => a.teamId !== id);
  state.cup.manualOrder = state.cup.manualOrder.filter(x => x !== id);
  save(); toast("Equipe excluída"); render();
}
function drawNumbers() {
  if (!teams().length) return toast("Cadastre as equipes primeiro.");
  const warn = state.cup.matches.length ? "\n\nOs confrontos já gerados NÃO mudam; para usar a nova numeração, gere a fase preliminar novamente." : "";
  if (!confirm("Sortear a numeração de todas as equipes?" + warn)) return;
  const nums = shuffle(teams().map((_, i) => i + 1));
  teams().forEach((t, i) => { t.number = nums[i]; });
  save(); toast("Numeração sorteada"); render();
}
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ============================ TELA: CORES ============================ */
function cores() {
  const rows = sortedColors().map(c => `<div class="card color-card">
      <div class="swatch" style="--c:${esc(c.hex)};--t:${textOn(c.hex)}">${esc(c.number)}</div>
      <div class="color-info"><b>Cor ${esc(c.number)}</b><span>${esc(c.name)}</span></div>
      <div class="actions"><button class="btn small" onclick="colorForm('${esc(c.id)}')">✏️ Editar</button><button class="btn small danger" onclick="deleteColor('${esc(c.id)}')">🗑</button></div>
    </div>`).join("");
  main().innerHTML = head("Cores dos balões", "Numeradas de 1 a 8. Na Arena Livre, a cor de cada tentativa é sorteada entre estas.",
    `<button class="btn primary" onclick="colorForm()">+ Nova cor</button>`) +
    `<div class="grid g4">${rows || `<div class="empty span-all">Nenhuma cor cadastrada. A Arena Livre precisa de pelo menos uma cor.</div>`}</div>
     <div class="actions mt"><button class="btn small" onclick="restoreColors()">↻ Restaurar as 8 cores padrão</button></div>`;
}
function colorForm(id) {
  const c = id ? state.colors.find(x => x.id === id) : null;
  const next = Math.max(0, ...state.colors.map(x => x.number)) + 1;
  openModal(`<h2>${c ? "Editar cor" : "Nova cor"}</h2><form id="colorF"><div class="form-grid">
      <div><label>Número *</label><input name="number" type="number" min="1" max="99" required value="${c ? c.number : next}"></div>
      <div><label>Nome *</label><input name="name" required maxlength="30" value="${esc(c?.name)}" placeholder="Ex.: Vermelho"></div>
      <div><label>Cor</label><input name="hex" type="color" value="${esc(c?.hex || "#e53935")}"></div>
    </div><div class="actions mt"><button class="btn primary big">Salvar</button><button type="button" class="btn big" onclick="closeModal()">Cancelar</button></div></form>`);
  document.getElementById("colorF").onsubmit = e => {
    e.preventDefault(); const f = new FormData(e.target);
    const data = { number: Math.max(1, Math.round(num(f.get("number"), next))), name: str(f.get("name")), hex: str(f.get("hex")) || "#9e9e9e" };
    if (!data.name) return toast("Informe o nome da cor.");
    if (state.colors.some(x => x !== c && x.number === data.number)) return toast(`O número ${data.number} já está em uso.`);
    if (c) Object.assign(c, data); else state.colors.push({ id: uid(), ...data });
    save(); closeModal(); toast(c ? "Cor atualizada" : "Cor adicionada"); render();
  };
}
function deleteColor(id) {
  const c = state.colors.find(x => x.id === id); if (!c) return;
  if (!confirm(`Excluir a cor ${c.number} (${c.name})?\nResultados já registrados não mudam.`)) return;
  state.colors = state.colors.filter(x => x.id !== id); save(); toast("Cor excluída"); render();
}
function restoreColors() {
  if (!confirm("Substituir a lista atual pelas 8 cores padrão?")) return;
  state.colors = defaultColors(); save(); toast("Cores restauradas"); render();
}

/* ============================ ARENA LIVRE: LÓGICA ============================ */
function attemptTotal(a) {
  const t = (a.events || []).reduce((s, e) => s + e.pts, 0);
  return state.settings.freeMinZero ? Math.max(0, t) : t;
}
function attemptOf(teamId, round) { return state.free.attempts.find(a => a.teamId === teamId && a.round === round) || null; }
function freeQueue() {
  const R = state.settings.freeRounds, list = [];
  for (let r = 1; r <= R; r++) sortedTeams().forEach(t => {
    const att = attemptOf(t.id, r), cur = state.free.current;
    list.push({ teamId: t.id, round: r, attempt: att, current: !!(cur && cur.teamId === t.id && cur.round === r) });
  });
  return list;
}
function nextFree() { return freeQueue().find(q => !q.attempt && !q.current) || null; }
function freeSummary() {
  const total = teams().length * state.settings.freeRounds;
  const done = state.free.attempts.filter(a => a.round <= state.settings.freeRounds && findTeam(a.teamId)).length;
  return { total, done };
}
function currentFreeRound() { const q = freeQueue().find(x => !x.attempt); return q ? q.round : state.settings.freeRounds; }
function drawColor(exceptId) {
  const pool = state.colors.filter(c => c.id !== exceptId);
  const list = pool.length ? pool : state.colors;
  const c = list[Math.floor(Math.random() * list.length)];
  return c ? { id: c.id, number: c.number, name: c.name, hex: c.hex } : null;
}
function callTeam(teamId, round) {
  if (state.free.current) return toast("Já existe uma equipe na arena. Registre ou cancele a tentativa atual.");
  if (liveMatch()) return toast("Há um Confronto Direto em andamento. Finalize-o antes.");
  if (!state.colors.length) { toast("Cadastre as cores antes."); return nav("cores"); }
  if (attemptOf(teamId, round)) return toast("Essa tentativa já foi registrada.");
  const prev = state.free.attempts.filter(a => a.teamId === teamId).sort((a, b) => b.round - a.round)[0];
  state.free.current = { id: uid(), teamId, round, color: drawColor(prev?.color?.id), events: [], timer: newTimer(state.settings.freeSeconds) };
  save(); render();
}
function callNext() { const n = nextFree(); if (!n) return toast("Todas as tentativas já foram realizadas."); callTeam(n.teamId, n.round); }
function redrawColor() {
  const cur = state.free.current; if (!cur) return;
  if (cur.timer.status !== "idle") return toast("A cor só pode ser trocada antes de iniciar.");
  cur.color = drawColor(cur.color?.id); save(); render();
}
function setColor(id) {
  const cur = state.free.current, c = state.colors.find(x => x.id === id); if (!cur || !c) return;
  if (cur.timer.status !== "idle") return toast("A cor só pode ser trocada antes de iniciar.");
  cur.color = { id: c.id, number: c.number, name: c.name, hex: c.hex }; save(); render();
}
function freeToggle() {
  const t = state.free.current?.timer; if (!t) return;
  if (t.status === "running") tPause(t); else if (t.status !== "over") tStart(t);
  save(); render();
}
function freeEvent(i) {
  const cur = state.free.current, ev = FREE_EVENTS[i]; if (!cur || !ev) return;
  if (cur.timer.status === "idle") return toast("Inicie o cronômetro antes de marcar pontos.");
  cur.events.push({ id: uid(), pts: ev.pts, label: ev.label, t: elapsed(cur.timer), seq: Date.now() });
  save(); render();
}
function freeUndo() {
  const cur = state.free.current; if (!cur || !cur.events.length) return toast("Nenhuma marcação para desfazer.");
  const e = cur.events.pop(); save(); toast(`Desfeito: ${signed(e.pts)} ${e.label}`); render();
}
function freeRemoveEvent(id) {
  const cur = state.free.current; if (!cur) return;
  cur.events = cur.events.filter(e => e.id !== id); save(); render();
}
function freeFinish() {
  const cur = state.free.current; if (!cur) return;
  if (cur.timer.status === "idle") return toast("A tentativa ainda não começou.");
  const total = attemptTotal(cur);
  if (!confirm(`Registrar o resultado de ${teamName(cur.teamId)} na Rodada ${cur.round}?\n\nPontuação: ${signed(total)}`)) return;
  state.free.attempts.push({ id: cur.id, teamId: cur.teamId, round: cur.round, color: cur.color, events: cur.events, at: new Date().toISOString() });
  state.free.current = null; save(); toast("Resultado registrado"); render();
}
function freeCancel() {
  const cur = state.free.current; if (!cur) return;
  if ((cur.events.length || cur.timer.status !== "idle") && !confirm("Cancelar esta tentativa? As marcações dela serão descartadas e a equipe volta para a fila.")) return;
  state.free.current = null; save(); render();
}
function freeVoid(id) {
  const a = state.free.attempts.find(x => x.id === id); if (!a) return;
  if (!confirm(`Anular a tentativa de ${teamName(a.teamId)} na Rodada ${a.round}?\nA equipe volta para a fila dessa rodada.`)) return;
  state.free.attempts = state.free.attempts.filter(x => x.id !== id); save(); toast("Tentativa anulada"); render();
}
function freeRanking() {
  const R = state.settings.freeRounds;
  return sortedTeams().map(t => {
    const scores = []; for (let r = 1; r <= R; r++) { const a = attemptOf(t.id, r); scores.push(a ? attemptTotal(a) : null); }
    const vals = scores.filter(v => v !== null);
    const sum = vals.reduce((s, v) => s + v, 0), best = vals.length ? Math.max(...vals) : 0;
    return { team: t, scores, done: vals.length, sum, best, total: state.settings.freeRankMode === "melhor" ? best : sum };
  }).sort((a, b) => b.total - a.total || b.best - a.best || b.sum - a.sum || a.team.number - b.team.number);
}

/* ============================ TELA: ARENA LIVRE ============================ */
function arena() {
  const cur = state.free.current, fs = freeSummary(), R = state.settings.freeRounds;
  main().innerHTML = head("🎈 Arena Livre", `Uma equipe por vez · ${R} rodada${R > 1 ? "s" : ""} · ${state.settings.freeSeconds} s por tentativa · arena 2,70 × 2,70 m`,
    `${eyeBtn()}<button class="btn" onclick="openTelaoWindow()">📺 Abrir telão</button>`) +
    `<div class="mode-banner arena"><b>ARENA LIVRE</b><span>Prova individual — classificação própria, separada do Confronto Direto.</span><span class="pill">${fs.done}/${fs.total} tentativas</span></div>
    <div class="arena-layout">
      <div>${cur ? freeStage(cur) : freeIdle()}</div>
      <div>${freeQueueCard()}</div>
    </div>
    ${freeRankingCard()}`;
}
function freeIdle() {
  const n = nextFree(), fs = freeSummary();
  if (!teams().length) return `<div class="card stage"><div class="empty">Cadastre as equipes para começar.</div></div>`;
  if (!state.colors.length) return `<div class="card stage"><div class="notice warn">Nenhuma cor cadastrada. <button class="btn small" onclick="nav('cores')">Cadastrar cores</button></div></div>`;
  if (!n) return `<div class="card stage center"><div class="big-check">✓</div><h2>Arena Livre concluída</h2><p class="muted">${fs.done} tentativas registradas. Veja a classificação abaixo.</p></div>`;
  const t = findTeam(n.teamId);
  return `<div class="card stage center">
    <div class="eyebrow">PRÓXIMA NA ARENA · RODADA ${n.round} DE ${state.settings.freeRounds}</div>
    <div class="stage-team">${esc(t.name)}</div><div class="stage-school">${esc(schoolText(t))}</div>
    <button class="btn primary huge mt" onclick="callNext()">📣 Chamar para a arena</button>
    <p class="muted small mt-s">A cor dos balões da equipe é sorteada ao chamar.</p>
  </div>`;
}
function freeStage(cur) {
  const t = findTeam(cur.teamId), tm = cur.timer, total = attemptTotal(cur);
  const toggle = tm.status === "running" ? `⏸ Pausar` : tm.status === "paused" ? `▶ Retomar` : `▶ Iniciar ${state.settings.freeSeconds} s`;
  const statusTxt = { idle: "PRONTA PARA INICIAR", running: "EM ANDAMENTO", paused: "PAUSADA", over: "TEMPO ESGOTADO" }[tm.status];
  const colorSel = tm.status === "idle" ? `<div class="color-pick"><select onchange="setColor(this.value)" aria-label="Trocar cor">${sortedColors().map(c => `<option value="${esc(c.id)}" ${c.id === cur.color?.id ? "selected" : ""}>Cor ${esc(c.number)} · ${esc(c.name)}</option>`).join("")}</select><button class="btn small" onclick="redrawColor()">🎲 Sortear outra</button></div>` : "";
  return `<div class="card stage live-${tm.status}">
    <div class="stage-top"><span class="pill">RODADA ${cur.round} DE ${state.settings.freeRounds}</span><span class="pill">${teamNo(t)}</span></div>
    <div class="stage-team">${esc(t.name)}</div><div class="stage-school">${esc(schoolText(t))}</div>
    <div class="stage-color"><span class="muted small">COR DA EQUIPE (própria)</span>${colorChip(cur.color, true)}${colorSel}</div>
    <div class="stage-mid">
      <div><div class="timer" data-timer="free">${fmt(left(tm))}</div><div class="status-txt s-${tm.status}">${tm.status === "running" ? '<i class="dot-live"></i>' : ""}${statusTxt}</div></div>
      <div class="stage-score"><span>PONTOS</span><b class="${total < 0 ? "minus" : ""}">${signed(total)}</b></div>
    </div>
    <div class="score-btns">${FREE_EVENTS.map((e, i) => `<button class="btn score ${e.cls}" onclick="freeEvent(${i})" ${tm.status === "idle" ? "disabled" : ""}><b>${e.short}</b><span>${e.icon} ${e.label}</span></button>`).join("")}</div>
    <div class="ctrl-row">
      <button class="btn ${tm.status === "running" ? "" : "primary"} big grow" onclick="freeToggle()" ${tm.status === "over" ? "disabled" : ""}>${toggle}</button>
      <button class="btn big" onclick="freeUndo()" ${cur.events.length ? "" : "disabled"}>↶ Desfazer última</button>
      <button class="btn warning big grow" onclick="freeFinish()" ${tm.status === "idle" ? "disabled" : ""}>✓ Registrar resultado</button>
    </div>
    <div class="log">${cur.events.slice().reverse().map(e => `<div class="log-item"><span>${esc(e.t)} · ${esc(e.label)}</span><b class="${e.pts >= 0 ? "plus" : "minus"}">${signed(e.pts)}</b><button class="x" title="Remover esta marcação" onclick="freeRemoveEvent('${esc(e.id)}')">✕</button></div>`).join("") || `<div class="muted small">Nenhuma marcação ainda.</div>`}</div>
    <div class="right"><button class="btn small ghost" onclick="freeCancel()">✕ Cancelar tentativa</button></div>
  </div>`;
}
function freeQueueCard() {
  const R = state.settings.freeRounds, q = freeQueue(), cur = state.free.current, next = nextFree(), cr = currentFreeRound();
  let html = "";
  for (let r = 1; r <= R; r++) {
    const items = q.filter(x => x.round === r), done = items.filter(x => x.attempt).length;
    const rows = items.map(x => {
      const t = findTeam(x.teamId);
      let chip, act = "";
      if (x.current) chip = `<span class="chip live">● Em arena</span>`;
      else if (x.attempt) chip = `<span class="chip done">✓ ${reveal ? signed(attemptTotal(x.attempt)) : "Jogou"}</span>`;
      else {
        chip = next && next.teamId === x.teamId && next.round === r ? `<span class="chip next">Próxima</span>` : `<span class="chip wait">Na fila</span>`;
        if (!cur) act = `<button class="btn tiny" onclick="callTeam('${esc(x.teamId)}',${r})">Chamar</button>`;
      }
      return `<div class="q-row ${x.current ? "is-live" : ""}">${teamCell(t)}${chip}${act}</div>`;
    }).join("");
    html += `<details class="q-round" ${r === cr ? "open" : ""}><summary><b>Rodada ${r}</b><span class="muted">${done}/${items.length}</span></summary>${rows || `<div class="muted small">Sem equipes.</div>`}</details>`;
  }
  return `<div class="card"><h3>Fila da Arena Livre</h3>${html}</div>`;
}
function freeRankingCard() {
  const R = state.settings.freeRounds, rk = freeRanking();
  const rows = (reveal ? rk : [...rk].sort((a, b) => a.team.number - b.team.number)).map((x, i) => `<tr>
      <td class="pos">${reveal ? `${i + 1}º` : "–"}</td><td>${teamCell(x.team)}</td>
      ${x.scores.map(v => `<td class="num">${v === null ? `<span class="muted">—</span>` : hide(signed(v), v < 0 ? "minus" : "")}</td>`).join("")}
      <td class="num total">${x.done ? hide(signed(x.total), x.total < 0 ? "minus" : "") : `<span class="muted">—</span>`}</td></tr>`).join("");
  const hist = [...state.free.attempts].sort((a, b) => str(b.at).localeCompare(str(a.at))).map(a => `<div class="log-item"><span><b>${esc(teamName(a.teamId, "Equipe removida"))}</b> · Rodada ${a.round} · ${colorChip(a.color)}</span><b>${hide(signed(attemptTotal(a)))}</b><button class="btn tiny danger" onclick="freeVoid('${esc(a.id)}')">Anular</button></div>`).join("");
  return `<div class="card mt"><div class="card-head"><h3>🏆 Classificação da Arena Livre</h3>${eyeBtn()}</div>
    ${reveal ? "" : `<p class="muted small">Pontuação oculta — equipes listadas pela numeração. Clique no 👁️ para revelar.</p>`}
    <div class="table-wrap"><table class="table"><thead><tr><th>Pos.</th><th>Equipe</th>${Array.from({ length: R }, (_, i) => `<th class="num">R${i + 1}</th>`).join("")}<th class="num">${state.settings.freeRankMode === "melhor" ? "Melhor" : "Total"}</th></tr></thead><tbody>${rows || `<tr><td colspan="${R + 3}">Nenhuma equipe.</td></tr>`}</tbody></table></div>
    <details class="mt-s"><summary class="muted">Histórico de tentativas (${state.free.attempts.length})</summary><div class="log">${hist || `<div class="muted small">Nenhuma tentativa registrada.</div>`}</div></details>
  </div>`;
}

/* ============================ CONFRONTOS: LÓGICA ============================ */
const STAGE_ORDER = { prelim: 0, semi: 1, final: 2 };
const matches = () => [...state.cup.matches].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.order - b.order);
const prelims = () => matches().filter(m => m.stage === "prelim");
const semis = () => matches().filter(m => m.stage === "semi");
const finalMatch = () => state.cup.matches.find(m => m.stage === "final") || null;
const liveMatch = () => state.cup.matches.find(m => m.id === state.cup.liveId && m.status === "live") || null;
const nextMatch = () => matches().find(m => m.status === "pending") || null;
function matchLabel(m) {
  if (m.stage === "prelim") return `Fase preliminar · Confronto ${m.order} de ${prelims().length}`;
  if (m.stage === "semi") return `Semifinal ${m.order} · ${m.order === 1 ? "1º × 4º" : "2º × 3º"}`;
  return "FINAL";
}
function sideScore(m, side, round) {
  const rs = round ? [round] : [1, 2];
  return rs.reduce((s, r) => s + m.rounds[r].events.filter(e => e.side === side).reduce((x, e) => x + e.pts, 0), 0);
}
function cupSummary() {
  const ms = state.cup.matches, done = ms.filter(m => m.status === "done").length;
  const n = prelims().length, total = n ? n + 3 : 0;
  let stageText = "fase preliminar";
  if (finalMatch()) stageText = finalMatch().status === "done" ? "encerrado" : "final";
  else if (semis().length) stageText = "semifinais";
  else if (!n) stageText = "não gerados";
  return { done, total, stageText };
}

/* Gera a fase preliminar: cada equipe joga exatamente 2 vezes, sem
   repetir confrontos (ciclo pela numeração do sorteio), ordenado para
   que nenhuma equipe jogue dois confrontos seguidos. */
function buildPrelimPairs(ids) {
  const n = ids.length, edges = [];
  for (let i = 0; i < n; i++) edges.push([ids[i], ids[(i + 1) % n]]);
  let order = [];
  for (let s = 0; s < 2; s++) for (let i = s; i < n; i += 2) order.push(edges[i]);
  if (conflicts(order) === 0) return order;
  const best = searchOrder(edges);
  return best || order;
}
function conflicts(list) {
  let c = 0;
  for (let i = 1; i < list.length; i++) if (list[i].some(x => list[i - 1].includes(x))) c++;
  return c;
}
function searchOrder(edges) {
  const n = edges.length, used = Array(n).fill(false), path = [];
  let steps = 0;
  const dfs = () => {
    if (path.length === n) return true;
    if (++steps > 200000) return false;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const last = path[path.length - 1];
      if (last && edges[i].some(x => last.includes(x))) continue;
      used[i] = true; path.push(edges[i]);
      if (dfs()) return true;
      used[i] = false; path.pop();
    }
    return false;
  };
  return dfs() ? path : null;
}
function emptyMatch(stage, order, a, b) {
  return { id: uid(), stage, order, a, b, status: "pending", phase: "r1", timer: newTimer(ROUND1_SECONDS), rounds: { 1: { events: [] }, 2: { events: [] } }, winner: null, pick: null, byDecision: false };
}
function generatePrelim() {
  const list = sortedTeams();
  if (list.length < 4) return toast("São necessárias pelo menos 4 equipes.");
  if (state.cup.matches.length && !confirm("Gerar a fase preliminar novamente?\n\nTODOS os confrontos e resultados (incluindo semifinais e final) serão apagados.")) return;
  const pairs = buildPrelimPairs(list.map(t => t.id));
  state.cup = { matches: pairs.map((p, i) => emptyMatch("prelim", i + 1, p[0], p[1])), liveId: null, manualOrder: [] };
  save(); toast(`${pairs.length} confrontos gerados`); render();
}

/* ---- Classificação da fase preliminar ---- */
function prelimStats() {
  const ids = new Set(); prelims().forEach(m => { ids.add(m.a); ids.add(m.b); });
  const map = {};
  [...ids].forEach(id => { map[id] = { team: findTeam(id), J: 0, V: 0, E: 0, D: 0, PM: 0, PS: 0, SG: 0, P: 0, total: prelims().filter(m => m.a === id || m.b === id).length }; });
  prelims().filter(m => m.status === "done").forEach(m => {
    const sa = sideScore(m, "a"), sb = sideScore(m, "b"), A = map[m.a], B = map[m.b];
    A.J++; B.J++; A.PM += sa; A.PS += sb; B.PM += sb; B.PS += sa;
    if (sa > sb) { A.V++; B.D++; A.P += WIN_PTS; B.P += LOSS_PTS; }
    else if (sb > sa) { B.V++; A.D++; B.P += WIN_PTS; A.P += LOSS_PTS; }
    else { A.E++; B.E++; A.P += DRAW_PTS; B.P += DRAW_PTS; }
  });
  Object.values(map).forEach(s => { s.SG = s.PM - s.PS; });
  return Object.values(map).filter(s => s.team);
}
function critValue(key, s, group) {
  if (key === "direto") {
    const g = new Set(group.map(x => x.team.id)); let p = 0;
    prelims().filter(m => m.status === "done" && g.has(m.a) && g.has(m.b) && (m.a === s.team.id || m.b === s.team.id)).forEach(m => {
      const mine = m.a === s.team.id ? "a" : "b", other = mine === "a" ? "b" : "a";
      const x = sideScore(m, mine), y = sideScore(m, other); p += x > y ? WIN_PTS : x === y ? DRAW_PTS : LOSS_PTS;
    });
    return p;
  }
  if (key === "saldo") return s.SG;
  if (key === "pro") return s.PM;
  if (key === "vitorias") return s.V;
  if (key === "arena") return freeRanking().find(r => r.team.id === s.team.id)?.total || 0;
  if (key === "sorteio") return -s.team.number;
  return 0;
}
function splitBy(group, crits) {
  if (group.length <= 1) return [{ list: group, tied: false }];
  if (!crits.length) return [{ list: group, tied: true }];
  const [c, ...rest] = crits;
  const vals = new Map(group.map(s => [s, critValue(c, s, group)]));
  const sorted = [...group].sort((a, b) => vals.get(b) - vals.get(a));
  const parts = [];
  sorted.forEach(s => { const last = parts[parts.length - 1]; if (last && vals.get(last[0]) === vals.get(s)) last.push(s); else parts.push([s]); });
  return parts.flatMap(p => splitBy(p, rest));
}
function standings() {
  const stats = prelimStats();
  const crits = state.settings.tiebreak.filter(x => x.on).map(x => x.key);
  const byPts = [...stats].sort((a, b) => b.P - a.P);
  const groups = [];
  byPts.forEach(s => { const g = groups[groups.length - 1]; if (g && g[0].P === s.P) g.push(s); else groups.push([s]); });
  const mo = state.cup.manualOrder, rows = [];
  groups.flatMap(g => splitBy(g, crits)).forEach(part => {
    let list = [...part.list].sort((a, b) => a.team.number - b.team.number), tied = part.tied, manual = false;
    if (tied && list.every(s => mo.includes(s.team.id))) { list.sort((a, b) => mo.indexOf(a.team.id) - mo.indexOf(b.team.id)); tied = false; manual = true; }
    const gid = list.map(s => s.team.id).join("|");
    list.forEach(s => rows.push({ ...s, tied, manual, gid, groupSize: list.length }));
  });
  rows.forEach((r, i) => { r.pos = i + 1; });
  return rows;
}
function prelimDone() { const p = prelims(); return p.length > 0 && p.every(m => m.status === "done"); }
function blockingTie(rows) { return rows.some(r => r.tied && r.pos <= 4); }
function moveInTie(id, dir) {
  const rows = standings(), i = rows.findIndex(r => r.team.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length || rows[i].gid !== rows[j].gid) return;
  const ids = rows.map(r => r.team.id);[ids[i], ids[j]] = [ids[j], ids[i]];
  state.cup.manualOrder = ids; save(); render();
}
function confirmTieOrder(gid) {
  const rows = standings(); state.cup.manualOrder = rows.map(r => r.team.id);
  save(); toast("Ordem definida pela Comissão Organizadora"); checkProgress(); render();
}
function clearManualOrder() {
  if (!confirm("Remover as decisões manuais de desempate?")) return;
  state.cup.manualOrder = []; save(); render();
}

/* ---- Avanço automático de fase ---- */
function winnerOf(m) { return m && m.status === "done" && m.winner && m.winner !== "draw" ? m.winner : null; }
function seeds() { return standings().slice(0, 4).map(r => r.team.id); }
function checkProgress() {
  if (prelimDone() && !semis().length) {
    const rows = standings();
    if (rows.length < 4) return;
    if (blockingTie(rows)) { toast("Empate não resolvido na classificação — defina a ordem para gerar as semifinais."); return; }
    const s = seeds();
    state.cup.matches.push(emptyMatch("semi", 1, s[0], s[3]), emptyMatch("semi", 2, s[1], s[2]));
    toast("Semifinais geradas: 1º × 4º e 2º × 3º");
  }
  const [s1, s2] = semis();
  if (s1 && s2 && winnerOf(s1) && winnerOf(s2) && !finalMatch()) {
    state.cup.matches.push(emptyMatch("final", 1, winnerOf(s1), winnerOf(s2)));
    toast("Final gerada");
  }
  save();
}
function champion() { const f = finalMatch(); return winnerOf(f) ? findTeam(f.winner) : null; }

/* ---- Condução do confronto ---- */
function startMatch(id) {
  const m = state.cup.matches.find(x => x.id === id); if (!m) return;
  if (liveMatch()) return toast("Já existe um confronto em andamento.");
  if (state.free.current) return toast("Há uma equipe na Arena Livre. Registre ou cancele a tentativa antes.");
  if (m.status !== "pending") return;
  Object.assign(m, { status: "live", phase: "r1", timer: newTimer(ROUND1_SECONDS), rounds: { 1: { events: [] }, 2: { events: [] } }, winner: null, pick: null, byDecision: false });
  state.cup.liveId = m.id; save(); nav("confrontos");
}
function matchToggle() {
  const m = liveMatch(); if (!m || m.phase === "review") return;
  const t = m.timer;
  if (t.status === "running") tPause(t); else if (t.status !== "over") tStart(t);
  save(); render();
}
function endRound() {
  const m = liveMatch(); if (!m) return;
  if (m.phase === "r1") {
    if (m.timer.status === "idle") return toast("O Round 1 ainda não começou.");
    if (!confirm("Encerrar o Round 1 e iniciar o intervalo?")) return;
    m.phase = "break"; m.timer = newTimer(BREAK_SECONDS); tStart(m.timer);
  } else if (m.phase === "r2") {
    if (m.timer.status === "idle") return toast("O Round 2 ainda não começou.");
    if (!confirm("Encerrar o Round 2?")) return;
    m.phase = "review"; m.timer = newTimer(0); m.timer.status = "over"; reviewRound = 2;
  }
  save(); render();
}
function startRound2() {
  const m = liveMatch(); if (!m || m.phase !== "break") return;
  m.phase = "r2"; m.timer = newTimer(ROUND2_SECONDS); save(); render();
}
function activeRound(m) { return m.phase === "r1" ? 1 : m.phase === "r2" ? 2 : m.phase === "review" ? reviewRound : null; }
function matchEvent(side, i) {
  const m = liveMatch(), ev = MATCH_EVENTS[i]; if (!m || !ev) return;
  const r = activeRound(m);
  if (!r) return toast("Intervalo: registro de pontos fechado. Use ↶ Desfazer para corrigir.");
  if ((m.phase === "r1" || m.phase === "r2") && m.timer.status === "idle") return toast("Inicie o round antes de marcar pontos.");
  m.rounds[r].events.push({ id: uid(), side, pts: ev.pts, label: ev.label, t: m.phase === "review" ? "correção" : elapsed(m.timer), seq: Date.now() });
  save(); render();
}
function matchUndo(side) {
  const m = liveMatch(); if (!m) return;
  let best = null;
  [1, 2].forEach(r => m.rounds[r].events.forEach((e, idx) => { if (e.side === side && (!best || e.seq >= best.e.seq)) best = { r, idx, e }; }));
  if (!best) return toast(`Nenhuma marcação de ${teamName(side === "a" ? m.a : m.b)} para desfazer.`);
  m.rounds[best.r].events.splice(best.idx, 1);
  save(); toast(`Desfeito: ${signed(best.e.pts)} de ${teamName(side === "a" ? m.a : m.b)}`); render();
}
function matchRemoveEvent(r, id) {
  const m = liveMatch(); if (!m) return;
  m.rounds[r].events = m.rounds[r].events.filter(e => e.id !== id); save(); render();
}
function setReviewRound(r) { reviewRound = r; render(); }
function pickWinner(id) { const m = liveMatch(); if (!m) return; m.pick = id; save(); render(); }
function confirmResult() {
  const m = liveMatch(); if (!m || m.phase !== "review") return;
  const sa = sideScore(m, "a"), sb = sideScore(m, "b");
  let winner = sa > sb ? m.a : sb > sa ? m.b : "draw", byDecision = false;
  if (winner === "draw" && m.stage !== "prelim") {
    if (!m.pick) return toast("Empate em fase eliminatória: selecione o vencedor definido pela comissão.");
    winner = m.pick; byDecision = true;
  }
  const txt = winner === "draw" ? "EMPATE" : `Vencedor: ${teamName(winner)}${byDecision ? " (decisão da comissão)" : ""}`;
  // Se o confronto for uma correção, verificar impacto nas fases seguintes
  const ko = state.cup.matches.filter(x => x.stage !== "prelim");
  if (m.stage === "prelim" && ko.length) {
    const prev = { status: m.status, winner: m.winner };
    m.status = "done"; m.winner = winner;
    const s = seeds(), rows = standings(); const [s1, s2] = semis();
    const same = !blockingTie(rows) && s1 && s2 && s1.a === s[0] && s1.b === s[3] && s2.a === s[1] && s2.b === s[2];
    m.status = prev.status; m.winner = prev.winner;
    if (!same) {
      if (!confirm(`${txt}\n\nCom essa correção a classificação muda: semifinais e final serão apagadas e geradas novamente. Continuar?`)) return;
      state.cup.matches = state.cup.matches.filter(x => x.stage === "prelim");
    } else if (!confirm(`${sa} × ${sb}\n${txt}\n\nConfirmar resultado?`)) return;
  } else if (m.stage === "semi" && finalMatch() && finalMatch().id !== m.id) {
    const other = semis().find(x => x.id !== m.id), f = finalMatch();
    const expect = m.order === 1 ? [winner, winnerOf(other)] : [winnerOf(other), winner];
    if (f.a !== expect[0] || f.b !== expect[1]) {
      if (!confirm(`${txt}\n\nO vencedor mudou: a final será apagada e gerada novamente. Continuar?`)) return;
      state.cup.matches = state.cup.matches.filter(x => x.stage !== "final");
    } else if (!confirm(`${sa} × ${sb}\n${txt}\n\nConfirmar resultado?`)) return;
  } else if (!confirm(`${teamName(m.a)} ${sa} × ${sb} ${teamName(m.b)}\n${txt}\n\nConfirmar resultado?`)) return;
  Object.assign(m, { status: "done", winner, byDecision, phase: "review", timer: newTimer(0) }); delete m._backup;
  state.cup.liveId = null; save();
  checkProgress();
  toast(m.stage === "final" ? `🏆 ${teamName(winner)} é CAMPEÃO!` : "Resultado registrado");
  render();
}
function cancelMatch() {
  const m = liveMatch(); if (!m) return;
  if (m.winner) { // era uma correção: volta ao resultado anterior
    if (!confirm("Descartar a correção? As alterações feitas agora serão perdidas.")) return;
    Object.assign(m, JSON.parse(m._backup || "{}"), { status: "done" }); delete m._backup;
  } else {
    if (!confirm("Cancelar este confronto? As marcações serão descartadas e ele volta para a fila.")) return;
    Object.assign(m, { status: "pending", phase: "r1", timer: newTimer(ROUND1_SECONDS), rounds: { 1: { events: [] }, 2: { events: [] } }, pick: null });
  }
  state.cup.liveId = null; save(); render();
}
function reopenMatch(id) {
  const m = state.cup.matches.find(x => x.id === id); if (!m || m.status !== "done") return;
  if (liveMatch()) return toast("Finalize o confronto em andamento antes de corrigir outro.");
  if (m.stage === "semi" && finalMatch()?.status === "done") return toast("A final já foi disputada. Corrija a final primeiro ou gere novamente a fase.");
  if (m.stage === "prelim" && state.cup.matches.some(x => x.stage !== "prelim" && x.status === "done") && !confirm("Já existem jogos eliminatórios disputados. Se a correção mudar a classificação, eles serão apagados. Continuar?")) return;
  m._backup = JSON.stringify({ rounds: m.rounds, winner: m.winner, pick: m.pick, byDecision: m.byDecision, phase: m.phase });
  Object.assign(m, { status: "live", phase: "review", timer: newTimer(0) }); m.timer.status = "over";
  state.cup.liveId = m.id; reviewRound = 2; save(); render();
  document.querySelector(".live-panel")?.scrollIntoView({ behavior: "smooth" });
}

/* ============================ TELA: CONFRONTOS ============================ */
function confrontos() {
  const live = liveMatch(), champ = champion(), n = prelims().length;
  main().innerHTML = head("⚔️ Confronto Direto", "Fase preliminar (cada equipe joga 2 vezes) → Semifinais (1º×4º, 2º×3º) → Final",
    `${eyeBtn()}<button class="btn" onclick="openTelaoWindow()">📺 Abrir telão</button>${n ? `<button class="btn small ghost" onclick="generatePrelim()">↻ Gerar novamente</button>` : ""}`) +
    `<div class="mode-banner cup"><b>CONFRONTO DIRETO</b><span>Duas equipes por vez na arena de 1,20 × 1,20 m — classificação própria, separada da Arena Livre.</span></div>` +
    (champ ? `<div class="champion-banner"><div class="trophy">🏆</div><div><div class="eyebrow">CAMPEÃO</div><h2>${esc(champ.name)}</h2><p>${esc(schoolText(champ))}</p></div></div>` : "") +
    (!n ? `<div class="card center stage"><h2>Fase preliminar</h2><p class="muted">${teams().length} equipes · cada equipe disputa exatamente 2 confrontos, sem repetição · ${teams().length >= 4 ? `${teams().length} confrontos` : "mínimo 4 equipes"}</p><button class="btn primary huge" onclick="generatePrelim()" ${teams().length < 4 ? "disabled" : ""}>🔀 Gerar fase preliminar</button></div>`
      : `${phaseTracker()}${live ? livePanel(live) : nextPanel()}
      <div class="cup-layout mt">${prelimCard()}${standingsCard()}</div>
      ${bracketCard()}`);
}
function phaseTracker() {
  const p = prelims(), pd = p.filter(m => m.status === "done").length, s = semis(), sd = s.filter(m => m.status === "done").length, f = finalMatch();
  const st = (label, info, state_) => `<div class="phase ${state_}"><b>${label}</b><span>${info}</span></div>`;
  return `<div class="phases">
    ${st("Fase preliminar", `${pd}/${p.length}`, pd === p.length ? "done" : "active")}
    ${st("Semifinais", s.length ? `${sd}/2` : "aguardando", !s.length ? "" : sd === 2 ? "done" : "active")}
    ${st("Final", f ? (f.status === "done" ? "encerrada" : "a disputar") : "aguardando", !f ? "" : f.status === "done" ? "done" : "active")}
  </div>`;
}
function nextPanel() {
  const m = nextMatch();
  if (!m) {
    if (champion()) return "";
    if (prelimDone() && !semis().length) return `<div class="card stage center"><h2>Fase preliminar encerrada</h2><p class="muted">Há empate na classificação que precisa ser resolvido. Use as setas ▲▼ na classificação e confirme.</p></div>`;
    return `<div class="card stage center muted">Aguardando…</div>`;
  }
  const a = findTeam(m.a), b = findTeam(m.b);
  return `<div class="card stage">
    <div class="center"><div class="eyebrow">PRÓXIMO CONFRONTO · ${esc(matchLabel(m)).toUpperCase()}</div></div>
    <div class="versus"><div class="vs-team">${teamCell(a)}</div><div class="vs">×</div><div class="vs-team">${teamCell(b)}</div></div>
    <div class="center"><button class="btn primary huge" onclick="startMatch('${esc(m.id)}')" ${state.free.current ? "disabled" : ""}>▶ Chamar e iniciar confronto</button>
    ${state.free.current ? `<p class="muted small">Há uma tentativa da Arena Livre em andamento.</p>` : ""}</div>
  </div>`;
}
function livePanel(m) {
  const a = findTeam(m.a), b = findTeam(m.b), t = m.timer, ph = m.phase, fix = !!m._backup;
  const phases = [["r1", "Round 1 · 2:00"], ["break", "Intervalo · 2:00"], ["r2", "Round 2 · 1:00"], ["review", "Resultado"]];
  const idx = phases.findIndex(p => p[0] === ph);
  const bar = `<div class="roundbar">${phases.map((p, i) => `<span class="round-pill ${i === idx ? "active" : i < idx ? "past" : ""}">${p[1]}</span>`).join("")}</div>`;
  const statusTxt = ph === "review" ? (fix ? "CORRIGINDO RESULTADO" : "CONFERÊNCIA DO RESULTADO") : ph === "break" ? (t.status === "over" ? "INTERVALO ENCERRADO" : "INTERVALO PARA AJUSTES") : { idle: "PRONTO PARA INICIAR", running: `ROUND ${ph === "r1" ? 1 : 2} EM ANDAMENTO`, paused: "PAUSADO", over: "TEMPO ESGOTADO" }[t.status];
  const sa = sideScore(m, "a"), sb = sideScore(m, "b");
  const canScore = ph === "review" || ((ph === "r1" || ph === "r2") && t.status !== "idle");
  const fighter = (side, tm, sc) => `<div class="fighter ${ph === "review" && sa !== sb && (side === "a" ? sa > sb : sb > sa) ? "win" : ""}">
      ${teamCell(tm)}
      <div class="pts">${sc}</div>
      <div class="muted small">R1 ${sideScore(m, side, 1)} · R2 ${sideScore(m, side, 2)}</div>
      <div class="fighter-btns">${MATCH_EVENTS.map((e, i) => `<button class="btn score ${i === 0 ? "good" : ""}" onclick="matchEvent('${side}',${i})" ${canScore ? "" : "disabled"}><b>${e.short}</b><span>${e.icon} ${e.label}</span></button>`).join("")}</div>
      <button class="btn undo" onclick="matchUndo('${side}')">↶ Desfazer última de ${esc(tm?.name)}</button>
    </div>`;
  let ctrl = "";
  if (ph === "r1" || ph === "r2") {
    const toggle = t.status === "running" ? "⏸ Pausar" : t.status === "paused" ? "▶ Retomar" : `▶ Iniciar Round ${ph === "r1" ? 1 : 2}`;
    ctrl = `<button class="btn ${t.status === "running" ? "" : "primary"} big grow" onclick="matchToggle()" ${t.status === "over" ? "disabled" : ""}>${toggle}</button><button class="btn warning big grow" onclick="endRound()" ${t.status === "idle" ? "disabled" : ""}>✓ Encerrar Round ${ph === "r1" ? 1 : 2}</button>`;
  } else if (ph === "break") ctrl = `<button class="btn primary big grow" onclick="startRound2()">▶ Ir para o Round 2</button>`;
  else {
    const draw = sa === sb;
    const pick = draw && m.stage !== "prelim" ? `<div class="notice warn">Empate em fase eliminatória. Selecione o vencedor conforme decisão da Comissão Organizadora:<div class="actions mt-s">${[m.a, m.b].map(id => `<button class="btn ${m.pick === id ? "primary" : ""}" onclick="pickWinner('${esc(id)}')">${m.pick === id ? "✓ " : ""}${esc(teamName(id))}</button>`).join("")}</div></div>` : "";
    ctrl = `<div class="review">
      <div class="review-res">${draw ? (m.stage === "prelim" ? "EMPATE · 1 ponto para cada" : "EMPATE") : `Vencedor: <b>${esc(teamName(sa > sb ? m.a : m.b))}</b>`}</div>
      ${pick}
      <div class="review-round muted small">Correções (+) vão para: <button class="btn tiny ${reviewRound === 1 ? "primary" : ""}" onclick="setReviewRound(1)">Round 1</button><button class="btn tiny ${reviewRound === 2 ? "primary" : ""}" onclick="setReviewRound(2)">Round 2</button></div>
      <button class="btn primary huge" onclick="confirmResult()">✓ Confirmar resultado</button></div>`;
  }
  const logs = [1, 2].map(r => m.rounds[r].events.slice().reverse().map(e => `<div class="log-item"><span>R${r} · ${esc(e.t)} · <b>${esc(teamName(e.side === "a" ? m.a : m.b))}</b> · ${esc(e.label)}</span><b class="plus">+${e.pts}</b><button class="x" title="Remover esta marcação" onclick="matchRemoveEvent(${r},'${esc(e.id)}')">✕</button></div>`).join("")).reverse().join("");
  return `<div class="card live-panel">
    <div class="center"><div class="eyebrow">${fix ? "CORREÇÃO · " : "EM ANDAMENTO · "}${esc(matchLabel(m)).toUpperCase()}</div></div>
    ${bar}
    ${ph === "review" ? "" : `<div class="timer" data-timer="match">${fmt(left(t))}</div>`}
    <div class="center"><span class="status-txt s-${ph === "review" ? "over" : t.status}">${t.status === "running" ? '<i class="dot-live"></i>' : ""}${statusTxt}</span></div>
    <div class="versus live">${fighter("a", a, sa)}<div class="vs">×</div>${fighter("b", b, sb)}</div>
    <div class="ctrl-row">${ctrl}</div>
    <details class="mt-s" ${logs ? "open" : ""}><summary class="muted">Marcações (${m.rounds[1].events.length + m.rounds[2].events.length}) — clique em ✕ para remover uma específica</summary><div class="log">${logs || `<div class="muted small">Nenhuma marcação.</div>`}</div></details>
    <div class="right"><button class="btn small ghost" onclick="cancelMatch()">${fix ? "✕ Descartar correção" : "✕ Cancelar confronto"}</button></div>
  </div>`;
}
function matchRow(m) {
  const live = liveMatch(), nm = nextMatch();
  let chip = `<span class="chip wait">Na fila</span>`;
  if (m.status === "live") chip = `<span class="chip live">● Jogando</span>`;
  else if (m.status === "done") chip = `<span class="chip done">✓ Encerrado</span>`;
  else if (nm && nm.id === m.id) chip = `<span class="chip next">Próximo</span>`;
  const act = m.status === "pending" && !live ? `<button class="btn tiny primary" onclick="startMatch('${esc(m.id)}')">Iniciar</button>`
    : m.status === "done" && !live ? `<button class="btn tiny" onclick="reopenMatch('${esc(m.id)}')" title="Corrigir resultado">✏️ Corrigir</button>` : "";
  const w = id => reveal && m.status === "done" && m.winner === id ? "win" : "";
  const sc = side => m.status !== "done" ? "" : reveal ? `<b>${sideScore(m, side)}</b>` : `<span class="score-hidden">••</span>`;
  return `<div class="m-row ${m.status}"><span class="m-no">${m.stage === "prelim" ? m.order : ""}</span>
    <div class="m-teams"><div class="${w(m.a)}"><span>${esc(teamName(m.a))}</span>${sc("a")}</div><div class="${w(m.b)}"><span>${esc(teamName(m.b))}</span>${sc("b")}</div></div>
    <div class="m-side">${chip}${act}</div></div>`;
}
function prelimCard() {
  return `<div class="card"><h3>Fase preliminar · ${prelims().length} confrontos</h3><div class="m-list">${prelims().map(matchRow).join("")}</div>
    <p class="muted small mt-s">Cada equipe joga exatamente 2 vezes, sem confrontos repetidos e sem jogar duas vezes seguidas.</p></div>`;
}
function teamStatus(id, rows) {
  const live = liveMatch(), nm = nextMatch(), c = champion(), f = finalMatch();
  if (live && (live.a === id || live.b === id)) return `<span class="chip live">● Jogando</span>`;
  if (c && c.id === id) return `<span class="chip gold">🏆 Campeão</span>`;
  if (nm && (nm.a === id || nm.b === id)) return `<span class="chip next">Próximo</span>`;
  if (semis().length) {
    const inKo = semis().some(m => m.a === id || m.b === id);
    if (!inKo) return `<span class="chip out">Eliminado</span>`;
    const lostSemi = semis().some(m => (m.a === id || m.b === id) && winnerOf(m) && winnerOf(m) !== id);
    if (lostSemi) return `<span class="chip out">Semifinalista</span>`;
    if (f && f.status === "done") return `<span class="chip done">Vice-campeão</span>`;
    return `<span class="chip ok">${f ? "Finalista" : "Semifinal"}</span>`;
  }
  const s = rows.find(r => r.team.id === id);
  if (s && s.J >= s.total) return `<span class="chip done">Jogou ${s.J}/${s.total}</span>`;
  return `<span class="chip wait">Na fila · ${s ? s.J : 0}/${s ? s.total : 2}</span>`;
}
function standingsCard() {
  const rows = standings(), done = prelimDone(), crits = state.settings.tiebreak.filter(x => x.on).map(x => TIEBREAKS[x.key].label);
  const list = reveal ? rows : [...rows].sort((a, b) => a.team.number - b.team.number);
  const body = list.map(r => {
    const cls = reveal && done ? (r.pos <= 4 ? "qual" : "elim") : "";
    const arrows = reveal && done && r.tied ? `<span class="tie-arrows"><button class="btn tiny" onclick="moveInTie('${esc(r.team.id)}',-1)" title="Subir">▲</button><button class="btn tiny" onclick="moveInTie('${esc(r.team.id)}',1)" title="Descer">▼</button></span>` : "";
    const tag = reveal && done && r.tied ? `<span class="chip warn">empate</span>` : reveal && r.manual ? `<span class="chip">decisão da comissão</span>` : "";
    return `<tr class="${cls}"><td class="pos">${reveal ? `${r.pos}º` : "–"}</td><td>${teamCell(r.team, `<div class="row-tags">${teamStatus(r.team.id, rows)}${tag}${arrows}</div>`)}</td>
      <td class="num">${r.J}</td><td class="num">${hide(r.V)}</td><td class="num">${hide(r.E)}</td><td class="num">${hide(r.D)}</td><td class="num hide-sm">${hide(r.SG > 0 ? "+" + r.SG : r.SG)}</td><td class="num total">${hide(r.P)}</td></tr>`;
  }).join("");
  const blocking = done && !semis().length && blockingTie(rows);
  return `<div class="card"><div class="card-head"><h3>Classificação · fase preliminar</h3>${eyeBtn()}</div>
    ${reveal ? "" : `<p class="muted small">Resultados ocultos — equipes listadas pela numeração. Clique no 👁️ para revelar.</p>`}
    <div class="table-wrap"><table class="table standings"><thead><tr><th>Pos.</th><th>Equipe</th><th class="num">J</th><th class="num">V</th><th class="num">E</th><th class="num">D</th><th class="num hide-sm">Saldo</th><th class="num">Pts</th></tr></thead><tbody>${body}</tbody></table></div>
    ${blocking ? `<div class="notice warn mt-s"><b>Empate não resolvido entre os 4 primeiros.</b> ${reveal ? `Ajuste a ordem com ▲▼ conforme a decisão da Comissão Organizadora e confirme:` : "Revele a pontuação (👁️) para resolver."} ${reveal ? `<div class="mt-s"><button class="btn primary" onclick="confirmTieOrder()">✓ Confirmar ordem e gerar semifinais</button></div>` : ""}</div>` : ""}
    <p class="muted small mt-s">Vitória 3 · Empate 1 · Derrota 0. Desempate: ${crits.length ? crits.join(" → ") : "nenhum critério ativo"} → decisão da comissão. ${done ? "Classificam-se os 4 primeiros." : ""}
    ${state.cup.manualOrder.length ? `<button class="btn tiny ghost" onclick="clearManualOrder()">Limpar decisões manuais</button>` : ""}</p></div>`;
}
function bracketCard() {
  const [s1, s2] = semis(), f = finalMatch(), champ = champion();
  const slot = (m, side, ph) => {
    const id = m ? m[side] : null, t = findTeam(id), win = m && winnerOf(m) === id && id;
    return `<div class="b-team ${win ? "winner" : ""} ${t ? "" : "ph"}"><span>${t ? esc(t.name) : ph}</span>${m && m.status === "done" ? `<b>${reveal ? sideScore(m, side) : "••"}</b>` : ""}${win ? "<em>✓</em>" : ""}</div>`;
  };
  const box = (m, title, pa, pb) => `<div class="b-match ${m?.status || ""}"><div class="b-title">${title}${m ? ` · ${m.status === "live" ? "● jogando" : m.status === "done" ? (m.byDecision ? "decisão da comissão" : "encerrada") : "a disputar"}` : ""}</div>${slot(m, "a", pa)}${slot(m, "b", pb)}${m && m.status === "pending" && !liveMatch() ? `<button class="btn tiny primary" onclick="startMatch('${esc(m.id)}')">Iniciar</button>` : m && m.status === "done" && !liveMatch() ? `<button class="btn tiny" onclick="reopenMatch('${esc(m.id)}')">✏️ Corrigir</button>` : ""}</div>`;
  return `<div class="card mt ko"><div class="card-head"><h3>🏅 Fase eliminatória</h3><span class="pill">mata-mata</span></div>
    <div class="bracket">
      <div class="b-col">${box(s1, "Semifinal 1", "1º colocado", "4º colocado")}${box(s2, "Semifinal 2", "2º colocado", "3º colocado")}</div>
      <div class="b-col mid">${box(f, "FINAL", "Vencedor Semifinal 1", "Vencedor Semifinal 2")}</div>
      <div class="b-col"><div class="b-champ ${champ ? "on" : ""}"><div class="trophy">🏆</div><div class="eyebrow">CAMPEÃO</div><b>${champ ? esc(champ.name) : "A definir"}</b>${champ ? `<small>${esc(schoolText(champ))}</small>` : ""}</div></div>
    </div></div>`;
}

/* ============================ TELÃO ============================ */
function telaoScene() {
  const d = state.display, cur = state.free.current, live = liveMatch();
  if (d.mode === "arena") return sceneFreeRank();
  if (d.mode === "cup") return sceneCupRank();
  if (d.mode === "bracket") return sceneBracket();
  if (cur) return sceneFree(cur);
  if (live) return sceneMatch(live);
  const champ = champion();
  if (champ) return `<div class="tv tv-champ"><div class="tv-trophy">🏆</div><div class="tv-label">CAMPEÃO · ROBÔ ESTOURA BALÃO</div><div class="tv-team">${esc(champ.name)}</div><div class="tv-school">${esc(schoolText(champ))}</div></div>`;
  const nf = nextFree(), nm = nextMatch();
  return `<div class="tv tv-idle"><img src="assets/robosapiens.png" alt="RoboSapiens" class="tv-logo"><div class="tv-title">Robô Estoura Balão</div>
    <div class="tv-next">${nm && prelims().some(m => m.status !== "pending") || (nm && !nf) ? `<span>PRÓXIMO CONFRONTO</span><b>${esc(teamName(nm.a))} × ${esc(teamName(nm.b))}</b><small>${esc(matchLabel(nm))}</small>`
      : nf ? `<span>PRÓXIMA NA ARENA LIVRE · RODADA ${nf.round}</span><b>${esc(teamName(nf.teamId))}</b><small>${esc(schoolText(findTeam(nf.teamId)))}</small>` : `<span>AGUARDE</span><b>Em instantes</b>`}</div></div>`;
}
function sceneFree(cur) {
  const t = findTeam(cur.teamId), total = attemptTotal(cur), tm = cur.timer;
  const nx = nextFree();
  return `<div class="tv tv-free" style="--c:${esc(cur.color?.hex || "#159447")}">
    <div class="tv-mode arena">🎈 ARENA LIVRE · RODADA ${cur.round} DE ${state.settings.freeRounds}</div>
    <div class="tv-team">${esc(t.name)}</div><div class="tv-school">${esc(schoolText(t))}</div>
    <div class="tv-grid">
      <div class="tv-color"><div class="tv-balloon" style="--c:${esc(cur.color?.hex || "#999")};--t:${textOn(cur.color?.hex || "#999")}">${esc(cur.color?.number ?? "")}</div><span>COR DA EQUIPE</span><b>${esc(cur.color?.name || "")}</b></div>
      <div class="tv-timer ${tm.status}" data-timer="free">${fmt(left(tm))}</div>
      <div class="tv-score"><span>PONTOS</span><b class="${total < 0 ? "minus" : ""}">${signed(total)}</b></div>
    </div>
    <div class="tv-rules">+50 balão de outra cor · −50 balão da própria cor · −30 saída da arena</div>
    ${nx ? `<div class="tv-foot">A seguir: <b>${esc(teamName(nx.teamId))}</b> · Rodada ${nx.round}</div>` : ""}
  </div>`;
}
function sceneMatch(m) {
  const a = findTeam(m.a), b = findTeam(m.b), sa = sideScore(m, "a"), sb = sideScore(m, "b");
  const ph = { r1: "ROUND 1", break: "INTERVALO", r2: "ROUND 2", review: "RESULTADO" }[m.phase];
  return `<div class="tv tv-match">
    <div class="tv-mode cup">⚔️ CONFRONTO DIRETO · ${esc(matchLabel(m)).toUpperCase()}</div>
    <div class="tv-phase">${ph}${m.timer.status === "paused" ? " · PAUSADO" : ""}</div>
    ${m.phase === "review" ? "" : `<div class="tv-timer ${m.timer.status}" data-timer="match">${fmt(left(m.timer))}</div>`}
    <div class="tv-vs">
      <div class="tv-side a"><div class="tv-team">${esc(a?.name)}</div><div class="tv-school">${esc(schoolText(a))}</div><div class="tv-big">${sa}</div></div>
      <div class="tv-x">×</div>
      <div class="tv-side b"><div class="tv-team">${esc(b?.name)}</div><div class="tv-school">${esc(schoolText(b))}</div><div class="tv-big">${sb}</div></div>
    </div>
    <div class="tv-rules">+100 por balão adversário estourado · +30 quando o adversário sai da arena</div>
  </div>`;
}
function tvHidden(title) { return `<div class="tv tv-rank"><div class="tv-mode">${title}</div><div class="tv-hidden">🔒<b>Resultado será revelado em instantes</b></div></div>`; }
function sceneFreeRank() {
  if (!state.display.reveal) return tvHidden("🎈 CLASSIFICAÇÃO · ARENA LIVRE");
  const rk = freeRanking();
  return `<div class="tv tv-rank"><div class="tv-mode arena">🎈 CLASSIFICAÇÃO · ARENA LIVRE</div><div class="tv-table">${rk.map((x, i) => `<div class="tv-row ${i < 3 ? "top" : ""}"><span class="p">${i + 1}º</span><span class="n">${esc(x.team.name)}<small>${esc(schoolText(x.team))}</small></span><b>${x.done ? signed(x.total) : "—"}</b></div>`).join("")}</div></div>`;
}
function sceneCupRank() {
  if (!state.display.reveal) return tvHidden("⚔️ CLASSIFICAÇÃO · CONFRONTOS");
  const rows = standings(), done = prelimDone();
  if (!rows.length) return tvHidden("⚔️ CLASSIFICAÇÃO · CONFRONTOS");
  return `<div class="tv tv-rank"><div class="tv-mode cup">⚔️ CLASSIFICAÇÃO · FASE PRELIMINAR</div><div class="tv-table">${rows.map(r => `<div class="tv-row ${done && r.pos <= 4 ? "top" : ""} ${done && r.pos > 4 ? "out" : ""}"><span class="p">${r.pos}º</span><span class="n">${esc(r.team.name)}<small>${esc(schoolText(r.team))} · ${r.J}J ${r.V}V ${r.E}E ${r.D}D</small></span><b>${r.P} pts</b></div>`).join("")}</div></div>`;
}
function sceneBracket() {
  const [s1, s2] = semis(), f = finalMatch(), champ = champion(), rv = state.display.reveal;
  const line = (m, side, ph) => { const id = m?.[side], w = m && winnerOf(m) === id && id; return `<div class="tv-bt ${w ? "w" : ""}"><span>${id ? esc(teamName(id)) : ph}</span>${m?.status === "done" && rv ? `<b>${sideScore(m, side)}</b>` : ""}</div>`; };
  return `<div class="tv tv-bracket"><div class="tv-mode cup">🏅 FASE ELIMINATÓRIA</div><div class="tv-bk">
    <div class="tv-col"><div class="tv-bm"><small>SEMIFINAL 1</small>${line(s1, "a", "1º colocado")}${line(s1, "b", "4º colocado")}</div><div class="tv-bm"><small>SEMIFINAL 2</small>${line(s2, "a", "2º colocado")}${line(s2, "b", "3º colocado")}</div></div>
    <div class="tv-col"><div class="tv-bm final"><small>FINAL</small>${line(f, "a", "Vencedor SF1")}${line(f, "b", "Vencedor SF2")}</div></div>
    <div class="tv-col"><div class="tv-bm champ"><div class="tv-trophy sm">🏆</div><small>CAMPEÃO</small><b>${champ ? esc(champ.name) : "A definir"}</b></div></div>
  </div></div>`;
}
function telao() {
  const d = state.display;
  const opt = (v, l) => `<button class="btn ${d.mode === v ? "primary" : ""}" onclick="setDisplay('${v}')">${l}</button>`;
  main().innerHTML = head("📺 Telão", "O que o público vê. Abra numa segunda janela e arraste para o projetor/TV.",
    `<button class="btn primary big" onclick="openTelaoWindow()">📺 Abrir janela do telão</button><button class="btn big" onclick="fullTelao()">⛶ Tela cheia aqui</button>`) +
    `<div class="card"><h3>Exibir no telão</h3><div class="actions">${opt("auto", "⚡ Automático (ao vivo)")}${opt("arena", "🎈 Classificação Arena Livre")}${opt("cup", "⚔️ Classificação Confrontos")}${opt("bracket", "🏅 Chaveamento")}</div>
      <div class="actions mt-s"><button class="btn ${d.reveal ? "primary" : ""}" onclick="toggleTvReveal()">${d.reveal ? "🙈 Ocultar pontuação no telão" : "👁️ Revelar pontuação no telão"}</button><span class="muted small">No modo automático o telão mostra a equipe na Arena Livre ou o confronto em andamento. Classificações só aparecem quando reveladas.</span></div></div>
    <div class="tv-preview mt"><div class="tv-frame">${telaoScene()}</div></div>`;
}
function setDisplay(mode) { state.display.mode = mode; save(); render(); }
function toggleTvReveal() { state.display.reveal = !state.display.reveal; save(); render(); }
function openTelaoWindow() {
  const w = window.open(location.pathname + "#telao", "telao_estoura_baloes", "width=1280,height=720");
  if (!w) toast("O navegador bloqueou a janela. Permita pop-ups ou use “Tela cheia aqui”.");
}
function fullTelao() {
  document.body.classList.add("telao-full");
  const box = document.getElementById("tvFull"); box.classList.remove("hidden"); box.innerHTML = `<button class="tv-exit" onclick="exitTelao()">✕ Sair</button><div id="tvScene">${telaoScene()}</div>`;
  document.documentElement.requestFullscreen?.().catch(() => { });
  updateTimers();
}
function exitTelao() {
  document.body.classList.remove("telao-full"); document.getElementById("tvFull").classList.add("hidden");
  if (document.fullscreenElement) document.exitFullscreen?.();
}
function renderTelaoWindow() {
  document.body.classList.add("telao-window");
  const box = document.getElementById("tvFull"); box.classList.remove("hidden");
  box.innerHTML = `<div id="tvScene">${telaoScene()}</div><div class="tv-hint">Duplo clique = tela cheia</div>`;
  updateTimers();
}

/* ============================ CONFIGURAÇÕES ============================ */
function config() {
  const s = state.settings;
  const tb = s.tiebreak.map((x, i) => `<div class="tb-row"><label class="check"><input type="checkbox" ${x.on ? "checked" : ""} onchange="toggleTb(${i})"> <b>${i + 1}. ${TIEBREAKS[x.key].label}</b></label><span class="muted small">${TIEBREAKS[x.key].desc}</span><span class="actions"><button class="btn tiny" onclick="moveTb(${i},-1)" ${i ? "" : "disabled"}>▲</button><button class="btn tiny" onclick="moveTb(${i},1)" ${i < s.tiebreak.length - 1 ? "" : "disabled"}>▼</button></span></div>`).join("");
  main().innerHTML = head("⚙️ Configurações", "Parâmetros da competição, backup e reinício.") +
    `<div class="grid g2">
      <div class="card"><h3>🎈 Arena Livre</h3><div class="form-grid">
        <div><label>Rodadas por equipe</label><select onchange="setSetting('freeRounds',this.value)">${[1, 2, 3, 4].map(n => `<option ${s.freeRounds === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label>Tempo por tentativa (s)</label><input type="number" min="5" max="600" value="${s.freeSeconds}" onchange="setSetting('freeSeconds',this.value)"></div>
        <div class="full"><label>Classificação da Arena Livre</label><select onchange="setSetting('freeRankMode',this.value)"><option value="soma" ${s.freeRankMode === "soma" ? "selected" : ""}>Soma das rodadas</option><option value="melhor" ${s.freeRankMode === "melhor" ? "selected" : ""}>Melhor rodada</option></select></div>
        <div class="full"><label class="check"><input type="checkbox" ${s.freeMinZero ? "checked" : ""} onchange="setSetting('freeMinZero',this.checked)"> Não permitir pontuação negativa em uma tentativa (mínimo 0)</label></div>
      </div><p class="muted small mt-s">Confirme essas opções com o regulamento da competição.</p></div>
      <div class="card"><h3>⚔️ Critérios de desempate (Confrontos)</h3><p class="muted small">Aplicados em ordem quando equipes empatam em pontos. Marque os previstos no regulamento. Se o empate persistir, a Comissão decide a ordem na própria classificação.</p><div class="tb-list">${tb}</div></div>
      <div class="card"><h3>💾 Backup</h3><div class="actions"><button class="btn primary" onclick="exportData()">⬇ Exportar JSON</button><label class="btn file">⬆ Importar JSON<input id="importFile" type="file" accept=".json,application/json" hidden></label></div><p class="muted small mt-s">Os dados ficam salvos neste navegador. Exporte um backup ao final de cada etapa.</p></div>
      <div class="card"><h3>⚠️ Reiniciar</h3><div class="actions col">
        <button class="btn danger" onclick="resetFree()">Zerar Arena Livre (apaga tentativas)</button>
        <button class="btn danger" onclick="resetCup()">Zerar Confrontos (apaga confrontos e resultados)</button>
        <button class="btn danger" onclick="resetAll()">Resetar tudo (volta às 7 equipes cadastradas)</button></div></div>
    </div>`;
  document.getElementById("importFile").onchange = importData;
}
function setSetting(k, v) {
  if (k === "freeRounds") {
    const n = Math.round(num(v, 4)), extra = state.free.attempts.filter(a => a.round > n).length;
    if (extra && !confirm(`Existem ${extra} tentativa(s) registradas acima da rodada ${n}. Elas ficarão fora da classificação (não são apagadas). Continuar?`)) return render();
  }
  state.settings[k] = v; state = normalize(state); save(); toast("Configuração salva"); render();
}
function toggleTb(i) { state.settings.tiebreak[i].on = !state.settings.tiebreak[i].on; save(); render(); }
function moveTb(i, d) { const a = state.settings.tiebreak, j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; save(); render(); }
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `robosapiens-estoura-baloes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || !Array.isArray(data.teams)) throw new Error("formato");
      if (!confirm("Substituir todos os dados atuais pelos do arquivo?")) return;
      state = normalize(data); save(); toast("Dados importados"); render();
    } catch (err) { toast("Arquivo JSON inválido"); }
  };
  r.readAsText(file);
}
function resetFree() { if (!confirm("Apagar TODAS as tentativas da Arena Livre?")) return; state.free = { current: null, attempts: [] }; save(); toast("Arena Livre zerada"); render(); }
function resetCup() { if (!confirm("Apagar TODOS os confrontos e resultados?")) return; state.cup = { matches: [], liveId: null, manualOrder: [] }; save(); toast("Confrontos zerados"); render(); }
function resetAll() { if (!confirm("Apagar tudo e voltar ao cadastro inicial das equipes?")) return; state = normalize(fresh()); save(); toast("Competição reiniciada"); render(); }

/* ============================ MODAL / EVENTOS GLOBAIS ============================ */
function openModal(html) { document.getElementById("modalContent").innerHTML = html; document.getElementById("modal").classList.remove("hidden"); document.querySelector("#modalContent input")?.focus(); }
function closeModal() { document.getElementById("modal").classList.add("hidden"); }

function updateTimers() {
  document.querySelectorAll("[data-timer]").forEach(el => {
    const t = el.dataset.timer === "free" ? state.free.current?.timer : liveMatch()?.timer;
    if (!t) return;
    const l = left(t); el.textContent = fmt(l);
    el.classList.toggle("warn", t.status === "running" && l <= 5 && l > 0);
    el.classList.toggle("over", t.status === "over" || (t.status === "running" && l <= 0));
  });
}
function refreshTelaoFull() { const s = document.getElementById("tvScene"); if (s && document.body.classList.contains("telao-full")) { s.innerHTML = telaoScene(); updateTimers(); } }

setInterval(() => {
  if (TELAO_WINDOW) { updateTimers(); return; }
  let changed = false;
  const cur = state.free.current;
  if (cur && cur.timer.status === "running" && left(cur.timer) <= 0) {
    cur.timer.status = "over"; cur.timer.remaining = 0; changed = true; beep(); toast("⏱ Tempo esgotado — registre o resultado");
  }
  const m = liveMatch();
  if (m && m.timer.status === "running" && left(m.timer) <= 0) {
    m.timer.status = "over"; m.timer.remaining = 0; changed = true; beep();
    toast(m.phase === "break" ? "⏱ Fim do intervalo — vá para o Round 2" : `⏱ Fim do Round ${m.phase === "r1" ? 1 : 2}`);
  }
  if (changed) { save(); render(); refreshTelaoFull(); } else updateTimers();
}, 200);

if (TELAO_WINDOW) {
  window.addEventListener("storage", e => { if (e.key === KEY) { state = load(); render(); } });
  document.addEventListener("dblclick", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); });
} else {
  document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => nav(b.dataset.view));
  document.getElementById("btnTelao").onclick = () => openTelaoWindow();
  document.getElementById("btnFullscreen").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); if (document.body.classList.contains("telao-full")) exitTelao(); } });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("telao-full")) exitTelao(); });
  // Mantém o telão em tela cheia (na mesma janela) atualizado a cada ação
  const _render = render;
  render = function () { _render(); refreshTelaoFull(); };
  window.addEventListener("storage", e => { if (e.key === KEY) { state = load(); render(); } });
}
render();
