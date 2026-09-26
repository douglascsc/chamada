import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch, Timestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => { results.push(Boolean(ok)); console.log(ok ? "✅" : "❌", name, detail ? `— ${detail}` : ""); };
const types = { ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5188);
const APP = "http://localhost:5188/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const alunos = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima"];
const now = Date.now();
const ontem = new Date(now - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  const nomes = ["INF2M 2026 - Banco de Dados", "INF3M 2026 - Web", "INF1M 2025 - Algoritmos"];
  for (let i = 0; i < nomes.length; i++) {
    await setDoc(doc(db, `turmas/t${i}`), { nome: nomes[i], professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", ...(i === 0 ? { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 20 * 60000), codigoDuracaoMin: 60 } : {}) });
    const b = writeBatch(db); alunos.forEach((n, k) => b.set(doc(db, `turmas/t${i}/alunos/s${k}`), { nome: n })); await b.commit();
  }
  await setDoc(doc(db, `turmas/t0/presencas/${ontem}_x`), { nome: alunos[0], data: ontem, horario: "08:05", maquina: "x", expiraEm: Timestamp.fromMillis(now + 6 * 86400000) });
});
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
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const clear = () => fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-chamada/databases/(default)/documents", { method: "DELETE" });
async function login(page, remember = false) {
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS);
  if (remember) await page.check("#teacher-gate-remember");
  await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
}
async function box(page, sel) { return page.locator(sel).boundingBox(); }

// ===== Chamada enxuta (professor, celular) =====
let ctx = await newCtx(true);
await ctx.addInitScript(() => { navigator.share = async (d) => { window.__shared = d; }; });
let page = await open(ctx, APP + "#professor");
await login(page);
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4);
await page.waitForTimeout(400);
check("Celular/professor: título grande \"Lista de Presença\" escondido", await page.isHidden("#list-heading-block"));
const bBar = await box(page, "#teacher-code-bar"), bHeader = await box(page, "#list-header"), bList = await box(page, "#student-list");
check("Celular/professor: barra do código antes do contador", bBar.y < bHeader.y && bHeader.y < bList.y, `barra ${Math.round(bBar.y)} · contador ${Math.round(bHeader.y)}`);
const bEnd = await box(page, "#btn-bar-end-code"), bCopy = await box(page, "#btn-bar-copy-absent");
check("Celular/professor: \"Encerrar código\" e \"Copiar ausentes\" lado a lado", Math.abs(bEnd.y - bCopy.y) < 2 && bEnd.x < bCopy.x);
check("Celular/professor: rótulo curto \"Encerrar código\"", (await page.locator("#btn-bar-end-code").innerText()).trim() === "Encerrar código");
check("Celular/professor: contador de presentes continua", await page.isVisible("#present-count"));
await page.screenshot({ path: `${OUT}/l7-01-chamada-enxuta-celular.png` });

// ===== Encerrar sozinho quando todos marcarem (Chamada) =====
check("Opção \"encerrar sozinho\" aparece com código ativo (desligada)", (await page.isVisible("#bar-auto-end")) && !(await page.isChecked("#bar-auto-end")));
for (const n of alunos) {
  await page.locator(".student-row", { hasText: n }).locator(".mark-button").click();
  await page.waitForTimeout(250);
}
await page.waitForFunction(() => document.getElementById("present-count").textContent === "4", null, { timeout: 8000 });
await page.waitForTimeout(800);
check("Opção desligada: todos marcaram e o código continua", (await read("turmas/t0")).codigoDoDia === "4821");
await page.check("#bar-auto-end");
await page.waitForFunction(() => /Todos os 4 alunos marcaram/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
check("Opção ligada: encerra o código (banco)", (await read("turmas/t0")).codigoDoDia === "");
await page.waitForTimeout(500);
check("Depois de encerrar: barra mostra \"Nenhum código ativo\" e some a opção", /Nenhum código ativo/.test(await page.textContent("#teacher-code-bar-text")) && (await page.isHidden("#bar-auto-end-wrap")));
check("Celular/professor sem código: \"Gerar código 1h\" e \"Copiar ausentes\" lado a lado", await (async () => { const a = await box(page, "#btn-bar-new-code"), b = await box(page, "#btn-bar-copy-absent"); return Math.abs(a.y - b.y) < 2; })());
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);

// ===== Encerrar sozinho pela janela do código =====
await row(page, "INF3M 2026").getByRole("button", { name: "Gerar código 1h" }).click();
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Janela do código: opção já vem ligada (lembra a escolha)", await page.isChecked("#code-display-auto-end"));
check("Janela do código: botão Compartilhar (onde o celular permite)", await page.isVisible("#btn-code-display-share"));
await page.click("#btn-code-display-share");
const shared = await page.evaluate(() => window.__shared);
check("Compartilhar: manda o nome e o link da turma", shared && shared.url === APP + "#turma=t1" && shared.title === "INF3M 2026 - Web" && /digite o código do dia/.test(shared.text), JSON.stringify(shared));
const codigoT1 = (await read("turmas/t1")).codigoDoDia;
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const b = writeBatch(f); alunos.slice(0, 3).forEach((n, k) => b.set(doc(f, `turmas/t1/presencas/p${k}`), { nome: n, data: hoje, horario: "08:00", maquina: `m${k}`, expiraEm: Timestamp.fromMillis(now + 86400000) })); await b.commit(); });
await page.waitForTimeout(1500);
check("Janela do código: 3 de 4 marcaram, código continua", (await read("turmas/t1")).codigoDoDia === codigoT1 && codigoT1 !== "");
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "turmas/t1/presencas/p3"), { nome: alunos[3].toUpperCase(), data: hoje, horario: "08:01", maquina: "m3", expiraEm: Timestamp.fromMillis(now + 86400000) }); });
await page.waitForFunction(() => /Encerrado: todos os 4 alunos marcaram/.test(document.getElementById("code-display-validity").textContent), null, { timeout: 8000 });
check("Janela do código: o 4º marcou → encerra e avisa na janela", (await read("turmas/t1")).codigoDoDia === "");
await page.screenshot({ path: `${OUT}/l7-02-janela-encerrado-celular.png` });
await page.click("#btn-close-code-display");
// desligando a opção
await row(page, "INF1M 2025").getByRole("button", { name: "Gerar código 1h" }).click();
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
await page.uncheck("#code-display-auto-end");
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const b = writeBatch(f); alunos.forEach((n, k) => b.set(doc(f, `turmas/t2/presencas/p${k}`), { nome: n, data: hoje, horario: "08:00", maquina: `m${k}`, expiraEm: Timestamp.fromMillis(now + 86400000) })); await b.commit(); });
await page.waitForTimeout(1500);
check("Opção desligada na janela: não encerra", (await read("turmas/t2")).codigoDoDia !== "");
await page.click("#btn-close-code-display");

// ===== Compartilhar no Gerenciar + cor da turma =====
await row(page, "INF2M 2026").getByRole("button", { name: "Gerenciar" }).click();
await page.waitForSelector("#teacher-manage-panel:not(.hidden)"); await page.waitForTimeout(400);
await page.click("#btn-share-turma-link");
check("Gerenciar: Compartilhar manda o link da turma", (await page.evaluate(() => window.__shared.url)) === APP + "#turma=t0");
check("Cor: 10 opções, \"Sem cor\" marcada", (await page.locator("#manage-color-options button").count()) === 10 && (await page.getAttribute('#manage-color-options button[aria-label="Sem cor"]', "aria-pressed")) === "true");
await page.click('#manage-color-options button[aria-label="Azul"]');
await page.waitForFunction(() => document.querySelector('#manage-color-options button[aria-label="Azul"]').getAttribute("aria-pressed") === "true", null, { timeout: 8000 });
check("Cor: salva no banco", (await read("turmas/t0")).cor === "azul");
await page.locator("#manage-color-options").locator("..").screenshot({ path: `${OUT}/l7-03-cor-celular.png` });
await page.click("#btn-manage-back"); await page.waitForTimeout(600);
check("Cor: faixa azul no cartão do professor", (await row(page, "INF2M 2026").evaluate((el) => getComputedStyle(el).borderLeftColor)) === "rgb(37, 99, 235)");
check("Sem cor: cartão sem faixa", (await row(page, "INF3M 2026").evaluate((el) => getComputedStyle(el).borderLeftWidth)) === "1px");
await page.screenshot({ path: `${OUT}/l7-04-turmas-cor-celular.png` });
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ===== Desktop: nada muda na Chamada =====
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await login(page);
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4); await page.waitForTimeout(400);
check("Computador: título \"Lista de Presença\" continua", await page.isVisible("#list-heading-block"));
check("Computador: barra do código continua abaixo do contador", (await box(page, "#teacher-code-bar")).y > (await box(page, "#list-header")).y);
check("Computador: sem Compartilhar onde o navegador não oferece", await page.isHidden("#btn-share-turma-link"));
await ctx.close();

// ===== Aluno: vibra, cor no cartão, sem layout de professor =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); await updateDoc(doc(f, "turmas/t0"), { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(Date.now() - 60000) }); await setDoc(doc(f, "turmas/t0/alunos/s9"), { nome: "Eva Nova" }); });
ctx = await newCtx(true);
await ctx.addInitScript(() => { navigator.vibrate = (p) => { window.__vib = p; return true; }; });
page = await open(ctx, APP);
await page.waitForSelector(".turma-card"); await page.waitForTimeout(500);
check("Aluno: faixa azul no cartão da turma", (await page.locator(".turma-card", { hasText: "INF2M 2026" }).evaluate((el) => getComputedStyle(el).borderLeftColor)) === "rgb(37, 99, 235)");
await page.locator(".turma-card", { hasText: "INF2M 2026" }).click();
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5);
check("Aluno no celular: título da lista aparece (layout de professor só para professor)", await page.isVisible("#list-heading-block"));
await page.locator(".student-row", { hasText: "Eva Nova" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Eva Nova" }).locator(".confirm-attendance").click();
await page.waitForSelector("#student-done-panel:not(.hidden)", { timeout: 10000 });
await page.waitForFunction(() => window.__vib, null, { timeout: 8000 }).catch(() => {});
check("Aluno: o celular vibra ao confirmar", JSON.stringify(await page.evaluate(() => window.__vib)) === "[60,60,120]");
// Relatar problema
await page.evaluate(() => document.getElementById("link-report-problem").addEventListener("click", (e) => { window.__href = e.currentTarget.href; e.preventDefault(); }));
await page.click("#link-report-problem");
const href = decodeURIComponent(await page.evaluate(() => window.__href));
check("Relatar problema: e-mail para o suporte com assunto", href.startsWith("mailto:douglascamargo@ifsul.edu.br?subject=Chamada — problema&body="), href.slice(0, 80));
check("Relatar problema: versão, tela/turma, internet, tamanho e navegador", /Versão: 2026\.09\.25/.test(href) && /Tela: #turma=t0 — turma "INF2M 2026 - Banco de Dados"/.test(href) && /Professor logado: não/.test(href) && /Internet: conectado/.test(href) && /Tamanho da tela: 390x/.test(href) && /Navegador: Mozilla/.test(href));
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ===== Sem internet (Modo professor) =====
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await login(page, true); // "Manter conectado": cópia do banco no aparelho
await page.close();
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-turmas-list > div", { timeout: 15000 }); await page.waitForTimeout(800);
check("Manter conectado: banco com cópia no aparelho (IndexedDB)", await page.evaluate(async () => (await indexedDB.databases()).some((d) => /firestore/i.test(d.name))));
await row(page, "INF3M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4); await page.waitForTimeout(600);
// desfaz as presenças de hoje (vêm da parte anterior) para testar do zero
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const { deleteDoc } = await import("firebase/firestore"); for (let k = 0; k < 4; k++) await deleteDoc(doc(f, `turmas/t1/presencas/p${k}`)); });
await page.waitForFunction(() => document.getElementById("present-count").textContent === "0", null, { timeout: 8000 });
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.waitForTimeout(300);
await page.locator(".student-row", { hasText: "Camila Ferreira" }).locator(".mark-button").click();
await page.waitForTimeout(500);
check("Sem internet: marca na hora (lista atualiza)", (await page.textContent("#present-count")) === "1");
check("Sem internet: aviso explica que será enviado depois", /Sem internet: será enviado quando a conexão voltar/.test(await page.textContent("#toast-text")));
check("Sem internet: linha mostra \"aguardando internet\"", /Presente · \d{2}:\d{2} · aguardando internet/.test(await page.locator(".student-row", { hasText: "Camila Ferreira" }).locator(".present-status-label").textContent()));
await page.locator(".student-row", { hasText: "Daniel Souza Lima" }).locator(".mark-button").click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/l7-05-sem-internet-celular.png` });
check("Sem internet: nada chegou ao banco ainda", !(await list("turmas/t1/presencas")).some((p) => p.data === hoje));
// fecha a página ainda sem internet; volta a internet e abre de novo
await page.close();
await ctx.setOffline(false);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-turmas-list > div", { timeout: 15000 });
let enviados = [];
for (let i = 0; i < 20 && enviados.length < 2; i++) { await page.waitForTimeout(500); enviados = (await list("turmas/t1/presencas")).filter((p) => p.data === hoje).map((p) => p.nome); }
check("Página fechada sem internet: ao reabrir com internet, as 2 presenças são enviadas", enviados.sort().join("|") === "Camila Ferreira|Daniel Souza Lima", enviados.join("|"));
check("Nenhum erro de JavaScript (sem internet)", page.errs.length === 0, page.errs.join(";"));
// Sair apaga a cópia local
await page.click("#btn-sign-out").catch(async () => { await page.click("#btn-open-more-options"); await page.click("#btn-sign-out"); });
await page.waitForLoadState("load"); await page.waitForTimeout(2500);
check("Sair: apaga a cópia do banco no aparelho", !(await page.evaluate(async () => (await indexedDB.databases()).some((d) => /firestore/i.test(d.name) && /main/i.test(d.name)))), JSON.stringify(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))));
check("Sair: volta para a tela inicial", await page.isVisible("#view-turma-select"));
await ctx.close();

// ===== Regras: cor da turma =====
const anaDb = env.authenticatedContext(uidA, { email: "prof.ana@ifsul.edu.br" }).firestore();
const outroDb = env.authenticatedContext("outro", { email: "outro@ifsul.edu.br" }).firestore();
check("Regras: dono salva uma cor da lista", await assertSucceeds(updateDoc(doc(anaDb, "turmas/t2"), { cor: "azul" })).then(() => true, () => false));
check("Regras: dono pode tirar a cor", await assertSucceeds(updateDoc(doc(anaDb, "turmas/t2"), { cor: "" })).then(() => true, () => false));
check("Regras: cor fora da lista é recusada", await assertFails(updateDoc(doc(anaDb, "turmas/t2"), { cor: "<script>" })).then(() => true, () => false));
check("Regras: cor que não é texto é recusada", await assertFails(updateDoc(doc(anaDb, "turmas/t2"), { cor: 5 })).then(() => true, () => false));
check("Regras: outro professor não muda a cor", await assertFails(updateDoc(doc(outroDb, "turmas/t2"), { cor: "rosa" })).then(() => true, () => false));
check("Regras: sem login não muda a cor", await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), "turmas/t2"), { cor: "rosa" })).then(() => true, () => false));

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
