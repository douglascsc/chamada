// Auditoria de segurança — SOMENTE no emulador local (projeto demo-chamada), dados fictícios.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, query, where, Timestamp } from "firebase/firestore";
import { readFileSync } from "node:fs";
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const now = Date.now();
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ontem = new Date(now - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M", professorUid: "profA", professorEmail: "profa@ifsul.edu.br", professorNome: "Profa A", codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 60000), codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T1/alunos/a1"), { nome: "Aluno Um" });
  await setDoc(doc(f, "turmas/T1/presencas/old"), { nome: "Aluno Um", data: ontem, horario: "08:00", maquina: "device-xyz", expiraEm: Timestamp.fromMillis(now + 86400000) });
  await setDoc(doc(f, "turmas/LEGADA"), { nome: "Turma antiga sem dono" }); // turma criada antes do campo professorUid
  await setDoc(doc(f, "turmas/T2"), { nome: "INF3M", professorUid: "profA" }); // sem código ativo
  await setDoc(doc(f, "turmas/T2/alunos/b1"), { nome: "Aluno Dois" });
});
const res = async (label, p) => { try { const v = await p; console.log("PERMITIDO |", label, v === undefined ? "" : "→ " + JSON.stringify(v).slice(0, 200)); } catch (e) { console.log("negado    |", label, "(" + (e.code || e.message).toString().slice(0, 40) + ")"); } };
const anon = env.unauthenticatedContext().firestore();
console.log("=== Sem login ===");
await res("ler lista de turmas (com código do dia e e-mail do professor)", getDocs(collection(anon, "turmas")).then((s) => s.docs.map((d) => ({ id: d.id, codigoDoDia: d.data().codigoDoDia, professorEmail: d.data().professorEmail }))));
await res("ler nomes de alunos de turma com código ativo", getDocs(collection(anon, "turmas/T1/alunos")).then((s) => s.docs.map((d) => d.data().nome)));
await res("ler presenças de DIAS ANTERIORES (inclui id do aparelho)", getDocs(collection(anon, "turmas/T1/presencas")).then((s) => s.docs.map((d) => [d.data().data, d.data().maquina])));
await res("ler alunos de turma SEM código ativo", getDocs(collection(anon, "turmas/T2/alunos")).then((s) => s.size));
await res("marcar presença com o código lido da própria turma", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "08:01", maquina: "x", codigoUsado: "4821" }).then((r) => r.id));
await res("marcar presença de NOME INEXISTENTE", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Fulano Que Nao Existe", data: hoje, horario: "08:01", maquina: "x", codigoUsado: "4821" }).then(() => "ok"));
await res("marcar presença em DATA PASSADA (ontem)", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: ontem, horario: "08:01", maquina: "x", codigoUsado: "4821" }).then(() => "ok"));
await res("marcar presença com HORÁRIO FALSO (evita 'atrasado')", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "07:00", maquina: "y", codigoUsado: "4821" }).then(() => "ok"));
await res("mesmo 'aparelho' marcar vários alunos (maquina aleatória a cada vez)", Promise.all([1, 2, 3].map((i) => addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "08:02", maquina: "rand" + i, codigoUsado: "4821" }))).then(() => "3 presenças"));
await res("presença SEM expiraEm (nunca apagada pela retenção)", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "08:03", maquina: "z", codigoUsado: "4821" }).then(() => "ok"));
await res("presença com expiraEm em 2099", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "08:03", maquina: "z", codigoUsado: "4821", expiraEm: Timestamp.fromMillis(Date.parse("2099-01-01")) }).then(() => "ok"));
await res("presença com CAMPO EXTRA de 500 KB (enche o banco)", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "Aluno Um", data: hoje, horario: "08:03", maquina: "z", codigoUsado: "4821", lixo: "x".repeat(500000) }).then(() => "ok"));
await res("presença com nome contendo HTML", addDoc(collection(anon, "turmas/T1/presencas"), { nome: "<img src=x onerror=alert(1)>", data: hoje, horario: "08:03", maquina: "z", codigoUsado: "4821" }).then(() => "ok (gravado; exibição usa textContent)"));
await res("apagar presença", deleteDoc(doc(anon, "turmas/T1/presencas/old")));
await res("alterar turma (trocar código)", updateDoc(doc(anon, "turmas/T1"), { codigoDoDia: "0000" }));
await res("ler registro de professores (acordosProfessor)", getDocs(collection(anon, "acordosProfessor")).then((s) => s.size));
await res("ler atrasos (fotos)", getDocs(collection(anon, "turmas/T1/atrasos")).then((s) => s.size));

console.log("=== Conta qualquer (cadastro aberto) ===");
const rand = env.authenticatedContext("intruso", { email: "intruso@gmail.com" }).firestore();
await res("criar turma com nome/professor falsos (aparece para os alunos)", setDoc(doc(rand, "turmas/FAKE"), { nome: "INF2M 2026 - Banco de Dados", professorUid: "intruso", professorNome: "Douglas Camargo Carvalho", professorEmail: "douglascamargo@ifsul.edu.br" }).then(() => "ok"));
await res("TOMAR POSSE de turma antiga sem professorUid", updateDoc(doc(rand, "turmas/LEGADA"), { professorUid: "intruso" }).then(() => "virou dono"));
await res("ler alunos da turma de outro professor (sem código)", getDocs(collection(rand, "turmas/T2/alunos")).then((s) => s.size));
await res("ler presenças de outro professor (código ativo = liberado a todos)", getDocs(collection(rand, "turmas/T1/presencas")).then((s) => s.size));
await res("apagar presença de outro professor", deleteDoc(doc(rand, "turmas/T1/presencas/old")));
await res("alterar turma de outro professor", updateDoc(doc(rand, "turmas/T1"), { nome: "hack" }));
await res("escrever qualquer campo no próprio acordosProfessor", setDoc(doc(rand, "acordosProfessor/intruso"), { nome: "Prof Falso", email: "douglascamargo@ifsul.edu.br", qualquer: "x".repeat(1000) }).then(() => "ok"));
await res("ler professoresPendentes", getDocs(collection(rand, "professoresPendentes")).then((s) => s.size));

console.log("=== Dono da turma ===");
const profA = env.authenticatedContext("profA", { email: "profa@ifsul.edu.br" }).firestore();
await res("dono passa a turma para OUTRO uid (sem a master)", updateDoc(doc(profA, "turmas/T2"), { professorUid: "intruso" }).then(() => "transferida"));
await res("dono cria turma com campos extras arbitrários", setDoc(doc(profA, "turmas/X"), { nome: "X", professorUid: "profA", qualquer: { a: 1 } }).then(() => "ok"));

console.log("=== E-mail da master sem verificação ===");
const falsoMaster = env.authenticatedContext("outro-uid", { email: "douglascamargo@ifsul.edu.br", email_verified: false }).firestore();
await res("token com e-mail da master NÃO verificado lê professoresPendentes", getDocs(collection(falsoMaster, "professoresPendentes")).then((s) => "lido: " + s.size));
await env.cleanup();
