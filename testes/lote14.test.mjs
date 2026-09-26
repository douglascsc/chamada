import { migrarCodigos, liberarProfessoresDoEmulador } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteField, collection, writeBatch, Timestamp, query, where, serverTimestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
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

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => { results.push(Boolean(ok)); console.log(ok ? "✅" : "❌", name, detail ? `— ${detail}` : ""); };
const types = { ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5199);
const APP = "http://localhost:5199/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
// conta master (UID fixo no lugar do UID real das regras)
const rM = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "douglascamargo@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((x) => x.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: rM.idToken, displayName: "Douglas" }) });
const uidM = rM.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", uidM) } });
const now = Date.now();
const ontem = new Date(now - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };
const list = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), p))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newCtx(mobile = true) {
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR" });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ok = (label, p) => p.then(() => check(label, true), (e) => check(label, false, e.message.slice(0, 120)));
const nega = (label, p) => p.then(() => check(label, false, "foi PERMITIDO"), () => check(label, true));
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });
async function entrar(email) {
  const ctx = await newCtx(true);
  const page = await open(ctx, APP + "#professor");
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-dashboard-content:not(.hidden), #terms-modal-backdrop:not(.hidden), #teacher-name-gate:not(.hidden)", { timeout: 15000 });
  return { ctx, page };
}
async function openAdmin(page) {
  await page.click("#btn-open-more-options");
  if (!(await page.evaluate(() => document.getElementById("admin-panel-section").open))) await page.click("#admin-panel-section summary");
  await page.waitForFunction(() => document.querySelectorAll("#admin-professores-list > div").length > 0 && !/Carregando/.test(document.getElementById("admin-professores-status").textContent), null, { timeout: 15000 });
}
async function criarTurmaPeloSite(page, turma) {
  await page.click("#btn-open-more-options");
  if (!(await page.evaluate(() => document.getElementById("new-turma-details").open))) await page.click("#new-turma-details summary");
  await page.fill("#new-turma-turma", turma); await page.fill("#new-turma-ano", "2027");
  await page.click("#btn-create-turma");
}

// ===== Lote 14: professores liberados (B), horário do servidor (C), ajustes (A) =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "acordosProfessor", uidM), { avisosAceitosEm: Timestamp.now(), email: "douglascamargo@ifsul.edu.br", nome: "Douglas" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 60 });
  await setDoc(doc(f, "turmas/T1/alunos/a1"), { nome: "Aluno Um" });
  await setDoc(doc(f, "turmas/T1/alunos/a2"), { nome: "Aluno Dois" });
});
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const t = (await getDoc(doc(f, "turmas/T1"))).data(); await setDoc(doc(f, "turmas/T1/salas/4821"), { nomes: ["Aluno Dois", "Aluno Um"], definidoEm: t.codigoDefinidoEm }); });
await liberarProfessoresDoEmulador(env); // Ana (e a master) já liberadas
// conta criada depois, sem liberação (como alguém que criou um login direto no Firebase)
const rX = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "estranho@gmail.com", password: PASS, returnSecureToken: true }) }).then((x) => x.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: rX.idToken, displayName: "Estranho" }) });
const uidX = rX.localId;
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "acordosProfessor", uidX), { avisosAceitosEm: Timestamp.now(), email: "estranho@gmail.com", nome: "Estranho" }); });
const anon = env.unauthenticatedContext().firestore();
// liberado direto no Firestore Console (conta criada no Authentication, nunca entrou)
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "professoresAutorizados/uid-do-console"), { email: "console@ifsul.edu.br", nome: "Liberada Pelo Console" }); });
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "professoresPendentes/antiga@ifsul.edu.br"), { nome: "Conta Antiga", email: "antiga@ifsul.edu.br", criadoEm: Timestamp.now() }); });
const prof = env.authenticatedContext(uidA, { email: "prof.ana@ifsul.edu.br" }).firestore();
const estranho = env.authenticatedContext(uidX, { email: "estranho@gmail.com" }).firestore();
const master = env.authenticatedContext(uidM, { email: "douglascamargo@ifsul.edu.br" }).firestore();

// --- B: regras
await nega("Conta não liberada NÃO cria turma", setDoc(doc(estranho, "turmas/FALSA"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidX, professorNome: "Douglas Camargo Carvalho" }));
await ok("Professora liberada cria turma", setDoc(doc(prof, "turmas/NOVA"), { nome: "INF5M 2027", professorUid: uidA, professorNome: "Ana Souza" }));
await ok("Master cria turma (sem precisar estar na lista)", setDoc(doc(master, "turmas/DAMASTER"), { nome: "INF6M 2027", professorUid: uidM, professorNome: "Douglas" }));
await nega("Conta não liberada NÃO se libera sozinha", setDoc(doc(estranho, `professoresAutorizados/${uidX}`), { email: "estranho@gmail.com", nome: "X" }));
await nega("Professora liberada NÃO libera outra conta", setDoc(doc(prof, `professoresAutorizados/${uidX}`), { email: "estranho@gmail.com", nome: "X" }));
await nega("Professora NÃO tira a liberação de outra", updateDoc(doc(prof, `professoresAutorizados/${uidM}`), { nome: "x" }));
await ok("Professora confere a própria liberação", getDoc(doc(prof, `professoresAutorizados/${uidA}`)));
await nega("Conta qualquer NÃO lê a lista de liberados", getDocs(collection(estranho, "professoresAutorizados")));
await nega("Master NÃO grava campo extra na liberação", setDoc(doc(master, `professoresAutorizados/${uidX}`), { email: "e", nome: "n", admin: true }));

// --- C: presença do aluno com data e hora do servidor
const exp = () => Timestamp.fromMillis(Date.now() + 86400000);
const amanha = new Date(now + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const pres = (dia, maq, extra = {}) => ({ nome: "Aluno Um", data: dia, horario: "07:00", maquina: maq, codigoUsado: "4821", expiraEm: exp(), criadoEm: serverTimestamp(), ...extra });
await nega("Aluno NÃO marca presença com data de ontem", setDoc(doc(anon, `turmas/T1/presencas/${ontem}_m1`), pres(ontem, "m1")));
await nega("Aluno NÃO marca presença com data de amanhã", setDoc(doc(anon, `turmas/T1/presencas/${amanha}_m2`), pres(amanha, "m2")));
await nega("Aluno NÃO marca sem a hora do servidor", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_m3`), (({ criadoEm, ...r }) => r)(pres(hoje, "m3"))));
await nega("Aluno NÃO inventa a hora (criadoEm falso)", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_m4`), pres(hoje, "m4", { criadoEm: Timestamp.fromMillis(now - 3600000) })));
await ok("Aluno marca hoje com a hora do servidor", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_m5`), pres(hoje, "m5")));
await ok("Professor marca sem criadoEm (horário anotado, funciona sem internet)", addDoc(collection(prof, "turmas/T1/presencas"), { nome: "Aluno Dois", data: hoje, horario: "08:00", maquina: "professor", expiraEm: exp() }));

// --- A: último e-mail não fica guardado
let { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.evaluate(() => localStorage.setItem("chamada:ultimoEmail", "alguem@ifsul.edu.br"));
await page.reload(); await page.waitForTimeout(1500);
check("Último e-mail antigo é apagado do aparelho", (await page.evaluate(() => localStorage.getItem("chamada:ultimoEmail"))) === null);
check("Nada novo guardado com o e-mail de login", !(await page.evaluate(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes("prof.ana@")))));
// horário vem do servidor (aluno marcou "07:00" no celular, mas a hora é a do servidor)
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 2, null, { timeout: 10000 });
await page.waitForTimeout(800);
const horaAluno = await page.locator(".student-row", { hasText: "Aluno Um" }).locator(".present-status-label").textContent();
const agoraSP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const perto = [0, -1, -2, 1].map((d) => agoraSP.format(new Date(Date.now() + d * 60000)));
check("Chamada mostra a hora do servidor, não a do celular do aluno", !horaAluno.includes("07:00") && perto.some((h) => horaAluno.includes(h)), horaAluno);
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- B: conta não liberada pelo site
({ ctx, page } = await entrar("estranho@gmail.com"));
if (await page.isVisible("#terms-modal-backdrop")) { await page.$eval("#terms-modal-box", (b) => b.scrollTo(0, b.scrollHeight)); await page.waitForTimeout(300); await page.click("#btn-close-terms"); await page.waitForTimeout(500); }
await page.waitForFunction(() => /ainda não foi liberada/.test(document.getElementById("toast-text").textContent), null, { timeout: 10000 })
  .then(() => check("Conta não liberada: aviso ao entrar", true), () => check("Conta não liberada: aviso ao entrar", false));
await criarTurmaPeloSite(page, "HACK");
await page.waitForFunction(() => /não foi liberada para criar turmas/.test(document.getElementById("toast-text").textContent), null, { timeout: 10000 })
  .then(() => check("Conta não liberada: criar turma pelo site mostra o motivo", true), () => check("Conta não liberada: criar turma pelo site mostra o motivo", false));
check("Conta não liberada: turma NÃO foi criada", !(await list("turmas")).some((t) => t.nome === "HACK 2027"));
await ctx.close();

// --- B: master libera no Painel admin; cria professor novo já liberado
({ ctx, page } = await entrar("douglascamargo@ifsul.edu.br"));
await openAdmin(page);
const linhaX = page.locator("#admin-professores-list > div", { hasText: "estranho@gmail.com" });
check("Painel admin: conta não liberada aparece marcada", /Não liberado/.test(await linhaX.textContent()));
check("Painel admin: professora liberada mostra \"✓ Liberado\"", /✓ Liberado para criar turmas/.test(await page.locator("#admin-professores-list > div", { hasText: "prof.ana@ifsul.edu.br" }).textContent()));
check("Painel admin: conta antiga aguardando 1º acesso explica quando será liberada", /Será liberado quando entrar pela 1ª vez/.test(await page.locator("#admin-professores-list > div", { hasText: "antiga@ifsul.edu.br" }).textContent()));
check("Painel admin: liberado direto no Firestore aparece (aguardando 1º acesso · ✓ Liberado)", /aguardando 1º acesso[\s\S]*✓ Liberado/.test((await page.locator("#admin-professores-list > div", { hasText: "console@ifsul.edu.br" }).textContent()) || ""));
check("Painel admin: sem aviso de regras antigas", !/publique as regras/.test(await page.textContent("#admin-professores-status")));
await linhaX.getByRole("button", { name: "Liberar" }).click();
await page.waitForFunction(() => /liberado\(a\) para criar turmas/.test(document.getElementById("admin-professores-status").textContent), null, { timeout: 10000 })
  .then(() => check("Painel admin: Liberar funciona", true), () => check("Painel admin: Liberar funciona", false));
check("Liberação gravada no banco", Boolean(await read(`professoresAutorizados/${uidX}`)));
await ok("Depois de liberada, a conta cria turma", setDoc(doc(estranho, "turmas/AGORAPODE"), { nome: "INF7M 2027", professorUid: uidX, professorNome: "Estranho" }));
await page.fill("#admin-new-professor-nome", "Juliane Teste"); await page.fill("#admin-new-professor-email", "juliane@ifsul.edu.br");
await page.click("#btn-create-professor");
await page.waitForFunction(() => /criado/.test(document.getElementById("create-professor-status").textContent), null, { timeout: 15000 });
const liberados = await list("professoresAutorizados");
check("Criar professor no Painel admin: já fica liberado", liberados.some((p) => p.email === "juliane@ifsul.edu.br"), JSON.stringify(liberados.map((p) => p.email)));
await page.waitForFunction(() => /✓ Liberado/.test([...document.querySelectorAll("#admin-professores-list > div")].find((r) => r.textContent.includes("juliane@ifsul.edu.br"))?.textContent || ""), null, { timeout: 10000 })
  .then(() => check("Professor recém-criado (aguardando 1º acesso) aparece como \"✓ Liberado\"", true), () => check("Professor recém-criado (aguardando 1º acesso) aparece como \"✓ Liberado\"", false));
await linhaX.waitFor();
check("Depois de Liberar: a linha mostra \"✓ Liberado\" e some o botão", /✓ Liberado/.test(await page.locator("#admin-professores-list > div", { hasText: "estranho@gmail.com" }).textContent()) && (await page.locator("#admin-professores-list > div", { hasText: "estranho@gmail.com" }).getByRole("button", { name: "Liberar" }).count()) === 0);
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- C: aluno pelo site grava a hora do servidor
ctx = await newCtx(true); page = await open(ctx, APP + "#turma=T1");
await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(600);
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length >= 1, null, { timeout: 10000 });
await page.locator(".student-row", { hasText: "Aluno Dois" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Aluno Dois" }).locator(".confirm-attendance").click();
let minha = null;
for (let i = 0; i < 30 && !minha; i++) { await page.waitForTimeout(500); minha = (await list("turmas/T1/presencas")).find((p) => p.nome === "Aluno Dois" && p.maquina !== "professor"); }
check("Aluno pelo site: presença com a hora do servidor (criadoEm)", minha && minha.criadoEm && Math.abs(minha.criadoEm.toMillis() - Date.now()) < 120000, JSON.stringify(minha));
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
