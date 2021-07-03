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

    try {
        const rsp = await Promise.all([
            new Promise<NavigationResponse>((resolve, _) => {
                regEventOnce(Navigate, rsp => {
                    resolve(rsp);
                });
            }),
            useWindow().loadURL(url)
        ]);

        return rsp[0];
    } catch (error) {
        throw error;
    }
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

export async function downloadVideo(entry: ListEntry) {
    const dbEntry = await getEntryByUrl(entry.url);

    const redownloadDone = (process.argv.indexOf('--redownload-done') > 0);
    const ignoreBroken = (process.argv.indexOf('--ignore-broken') > 0);

    if (dbEntry?.status === 'DONE' && !redownloadDone) {
        console.log(`Skipped "${dbEntry.filename}"`);
        return;
    } else if (dbEntry?.status === 'ERROR' && ignoreBroken) {
        console.log(`Skipped broken "${dbEntry.filename}"`);
        return;
    }

    const settings = await useSettings();
    await navigate(entry.url);
    const videoDetailsData = await callEvent(ScanVideoPage);

    if (!videoDetailsData) {
        console.warn('No video data for: ', entry.name);
        return;
    }

    if (videoDetailsData === 'moved') {
        console.warn('Video has been moved: ', entry.name);
        return;
    }

    const bestUrl = ((urls) => {
        let _bestUrl: DownloadLink | undefined = undefined;
        let sz: number = 0;

        let idx = 0;
        for (const url of urls) {
            let size = /(\d+)x(\d+)/i.exec(url.name);

            if (!size) {
                size = /(\d+)\.mp4$/i.exec(url.name);

                if (!size) {
                    console.warn('Unable to calculte size for ', url.name, url.link);
                    if (idx <= 0) {
                        _bestUrl = undefined;
                        break;
                    }
                } else {
                    size = [size[0], '0', size[1]] as RegExpExecArray;
                }
            }

            if (size) {
                // const w = parseInt(size[1], 10);
                const h = parseInt(size[2], 10);

                const _sz = h;

                if (sz < _sz) {
                    _bestUrl = url;
                    sz = _sz;
                }
            }

            idx++;
        }

        return _bestUrl;
    })(videoDetailsData.downloadLinks.reverse());

    if (!bestUrl) {
        console.warn('No best url for video: ', videoDetailsData);
        return;
    }

    let fileName = filenamify((videoDetailsData.tags.map((tag) => tag.replace(/ /g, '-')).join(' ') + ' ' + videoDetailsData.title || '').replace(/&amp;/g, '&').trim());
    let nr = 0;

    while ((!fileName.length && !nr) || existsSync(path.join(settings.downloadLocation, fileName + (nr > 0 ? ' #' + nr : '') + '.mp4'))) {
        nr++;
    }

    fileName = (fileName + (nr > 0 ? ' #' + nr : '') + '.mp4').trim();

    const vidEntry: VideoDetailsEntry = {
        ...dbEntry,
        ...videoDetailsData,
        listEntryData: entry,
        filename: fileName,
        lastStatusUpdate: new Date(),
        status: 'TODO',
    };

    await setEntry(vidEntry);

    await waitForInternet();

    try { 
        await downloadFile(bestUrl.link, {
            directory: settings.downloadLocation,
            filename: fileName,
        });

        vidEntry.status = 'DONE';
        process.stdout.write(`Done downloading "${vidEntry.filename}"                                                                                                      \r\n`);
    } catch (ex) {
        vidEntry.status = 'ERROR';
        console.error(`Download error for file "${fileName}": `, vidEntry.title || vidEntry.filename, bestUrl.name, bestUrl.link);
    } finally {
        vidEntry.lastStatusUpdate = new Date();
        await setEntry(vidEntry);
    }
}

interface DownloadFileOptions {
    filename: string;
    directory: string;
}

export const downloadFile = async (url: string, {filename, directory}: DownloadFileOptions) => {
    const win = useWindow();

    const rsp = await new Promise((resolve, reject) => {
        win.webContents.session.once('will-download', (event, item, webContents) => {
            const filePath = path.join(directory, filename);
            item.setSavePath(filePath);

            let lastProgressPercent = 0.0;
            let loopCounter = 0;
            let cancelledOnPurpose = false;

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
                if (state === 'completed' || cancelledOnPurpose) {
                    resolve(undefined);
                } else {
                    reject(state);
                }
            });
        });

        win.webContents.downloadURL(url);
    });

    win.webContents.session.removeAllListeners('will-download');

    return rsp;
};