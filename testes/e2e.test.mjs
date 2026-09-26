import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, Timestamp, Bytes } from "firebase/firestore";
import http from "node:http";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

// Cartão da turma: no celular, "Gerenciar" e "Gerar código 1h" ficam no "⋯"
// Gerenciar: "Alunos" e "Configurações da turma" começam recolhidos; abre como o professor faria (tocando no título)
async function abrirGerenciar(p) {
  await p.waitForSelector("#teacher-manage-panel:not(.hidden)");
  // (o site pode abrir "Alunos" sozinho numa turma vazia no mesmo instante; confere e repete)
  for (const id of ["manage-alunos-details", "manage-config-details"]) {
    for (let i = 0; i < 4 && !(await p.$eval(`#${id}`, (d) => d.open)); i++) {
      await p.click(`#${id} > summary`);
      await p.waitForTimeout(250);
    }
  }
}
async function cardClick(card, name) {
  const visivel = card.getByRole("button", { name, exact: true }).locator("visible=true");
  if (!(await visivel.count())) await card.getByRole("button", { name: /^Mais opções/ }).click();
  await card.getByRole("button", { name, exact: true }).locator("visible=true").first().click();
}


const S = process.env.S;
const IMG = `${S}/img`;
const OUT = process.env.OUT || "out";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(ok ? "✅" : "❌", name, detail ? `— ${detail}` : "");
}

// ---------- servidor local da cópia de teste ----------
const server = http.createServer((req, res) => {
  const p = req.url.split("?")[0];
  const file = p === "/" ? "site/index.html" : `site${p}`;
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": file.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(5173);
const APP = "http://localhost:5173/";

// ---------- usuários no emulador de Auth ----------
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
async function createUser(email, password, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then((r) => r.json());
  await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName }) });
  return r.localId;
}
const PASS = "senha-teste-123";
const uidA = await createUser("profa@teste.br", PASS, "Prof A");
const uidB = await createUser("profb@teste.br", PASS, "Prof B");
const uidM = await createUser("douglascamargo@ifsul.edu.br", PASS, "Master");

// ---------- dados iniciais (regras desligadas, só no emulador) ----------
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const DAY = 86400000;
const tinyThumb = Bytes.fromUint8Array(new Uint8Array(readFileSync(`${IMG}/pequena_800x600.jpg`)).slice(0, 2000));
await admin(async (db) => {
  for (const uid of [uidA, uidB, uidM]) await setDoc(doc(db, "acordosProfessor", uid), { avisosAceitosEm: Timestamp.now() });
  await setDoc(doc(db, "turmas/tA1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Prof A", professorEmail: "profa@teste.br" });
  await setDoc(doc(db, "turmas/tA2"), { nome: "INF3M 2026 - Redes", professorUid: uidA, professorNome: "Prof A", professorEmail: "profa@teste.br" });
  await setDoc(doc(db, "turmas/tB1"), { nome: "INF2N 2026 - Web", professorUid: uidB, professorNome: "Prof B", professorEmail: "profb@teste.br" });
  for (const t of ["tA1", "tA2", "tB1"]) for (let i = 1; i <= 3; i++) await setDoc(doc(db, `turmas/${t}/alunos/a${i}`), { nome: `Aluno ${i}` });
  // retenção: um vencido (181 dias) e um ainda válido (179 dias)
  await setDoc(doc(db, "turmas/tA1/atrasos/velho181"), { criadoEm: Timestamp.fromMillis(Date.now() - 181 * DAY), thumb: tinyThumb });
  await setDoc(doc(db, "turmas/tA1/atrasosImg/velho181"), { img: tinyThumb });
  await setDoc(doc(db, "turmas/tA1/atrasos/quase179"), { criadoEm: Timestamp.fromMillis(Date.now() - 179 * DAY), thumb: tinyThumb });
  await setDoc(doc(db, "turmas/tA1/atrasosImg/quase179"), { img: tinyThumb });
  // foto da turma do Prof B (para testar isolamento)
  await setDoc(doc(db, "turmas/tB1/atrasos/fotoB"), { criadoEm: Timestamp.now(), thumb: tinyThumb });
  await setDoc(doc(db, "turmas/tB1/atrasosImg/fotoB"), { img: tinyThumb });
});
const count = async (p) => admin(async (db) => (await getDocs(collection(db, p))).size);
const exists = async (p) => admin(async (db) => (await getDoc(doc(db, p))).exists());

// ---------- navegador ----------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newPage(viewport = { width: 1280, height: 900 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...extra });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (r) => {
    const name = path.basename(new URL(r.request().url()).pathname);
    r.fulfill({ body: readFileSync(`node_modules/firebase/${name}`), contentType: "text/javascript" });
  });
  await ctx.route("https://cdn.tailwindcss.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  const page = await ctx.newPage();
  page.jsErrors = [];
  page.on("pageerror", (e) => page.jsErrors.push(e.message));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? PASS : undefined));
  await page.goto(APP);
  return page;
}
async function login(page, email) {
  await page.click("#btn-teacher-area");
  await page.fill("#teacher-gate-email", email);
  await page.fill("#teacher-gate-password", PASS);
  await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-turmas-list > div", { timeout: 15000 });
}
const rowNames = (page) => page.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (els) => els.map((e) => e.textContent));
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });
async function waitUploadDone(page) {
  await page.waitForFunction(() => !document.getElementById("btn-add-atraso").disabled && /guardad|Não|não/.test(document.getElementById("atrasos-status").textContent), null, { timeout: 60000 });
  return page.textContent("#atrasos-status");
}
async function directRead(page, p) {
  return page.evaluate(async (p) => {
    const { getApp } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js");
    const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
    try { await getDoc(doc(getFirestore(getApp()), p)); return "LEU"; } catch (e) { return e.code; }
  }, p);
}

// ================= Professor A =================
let page = await newPage();
await login(page, "profa@teste.br");
check("Autenticação: professor autenticado entra na Área do professor", await page.isVisible("#teacher-turmas-list"));
const namesA = await rowNames(page);
check("Turmas: prof A vê só as próprias turmas", namesA.length === 2 && !namesA.some((n) => n.includes("INF2N")), namesA.join(" | "));
const btnTexts = await row(page, "INF2M").locator("button:visible").allTextContents();
check("Botões na ordem [Gerar código 30 min][Gerar código 1h][Chamada][📷 Atrasos][Gerenciar]", JSON.stringify(btnTexts) === JSON.stringify(["Gerar código 30 min", "Gerar código 1h", "Chamada", "Atrasos", "Gerenciar"]), btnTexts.join(" | "));
const cls = await row(page, "INF2M").locator("button:visible").evaluateAll((b) => [b[3].className, b[4].className]);
check("Botão Atrasos com o mesmo estilo (cores) do botão Gerenciar", ["bg-slate-100", "text-slate-700", "rounded-lg", "font-semibold"].every((c) => cls[0].includes(c) && cls[1].includes(c)));
check("\"Ver todos os atrasos\" no cabeçalho de Turmas cadastradas", await page.isVisible("#btn-open-all-atrasos"));

// retenção (limpeza ao entrar)
await page.waitForTimeout(2500);
check("180 dias: foto de 181 dias apagada ao entrar (lista)", !(await exists("turmas/tA1/atrasos/velho181")));
check("180 dias: foto de 181 dias apagada ao entrar (imagem)", !(await exists("turmas/tA1/atrasosImg/velho181")));
check("180 dias: foto de 179 dias preservada", await exists("turmas/tA1/atrasos/quase179") && await exists("turmas/tA1/atrasosImg/quase179"));
check("180 dias: limpeza não mexe em fotos de outro professor", await exists("turmas/tB1/atrasos/fotoB"));

// foto vencida ainda não limpa não deve aparecer na tela
await admin(async (db) => {
  await setDoc(doc(db, "turmas/tA1/atrasos/vencidaNaoLimpa"), { criadoEm: Timestamp.fromMillis(Date.now() - 185 * DAY), thumb: tinyThumb });
  await setDoc(doc(db, "turmas/tA1/atrasosImg/vencidaNaoLimpa"), { img: tinyThumb });
});

// abrir Atrasos da turma
await row(page, "INF2M").getByRole("button", { name: "Atrasos" }).click();
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
check("Modal com título \"Atrasos — INF2M 2026 - Banco de Dados\"", (await page.textContent("#atrasos-modal-title")) === "Atrasos — INF2M 2026 - Banco de Dados");
check("Lista inicial: só a foto de 179 dias (vencida escondida)", (await page.locator("#atrasos-list button").count()) === 1);

// Adicionar foto → seletor nativo (câmera/galeria)
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#btn-add-atraso")]);
const accept = await page.getAttribute("#atraso-file-input", "accept");
const capture = await page.getAttribute("#atraso-file-input", "capture");
check("Seletor nativo: accept=image/*, sem 'capture' (celular oferece câmera E galeria), múltiplas fotos", accept === "image/*" && capture === null && chooser.isMultiple());
const t0 = Date.now();
await chooser.setFiles(`${IMG}/grande_4032x3024.jpg`);
let status = await waitUploadDone(page);
check("Upload JPG grande (3,2 MB, 4032x3024)", status === "Foto guardada.", `${status} em ${Date.now() - t0} ms`);

async function latestAtraso(turma) {
  return admin(async (db) => {
    const snap = await getDocs(collection(db, `turmas/${turma}/atrasos`));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.criadoEm.toMillis() - a.criadoEm.toMillis());
    const d = docs[0];
    const img = (await getDoc(doc(db, `turmas/${turma}/atrasosImg/${d.id}`))).data().img.toUint8Array();
    return { id: d.id, keys: Object.keys(d).sort(), criadoEm: d.criadoEm.toMillis(), thumb: d.thumb.toUint8Array(), img };
  });
}
const stored = [];
async function recordStored(label, turma = "tA1") {
  const a = await latestAtraso(turma);
  writeFileSync(`${OUT}/${label}.img`, a.img); writeFileSync(`${OUT}/${label}.thumb`, a.thumb);
  stored.push({ label, id: a.id, img: a.img.length, thumb: a.thumb.length });
  return a;
}
let a = await recordStored("grande_4032x3024.jpg");
check("Metadados mínimos: só {criadoEm, thumb} (+id no caminho)", JSON.stringify(a.keys) === JSON.stringify(["criadoEm", "id", "thumb"]), a.keys.join(","));
check("Data automática: criadoEm = hora do servidor no envio", Math.abs(a.criadoEm - Date.now()) < 60000);
check("Compressão: foto guardada muito menor que a original", a.img.length < statSync(`${IMG}/grande_4032x3024.jpg`).size / 5, `${statSync(`${IMG}/grande_4032x3024.jpg`).size} → ${a.img.length} bytes`);

// várias fotos de uma vez (PNG, PNG transparente, WebP, pequena, celular com EXIF de rotação)
const multi = ["documento.png", "transparente.png", "foto.webp", "pequena_800x600.jpg", "celular_orient6.jpg"];
for (const f of multi) {
  await page.setInputFiles("#atraso-file-input", `${IMG}/${f}`);
  status = await waitUploadDone(page);
  check(`Upload ${f}`, status === "Foto guardada.", status);
  await recordStored(f);
}
await page.setInputFiles("#atraso-file-input", [`${IMG}/pequena_800x600.jpg`, `${IMG}/foto.webp`, `${IMG}/documento.png`]);
status = await waitUploadDone(page);
check("Upload de várias fotos de uma vez (3)", status === "3 fotos guardadas.", status);
await page.setInputFiles("#atraso-file-input", `${IMG}/ruido_extremo.jpg`);
status = await waitUploadDone(page);
check("Foto de pior caso (15 MB de ruído puro): comprimida até caber ou recusada com mensagem", /guardada|grande demais/.test(status), status);
if (status === "Foto guardada.") await recordStored("ruido_extremo.jpg");

const before = await count("turmas/tA1/atrasos");
await page.setInputFiles("#atraso-file-input", `${IMG}/nao_imagem.txt`);
status = await waitUploadDone(page);
check("Arquivo que não é imagem: recusado com mensagem", /não é uma imagem/.test(status), status);
await page.setInputFiles("#atraso-file-input", `${IMG}/corrompida.jpg`);
status = await waitUploadDone(page);
check("Imagem corrompida: recusada com mensagem", /não foi possível ler/.test(status), status);
check("Nada é gravado quando o arquivo é inválido", (await count("turmas/tA1/atrasos")) === before && (await count("turmas/tA1/atrasosImg")) === before);

// ordenação na tela
const thumbsCount = await page.locator("#atrasos-list button").count();
check("Lista mostra todas as fotos enviadas + a de 179 dias (a vencida não limpa fica escondida)", thumbsCount === before - 1, `${thumbsCount} na tela, ${before} no banco (1 vencida escondida)`);
const headings = await page.$$eval("#atrasos-list h3", (hs) => hs.map((h) => h.textContent));
check("Agrupado por data, mais recente → mais antigo", headings.length === 2 && headings[1] === new Date(Date.now() - 179 * DAY).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), headings.join(" | "));
await page.waitForTimeout(300);
const brokenThumbs = await page.$$eval("#atrasos-list img", (imgs) => imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).length);
check("Todas as miniaturas das fotos enviadas pelo app são desenhadas ", brokenThumbs === 0, `${brokenThumbs} sem desenho`);
await page.screenshot({ path: `${OUT}/01-atrasos-turma-desktop.png` });

// visualizar
await page.locator("#atrasos-list button").first().click();
await page.waitForSelector("#atraso-viewer-img:not(.hidden)");
const natural = await page.$eval("#atraso-viewer-img", (i) => [i.naturalWidth, i.naturalHeight]);
check("Visualizar: abre a foto em tamanho maior", natural[0] > 200, natural.join("x"));
const sub = await page.textContent("#atraso-viewer-subtitle");
const exp = new Date(Date.now() + 180 * DAY).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
check("180 dias: data de exclusão exibida = envio + 180 dias", sub.includes(exp), sub);
await page.screenshot({ path: `${OUT}/02-visualizar-desktop.png` });
// baixar
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download-atraso")]);
const dlPath = `${OUT}/download-${dl.suggestedFilename()}`;
await dl.saveAs(dlPath);
const viewedId = await page.evaluate(() => null);
check("Baixar: arquivo com nome descritivo", /^atraso_inf2m-2026-banco-de-dados_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.(webp|jpg)$/.test(dl.suggestedFilename()), dl.suggestedFilename());
const newest = await latestAtraso("tA1");
check("Baixar: conteúdo idêntico ao guardado", statSync(dlPath).size === newest.img.length || stored.some((s) => s.img === statSync(dlPath).size), `${statSync(dlPath).size} bytes`);
// fechar (botão, Esc, clique fora)
await page.click("#btn-close-atraso-viewer-footer");
check("Fechar pelo botão", await page.isHidden("#atraso-viewer-backdrop"));
await page.locator("#atrasos-list button").first().click();
await page.waitForSelector("#atraso-viewer-img:not(.hidden)");
await page.keyboard.press("Escape");
check("Fechar com Esc (volta para a lista, que continua aberta)", (await page.isHidden("#atraso-viewer-backdrop")) && (await page.isVisible("#atrasos-modal-backdrop")));
// excluir
const nBefore = await count("turmas/tA1/atrasos");
await page.locator("#atrasos-list button").first().click();
await page.waitForSelector("#atraso-viewer-img:not(.hidden)");
await page.click("#btn-delete-atraso");
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "Foto excluída.");
check("Excluir: some da lista e do banco (lista + imagem)", (await count("turmas/tA1/atrasos")) === nBefore - 1 && (await count("turmas/tA1/atrasosImg")) === nBefore - 1 && (await page.locator("#atrasos-list button").count()) === nBefore - 2);
check("Sem edição: visualizador não tem campos/editar", (await page.locator("#atraso-viewer-backdrop input, #atraso-viewer-backdrop textarea").count()) === 0);
await page.click("#btn-close-atrasos");
check("Fechar o modal de atrasos", await page.isHidden("#atrasos-modal-backdrop"));

// foto na turma A2 para a visão geral
await row(page, "INF3M").getByRole("button", { name: "Atrasos" }).click();
await page.setInputFiles("#atraso-file-input", `${IMG}/pequena_800x600.jpg`);
await waitUploadDone(page);
await page.click("#btn-close-atrasos");

// ---------- Todos os atrasos ----------
await page.click("#btn-open-all-atrasos");
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
check("Todos os atrasos: título", (await page.textContent("#atrasos-modal-title")) === "Todos os atrasos");
check("Todos os atrasos: sem botão de adicionar (só na turma)", await page.isHidden("#btn-add-atraso"));
const allCount = await page.locator("#atrasos-list button").count();
const expectedAll = (await count("turmas/tA1/atrasos")) - 1 /*vencidaNaoLimpa*/ + (await count("turmas/tA2/atrasos"));
check("Todos os atrasos: fotos das duas turmas do professor, nenhuma de outro professor", allCount === expectedAll, `${allCount}/${expectedAll}`);
const captions = await page.$$eval("#atrasos-list button span", (s) => s.map((x) => x.textContent));
check("Todos os atrasos: cada foto identifica a turma", captions.length === allCount && captions.every((c) => c.startsWith("INF2M 2026") || c.startsWith("INF3M 2026")));
check("Todos os atrasos: legenda curta \"turma · dia\"; a mais recente (INF3M) primeiro", captions[0] === `INF3M 2026 · ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).slice(0, 5)}`, captions[0]);
const opts = await page.$$eval("#atrasos-turma-filter option", (o) => o.map((x) => x.textContent));
check("Filtro: Todas as turmas + só as turmas do professor", JSON.stringify(opts) === JSON.stringify(["Todas as turmas", "INF2M 2026 - Banco de Dados", "INF3M 2026 - Redes"]), opts.join(" | "));
await page.selectOption("#atrasos-turma-filter", "tA2");
const f2 = await page.$$eval("#atrasos-list button span", (s) => s.map((x) => x.textContent));
check("Filtro: só INF3M", f2.length === 1 && f2[0].startsWith("INF3M 2026 · "));
await page.waitForTimeout(300);
check("Miniatura realmente desenhada na tela", await page.$eval("#atrasos-list img", (i) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: `${OUT}/03-todos-atrasos-filtro-desktop.png` });
await page.selectOption("#atrasos-turma-filter", "");

// ---------- Filtro por dia + Baixar todas ----------
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
const dia179 = new Date(Date.now() - 179 * DAY).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const totalTodos = await page.locator("#atrasos-list button").count();
check("Baixar todas: botão mostra a quantidade", (await page.textContent("#btn-download-all-atrasos-label")) === `Baixar todas (${totalTodos})`, await page.textContent("#btn-download-all-atrasos-label"));
await page.fill("#atrasos-date-filter", dia179);
const soDia179 = await page.$$eval("#atrasos-list button span", (s) => s.map((x) => x.textContent));
check("Filtro por dia: só as fotos daquele dia", soDia179.length === 1 && soDia179[0].endsWith(dia179.slice(8, 10) + "/" + dia179.slice(5, 7)), soDia179.join(" | "));
check("Filtro por dia: botão \"Todos os dias\" aparece", await page.isVisible("#btn-clear-atrasos-date"));
check("Baixar todas acompanha o filtro", (await page.textContent("#btn-download-all-atrasos-label")) === "Baixar todas (1)");
const [dlUma] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download-all-atrasos")]);
check("Baixar todas com 1 foto: baixa a foto direto (sem .zip)", /^atraso_.*\.(webp|jpg)$/.test(dlUma.suggestedFilename()), dlUma.suggestedFilename());
await page.fill("#atrasos-date-filter", "2020-01-01");
check("Filtro por dia sem fotos: mensagem e botão desativado", (await page.isVisible("#atrasos-empty")) && (await page.isDisabled("#btn-download-all-atrasos")));
await page.click("#btn-clear-atrasos-date");
check("\"Todos os dias\" limpa o filtro", (await page.locator("#atrasos-list button").count()) === totalTodos && (await page.isHidden("#btn-clear-atrasos-date")));
await page.selectOption("#atrasos-turma-filter", "tA1");
await page.fill("#atrasos-date-filter", hoje);
const nZip = await page.locator("#atrasos-list button").count();
const [dlZip] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#btn-download-all-atrasos")]);
const zipPath = `${OUT}/${dlZip.suggestedFilename()}`;
await dlZip.saveAs(zipPath);
check("Baixar todas: gera um .zip com nome descritivo", dlZip.suggestedFilename() === `atrasos_inf2m-2026_${hoje}.zip`, dlZip.suggestedFilename());
writeFileSync(`${OUT}/zip-expected.json`, JSON.stringify({ path: zipPath, count: nZip }));
await page.waitForFunction(() => /fotos baixadas/.test(document.getElementById("atrasos-status").textContent));
check("Baixar todas: mensagem de conclusão", (await page.textContent("#atrasos-status")) === `${nZip} fotos baixadas (arquivo .zip).`, await page.textContent("#atrasos-status"));
await page.selectOption("#atrasos-turma-filter", "");
await page.click("#btn-clear-atrasos-date");

await page.locator("#atrasos-list button").first().click();
await page.waitForSelector("#atraso-viewer-img:not(.hidden)");
check("Todos os atrasos: visualizar com data — turma", (await page.textContent("#atraso-viewer-title")).includes("INF3M 2026 - Redes"));
const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download-atraso")]);
check("Todos os atrasos: baixar", /^atraso_inf3m-2026-redes_/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
await page.click("#btn-delete-atraso");
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "Foto excluída.");
check("Todos os atrasos: excluir", (await count("turmas/tA2/atrasos")) === 0 && (await count("turmas/tA2/atrasosImg")) === 0);
await page.click("#btn-close-atrasos");

// ---------- Regressão (prof A) ----------
await cardClick(row(page, "INF2M"), "Gerar código 1h");
await page.waitForFunction(() => /Código \d{4} gerado/.test(document.getElementById("toast-text").textContent));
const code = (await page.textContent("#toast-text")).match(/Código (\d{4})/)[1];
await page.click("#btn-close-code-display");
check("[regressão] Gerar código 1h", Boolean(code), code);
await cardClick(row(page, "INF2M"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.waitForFunction(() => document.getElementById("manage-aluno-count").textContent === "3");
check("[regressão] Gerenciar abre o painel com os alunos", true);
await page.click("#btn-load-history");
await page.waitForTimeout(800);
check("[regressão] Carregar histórico sem erro", page.jsErrors.length === 0, page.jsErrors.join(" ; "));
check("Nenhum erro de JavaScript na sessão do prof A", page.jsErrors.length === 0, page.jsErrors.join(" ; "));
await page.click("#btn-sign-out");
await page.waitForSelector("#view-turma-select:not(.hidden)");
check("[regressão] Sair volta para a tela inicial", true);
check("Autenticação: não autenticado não consegue ler fotos direto pelo SDK", (await directRead(page, "turmas/tA1/atrasosImg/quase179")) === "permission-denied");

// [regressão] fluxo do aluno com o código
await page.locator(".turma-card", { hasText: "INF2M 2026 - Banco de Dados" }).click();
await page.waitForTimeout(1500); // espera os dados da turma chegarem (como uma pessoa faria)
await page.fill("#student-daily-code", code);
// digitar os 4 dígitos já valida o código automaticamente
try { await page.waitForSelector("#attendance-list-panel:not(.hidden)", { timeout: 15000 }); }
catch (e) { await page.screenshot({ path: `${OUT}/debug-aluno.png`, fullPage: true }); console.log("DEBUG msg:", await page.textContent("#global-message-text"), "| errors:", page.jsErrors.join(";")); throw e; }
check("[regressão] Aluno libera a lista com o código do dia", true);
check("Aluno com código ativo NÃO consegue ler fotos de atrasos", (await directRead(page, "turmas/tA1/atrasosImg/quase179")) === "permission-denied");
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".confirm-attendance").click();
await page.waitForTimeout(1500);
check("[regressão] Aluno marca presença", (await count("turmas/tA1/presencas")) === 1);
await page.context().close();

// ================= Professor B =================
page = await newPage();
await login(page, "profb@teste.br");
const namesB = await rowNames(page);
check("Isolamento: prof B vê só a própria turma", namesB.length === 1 && namesB[0] === "INF2N 2026 - Web", namesB.join(" | "));
await page.click("#btn-open-all-atrasos");
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
const bCaps = await page.$$eval("#atrasos-list button span", (s) => s.map((x) => x.textContent));
check("Isolamento: \"Todos os atrasos\" do prof B só tem fotos da turma dele", bCaps.length === 1 && bCaps[0].startsWith("INF2N 2026 · "));
check("Isolamento: prof B logado, leitura direta da foto do prof A (turmaId/ID trocados) negada", (await directRead(page, "turmas/tA1/atrasosImg/quase179")) === "permission-denied");
check("Isolamento: prof B logado, leitura direta da miniatura do prof A negada", (await directRead(page, "turmas/tA1/atrasos/quase179")) === "permission-denied");
check("Nenhum erro de JavaScript na sessão do prof B", page.jsErrors.length === 0, page.jsErrors.join(" ; "));
await page.context().close();

// ================= Master =================
page = await newPage();
await login(page, "douglascamargo@ifsul.edu.br");
await page.click("#btn-open-all-atrasos");
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
const mCaps = await page.$$eval("#atrasos-list button", (s) => s.map((x) => x.title));
check("Master: vê fotos de todos os professores, com o nome do professor", mCaps.some((c) => c.startsWith("INF2N 2026 - Web (Prof B)")) && mCaps.some((c) => c.startsWith("INF2M 2026 - Banco de Dados (Prof A)")), [...new Set(mCaps.map((c) => c.split(" — ")[0]))].join(" | "));
await page.click("#btn-close-atrasos");
// excluir turma apaga as fotos junto
await cardClick(row(page, "INF2M"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.click("#btn-delete-turma");
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
check("Excluir turma: senha pedida em campo oculto (type=password)", (await page.getAttribute("#reauth-input", "type")) === "password");
await page.fill("#reauth-input", PASS);
await page.click("#btn-submit-reauth");
await page.waitForFunction(() => /excluída com sucesso/.test(document.getElementById("toast-text").textContent), null, { timeout: 20000 });
check("Excluir turma apaga também as fotos de atrasos (sem órfãs)", (await count("turmas/tA1/atrasos")) === 0 && (await count("turmas/tA1/atrasosImg")) === 0 && !(await exists("turmas/tA1")));
check("Nenhum erro de JavaScript na sessão master", page.jsErrors.length === 0, page.jsErrors.join(" ; "));
await page.context().close();

// ================= Celular (responsividade) =================
await admin(async (db) => { for (let i = 0; i < 7; i++) { await setDoc(doc(db, `turmas/tB1/atrasos/m${i}`), { criadoEm: Timestamp.fromMillis(Date.now() - i * DAY), thumb: Bytes.fromUint8Array(new Uint8Array(readFileSync(`${OUT}/grande_4032x3024.jpg.thumb`))) }); await setDoc(doc(db, `turmas/tB1/atrasosImg/m${i}`), { img: Bytes.fromUint8Array(new Uint8Array(readFileSync(`${OUT}/grande_4032x3024.jpg.img`))) }); } });
page = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await login(page, "profb@teste.br");
const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= 390 && window.innerWidth === 390);
check("Celular: tela de turmas sem rolagem horizontal", await noOverflow());
await page.screenshot({ path: `${OUT}/04-turmas-celular.png` });
await row(page, "INF2N").getByRole("button", { name: "Atrasos" }).click();
await page.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
check("Celular: modal de atrasos cabe na tela", await page.$eval("#atrasos-modal-backdrop section", (s) => s.getBoundingClientRect().right <= 390 && window.innerWidth === 390));
await page.screenshot({ path: `${OUT}/05-atrasos-celular.png` });
await page.setInputFiles("#atraso-file-input", `${IMG}/celular_orient6.jpg`);
status = await waitUploadDone(page);
check("Celular: upload de foto de celular", status === "Foto guardada.", status);
await page.locator("#atrasos-list button").first().click();
await page.waitForSelector("#atraso-viewer-img:not(.hidden)");
await page.screenshot({ path: `${OUT}/06-visualizar-celular.png` });
await page.context().close();

writeFileSync(`${OUT}/stored.json`, JSON.stringify(stored, null, 1));
await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
