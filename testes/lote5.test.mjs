import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp, Bytes } from "firebase/firestore";
import jsQR from "jsqr";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5186);
const APP = "http://localhost:5186/";
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
const PNG1 = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const ontemMeioDia = Date.parse(`${ontem}T10:00:00-03:00`);
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "turmas/t0/atrasos/a1"), { criadoEm: Timestamp.fromMillis(ontemMeioDia), thumb: Bytes.fromUint8Array(PNG1) });
  await setDoc(doc(db, "turmas/t0/atrasos/a2"), { criadoEm: Timestamp.fromMillis(ontemMeioDia + 3600000), thumb: Bytes.fromUint8Array(PNG1) });
  await setDoc(doc(db, "turmas/t1/atrasos/b1"), { criadoEm: Timestamp.fromMillis(ontemMeioDia), thumb: Bytes.fromUint8Array(PNG1) });
  await setDoc(doc(db, "turmas/t0/presencas/antigo"), { nome: "Bruno Henrique Alves", data: new Date(now - 2 * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), horario: "08:00", maquina: "y", expiraEm: Timestamp.fromMillis(now + 5 * 86400000) });
});

let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);

// ===== Desfazer no Modo professor =====
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4);
const linha = (n) => page.locator(".student-row", { hasText: n });
await linha("Bruno Henrique Alves").locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 });
await page.waitForSelector("#btn-toast-action:not(.hidden)", { timeout: 8000 });
check("Depois de marcar: aviso com botão \"Desfazer\"", (await page.isVisible("#btn-toast-action")) && (await page.textContent("#btn-toast-action")) === "Desfazer" && /Bruno Henrique Alves marcado\(a\) como presente/.test(await page.textContent("#toast-text")));
await page.screenshot({ path: `${OUT}/l5-01-desfazer-rapido-celular.png` });
await page.click("#btn-toast-action");
await page.waitForFunction(() => document.getElementById("present-count").textContent === "0", null, { timeout: 8000 });
check("\"Desfazer\" do aviso apaga na hora, sem pedir senha", (await page.isHidden("#reauth-backdrop")) && (await page.isHidden("#teacher-gate-modal-backdrop")) && !(await list("turmas/t0/presencas")).some((p) => p.nome === "Bruno Henrique Alves" && p.data !== ontem && p.maquina === "professor"));
check("Aviso confirma que desfez", /Presença de Bruno Henrique Alves desfeita/.test(await page.textContent("#toast-text")));
await linha("Camila Ferreira").locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 });
await page.waitForTimeout(8600);
check("O \"Desfazer\" rápido some depois de 8 segundos", await page.isHidden("#toast"));
await linha("Camila Ferreira").locator(".undo-button").click();
await page.waitForSelector("#reauth-backdrop:not(.hidden)", { timeout: 5000 });
check("\"Desfazer\" da linha pede só a senha (não a tela de login)", (await page.isHidden("#teacher-gate-modal-backdrop")) && /Desfazer a presença de Camila Ferreira hoje\?/.test(await page.textContent("#reauth-message")));
await page.screenshot({ path: `${OUT}/l5-02-desfazer-senha-celular.png` });
await page.fill("#reauth-input", "senha-errada"); await page.click("#btn-submit-reauth");
await page.waitForSelector("#reauth-error:not(.hidden)", { timeout: 8000 });
check("Senha errada: não desfaz", (await page.textContent("#present-count")) === "1");
await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth");
await page.waitForFunction(() => document.getElementById("present-count").textContent === "0", null, { timeout: 8000 });
check("Senha certa: desfaz", (await page.isHidden("#reauth-backdrop")));
await linha("Daniel Souza Lima").locator(".mark-button").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 });
await linha("Daniel Souza Lima").locator(".undo-button").click();
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
await page.click("#btn-cancel-reauth");
await page.waitForTimeout(400);
check("Cancelar a senha: presença continua", (await page.textContent("#present-count")) === "1");
await page.waitForSelector("#btn-toast-action:not(.hidden)", { timeout: 8000 });
await page.click("#btn-trocar-turma"); await page.waitForTimeout(500);
check("Saindo da Chamada, o \"Desfazer\" rápido some", await page.isHidden("#toast"));

// ===== Atrasos no histórico =====
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#history-day-panel:not(.hidden)");
await page.waitForTimeout(800);
check("Dia sem fotos: não mostra o aviso de atrasos", await page.isHidden("#history-day-atrasos"), await page.textContent("#history-day-title"));
const chipOntem = page.locator("#history-dates-list button", { hasText: `${ontem.slice(8, 10)}/${ontem.slice(5, 7)}/${ontem.slice(0, 4)}` });
await chipOntem.click();
await page.waitForSelector("#history-day-atrasos:not(.hidden)", { timeout: 8000 });
check("Dia com fotos: \"2 fotos de atraso neste dia\" (só desta turma)", (await page.textContent("#history-day-atrasos-text")) === "2 fotos de atraso neste dia");
await page.locator("#history-day-panel").screenshot({ path: `${OUT}/l5-03-historico-atrasos-celular.png` });
await page.click("#btn-history-day-atrasos");
await page.waitForSelector("#atrasos-modal-backdrop:not(.hidden)");
await page.waitForFunction(() => !/Carregando/.test(document.getElementById("atrasos-status")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
check("\"Ver fotos\" abre os atrasos da turma já filtrados no dia", (await page.inputValue("#atrasos-date-filter")) === ontem && (await page.locator("#atrasos-list img").count()) === 2 && /INF2M 2026/.test(await page.textContent("#atrasos-modal-title")));
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
if (await page.isVisible("#atrasos-modal-backdrop")) await page.click("#btn-close-atrasos").catch(() => {});
await page.waitForTimeout(300);
const chipAntigo = page.locator("#history-dates-list button").last();
await chipAntigo.click(); await page.waitForTimeout(800);
check("Trocando para dia sem fotos, o aviso some", await page.isHidden("#history-day-atrasos"));

// ===== Cartaz com QR =====
await page.evaluate(() => { window.__printCount = 0; window.print = () => { window.__printCount++; }; });
await page.click("#btn-print-turma-poster");
await page.waitForFunction(() => window.__printCount === 1, null, { timeout: 8000 });
const poster = await page.evaluate(() => { const s = document.getElementById("print-sheet"); return s && { poster: s.classList.contains("ps-poster"), text: s.innerText, src: s.querySelector("img")?.src.slice(0, 20) }; });
check("Cartaz: nome da turma, professora, instruções e link", poster && poster.poster && /INF2M 2026 - Banco de Dados/.test(poster.text) && /Professor\(a\): Ana Souza/.test(poster.text) && /Aponte a câmera/.test(poster.text) && /#turma=t0/.test(poster.text), poster && poster.text.replace(/\n/g, " | "));
const qrData = await page.evaluate(async () => { const img = document.querySelector("#print-sheet img"); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: Array.from(d.data) }; });
const decoded = jsQR(Uint8ClampedArray.from(qrData.data), qrData.w, qrData.h);
check("Cartaz: o QR lê o link da turma", decoded && decoded.data === APP + "#turma=t0", decoded && decoded.data);
await page.emulateMedia({ media: "print" });
check("Cartaz: na impressão só a folha aparece", (await page.isVisible("#print-sheet")) && (await page.isHidden("#view-teacher-dashboard")));
await page.pdf({ path: `${OUT}/l5-04-cartaz-qr.pdf`, format: "A4", printBackground: true });
const pdfPages = await page.evaluate(() => 0);
await page.emulateMedia({ media: "screen" });
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
check("Cartaz: depois de imprimir, limpa", await page.evaluate(() => !document.getElementById("print-sheet")));
// a lista para assinatura continua funcionando
await page.click("#btn-print-sign-sheet");
check("Lista para assinatura continua funcionando", (await page.evaluate(() => window.__printCount)) === 2 && (await page.evaluate(() => document.querySelectorAll("#print-sheet tbody tr").length)) === 4);
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
check("Nenhum erro de JavaScript", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
