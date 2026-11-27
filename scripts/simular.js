// Simulador do bot pelo terminal, sem WhatsApp. A conversa real chega na Etapa 3.
import 'dotenv/config';
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'você> ' });
console.log('Simulador TaskDaily — digite "sair" para encerrar.');
rl.prompt();
for await (const linha of rl) {
  const texto = linha.trim();
  if (texto === 'sair') break;
  if (texto) console.log('bot> (ainda sem interpretação — Etapa 3)');
  rl.prompt();
}
rl.close();
