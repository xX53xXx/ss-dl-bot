import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike, openSync, writeSync, closeSync } from 'fs';
import ping from 'ping';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../consts';
import { Params } from '../consts/pages';
import {
    Navigate,
    NavigationResponse,

    EventParams,
    EventResponseParams,
    ScanPage,
} from '../consts/events';
import config, { Settings } from '../entities/Settings';
import * as Page from '../consts/pages';
import * as path from 'path';
import axios from 'axios';

export async function readJsonFile<T>(filePath: PathLike, defaultFallback?: T): Promise<T> {
    if (!existsSync(filePath)) {
        if (defaultFallback !== undefined) {
            return defaultFallback;
        }

        throw new Error(`JSON file "${filePath}" not found.`);
    }

    const data: string = readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
}

export async function writeJsonFile<T = any>(filePath: PathLike, data: T, format?: boolean): Promise<void> {
    writeFileSync(filePath, JSON.stringify(data, null, format ? 2 : undefined), 'utf-8');
}

let browserWindow: BrowserWindow|null = null;
export function $regWindow(window: BrowserWindow) {
    browserWindow = window;
}

export function useWindow(): BrowserWindow {
    if (browserWindow === null) {
        throw new Error('No browser window registrated. Use "$regWindow" to registrate an initialized browser window.');
    }

    return browserWindow;
}

export async function useSettings(): Promise<Settings> {
    return config;
}

// ---

export function regEvent<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.on(eventName, (e, p) => callback(p, e));
}

export function regEventOnce<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.once(eventName, (e, p) => callback(p, e));
}

export function sendEvent<EventName extends keyof EventParams>(eventName: EventName, params?: EventParams[EventName]) {
    useWindow().webContents.send(eventName, params);
}

export async function callEvent<EventName extends keyof EventParams>(eventName: EventName, params?: EventParams[EventName]): Promise<EventResponseParams[EventName]> {
    return await new Promise<EventResponseParams[EventName]>((resolve, reject) => {
        try {
            regEventOnce(eventName, rsp => {
                resolve(rsp);
            });

            sendEvent(eventName);
         } catch (error) {
            reject(error);
        }
    });
}

// ---

export async function navigate<PageName extends keyof Params>(page: PageName | string, args?: Params[PageName]): Promise<NavigationResponse> {

    const mts = /:(\w+)/ig.exec(page);
    let url = ((page.indexOf(URL) >= 0 ? '' : URL + '/') + page).replace(/\/+/g, '/'); // Remove double slashes

    if (mts) {
        for (let i = 1; i < mts.length; i++) {
            if ((args as any)[mts[i]]) {
                url = url.replace(new RegExp(`:${mts[i]}`, 'ig'), (args as any)[mts[i]]);
                delete (args as any)[mts[i]];
            }
        }
    }

    url += (args ? '?' + toQueryArgs(args) : '');

    return new Promise((resolve) => {
        regEventOnce(Navigate, rsp => {
            resolve(rsp);
        });

        useWindow().loadURL(url);
    });
}

let _onPanicCleanups: Function[] = [];
export function onPanicCleanup() {
    for (let fnc of _onPanicCleanups) {
        fnc();
    }
}

export function $regOnPanicCleanup(fnc: Function) {
    if (_onPanicCleanups.indexOf(fnc) < 0) {
        _onPanicCleanups.push(fnc);
    }
}

export function $unregOnPanicCleanup(fnc: Function) {
    _onPanicCleanups = _onPanicCleanups.filter(_fnc => _fnc !== fnc);
}

export async function waitForInternet(): Promise<boolean> {
    let hadInternetError: boolean = false;

    while (!await hasInternet()) {
        hadInternetError = true;
        process.stdout.write('No internet, waiting ...                                                                                                      \r');
        await new Promise((r, _) => setTimeout(r, 2048));
    }

    return hadInternetError;
}

export async function hasInternet(testHost: string = 'sperma-studio.com'): Promise<boolean> {
    return new Promise<boolean>((resolve, _) => {
        ping.sys.probe(testHost, isAlive => {
            resolve(isAlive);
        });
    });
}

export function getFileName(filePath: string): string {
    return filePath.replace(/^.*[\\\/]/g, '');
}

// ---

export async function scanPage(page: number) {
    await navigate(Page.VideosList, { page });
    return await callEvent(ScanPage);
}

interface DownloadFileOptions {
    filename: string;
    directory: string;
}

export const downloadFile = async (url: string, {filename, directory}: DownloadFileOptions) => {
    const win = useWindow();

    const rsp = await (new Promise((resolve, reject) => {
        win.webContents.session.once('will-download', (event, item, webContents) => {
            const filePath = path.join(directory, filename);
            item.setSavePath(filePath);

            let lastProgressPercent = 0.0;
            let loopCounter = 0;

            const totalBytes = item.getTotalBytes();

            item.on('updated', (e, state) => {
                const receivedBytes = item.getReceivedBytes();
                const percentage = receivedBytes / (totalBytes || 1);

                if (state === 'progressing') {
                    if (percentage - lastProgressPercent < -0.15) {
                        loopCounter++;
                        lastProgressPercent = percentage;
                    } else {
                        lastProgressPercent = percentage;
                        process.stdout.write(`Downloading ${loopCounter > 0 ? '#' + loopCounter + ' ' : ''}"${filename}": ${Math.round(percentage * 100)} %, ${receivedBytes} / ${totalBytes}                                                                                                      \r`);
                    }

                    if (loopCounter > 1) {
                        item.pause();
                        item.cancel();
                    }
                } else if (state === 'interrupted') {
                    if (item.canResume()) {
                        item.resume();
                    }
                }
            });

            item.once('done', (e, state) => {
                if (state === 'completed') {
                    resolve(undefined);
                } else {
                    reject(state);
                }
            });
        });

        win.webContents.downloadURL(url);
    }));

    win.webContents.session.removeAllListeners('will-download');

    return rsp;
};

type Pos = { x: number; y: number; };

export const makeClick = async (position: 'center' | Pos = 'center', button: 'left' | 'middle' | 'right' = 'left') => {
    const win = useWindow();

    let maximize = false;
    if (win.isMaximized()) {
        win.unmaximize();
        maximize = true;
    }

    const winSize = win.getSize();

    const xy: Pos = position === 'center' ? {
        x: winSize[0] * 0.5,
        y: winSize[1] * 0.5,
    } : position as Pos;

    win.webContents.sendInputEvent({
        type: 'mouseDown',
        ...xy,
        button
    });

    await new Promise((r) => setTimeout(r, 16));

    win.webContents.sendInputEvent({
        type: 'mouseUp',
        ...xy,
        button
    });

    if (maximize) {
        win.maximize();
    }
}

const getManifestBaseUrl = (streamManifestUrl: string) => streamManifestUrl.substr(0, streamManifestUrl.lastIndexOf('/'));

const getBestStreamManifest = async (streamManifestUrl: string) => {
    const manifest = (await axios.get(streamManifestUrl)).data.split(`\n`);
    
    let best_m3u = '';
    let best_height = 0;

    let use_next_m3u = false;

    for (const line of manifest) {
        const mt = /,RESOLUTION=(\d+)x(\d+)/g.exec(line);
        
        if (mt) {
            const h = parseInt(mt[2], 10);

            if (h > best_height) {
                best_height = h;
                use_next_m3u = true;
            }
        } else if (use_next_m3u) {
            best_m3u = line;
            use_next_m3u = false;
        }
    }

    if (!best_m3u) {
        for (const line of manifest.reverse()) {
            const ln = line.trim();

            if (ln.length > 0 && !ln.startsWith('#')) {
                return ln;
            }
        }
    }

    if (!best_m3u) {
        throw new Error('No best m3u8 file name found in manifest: ' + `\n` + manifest.join(`\n`));
    }

    return best_m3u.trim();
};

export const downloadStream = async (streamManifestUrl: string, filePath: string) => {
    const baseUrl = getManifestBaseUrl(streamManifestUrl);
    const bestManifest = await getBestStreamManifest(streamManifestUrl);
    const streamParts = (await axios.get(baseUrl + '/' + bestManifest)).data.split(`\n`).filter((ln: string) => !ln.startsWith('#')).map((ln: string) => baseUrl + '/' + ln);

    while (!streamParts[streamParts.length - 1].endsWith('.ts')) {
        streamParts.pop();
    }

    const fh = openSync(filePath, 'ax');

    const partsCount = streamParts.length;
    let downloadedParts = 0;
    let writtenParts = 0;

    do {
        const data = (await Promise.all(streamParts.splice(0, 64).map((partUrl: string) => new Promise(async (resolve) => {
            await waitForInternet();
            const data = await axios.get(partUrl, { responseType: 'arraybuffer' });
            downloadedParts++;
            process.stdout.write(`Downloading stream: ${Math.round(downloadedParts / partsCount * 100)} % ${downloadedParts} / ${partsCount}                                                                                                     \r`);
            resolve(data.data);
        })))) as Buffer[];

        for (const entry of data) {
            writtenParts++;
            process.stdout.write(`Writing stream: ${Math.round(writtenParts / downloadedParts * 100)} % ${writtenParts} / ${downloadedParts}                                                                                                     \r`);
            writeSync(fh, new Uint8Array(entry));
        }
    } while (streamParts.length > 0);

    closeSync(fh);

    process.stdout.write(`Download stream done "${filePath}"                                                                                                                                                   \r\n`);
};