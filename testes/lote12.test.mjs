import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteField, collection, writeBatch, Timestamp } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5197);
const APP = "http://localhost:5197/";
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
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ok = (label, p) => p.then(() => check(label, true), (e) => check(label, false, e.message.slice(0, 120)));
const nega = (label, p) => p.then(() => check(label, false, "foi PERMITIDO"), () => check(label, true));

await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "acordosProfessor", uidM), { avisosAceitosEm: Timestamp.now(), email: "douglascamargo@ifsul.edu.br", nome: "Douglas" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026", professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 60000), codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T1/alunos/a1"), { nome: "Aluno Um" });
  await setDoc(doc(f, "turmas/OUTRA"), { nome: "Turma de outro", professorUid: "profB", professorNome: "Prof B", professorEmail: "profb@ifsul.edu.br" });
  await setDoc(doc(f, "turmas/LEGADA"), { nome: "Turma antiga sem dono", codigoDoDia: "" });
});
const exp = () => Timestamp.fromMillis(Date.now() + 7 * 86400000);
const presenca = (extra = {}) => ({ nome: "Aluno Um", data: hoje, horario: "08:01", maquina: "aparelho-1", codigoUsado: "4821", expiraEm: exp(), ...extra });
const anon = env.unauthenticatedContext().firestore();
const prof = env.authenticatedContext(uidA, { email: "prof.ana@ifsul.edu.br" }).firestore();
const intruso = env.authenticatedContext("intruso", { email: "intruso@gmail.com" }).firestore();
const master = env.authenticatedContext(uidM, { email: "douglascamargo@ifsul.edu.br" }).firestore();
const falsoMaster = env.authenticatedContext("outro-uid", { email: "douglascamargo@ifsul.edu.br" }).firestore();

// ===== 1. Presenças: só os campos esperados, tamanhos e prazo =====
await ok("Aluno com código marca presença normal", addDoc(collection(anon, "turmas/T1/presencas"), presenca()));
await nega("Presença SEM expiraEm (nunca seria apagada)", addDoc(collection(anon, "turmas/T1/presencas"), (({ expiraEm, ...r }) => r)(presenca())));
await nega("Presença com expiraEm em 2099", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ expiraEm: Timestamp.fromMillis(Date.parse("2099-01-01")) })));
await nega("Presença com campo extra de 500 KB", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ lixo: "x".repeat(500000) })));
await nega("Presença com campo extra pequeno", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ extra: 1 })));
await nega("Presença com nome de 200 caracteres", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ nome: "A".repeat(200) })));
await nega("Presença com nome vazio", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ nome: "" })));
await nega("Presença com data fora do formato", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ data: "hoje" })));
await nega("Presença com horário gigante", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ horario: "x".repeat(50) })));
await nega("Presença com aparelho gigante", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ maquina: "x".repeat(100) })));
await nega("Presença com código errado", addDoc(collection(anon, "turmas/T1/presencas"), presenca({ codigoUsado: "0000" })));
await ok("Professor marca presença (sem código)", addDoc(collection(prof, "turmas/T1/presencas"), (({ codigoUsado, ...r }) => ({ ...r, maquina: "professor" }))(presenca())));
await ok("Professor corrige dia anterior (\"manual\")", addDoc(collection(prof, "turmas/T1/presencas"), { nome: "Aluno Um", data: new Date(now - 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), horario: "manual", maquina: "professor", expiraEm: Timestamp.fromMillis(now + 4 * 86400000) }));

// ===== 2. Turmas: campos, tamanhos, dono, turmas antigas =====
await ok("Professor cria turma normal (sem e-mail)", setDoc(doc(prof, "turmas/NOVA"), { nome: "INF5M 2027", professorUid: uidA, professorNome: "Ana Souza", codigoDoDia: "", codigoDefinidoEm: null }));
await nega("Criar turma COM e-mail do professor (a turma é pública)", setDoc(doc(prof, "turmas/COMEMAIL"), { nome: "X", professorUid: uidA, professorEmail: "prof.ana@ifsul.edu.br" }));
await nega("Criar turma com campo extra", setDoc(doc(prof, "turmas/EXTRA"), { nome: "X", professorUid: uidA, qualquer: { a: 1 } }));
await nega("Criar turma com nome de 500 caracteres", setDoc(doc(prof, "turmas/LONGA"), { nome: "X".repeat(500), professorUid: uidA }));
await nega("Criar turma com cor fora da lista", setDoc(doc(prof, "turmas/COR"), { nome: "X", professorUid: uidA, cor: "<script>" }));
await nega("Dono passa a turma para outro UID", updateDoc(doc(prof, "turmas/T1"), { professorUid: "intruso" }));
await nega("Conta qualquer toma posse de turma antiga sem dono", updateDoc(doc(intruso, "turmas/LEGADA"), { professorUid: "intruso" }));
await nega("Dono coloca o e-mail de volta na turma", updateDoc(doc(prof, "turmas/NOVA"), { professorEmail: "prof.ana@ifsul.edu.br" }));
await ok("Dono gera código numa turma antiga que ainda tem e-mail", updateDoc(doc(prof, "turmas/T1"), { codigoDoDia: "5555", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 30 }));
await ok("Dono remove o e-mail da própria turma", updateDoc(doc(prof, "turmas/T1"), { professorEmail: deleteField(), professorNome: "Ana Souza" }));
await nega("Dono renomeia turma com 500 caracteres", updateDoc(doc(prof, "turmas/T1"), { nome: "X".repeat(500) }));
await ok("Master transfere turma (troca o dono)", updateDoc(doc(master, "turmas/OUTRA"), { professorUid: uidA, professorEmail: deleteField(), professorNome: "Ana Souza" }));
await ok("Master assume turma antiga sem dono", updateDoc(doc(master, "turmas/LEGADA"), { professorUid: uidM, professorNome: "Douglas" }));

// ===== 3. Master pelo UID =====
await ok("Master (pelo UID) lê a lista de pendentes", getDocs(collection(master, "professoresPendentes")));
await nega("Token com o e-mail da master mas OUTRO UID não é master", getDocs(collection(falsoMaster, "professoresPendentes")));
await nega("Conta qualquer não lê pendentes", getDocs(collection(intruso, "professoresPendentes")));

// ===== 4. Site: e-mail sai das turmas; turmas antigas só com a master =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "turmas/A1"), { nome: "INF1M 2026", professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br" });
  await setDoc(doc(f, "turmas/B1"), { nome: "INF9M 2026", professorUid: "profB", professorNome: "Prof B", professorEmail: "profb@ifsul.edu.br" });
  await setDoc(doc(f, "turmas/ORFA"), { nome: "Turma sem dono", codigoDoDia: "" });
});
async function entrar(email) {
  const ctx = await newCtx(true);
  const page = await open(ctx, APP + "#professor");
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-turmas-list > div", { timeout: 15000 }); await page.waitForTimeout(2500);
  return { ctx, page };
}
let { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
check("Professor ao entrar: e-mail sai das turmas dele", !("professorEmail" in (await read("turmas/A1"))));
check("Professor ao entrar: NÃO mexe na turma de outro professor", (await read("turmas/B1")).professorEmail === "profb@ifsul.edu.br");
check("Professor ao entrar: NÃO assume turma antiga sem dono", !(await read("turmas/ORFA")).professorUid);
// cria turma pelo site
await page.click("#btn-open-more-options"); await page.click("#new-turma-details summary");
await page.fill("#new-turma-turma", "INF8M"); await page.fill("#new-turma-ano", "2027");
await page.click("#btn-create-turma");
await page.waitForSelector("#teacher-manage-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(500);
const criada = (await list("turmas")).find((t) => t.nome === "INF8M 2027");
check("Nova turma pelo site: criada sem e-mail do professor", criada && !("professorEmail" in criada) && criada.professorNome === "Ana Souza");
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();
({ ctx, page } = await entrar("douglascamargo@ifsul.edu.br"));
check("Master ao entrar: e-mail sai de TODAS as turmas", !(await list("turmas")).some((t) => "professorEmail" in t));
check("Master ao entrar: assume a turma antiga sem dono", (await read("turmas/ORFA")).professorUid === uidM);
check("Master: turma de outro professor continua com o dono certo", (await read("turmas/B1")).professorUid === "profB");
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();
// aluno: contato LGPD é o responsável pelo sistema
await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "turmas/T1"), { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(Date.now() - 60000) }); });
ctx = await newCtx(true); page = await open(ctx, APP + "#turma=T1");
await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(600);
await page.click("#btn-open-student-info"); await page.waitForTimeout(300);
check("Aluno: \"Sobre seus dados\" indica o contato do responsável pelo sistema", (await page.textContent("#student-info-contact-link")) === "douglascamargo@ifsul.edu.br");
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
