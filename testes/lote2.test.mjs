import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(body); }).listen(5180);
const APP = "http://localhost:5180/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
async function createUser(email, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) }).then((r) => r.json());
  if (displayName) await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName }) });
  return r.localId;
}
const uidM = await createUser("douglascamargo@ifsul.edu.br", "Douglas");
const uidA = await createUser("prof.ana@ifsul.edu.br", "Ana Souza");
const uidJ = await createUser("juliane@ifsul.edu.br", "Juliane Moura"); // conta criada antes, nunca entrou
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", uidM) /* conta master do teste */ } });
const alunos = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima", "Eduarda Martins", "Felipe Carvalho"];
const now = Date.now();
const iso = (d) => new Date(now - d * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidM), { avisosAceitosEm: Timestamp.now(), email: "douglascamargo@ifsul.edu.br", nome: "Douglas" });
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza", ultimoAcesso: Timestamp.fromMillis(now - 3 * 86400000) });
  await setDoc(doc(db, "acordosProfessor", "orfao"), { avisosAceitosEm: Timestamp.now(), email: "teste@teste.com.br" }); // registro órfão, sem último acesso
  const nomes = ["INF2M 2026 - Banco de Dados", "INF3M 2026 - Web", "ELE1M 2026 - Circuitos", "ELE2M 2026 - Eletrônica", "MEC1M 2026 - Desenho", "ADM1 2026 - Português", "QUI1 2026 - Química", "TMS1 2026 - Informática"];
  for (let i = 0; i < nomes.length; i++) {
    await setDoc(doc(db, `turmas/t${i}`), { nome: nomes[i], professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", ...(i === 0 ? { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 60 } : {}) });
    const b = writeBatch(db); alunos.forEach((n, k) => b.set(doc(db, `turmas/t${i}/alunos/s${k}`), { nome: n })); await b.commit();
  }
  const b2 = writeBatch(db);
  [[2, [0, 1, 2, 3]], [1, [0, 1, 4]], [0, [0, 2]]].forEach(([d, ks]) => ks.forEach((k) => b2.set(doc(db, `turmas/t0/presencas/${iso(d)}_${k}`), { nome: alunos[k], data: iso(d), horario: `08:0${k}`, maquina: `m${d}${k}`, expiraEm: Timestamp.fromMillis(now + 5 * 86400000) })));
  await b2.commit();
});
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };

await migrarCodigos(env);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newCtx(mobile = true) {
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
async function login(page, email) {
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
}
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());

// ================= Professora (celular) =================
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await login(page, "prof.ana@ifsul.edu.br");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(800);
check("Cabeçalho: \"Área do professor\" escondido dentro do painel", await page.isHidden("#btn-teacher-area"));
check("Cabeçalho: status \"Conectado\" escondido quando está tudo ok", await page.isHidden("#db-status-badge"));
const topoTurmas = await page.evaluate(() => Math.round(document.getElementById("teacher-turmas-heading").getBoundingClientRect().top));
check("Cabeçalho compacto: lista de turmas começa mais alto no celular", topoTurmas < 360, `${topoTurmas}px (antes ~430px)`);

// --- Encerrar pelo cartão
check("Cartão com código ativo mostra \"Encerrar\"", await row(page, "INF2M 2026").getByRole("button", { name: /Encerrar o código/ }).isVisible());
await page.screenshot({ path: `${OUT}/l2-01-painel-celular.png` });
await row(page, "INF2M 2026").getByRole("button", { name: /Encerrar o código/ }).click();
await page.waitForFunction(() => /encerrado/.test(document.getElementById("toast-text").textContent));
check("Encerrar (cartão): código apagado no banco", (await codigoAtual(env, "t0")) === "");
await page.waitForTimeout(500);
check("Encerrar (cartão): cartão mostra \"Nenhum código ativo\"", (await row(page, "INF2M 2026").textContent()).includes("Nenhum código ativo"));

// --- Gerar → código grande com QR + link
await cardClick(row(page, "INF2M 2026"), "Gerar código 1h");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
await page.waitForSelector("#code-display-qr img", { timeout: 8000 });
check("Código grande: QR da turma aparece", await page.$eval("#code-display-qr img", (i) => i.complete && i.naturalWidth > 0));
check("Acessibilidade: foco vai para dentro da janela aberta", await page.evaluate(() => document.getElementById("code-display-backdrop").contains(document.activeElement)));
for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
check("Acessibilidade: Tab não sai da janela", await page.evaluate(() => document.getElementById("code-display-backdrop").contains(document.activeElement)));
await page.click("#btn-code-display-copy-link");
await page.waitForTimeout(300);
check("Código grande: \"Copiar link da turma\" copia o link #turma=", (await clip(page)) === APP + "#turma=t0", await clip(page));
await page.screenshot({ path: `${OUT}/l2-02-codigo-qr-celular.png` });

// --- Chamada: barra do professor
await page.click("#btn-code-display-chamada");
await page.waitForSelector("#teacher-code-bar:not(.hidden)");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 6);
check("Chamada: barra mostra o código ativo e até quando vale", /^Código \d{4} · expira em (1h|59 min) \(\d{2}:\d{2}\)$/.test(await page.textContent("#teacher-code-bar-text")), await page.textContent("#teacher-code-bar-text"));
check("Chamada: \"Área do professor\" escondido", await page.isHidden("#btn-teacher-area"));
check("Chamada: botão mostra quantos ausentes", (await page.textContent("#btn-bar-copy-absent")) === "Copiar ausentes (4)", await page.textContent("#btn-bar-copy-absent"));
await page.click("#btn-bar-copy-absent"); await page.waitForTimeout(300);
const txt = await clip(page);
check("Copiar ausentes (chamada): título + um nome por linha", txt.startsWith("Ausentes — INF2M 2026 - Banco de Dados — ") && txt.split("\n").length === 5 && txt.includes("Bruno Henrique Alves") && !txt.includes("Camila Ferreira"), JSON.stringify(txt.split("\n")[0]));
await page.screenshot({ path: `${OUT}/l2-03-chamada-barra-celular.png` });
await page.click("#btn-bar-end-code");
await page.waitForFunction(() => /Nenhum código ativo/.test(document.getElementById("teacher-code-bar-text").textContent), null, { timeout: 8000 });
check("Chamada: \"Encerrar código agora\" → barra mostra \"Gerar código 30 min\"", (await page.isVisible("#btn-bar-new-code")) && (await page.isHidden("#btn-bar-end-code")));
await page.click("#btn-bar-new-code");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Chamada: \"Gerar código 30 min\" pela barra abre o código grande", /^\d{4}$/.test(await page.textContent("#code-display-value")));
await page.click("#btn-close-code-display");
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);

// --- Gerenciar: link, QR, copiar ausentes, 7 dias, renomear/remover aluno
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#history-day-panel:not(.hidden)");
check("Gerenciar: link da turma", (await page.textContent("#manage-turma-link")) === APP + "#turma=t0");
await page.click("#btn-copy-turma-link"); await page.waitForTimeout(300);
check("Gerenciar: \"Copiar link\"", (await clip(page)) === APP + "#turma=t0");
await page.click("#btn-show-turma-qr");
await page.waitForSelector("#turma-qr-image img", { timeout: 8000 });
check("Gerenciar: \"Mostrar QR Code\" abre o QR grande", await page.$eval("#turma-qr-image img", (i) => i.naturalWidth > 0));
await page.screenshot({ path: `${OUT}/l2-04-qr-grande-celular.png` });
await page.keyboard.press("Escape").catch(() => {});
await page.click("#btn-close-turma-qr").catch(() => {});
await page.click("#btn-copy-history-absent"); await page.waitForTimeout(300);
const hist = await clip(page);
check("Copiar ausentes (histórico, dia mais recente)", hist.startsWith("Ausentes — INF2M 2026 - Banco de Dados — ") && hist.includes("(4 de 6)"), hist.split("\n")[0]);
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-week")]);
const xlsxPath = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(xlsxPath);
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsxPath);
const sh = wb.worksheets[0];
const header = sh.getRow(3).values.slice(1);
const linhaBruno = sh.getRow(4 + alunos.slice().sort((a, b) => a.localeCompare(b, "pt-BR")).indexOf("Bruno Henrique Alves")).values.slice(1);
check("Exportar 7 dias: uma coluna por dia + Presenças + Faltas + Atrasos", header.length === 7 && header[0] === "Aluno" && header[4] === "Presenças" && header[5] === "Faltas" && header[6] === "Atrasos", header.join(" | "));
check("Exportar 7 dias: presença com horário, falta como \"Falta\" e totais", linhaBruno[1] === "08:01" && linhaBruno[2] === "08:01" && linhaBruno[3] === "Falta" && linhaBruno[4] === 2 && linhaBruno[5] === 1, linhaBruno.join(" | "));
await page.locator("#manage-alunos-list > div", { hasText: "Felipe Carvalho" }).getByRole("button", { name: /Editar nome/ }).click();
const editInput = page.locator('#manage-alunos-list input[aria-label="Novo nome de Felipe Carvalho"]');
check("Renomear aluno: campo na própria linha (sem janela do navegador)", await editInput.isVisible());
await editInput.fill("Felipe Carvalho Neto"); await editInput.press("Enter");
await page.waitForFunction(() => /Nome alterado/.test(document.getElementById("toast-text").textContent));
check("Renomear aluno: salvo no banco", (await read("turmas/t0/alunos/s5")).nome === "Felipe Carvalho Neto");
await page.locator("#manage-alunos-list > div", { hasText: "Eduarda Martins" }).getByRole("button", { name: /Remover Eduarda/ }).click();
await page.locator("#manage-alunos-list > div", { hasText: "Remover Eduarda Martins?" }).getByRole("button", { name: "Remover", exact: true }).click();
await page.waitForFunction(() => /removido/.test(document.getElementById("toast-text").textContent));
check("Remover aluno: confirmação na própria linha e removido", !(await read("turmas/t0/alunos/s4")));
const alvos = await page.$$eval("#manage-alunos-list button", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
check("Celular: botões de editar/remover aluno com 44px", alvos.every((h) => h >= 44), `mín ${Math.min(...alvos)}px`);
await page.screenshot({ path: `${OUT}/l2-05-gerenciar-link-celular.png` });
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ================= Aluno (celular) =================
ctx = await newCtx(true);
page = await open(ctx, APP);
await page.waitForSelector(".turma-card"); await page.waitForTimeout(500);
check("Aluno: busca de turma aparece (8 turmas)", await page.isVisible("#turma-select-search"));
await page.fill("#turma-select-search", "ele");
let cards = await page.$$eval(".turma-card", (c) => c.map((x) => x.querySelector(".font-bold").textContent));
check("Aluno: busca \"ele\" mostra só ELE1M e ELE2M", cards.length === 2 && cards.every((n) => n.startsWith("ELE")), cards.join(" | "));
await page.fill("#turma-select-search", "zzz");
check("Aluno: busca sem resultado tem mensagem", await page.isVisible("#turma-select-search-empty"));
await page.fill("#turma-select-search", "inf2m");
await page.locator(".turma-card").first().click();
await page.waitForTimeout(600);
check("Aluno: ao entrar, o endereço vira o link da turma", page.url() === APP + "#turma=t0", page.url());
await page.click("#btn-trocar-turma");
check("Aluno: \"Trocar turma\" limpa o link", page.url() === APP, page.url());
await page.close();
page = await open(ctx, APP + "#turma=t0");
await page.waitForSelector("#view-attendance:not(.hidden)", { timeout: 8000 });
check("Link da turma: abre direto a turma, pedindo o código", (await page.textContent("#attendance-turma-name")) === "INF2M 2026 - Banco de Dados" && (await page.isVisible("#student-daily-code")));
await page.close();
page = await open(ctx, APP + "#turma=naoexiste");
await page.waitForFunction(() => /não existe/.test(document.getElementById("toast-text").textContent), null, { timeout: 8000 });
check("Link de turma inexistente: aviso e volta para a lista", (await page.isVisible("#view-turma-select")) && page.url() === APP);
await page.close();
// sem internet
page = await open(ctx, APP + "#turma=t0");
await page.waitForSelector("#view-attendance:not(.hidden)");
const codigo = (await codigoAtual(env, "t0"));
await page.fill("#student-daily-code", codigo);
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5);
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.waitForTimeout(300);
check("Sem internet: faixa de aviso aparece", await page.isVisible("#offline-banner"));
await page.screenshot({ path: `${OUT}/l2-06-sem-internet-celular.png` });
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.waitForTimeout(300);
check("Internet voltou: faixa some", await page.isHidden("#offline-banner"));
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ================= Master: professores pendentes e último acesso =================
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await login(page, "douglascamargo@ifsul.edu.br");
await page.waitForSelector("#teacher-turmas-list > div");
// --- QR grande para projetar (computador)
await cardClick(row(page, "INF2M 2026"), "Gerar código 1h");
await page.waitForSelector("#code-display-qr img", { timeout: 8000 });
await page.click("#code-display-qr");
await page.waitForSelector("#turma-qr-image img", { timeout: 8000 });
await page.waitForTimeout(300);
const tamQr = await page.$eval("#turma-qr-image img", (i) => Math.round(i.getBoundingClientRect().width));
check("Computador: tocar no QR pequeno abre o QR grande por cima", (await page.isVisible("#turma-qr-backdrop")));
check("Computador: QR grande com ~512px (o dobro)", tamQr >= 500, `${tamQr}px`);
const pngQr = await page.locator("#turma-qr-image img").screenshot();
const { PNG } = await import("pngjs"); const jsQR = (await import("jsqr")).default;
const imgQr = PNG.sync.read(pngQr);
const lido = jsQR(new Uint8ClampedArray(imgQr.data), imgQr.width, imgQr.height);
check("QR grande é legível e aponta para o link da turma", lido && lido.data === APP + "#turma=t0", lido ? lido.data : "não leu");
await page.screenshot({ path: `${OUT}/l2-08-qr-grande-computador.png` });
await page.click("#btn-close-turma-qr");
await page.click("#btn-close-code-display");
await page.click("#btn-open-more-options");
await page.click("#admin-panel-section summary");
await page.waitForFunction(() => document.querySelectorAll("#admin-professores-list > div").length > 0);
let rows = await page.$$eval("#admin-professores-list > div", (r) => r.map((x) => x.querySelector(".text-xs").textContent));
check("Lista: último acesso de cada professor", rows.some((r) => r.startsWith("prof.ana@ifsul.edu.br") && /último acesso: \d{2}\/\d{2}\/\d{4}/.test(r)), rows.join(" || "));
check("Lista: registro órfão fica evidente (\"sem registro\" de acesso)", rows.some((r) => r.startsWith("teste@teste.com.br") && r.includes("último acesso: sem registro")));
await page.fill("#admin-new-professor-nome", "Carlos Novo"); await page.fill("#admin-new-professor-email", "carlos@ifsul.edu.br");
await page.click("#btn-create-professor");
await page.waitForFunction(() => /criado/.test(document.getElementById("create-professor-status").textContent), null, { timeout: 15000 });
await page.waitForFunction(() => [...document.querySelectorAll("#admin-professores-list > div")].some((r) => r.textContent.includes("carlos@ifsul.edu.br")), null, { timeout: 8000 });
rows = await page.$$eval("#admin-professores-list > div", (r) => r.map((x) => x.textContent));
check("Criar professor: aparece na hora como \"aguardando 1º acesso\"", rows.some((r) => r.includes("carlos@ifsul.edu.br · aguardando 1º acesso")));
await page.fill("#admin-new-professor-nome", "Juliane Moura"); await page.fill("#admin-new-professor-email", "juliane@ifsul.edu.br");
await page.click("#btn-create-professor");
await page.waitForFunction(() => /Já existe uma conta/.test(document.getElementById("create-professor-status").textContent), null, { timeout: 15000 });
await page.waitForFunction(() => [...document.querySelectorAll("#admin-professores-list > div")].some((r) => r.textContent.includes("juliane@ifsul.edu.br")), null, { timeout: 8000 });
check("Conta já existente (caso Juliane): entra na lista sem duplicar a conta", (await page.textContent("#admin-professores-list")).includes("juliane@ifsul.edu.br · aguardando 1º acesso"));
check("Pendente não aparece como destino de transferência", !(await page.$$eval("#manage-transfer-select option", (o) => o.map((x) => x.textContent).join(" "))).includes("carlos@"));
await page.screenshot({ path: `${OUT}/l2-07-professores-pendentes.png` });
// Juliane entra pela primeira vez
const ctxJ = await newCtx(true);
const pJ = await open(ctxJ, APP + "#professor");
await login(pJ, "juliane@ifsul.edu.br");
await pJ.waitForSelector("#terms-modal-backdrop:not(.hidden)", { timeout: 10000 });
check("Juliane no 1º acesso ainda vê o aviso obrigatório (pendente não pula o aviso)", await pJ.isVisible("#terms-modal-backdrop"));
await pJ.$eval("#terms-modal-box", (b) => b.scrollTo(0, b.scrollHeight)); await pJ.waitForTimeout(300); await pJ.click("#btn-close-terms"); await pJ.waitForTimeout(1000);
await ctxJ.close();
await page.click("#btn-refresh-professores");
await page.waitForFunction(() => !/Carregando/.test(document.getElementById("admin-professores-status").textContent));
await page.waitForTimeout(600);
rows = await page.$$eval("#admin-professores-list > div", (r) => r.map((x) => x.textContent));
check("Depois do 1º acesso: Juliane vira professora registrada (sai de \"aguardando\")", rows.some((r) => r.includes("juliane@ifsul.edu.br") && r.includes("último acesso")) && !rows.some((r) => r.includes("juliane@ifsul.edu.br · aguardando")));
check("Pendente da Juliane apagado automaticamente", !(await read("professoresPendentes/juliane@ifsul.edu.br")));
const rowCarlos = page.locator("#admin-professores-list > div", { hasText: "carlos@ifsul.edu.br" });
await rowCarlos.getByRole("button", { name: "Remover" }).click();
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth");
await page.waitForFunction(() => /saiu da lista/.test(document.getElementById("admin-professores-status").textContent), null, { timeout: 8000 });
check("Remover pendente: sai da lista (com senha)", !(await read("professoresPendentes/carlos@ifsul.edu.br")));
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
