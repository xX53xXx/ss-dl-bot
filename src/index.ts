import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as Page from './consts/pages';
import { $regWindow, navigate, onPanicCleanup, regEvent } from './utils';
import { PageStructureError, PageStructureWarning } from './consts/events';
import { main } from './main';
import { session } from './session';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.on('ready', async () => {
    const win = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, '$injection/index.js')
        }
    });

    win.setMenu(null);

    if (process.argv.indexOf('--dev-tools') > 0) {
        win.webContents.openDevTools();
    }

    if (!(process.argv.indexOf('--unmute') > 0)) {
        win.webContents.setAudioMuted(true);
    }

    win.on('close', () => {
        process.exit();
    });

    win.on('close', onPanicCleanup);
    process.on('beforeExit', onPanicCleanup);
    process.on('exit', onPanicCleanup);
    // process.on('SIGKILL', onPanicCleanup);
    process.on('SIGTERM', onPanicCleanup);

    $regWindow(win);

    session.addEventListener('login', async () => {
        try {
            await main(win);
        } catch (err) {
            console.error('Error: ', err);
            // onPanicCleanup();
            process.exit(-2);
        }
    });

    session.addEventListener('logout', () => {
        navigate(Page.Login);
    });

    await navigate(Page.Login);
});

regEvent(PageStructureError, message => {
    console.error(`PageStructureError: ${message}. Code update required!`);
    process.exit(-1);
});

regEvent(PageStructureWarning, message => {
    console.warn(`PageStructureWarning: ${message}. Code update required!`);
});