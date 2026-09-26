import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, writeBatch, serverTimestamp, Timestamp, Bytes, query, where, orderBy } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-chamada",
  firestore: { rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", "master") /* conta master do teste */, host: "127.0.0.1", port: 8080 },
});
await env.clearFirestore();
const bytes = (n) => Bytes.fromUint8Array(new Uint8Array(n).fill(7));
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "turmas/tA"), { nome: "INF2M 2026 - BD", professorUid: "profA" });
  await setDoc(doc(db, "acordosProfessor/profA"), { email: "a@x.br", nome: "Prof A" });
  await setDoc(doc(db, "acordosProfessor/profB"), { email: "b@x.br", nome: "Prof B" });
  await setDoc(doc(db, "turmas/tB"), { nome: "INF3M 2026 - Redes", professorUid: "profB" });
  await setDoc(doc(db, "turmas/tA/atrasos/x1"), { criadoEm: Timestamp.now(), thumb: bytes(10) });
  await setDoc(doc(db, "turmas/tA/atrasosImg/x1"), { img: bytes(100) });
  await setDoc(doc(db, "turmas/tA/alunos/a1"), { nome: "Aluno 1" });
  await setDoc(doc(db, "turmas/tA/presencas/p0"), { nome: "Aluno 1", data: "2026-09-25", horario: "08:00", maquina: "m0", expiraEm: Timestamp.fromMillis(Date.now() + 7 * 86400000) });
  // código ativo na turma A
  // (o código fica em turmas/tA/salas/1234, não na turma)
  const definidoEm = Timestamp.now();
  await updateDoc(doc(db, "turmas/tA"), { codigoDefinidoEm: definidoEm, codigoDuracaoMin: 60 });
  await setDoc(doc(db, "turmas/tA/salas/1234"), { nomes: ["Aluno 1"], definidoEm });
});

const A = env.authenticatedContext("profA", { email: "a@x.br" }).firestore();
const B = env.authenticatedContext("profB", { email: "b@x.br" }).firestore();
const M = env.authenticatedContext("master", { email: "douglascamargo@ifsul.edu.br" }).firestore();
const U = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
async function t(name, p) {
  try { await p; pass++; console.log("✅", name); }
  catch (e) { fail++; console.log("❌", name, "-", e.message); }
}
function batchAtraso(db, turma, id, { criadoEm = serverTimestamp(), thumb = bytes(1000), img = bytes(200 * 1024), extra = null, skipMeta = false } = {}) {
  const b = writeBatch(db);
  if (!skipMeta) b.set(doc(db, `turmas/${turma}/atrasos/${id}`), { criadoEm, thumb, ...(extra || {}) });
  b.set(doc(db, `turmas/${turma}/atrasosImg/${id}`), { img });
  return b.commit();
}

// --- Autenticação
await t("não autenticado NÃO lê atrasos", assertFails(getDocs(collection(U, "turmas/tA/atrasos"))));
await t("não autenticado NÃO lê atrasosImg", assertFails(getDoc(doc(U, "turmas/tA/atrasosImg/x1"))));
await t("não autenticado NÃO cria atraso", assertFails(batchAtraso(U, "tA", "u1")));
await t("não autenticado NÃO lê atrasos mesmo com código do dia ativo", assertFails(getDoc(doc(U, "turmas/tA/atrasos/x1"))));

// --- Dono da turma
await t("prof A lista atrasos da turma A", assertSucceeds(getDocs(query(collection(A, "turmas/tA/atrasos"), where("criadoEm", ">", Timestamp.fromMillis(0)), orderBy("criadoEm", "desc")))));
await t("prof A lê foto da turma A", assertSucceeds(getDoc(doc(A, "turmas/tA/atrasosImg/x1"))));
await t("prof A cria atraso (batch) na turma A", assertSucceeds(batchAtraso(A, "tA", "n1")));
await t("prof A apaga atraso da turma A", assertSucceeds((async () => { const b = writeBatch(A); b.delete(doc(A, "turmas/tA/atrasos/n1")); b.delete(doc(A, "turmas/tA/atrasosImg/n1")); await b.commit(); })()));

// --- Isolamento
await t("prof B NÃO lista atrasos da turma A", assertFails(getDocs(collection(B, "turmas/tA/atrasos"))));
await t("prof B NÃO lê a foto da turma A (acesso direto por ID)", assertFails(getDoc(doc(B, "turmas/tA/atrasosImg/x1"))));
await t("prof B NÃO cria atraso na turma A (turmaId trocado)", assertFails(batchAtraso(B, "tA", "b1")));
await t("prof B NÃO apaga atraso da turma A", assertFails(deleteDoc(doc(B, "turmas/tA/atrasos/x1"))));
await t("prof B NÃO apaga foto da turma A", assertFails(deleteDoc(doc(B, "turmas/tA/atrasosImg/x1"))));
await t("prof A NÃO lê atrasos da turma B", assertFails(getDocs(collection(A, "turmas/tB/atrasos"))));
await t("prof A NÃO cria em turma inexistente", assertFails(batchAtraso(A, "naoexiste", "z1")));

// --- Master
await t("master lê atrasos da turma A", assertSucceeds(getDocs(collection(M, "turmas/tA/atrasos"))));
await t("master lê foto da turma A", assertSucceeds(getDoc(doc(M, "turmas/tA/atrasosImg/x1"))));

// --- Validação de dados
await t("data do cliente (antedatada) é recusada", assertFails(batchAtraso(A, "tA", "d1", { criadoEm: Timestamp.fromMillis(Date.now() - 86400000) })));
await t("campo extra (ex: nome do aluno) é recusado", assertFails(batchAtraso(A, "tA", "d2", { extra: { aluno: "Fulano" } })));
await t("miniatura > 64 KB é recusada", assertFails(batchAtraso(A, "tA", "d3", { thumb: bytes(65 * 1024) })));
await t("foto > 900 KB é recusada", assertFails(batchAtraso(A, "tA", "d4", { img: bytes(901 * 1024) })));
await t("foto como texto (não bytes) é recusada", assertFails(batchAtraso(A, "tA", "d5", { img: "abc" })));
await t("foto sem o documento de lista (órfã) é recusada", assertFails(batchAtraso(A, "tA", "d6", { skipMeta: true })));
await t("editar atraso existente é recusado", assertFails(updateDoc(doc(A, "turmas/tA/atrasos/x1"), { thumb: bytes(5) })));
await t("editar foto existente é recusado", assertFails(updateDoc(doc(A, "turmas/tA/atrasosImg/x1"), { img: bytes(5) })));

// --- Regressão das regras existentes
await t("[regressão] qualquer um lê turmas", assertSucceeds(getDoc(doc(U, "turmas/tA"))));
await t("[código secreto] aluno com o código lê a lista de nomes (sala)", assertSucceeds(getDoc(doc(U, "turmas/tA/salas/1234"))));
await t("[código secreto] aluno NÃO lê a coleção de alunos (nem com código ativo)", assertFails(getDocs(collection(U, "turmas/tA/alunos"))));
await t("[regressão] aluno com código correto cria presença", assertSucceeds(setDoc(doc(U, "turmas/tA/presencas/2026-09-25_m1"), { nome: "Aluno 1", data: "2026-09-25", horario: "08:10", maquina: "m1", codigoUsado: "1234", expiraEm: Timestamp.fromMillis(Date.now() + 7 * 86400000) })));
await t("[regressão] código errado NÃO cria presença", assertFails(setDoc(doc(U, "turmas/tA/presencas/2026-09-25_m2"), { nome: "Aluno 1", data: "2026-09-25", horario: "08:10", maquina: "m2", codigoUsado: "9999", expiraEm: Timestamp.fromMillis(Date.now() + 7 * 86400000) })));
await t("[regressão] sem código NÃO lê alunos da turma B", assertFails(getDocs(collection(U, "turmas/tB/alunos"))));
await t("[regressão] prof B NÃO edita turma A", assertFails(updateDoc(doc(B, "turmas/tA"), { nome: "hack" })));
await t("[regressão] prof A gera código na turma A (turma + sala, juntos)", assertSucceeds((async () => { const b = writeBatch(A); b.update(doc(A, "turmas/tA"), { codigoDefinidoEm: serverTimestamp(), codigoDuracaoMin: 60 }); b.delete(doc(A, "turmas/tA/salas/1234")); b.set(doc(A, "turmas/tA/salas/5555"), { nomes: ["Aluno 1"], definidoEm: serverTimestamp() }); await b.commit(); })()));
await t("[código secreto] prof A NÃO grava o código na turma (pública)", assertFails(updateDoc(doc(A, "turmas/tA"), { codigoDoDia: "7777" })));
await t("[regressão] prof A apaga presença da turma A", assertSucceeds(deleteDoc(doc(A, "turmas/tA/presencas/p0"))));

// --- Registro de professores (acordosProfessor)
await t("[professores] prof A atualiza o próprio registro (nome)", assertSucceeds(updateDoc(doc(A, "acordosProfessor/profA"), { nome: "Prof A2" })));
await t("[professores] prof A NÃO lê o registro do prof B", assertFails(getDoc(doc(A, "acordosProfessor/profB"))));
await t("[professores] prof A NÃO lista os registros", assertFails(getDocs(collection(A, "acordosProfessor"))));
await t("[professores] prof A NÃO apaga o registro do prof B", assertFails(deleteDoc(doc(A, "acordosProfessor/profB"))));
await t("[professores] prof A NÃO altera o registro do prof B", assertFails(updateDoc(doc(A, "acordosProfessor/profB"), { nome: "hack" })));
await t("[professores] master lista todos os registros", assertSucceeds(getDocs(collection(M, "acordosProfessor"))));
await t("[professores] master NÃO altera o registro de outro", assertFails(updateDoc(doc(M, "acordosProfessor/profB"), { nome: "x" })));
await t("[professores] master apaga o registro de outro (remover professor)", assertSucceeds(deleteDoc(doc(M, "acordosProfessor/profB"))));
await t("[professores] não autenticado NÃO lê registros", assertFails(getDocs(collection(U, "acordosProfessor"))));
await t("[transferência] master transfere turma (troca professorUid/Nome)", assertSucceeds(updateDoc(doc(M, "turmas/tB"), { professorUid: "profA", professorNome: "Prof A" })));
await t("[transferência] prof B (ex-dono) NÃO retoma a turma", assertFails(updateDoc(doc(B, "turmas/tB"), { professorUid: "profB" })));
await t("[transferência] novo dono (prof A) edita a turma recebida", assertSucceeds(updateDoc(doc(A, "turmas/tB"), { professorNome: "Prof A" })));

// --- Professores pendentes (só master)
await t("[pendentes] master cria pendente", assertSucceeds(setDoc(doc(M, "professoresPendentes/juliane@ifsul.edu.br"), { nome: "Juliane", email: "juliane@ifsul.edu.br" })));
await t("[pendentes] master lista pendentes", assertSucceeds(getDocs(collection(M, "professoresPendentes"))));
await t("[pendentes] prof A NÃO lista pendentes", assertFails(getDocs(collection(A, "professoresPendentes"))));
await t("[pendentes] prof A NÃO cria pendente", assertFails(setDoc(doc(A, "professoresPendentes/x@x.br"), { nome: "x" })));
await t("[pendentes] não autenticado NÃO lê", assertFails(getDoc(doc(U, "professoresPendentes/juliane@ifsul.edu.br"))));
await t("[pendentes] master apaga pendente", assertSucceeds(deleteDoc(doc(M, "professoresPendentes/juliane@ifsul.edu.br"))));
await t("[último acesso] prof A atualiza o próprio ultimoAcesso", assertSucceeds(updateDoc(doc(A, "acordosProfessor/profA"), { ultimoAcesso: serverTimestamp() })));
await t("[encerrar código] prof B NÃO encerra código da turma A", assertFails(updateDoc(doc(B, "turmas/tA"), { codigoDefinidoEm: null })));
await t("[encerrar código] dono encerra o código (turma + apaga sala)", assertSucceeds((async () => { const b = writeBatch(A); b.update(doc(A, "turmas/tA"), { codigoDefinidoEm: null }); b.delete(doc(A, "turmas/tA/salas/5555")); await b.commit(); })()));
await t("[encerrar código] encerrado, aluno NÃO marca presença com o código antigo", assertFails(setDoc(doc(U, "turmas/tA/presencas/2026-09-25_m9"), { nome: "Aluno 1", data: "2026-09-25", horario: "09:00", maquina: "m9", codigoUsado: "5555", expiraEm: Timestamp.fromMillis(Date.now() + 7 * 86400000) })));
await t("[encerrar código] encerrado, aluno NÃO lê a lista", assertFails(getDoc(doc(U, "turmas/tA/salas/5555"))));

// --- Arquivar turma
await t("[arquivar] dono arquiva a turma (arquivada: true)", assertSucceeds(updateDoc(doc(A, "turmas/tA"), { arquivada: true })));
await t("[arquivar] dono reativa (arquivada: false)", assertSucceeds(updateDoc(doc(A, "turmas/tA"), { arquivada: false })));
await t("[arquivar] valor que não é booleano é recusado", assertFails(updateDoc(doc(A, "turmas/tA"), { arquivada: "sim" })));
await t("[arquivar] prof B NÃO arquiva turma do A", assertFails(updateDoc(doc(B, "turmas/tA"), { arquivada: true })));
await t("[arquivar] master arquiva qualquer turma", assertSucceeds(updateDoc(doc(M, "turmas/tA"), { arquivada: true })));

console.log(`\n${pass} passaram, ${fail} falharam`);
await env.cleanup();
process.exit(fail ? 1 : 0);
