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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5187);
const APP = "http://localhost:5187/";
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
    await setDoc(doc(db, `turmas/t${i}`), { nome: nomes[i], professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", ...(i === 0 ? { codigoDoDia: "482193", codigoDefinidoEm: Timestamp.fromMillis(now - 20 * 60000), codigoDuracaoMin: 60 } : {}) });
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
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);

// ===== Importar com prévia (Gerenciar) =====
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.waitForFunction(() => document.getElementById("manage-aluno-count").textContent === "4");
await page.click("#btn-import-alunos");
await page.waitForFunction(() => /Cole os nomes/.test(document.getElementById("toast-text").textContent));
check("Importar vazio: pede para colar os nomes", await page.isHidden("#import-preview"));
await page.fill("#manage-import-alunos", "Eduarda Martins\n  Felipe   Costa \n\nANA BEATRIZ ROCHA\nEduarda Martins\nbruno henrique alves\nGabriel Nunes\n");
await page.click("#btn-import-alunos");
await page.waitForSelector("#import-preview:not(.hidden)");
const prev = await page.textContent("#import-preview-text");
check("Prévia: novos, já cadastrados (com exemplos), repetidos e linhas vazias", prev === "3 novos · 2 já cadastrados (ANA BEATRIZ ROCHA, bruno henrique alves) · 1 repetido na lista · 1 linha vazia. Só os novos serão adicionados.", prev);
check("Prévia: botão \"Importar 3\"", (await page.textContent("#btn-import-confirm")) === "Importar 3");
check("Prévia: nada gravado antes de confirmar", (await list("turmas/t0/alunos")).length === 4);
await page.locator("#manage-import-alunos").locator("..").screenshot({ path: `${OUT}/l6-01-previa-importacao-celular.png` });
await page.click("#btn-import-cancel");
check("Cancelar: fecha a prévia sem gravar", (await page.isHidden("#import-preview")) && (await list("turmas/t0/alunos")).length === 4 && (await page.inputValue("#manage-import-alunos")).length > 0);
await page.click("#btn-import-alunos");
await page.waitForSelector("#import-preview:not(.hidden)");
await page.type("#manage-import-alunos", "X");
check("Editar o texto depois da prévia: a prévia antiga some", await page.isHidden("#import-preview"));
await page.fill("#manage-import-alunos", "Eduarda Martins\n  Felipe   Costa \n\nANA BEATRIZ ROCHA\nEduarda Martins\nbruno henrique alves\nGabriel Nunes\n");
await page.click("#btn-import-alunos");
await page.waitForSelector("#import-preview:not(.hidden)");
await page.click("#btn-import-confirm");
await page.waitForFunction(() => /3 alunos importados/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
await page.waitForFunction(() => document.getElementById("manage-aluno-count").textContent === "7", null, { timeout: 8000 });
const nomes = (await list("turmas/t0/alunos")).map((a) => a.nome).sort();
check("Confirmar: grava só os 3 novos, com espaços arrumados", nomes.length === 7 && nomes.includes("Felipe Costa") && nomes.includes("Eduarda Martins") && nomes.includes("Gabriel Nunes") && nomes.filter((n) => n === "Eduarda Martins").length === 1, nomes.join(" | "));
check("Confirmar: limpa o campo e fecha a prévia", (await page.inputValue("#manage-import-alunos")) === "" && (await page.isHidden("#import-preview")));
await page.fill("#manage-import-alunos", "Felipe Costa\nGabriel Nunes");
await page.click("#btn-import-alunos");
await page.waitForSelector("#import-preview:not(.hidden)");
check("Só nomes já cadastrados: \"Nada novo para importar\" (desativado)", (await page.textContent("#btn-import-confirm")) === "Nada novo para importar" && (await page.isDisabled("#btn-import-confirm")));
// trocar de turma com prévia aberta não importa na turma errada
await page.fill("#manage-import-alunos", "Helena Prado");
await page.click("#btn-import-alunos");
await page.waitForSelector("#import-preview:not(.hidden)");
await page.click("#btn-manage-back"); await page.waitForTimeout(500);
await cardClick(row(page, "INF3M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)"); await page.waitForTimeout(500);
check("Trocando de turma, a prévia da turma anterior some", await page.isHidden("#import-preview"));
check("Nada foi importado na turma errada", !(await list("turmas/t1/alunos")).some((a) => a.nome === "Helena Prado") && !(await list("turmas/t0/alunos")).some((a) => a.nome === "Helena Prado"));
await page.click("#btn-manage-back"); await page.waitForTimeout(500);

// ===== Nova turma: contagem e sem repetidos =====
await page.click("#btn-open-more-options");
await page.click("#new-turma-details summary");
check("Nova turma: sem texto, sem contagem", await page.isHidden("#new-turma-alunos-count"));
await page.fill("#new-turma-alunos", "Igor Lima\nJúlia Reis\n\nigor  lima\nKátia Souza\n");
check("Nova turma: contagem ao vivo avisa os repetidos", (await page.textContent("#new-turma-alunos-count")) === "3 alunos · 1 nome repetido será ignorado", await page.textContent("#new-turma-alunos-count"));
await page.fill("#new-turma-turma", "INF5M"); await page.fill("#new-turma-ano", "2027"); await page.fill("#new-turma-disciplina", "IA");
await page.click("#btn-create-turma");
await page.waitForSelector("#teacher-manage-panel:not(.hidden)", { timeout: 10000 });
const nova = (await list("turmas")).find((t) => t.nome === "INF5M 2027 - IA");
const alunosNova = nova ? (await list(`turmas/${nova.id}/alunos`)).map((a) => a.nome).sort() : [];
check("Nova turma: cadastra sem repetidos nem linhas vazias", alunosNova.join("|") === "Igor Lima|Júlia Reis|Kátia Souza", alunosNova.join("|"));
await page.click("#btn-manage-back"); await page.waitForTimeout(400);
await page.click("#btn-open-more-options"); await page.waitForTimeout(300);
check("Depois de criar, a contagem some", await page.isHidden("#new-turma-alunos-count"));
await page.click("#btn-fill-example");
check("Lista de exemplo: mostra 30 alunos", (await page.textContent("#new-turma-alunos-count")) === "30 alunos");
check("Nenhum erro de JavaScript", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
