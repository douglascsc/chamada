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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5182);
const APP = "http://localhost:5182/";
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
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });

// ===== 9. ícone de aplicativo =====
let ctx = await newCtx(true);
let page = await open(ctx, APP);
const manifestHref = await page.getAttribute('link[rel="manifest"]', "href");
const man = await page.evaluate(async (h) => (await fetch(h)).json(), manifestHref);
const icones = await page.evaluate(async (m) => Promise.all(m.icons.map(async (i) => (await fetch(i.src)).status)), man);
check("Ícone de app: manifesto com nome \"Chamada\", tela cheia e ícones", man.short_name === "Chamada" && man.display === "standalone" && man.icons.length === 3 && icones.every((s) => s === 200), JSON.stringify({ short: man.short_name, icones }));
check("Ícone de app: sem start_url (o atalho abre a página onde foi criado, ex. #professor)", !("start_url" in man));
check("Ícone para iPhone e cor do tema", (await page.getAttribute('link[rel="apple-touch-icon"]', "href")) === "icons/apple-touch-icon.png" && (await page.getAttribute('meta[name="theme-color"]', "content")) === "#2B7A40");
await ctx.close();

// ===== Professora =====
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
// 4. tempo restante
const linha = await row(page, "INF2M 2026").textContent();
check("Tempo restante no cartão: \"expira em 40 min (hh:mm)\"", /Código 4821 · expira em (39|40) min \(\d{2}:\d{2}\)/.test(linha), linha.match(/Código[^E]*/)?.[0]);
await cardClick(row(page, "INF3M 2026"), "Gerar código 1h");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Tempo restante na janela do código", /^Válido até \d{2}:\d{2} · expira em (59 min|1h)$/.test(await page.textContent("#code-display-validity")), await page.textContent("#code-display-validity"));
check("Item 3 não foi feito: sem botão \"+30 min\"", (await page.locator("text=+30 min").count()) === 0);
await page.click("#btn-close-code-display");
// 1. professor marca com 1 toque (Chamada)
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4);
check("Tempo restante na Chamada", /expira em (39|40) min/.test(await page.textContent("#teacher-code-bar-text")), await page.textContent("#teacher-code-bar-text"));
await page.locator(".student-row", { hasText: "Bruno Henrique Alves" }).locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 });
check("Professor marca com 1 toque (sem \"Sim, sou eu\")", (await page.textContent("#present-count")) === "1" && (await page.locator(".identity-actions:not(.hidden)").count()) === 0);
await page.click("#btn-trocar-turma"); await page.waitForTimeout(500);
// 7. corrigir dia anterior
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#history-day-panel:not(.hidden)");
const chipOntem = page.locator("#history-dates-list button", { hasText: `${ontem.slice(8, 10)}/${ontem.slice(5, 7)}/${ontem.slice(0, 4)}` });
await chipOntem.click();
await page.waitForFunction(() => /1 presente\(s\) de 4/.test(document.getElementById("history-day-title").textContent));
await page.getByRole("button", { name: /Marcar Camila Ferreira como presente/ }).click();
await page.waitForFunction(() => /2 presente\(s\) de 4/.test(document.getElementById("history-day-title").textContent), null, { timeout: 8000 });
const corrigida = (await list("turmas/t0/presencas")).find((p) => p.nome === "Camila Ferreira" && p.data === ontem);
check("Histórico: \"Marcar presente\" num dia anterior grava a presença (manual) desse dia", corrigida && corrigida.horario === "manual" && corrigida.maquina === "professor", JSON.stringify(corrigida && { data: corrigida.data, horario: corrigida.horario }));
check("Histórico: continua mostrando o mesmo dia depois de corrigir", /2 presente\(s\) de 4/.test(await page.textContent("#history-day-title")));
await page.screenshot({ path: `${OUT}/l3-01-historico-corrigir-celular.png`, fullPage: true });
await page.getByRole("button", { name: /Desfazer a presença de Camila Ferreira/ }).click();
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth");
await page.waitForFunction(() => /1 presente\(s\) de 4/.test(document.getElementById("history-day-title").textContent), null, { timeout: 8000 });
check("Histórico: \"Desfazer\" pede a senha e remove", !(await list("turmas/t0/presencas")).some((p) => p.nome === "Camila Ferreira" && p.data === ontem));
await page.click("#btn-manage-back"); await page.waitForTimeout(500);
// 8. arquivar
await cardClick(row(page, "INF1M 2025"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.click("#btn-archive-turma");
await page.waitForFunction(() => /arquivada/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
await page.waitForTimeout(600);
check("Arquivar: grava no banco e volta às turmas", (await read("turmas/t2")).arquivada === true && (await page.isVisible("#teacher-turmas-section")));
check("Arquivar: some da lista principal", (await row(page, "INF1M 2025").count()) === 0);
check("Arquivar: aparece em \"Turmas arquivadas (1)\"", (await page.isVisible("#archived-turmas")) && (await page.textContent("#archived-count")) === "1");
check("Arquivar: nada foi apagado (alunos continuam)", (await list("turmas/t2/alunos")).length === 4);
await page.click("#archived-turmas summary");
await page.screenshot({ path: `${OUT}/l3-02-arquivadas-celular.png` });
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));

// ===== Aluno =====
const ctxA = await newCtx(true);
let pa = await open(ctxA, APP);
await pa.waitForSelector(".turma-card"); await pa.waitForTimeout(500);
const cards = await pa.$$eval(".turma-card", (c) => c.map((x) => x.textContent));
check("Aluno: turma arquivada não aparece na lista", cards.length === 2 && !cards.some((c) => c.includes("INF1M 2025")));
await pa.close();
pa = await open(ctxA, APP + "#turma=t2");
await pa.waitForFunction(() => /arquivada/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
check("Aluno: link de turma arquivada avisa e volta à lista", await pa.isVisible("#view-turma-select"));
await pa.close();
// 5. tela Pronto
pa = await open(ctxA, APP + "#turma=t0");
await pa.waitForSelector("#view-attendance:not(.hidden)");
await pa.fill("#student-daily-code", "4821");
await pa.waitForFunction(() => document.querySelectorAll(".student-row").length === 4);
await pa.locator(".student-row", { hasText: "Daniel Souza Lima" }).locator(".mark-button").click();
check("Aluno ainda confirma \"Sim, sou eu\"", await pa.locator(".student-row", { hasText: "Daniel Souza Lima" }).locator(".confirm-attendance").isVisible());
await pa.locator(".student-row", { hasText: "Daniel Souza Lima" }).locator(".confirm-attendance").click();
await pa.waitForSelector("#student-done-panel:not(.hidden)", { timeout: 10000 });
check("Tela \"Pronto ✓\": nome, horário e turma; lista escondida", (await pa.textContent("#student-done-name")) === "Daniel Souza Lima" && /^às \d{2}:\d{2} · \d{2}\/\d{2}\/\d{4}$/.test(await pa.textContent("#student-done-when")) && (await pa.textContent("#student-done-turma")) === "INF2M 2026 - Banco de Dados" && (await pa.isHidden("#attendance-list-panel")));
await pa.screenshot({ path: `${OUT}/l3-03-aluno-pronto-celular.png` });
await pa.click("#btn-student-done-list");
check("\"Ver a lista da turma\" mostra a lista de novo", (await pa.isVisible("#attendance-list-panel")) && (await pa.isHidden("#student-done-panel")));
await pa.close();
pa = await open(ctxA, APP + "#turma=t0");
await pa.waitForSelector("#view-attendance:not(.hidden)");
await pa.fill("#student-daily-code", "4821");
await pa.waitForSelector("#student-done-panel:not(.hidden)", { timeout: 10000 });
check("Voltando depois no mesmo aparelho: já mostra \"Pronto ✓\"", (await pa.textContent("#student-done-name")) === "Daniel Souza Lima");
check("Nenhum erro de JavaScript (aluno)", pa.errs.length === 0, pa.errs.join(";"));
await ctxA.close();

// reativar
await page.locator("#archived-turmas-list > div", { hasText: "INF1M 2025" }).getByRole("button", { name: "Reativar" }).click();
await page.waitForFunction(() => /reativada/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
await page.waitForTimeout(600);
check("Reativar: volta para a lista principal", (await read("turmas/t2")).arquivada === false && (await row(page, "INF1M 2025").count()) === 1 && (await page.isHidden("#archived-turmas")));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
