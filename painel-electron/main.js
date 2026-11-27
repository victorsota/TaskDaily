import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = path.dirname(fileURLToPath(import.meta.url));

function criarJanela() {
  const janela = new BrowserWindow({
    width: 420,
    height: 640,
    title: 'TaskDaily',
    backgroundColor: '#1e1e24',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  janela.loadFile(path.join(pasta, 'renderer', 'index.html'));
}

app.whenReady().then(criarJanela);
app.on('window-all-closed', () => app.quit());
