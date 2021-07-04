import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike } from 'fs';
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
import { ListEntry } from '../entities/ListEntry';
import { ScanVideoPage } from '../consts/events';
import { DownloadLink, VideoDetailsEntry } from '../entities/VideoDetails';
import filenamify from 'filenamify';
import { getEntryByUrl, setEntry } from '../db';

export async function readJsonFile<T>(filePath: PathLike): Promise<T> {
    if (!existsSync(filePath)) {
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

                    if (loopCounter > 3) {
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