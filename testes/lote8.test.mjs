import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp, Bytes } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cartão da turma: no celular, "Gerenciar" e "Gerar código 3h" ficam no "⋯"
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5192);
const APP = "http://localhost:5192/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const now = Date.now();
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

// ===== Cenário da auditoria: 6 turmas, 32 alunos =====
const nomes = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima", "Eduarda Martins", "Felipe Carvalho", "Gabriela Nunes", "Heitor Ribeiro", "Isabela Costa", "João Pedro Santos", "Júlia Mendes", "Kauã Oliveira", "Larissa Pereira", "Lucas Gabriel Silva", "Manuela Araújo", "Matheus Barbosa", "Nicole Teixeira", "Otávio Moreira", "Pedro Henrique Dias", "Rafaela Gomes", "Samuel Cardoso", "Sofia Almeida", "Thiago Freitas", "Valentina Rocha", "Vinícius Batista", "Yasmin Correia", "Arthur Monteiro", "Beatriz Castro", "Caio Duarte", "Davi Lucca Pinto", "Emanuelly Vieira", "Enzo Gabriel Cunha"];
const turmas = ["INF1M 2026 - Algoritmos", "INF1N 2026 - Lógica de Programação", "INF2M 2026 - Banco de Dados", "INF2N 2026 - Banco de Dados", "INF3M 2026 - Programação Web", "INF4M 2026 - Projeto Integrador"];
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const PNG1 = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  for (let i = 0; i < turmas.length; i++) {
    await setDoc(doc(db, `turmas/a${i}`), { nome: turmas[i], professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", ...(i === 2 ? { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 15 * 60000), codigoDuracaoMin: 60 } : {}) });
    const b = writeBatch(db); nomes.forEach((n, k) => b.set(doc(db, `turmas/a${i}/alunos/s${k}`), { nome: n })); await b.commit();
    for (let d = 1; d <= 3; d++) { const dia = new Date(now - d * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); const b3 = writeBatch(db); nomes.slice(0, 25).forEach((n, k) => b3.set(doc(db, `turmas/a${i}/presencas/h${d}_${k}`), { nome: n, data: dia, horario: "08:10", maquina: `h${k}`, expiraEm: Timestamp.fromMillis(now + 3 * 86400000) })); await b3.commit(); }
  }
  const b2 = writeBatch(db); nomes.slice(0, 18).forEach((n, k) => b2.set(doc(db, `turmas/a2/presencas/p${k}`), { nome: n, data: hoje, horario: `08:${String(k).padStart(2, "0")}`, maquina: `m${k}`, expiraEm: Timestamp.fromMillis(now + 6 * 86400000) })); await b2.commit();
  await setDoc(doc(db, "turmas/vazia"), { nome: "ZZZ 2026 - Turma nova", professorUid: uidA, professorNome: "Ana Souza", arquivada: true });
});
const top = (p, sel) => p.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top + scrollY));
const h = (p, sel) => p.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
const card = (p, n) => p.locator("#teacher-turmas-list > div", { hasText: n });
const medidas = {};

// ================= ALUNO (celular) =================
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#turma=a2");
await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(500);
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 32); await page.waitForTimeout(900);
check("Aluno: depois do código, sem o aviso verde repetido", await page.isHidden("#global-message"));
check("Aluno: instrução \"você precisa do código\" some depois de validar", await page.isHidden("#list-student-hint"));
check("Aluno: a tela desce sozinha até a lista", (await page.evaluate(() => scrollY)) > 300, `rolou ${await page.evaluate(() => Math.round(scrollY))}px`);
const visiveis = await page.$$eval(".student-row", (rs) => rs.filter((r) => r.offsetParent).map((r) => r.dataset.studentName));
check("Aluno: só aparece quem ainda não marcou (14 de 32)", visiveis.length === 14 && !visiveis.includes("Ana Beatriz Rocha"), `${visiveis.length} visíveis`);
check("Aluno: quem falta em ordem alfabética", visiveis[0] === "Arthur Monteiro", visiveis.slice(0, 3).join(", "));
check("Aluno: botão \"Já marcaram (18)\"", /^Já marcaram \(18\) — toque para ver/.test(await page.textContent("#present-toggle")) && (await page.getAttribute("#present-toggle", "aria-expanded")) === "false");
medidas.alunoLinha = await h(page, ".student-row:visible");
check("Aluno: linha do aluno compacta no celular (≤ 80px; antes 140px)", medidas.alunoLinha <= 80, `${medidas.alunoLinha}px`);
check("Aluno: botão curto \"Marcar\" ao lado do nome", (await page.locator(".student-row:visible .mark-button").first().innerText()).trim() === "Marcar" && Math.abs((await page.locator(".student-row:visible .mark-button").first().boundingBox()).y - (await page.locator(".student-row:visible .student-name").first().boundingBox()).y) < 30);
check("Aluno: nomes não são títulos (acessibilidade) e a lista é uma lista", (await page.$eval(".student-row .student-name", (e) => e.tagName)) === "P" && (await page.getAttribute("#student-list", "role")) === "list");
check("Aluno: \"Modo professor\" discreto (texto, sem botão destacado)", (await page.$eval("#btn-teacher-mode", (b) => getComputedStyle(b).backgroundColor)) === "rgba(0, 0, 0, 0)");
await page.screenshot({ path: `${OUT}/l8-01-aluno-lista-celular.png` });
await page.click("#present-toggle");
check("Aluno: tocar em \"Já marcaram\" mostra os 18", (await page.$$eval(".student-row", (rs) => rs.filter((r) => r.offsetParent).length)) === 32 && /^Esconder quem já marcou \(18\)/.test(await page.textContent("#present-toggle")));
await page.click("#present-toggle");
await page.fill("#student-search", "otávio");
check("Aluno: na busca, quem já marcou aparece", (await page.$$eval(".student-row", (rs) => rs.filter((r) => r.offsetParent).map((r) => r.dataset.studentName))).join() === "Otávio Moreira" && await page.isHidden("#present-toggle"));
await page.fill("#student-search", "");
const alvo = page.locator(".student-row", { hasText: "Yasmin Correia" });
await alvo.locator(".mark-button").click();
check("Aluno: \"Sim, sou eu\" aparece na linha inteira", (await alvo.locator(".confirm-attendance").isVisible()) && (await alvo.evaluate((r) => r.classList.contains("is-confirming"))));
await page.screenshot({ path: `${OUT}/l8-02-aluno-confirmar-celular.png` });
await alvo.locator(".confirm-attendance").click();
await page.waitForSelector("#student-done-panel:not(.hidden)", { timeout: 10000 });
check("Aluno: marca e vê \"Pronto ✓\"", (await page.textContent("#student-done-name")) === "Yasmin Correia");
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ================= PROFESSOR (celular) =================
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(900);
medidas.painelPrimeiraTurma = await top(page, "#teacher-turmas-list > div");
medidas.painelAltura = await page.evaluate(() => document.documentElement.scrollHeight);
const cartoes = await page.$$eval("#teacher-turmas-list > div", (els) => els.map((e) => ({ y: Math.round(e.getBoundingClientRect().top + scrollY), h: Math.round(e.getBoundingClientRect().height) })));
medidas.cartaoAltura = cartoes.map((c) => c.h);
medidas.turmasNaPrimeiraTela = cartoes.filter((c) => c.y + c.h <= 844).length;
check("Painel: 1ª turma mais para cima (antes 388px)", medidas.painelPrimeiraTurma < 300, `${medidas.painelPrimeiraTurma}px`);
check("Painel: cartão da turma mais baixo (antes 176px; com código ativo, 224px)", medidas.cartaoAltura.every((a, i) => a <= (i === 2 ? 180 : 140)), medidas.cartaoAltura.join("/"));
check("Painel: pelo menos 3 turmas inteiras na primeira tela (antes 1)", medidas.turmasNaPrimeiraTela >= 3, `${medidas.turmasNaPrimeiraTela}`);
check("Painel: \"Área do professor\" só para leitor de tela; conta e avisos fora do painel", (await page.$eval("#view-teacher-dashboard h2", (e) => e.getBoundingClientRect().height <= 1)) && (await page.isHidden("#teacher-account-email")) && (await page.isHidden("#btn-open-terms")));
check("Painel: \"Tela dos alunos\" no lugar de \"Voltar\"", (await page.innerText("#btn-teacher-back")).trim() === "Tela dos alunos");
const c1 = card(page, "INF1M 2026");
const nomesBotoes = await c1.locator("button:visible").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || b.innerText.trim()));
check("Cartão (celular): Gerar código 1h, Chamada, Atrasos e ⋯", nomesBotoes.length === 4 && nomesBotoes.includes("Gerar código 1h") && nomesBotoes.includes("Chamada") && nomesBotoes.includes("Atrasos") && nomesBotoes.some((n) => /^Mais opções/.test(n)), nomesBotoes.join(" | "));
const acoes = await c1.locator("button:visible").evaluateAll((bs) => bs.filter((b) => !/Mais opções/.test(b.getAttribute("aria-label") || "")).map((b) => Math.round(b.getBoundingClientRect().top)));
check("Cartão (celular): as 3 ações numa linha só", new Set(acoes).size === 1, acoes.join("/"));
await c1.getByRole("button", { name: /^Mais opções/ }).click();
check("⋯ mostra \"Gerar código 3h\" e \"Gerenciar\"", (await c1.getByRole("button", { name: "Gerar código 3h", exact: true }).locator("visible=true").count()) === 1 && (await c1.getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").count()) === 1 && (await c1.getByRole("button", { name: /^Mais opções/ }).getAttribute("aria-expanded")) === "true");
await page.screenshot({ path: `${OUT}/l8-03-painel-celular.png` });
await c1.getByRole("button", { name: "Gerar código 3h", exact: true }).locator("visible=true").click();
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("⋯ → Gerar código 3h funciona (janela do código)", /expira em (2h 5\dmin|3h)/.test(await page.textContent("#code-display-validity")), await page.textContent("#code-display-validity"));
check("Janela do código: sem aviso flutuante por cima (a janela já confirma)", await page.isHidden("#toast"));
await page.click("#btn-close-code-display"); await page.waitForTimeout(500);
const c3 = card(page, "INF2M 2026");
check("Código ativo (celular): forma curta \"Código 4821 · até HH:MM\"", /^Código 4821 · até \d{2}:\d{2}$/.test((await c3.locator("[data-expira] span:visible").innerText()).trim()));
const bCod = await c3.locator("[data-expira]").boundingBox(), bEnc = await c3.getByRole("button", { name: /Encerrar o código de/ }).boundingBox();
check("\"Encerrar código\" na mesma linha do código", Math.abs((bCod.y + bCod.height / 2) - (bEnc.y + bEnc.height / 2)) < 12 && (await c3.getByRole("button", { name: /Encerrar o código de/ }).innerText()).trim() === "Encerrar");
check("\"Ver todos os atrasos\": no fim da lista no celular", (await page.isVisible("#btn-open-all-atrasos-bottom")) && (await page.isHidden("#btn-open-all-atrasos")));
// Atrasos
await c3.getByRole("button", { name: "Atrasos" }).click();
await page.waitForSelector("#atrasos-modal-backdrop:not(.hidden)"); await page.waitForTimeout(600);
check("Atrasos (celular): \"Tirar foto\" (câmera direta) e \"Da galeria\"", (await page.isVisible("#btn-take-atraso")) && (await page.innerText("#btn-add-atraso")).trim() === "Da galeria" && (await page.getAttribute("#atraso-camera-input", "capture")) === "environment" && (await page.getAttribute("#atraso-camera-input", "multiple")) === null);
check("Atrasos: botão fechar com 44px", (await h(page, "#btn-close-atrasos")) >= 44);
await page.screenshot({ path: `${OUT}/l8-04-atrasos-celular.png` });
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#btn-take-atraso")]);
check("\"Tirar foto\" abre o seletor de câmera (uma foto)", !chooser.isMultiple());
await chooser.setFiles("img/pequena_800x600.jpg");
await page.waitForFunction(() => /Foto guardada/.test(document.getElementById("atrasos-status").textContent), null, { timeout: 15000 });
check("\"Tirar foto\": foto guardada na turma", (await list("turmas/a2/atrasos")).length === 1);
await page.click("#btn-close-atrasos"); await page.waitForTimeout(300);
await page.click("#btn-open-all-atrasos-bottom");
await page.waitForSelector("#atrasos-modal-backdrop:not(.hidden)"); await page.waitForTimeout(500);
check("Todos os atrasos: só ver/baixar (sem Tirar foto)", (await page.isHidden("#btn-take-atraso")) && (await page.isHidden("#btn-add-atraso")));
await page.click("#btn-close-atrasos"); await page.waitForTimeout(300);
// Chamada do professor
await c3.getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 32); await page.waitForTimeout(500);
medidas.chamadaLinha = await h(page, ".student-row");
check("Chamada (celular): linha compacta (antes 140px)", medidas.chamadaLinha <= 80, `${medidas.chamadaLinha}px`);
check("Chamada: professor vê todos (sem recolher quem marcou)", (await page.$$eval(".student-row", (rs) => rs.filter((r) => r.offsetParent).length)) === 32 && (await page.locator("#present-toggle:visible").count()) === 0);
check("Chamada: \"Sobre seus dados\" não aparece para o professor", await page.isHidden("#btn-open-student-info"));
check("Chamada: \"Voltar às turmas\"", (await page.innerText("#btn-trocar-turma")).trim() === "Voltar às turmas");
await page.locator(".student-row", { hasText: "Arthur Monteiro" }).locator(".mark-button").click();
await page.waitForSelector("#btn-toast-action:not(.hidden)", { timeout: 8000 });
check("Aviso: botão fechar com 44px", (await h(page, "#btn-close-toast")) >= 44);
await page.screenshot({ path: `${OUT}/l8-05-chamada-professor-celular.png` });
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);
// Gerenciar
await c3.getByRole("button", { name: /^Mais opções/ }).click();
await c3.getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(600);
medidas.gerenciarHistorico = await top(page, "#manage-history-section");
medidas.gerenciarAltura = await page.evaluate(() => document.documentElement.scrollHeight);
check("Gerenciar: Histórico logo no começo (antes em 3.652px)", medidas.gerenciarHistorico < 600, `${medidas.gerenciarHistorico}px`);
check("Gerenciar: Alunos e Configurações recolhidos no celular", !(await page.$eval("#manage-alunos-details", (d) => d.open)) && !(await page.$eval("#manage-config-details", (d) => d.open)));
check("Gerenciar: \"Alunos (32)\" no título do recolhível", /Alunos \(32\)/i.test(await page.innerText("#manage-alunos-details > summary")));
check("Gerenciar: \"Histórico\" (nome curto)", (await page.innerText("#manage-history-section h4")).trim().toLowerCase() === "histórico");
await page.screenshot({ path: `${OUT}/l8-06-gerenciar-celular.png`, fullPage: true });
await page.click("#manage-config-details > summary");
check("Configurações: código manual, link/QR, cor, arquivar e excluir lá dentro", (await page.isVisible("#manage-code-input")) && (await page.isVisible("#btn-copy-turma-link")) && (await page.isVisible("#manage-color-options")) && (await page.isVisible("#btn-archive-turma")) && (await page.isVisible("#btn-delete-turma")));
await page.click("#manage-alunos-details > summary");
check("Alunos: abre com um toque", (await page.isVisible("#manage-add-aluno-nome")) && (await page.locator("#manage-alunos-list > div").count()) === 32);
await page.click("#btn-manage-back"); await page.waitForTimeout(500);
// Opções
await page.click("#btn-open-more-options"); await page.waitForTimeout(400);
check("Opções: \"Conectado como\" com o e-mail", (await page.isVisible("#teacher-account-email")) && (await page.textContent("#teacher-account-email")) === "prof.ana@ifsul.edu.br");
check("Opções: aviso do SUAP e \"Avisos importantes\"", await page.isVisible("#btn-open-terms"));
await page.click("#btn-open-terms");
check("\"Avisos importantes\" abre os termos", await page.isVisible("#terms-modal-backdrop"));
await page.screenshot({ path: `${OUT}/l8-07-opcoes-celular.png` });
check("Nenhum erro de JavaScript (professora, celular)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Turma sem alunos: Alunos já abre
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "turmas/vazia"), { nome: "ZZZ 2026 - Turma nova", professorUid: uidA, professorNome: "Ana Souza" }); });
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(800);
const cz = card(page, "ZZZ 2026");
await cz.getByRole("button", { name: /^Mais opções/ }).click();
await cz.getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").click();
await page.waitForSelector("#teacher-manage-panel:not(.hidden)"); await page.waitForTimeout(800);
check("Turma sem alunos: a parte de Alunos já abre para cadastrar", (await page.$eval("#manage-alunos-details", (d) => d.open)) && (await page.isVisible("#manage-import-alunos")));
await ctx.close();

// ================= COMPUTADOR =================
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(800);
const bot = (await card(page, "INF1N 2026").locator("button:visible").allInnerTexts()).filter((t) => !/^[☆★]$/.test(t.trim())); // ☆ = fixar (mais de 6 turmas)
check("Computador: cartão com as 5 ações de sempre (sem ⋯)", JSON.stringify(bot.map((t) => t.trim())) === JSON.stringify(["Gerar código 1h", "Gerar código 3h", "Chamada", "Atrasos", "Gerenciar"]), bot.join(" | "));
check("Computador: código ativo com o texto completo", /Código 4821 · expira em \d+ min \(\d{2}:\d{2}\)/.test(await card(page, "INF2M 2026").locator("[data-expira] span:visible").innerText()));
check("Computador: \"Área do professor\" e \"Ver todos os atrasos\" no topo", (await page.isVisible("#view-teacher-dashboard h2")) && (await page.isVisible("#btn-open-all-atrasos")) && (await page.isHidden("#btn-open-all-atrasos-bottom")));
await card(page, "INF2M 2026").getByRole("button", { name: "Atrasos" }).click();
await page.waitForSelector("#atrasos-modal-backdrop:not(.hidden)"); await page.waitForTimeout(500);
check("Computador: Atrasos com \"Adicionar foto\" (sem Tirar foto)", (await page.isHidden("#btn-take-atraso")) && (await page.innerText("#btn-add-atraso")).trim() === "Adicionar foto");
await page.click("#btn-close-atrasos"); await page.waitForTimeout(300);
await card(page, "INF2M 2026").getByRole("button", { name: "Gerenciar" }).click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(600);
const bHist = await page.locator("#manage-history-section").boundingBox(), bAl = await page.locator("#manage-alunos-details").boundingBox();
check("Computador: Histórico e Alunos lado a lado (Alunos aberto)", Math.abs(bHist.y - bAl.y) < 4 && bAl.x > bHist.x + 100 && (await page.$eval("#manage-alunos-details", (d) => d.open)));
medidas.gerenciarAlturaPC = await page.evaluate(() => document.documentElement.scrollHeight);
check("Computador: Gerenciar mais curto (antes 3.757px)", medidas.gerenciarAlturaPC < 3000, `${medidas.gerenciarAlturaPC}px`);
await page.screenshot({ path: `${OUT}/l8-08-gerenciar-computador.png` });
check("Nenhum erro de JavaScript (computador)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

console.log("MEDIDAS", JSON.stringify(medidas));
await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
