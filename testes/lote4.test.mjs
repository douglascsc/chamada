import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5183);
const APP = "http://localhost:5183/";
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

await migrarCodigos(env);
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
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "turmas/tvazia"), { nome: "VAZIA 2026 - Sem alunos", professorUid: uidA, professorNome: "Ana Souza" }); });

let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);

// ===== 2. ausentes primeiro na Chamada do professor =====
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4);
await page.locator(".student-row", { hasText: "Ana Beatriz Rocha" }).locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 });
let ordem = await page.$$eval(".student-row", (r) => r.map((x) => x.dataset.studentName));
check("Ausentes primeiro: quem marcou vai para o fim da lista", ordem[3] === "Ana Beatriz Rocha" && ordem[0] === "Bruno Henrique Alves", ordem.join(" | "));
await page.locator(".student-row", { hasText: "Camila Ferreira" }).locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "2", null, { timeout: 8000 });
ordem = await page.$$eval(".student-row", (r) => r.map((x) => x.dataset.studentName));
check("Ausentes primeiro: os 2 que faltam ficam no topo", ordem.slice(0, 2).join("|") === "Bruno Henrique Alves|Daniel Souza Lima", ordem.join(" | "));
await page.screenshot({ path: `${OUT}/l4-01-ausentes-primeiro-celular.png` });
await page.click("#btn-trocar-turma"); await page.waitForTimeout(500);

// ===== 6. lista para assinatura =====
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.waitForFunction(() => document.getElementById("manage-aluno-count").textContent === "4");
await page.evaluate(() => { window.__printCount = 0; window.print = () => { window.__printCount++; }; });
await page.click("#btn-print-sign-sheet");
check("Imprimir: chama a impressão", (await page.evaluate(() => window.__printCount)) === 1);
const sheet = await page.evaluate(() => { const s = document.getElementById("print-sheet"); return s && { text: s.innerText, linhas: [...s.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent)) }; });
check("Imprimir: título, turma, professora e data em branco", sheet && /Lista de presença/.test(sheet.text) && /INF2M 2026 - Banco de Dados/.test(sheet.text) && /Professor\(a\): Ana Souza/.test(sheet.text) && /Data: ____\/____\/________/.test(sheet.text));
check("Imprimir: 4 alunos em ordem alfabética, numerados, assinatura em branco", sheet.linhas.length === 4 && sheet.linhas.map((l) => l[1]).join("|") === "Ana Beatriz Rocha|Bruno Henrique Alves|Camila Ferreira|Daniel Souza Lima" && sheet.linhas.every((l, i) => l[0] === String(i + 1) && l[2] === ""));
await page.emulateMedia({ media: "print" });
check("Na impressão só a folha aparece (o app some)", (await page.isVisible("#print-sheet")) && (await page.isHidden("#view-teacher-dashboard")));
await page.pdf({ path: `${OUT}/l4-02-lista-assinatura.pdf`, format: "A4", printBackground: true });
await page.emulateMedia({ media: "screen" });
check("Na tela a folha não aparece", await page.isHidden("#print-sheet"));
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
check("Depois de imprimir, limpa a folha", (await page.evaluate(() => !document.getElementById("print-sheet") && !document.body.classList.contains("printing-sheet"))));
await page.click("#btn-manage-back"); await page.waitForTimeout(500);
await cardClick(row(page, "VAZIA 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)"); await page.waitForTimeout(600);
await page.click("#btn-print-sign-sheet");
await page.waitForFunction(() => /Cadastre os alunos/.test(document.getElementById("toast-text").textContent), null, { timeout: 5000 });
check("Turma sem alunos: avisa e não imprime", (await page.evaluate(() => window.__printCount)) === 1);
await page.click("#btn-manage-back"); await page.waitForTimeout(500);

// ===== 3. copiar alunos de outra turma =====
await page.click("#btn-open-more-options");
await page.click("#new-turma-details summary");
await page.waitForSelector("#new-turma-copy-row:not(.hidden)");
const opcoes = await page.$$eval("#new-turma-copy-from option", (o) => o.map((x) => x.textContent));
check("Nova turma: lista as turmas para copiar", opcoes[0] === "— escolher turma —" && opcoes.includes("INF3M 2026 - Web") && opcoes.length === 5, opcoes.join(" | "));
await page.fill("#new-turma-alunos", "Aluno Novo Extra\ncamila ferreira");
await page.selectOption("#new-turma-copy-from", "t1");
await page.waitForFunction(() => /copiado/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
let lista = (await page.inputValue("#new-turma-alunos")).split("\n");
check("Copiar: junta com o que já estava, sem repetir nomes", lista.length === 5 && lista[0] === "Aluno Novo Extra" && lista.filter((n) => /camila ferreira/i.test(n)).length === 1, lista.join(" | "));
check("Copiar: aviso diz quantos foram copiados", /3 alunos copiados de "INF3M 2026 - Web"/.test(await page.textContent("#toast-text")), await page.textContent("#toast-text"));
check("Copiar: o seletor volta para \"escolher\"", (await page.inputValue("#new-turma-copy-from")) === "");
await page.selectOption("#new-turma-copy-from", "t2");
await page.waitForFunction(() => /0 alunos copiados/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
check("Copiar de novo a mesma lista não duplica", (await page.inputValue("#new-turma-alunos")).split("\n").length === 5);
await page.fill("#new-turma-alunos", "");
await page.selectOption("#new-turma-copy-from", "tvazia");
await page.waitForFunction(() => /não tem alunos/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
check("Copiar de turma vazia: avisa", (await page.inputValue("#new-turma-alunos")) === "");
await page.selectOption("#new-turma-copy-from", "t1");
await page.waitForFunction(() => /4 alunos copiados/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
await page.screenshot({ path: `${OUT}/l4-03-copiar-alunos-celular.png` });
await page.fill("#new-turma-turma", "INF4M"); await page.fill("#new-turma-ano", "2027"); await page.fill("#new-turma-disciplina", "Redes");
await page.click("#btn-create-turma");
await page.waitForSelector("#teacher-manage-panel:not(.hidden)", { timeout: 10000 });
await page.waitForFunction(() => document.getElementById("manage-aluno-count").textContent === "4", null, { timeout: 8000 });
const nova = (await list("turmas")).find((t) => t.nome === "INF4M 2027 - Redes");
check("Criar turma com a lista copiada: 4 alunos na turma nova", nova && (await list(`turmas/${nova.id}/alunos`)).length === 4);
check("A turma de origem não foi alterada", (await list("turmas/t1/alunos")).length === 4);
check("Nenhum erro de JavaScript", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Desktop: layout do seletor
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
await page.click("#btn-open-more-options"); await page.click("#new-turma-details summary"); await page.waitForTimeout(300);
await page.locator("#new-turma-details").screenshot({ path: `${OUT}/l4-04-nova-turma-desktop.png` });
await row(page, "INF2M 2026").count();
check("Nenhum erro de JavaScript (desktop)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
