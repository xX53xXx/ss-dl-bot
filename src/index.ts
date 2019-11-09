import { app, BrowserWindow, ipcMain, Event } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as filenamify from 'filenamify';

import settings from './settings';
import database from './entities/database';
import * as Page from './pages';
import { VideoMeta } from 'entities/VideoEntry';

const URL = 'https://www.sperma-studio.com';

database.load();

app.on('ready', () => {
    const win = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'injection.js')
        }
    });

    win.loadURL(URL + Page.LOGIN_PAGE);

    win.setMenu(null);

    win.webContents.openDevTools();

    // STATE

    const state = {
        
    } as {
        pagesAmount?: number;
        currentPage?: number;
        currentVideoURLs?: string[];
        currentVideoUrlIndex?: number;
    };

    // PATH METHODS

    const scanNextVideosPage = (noDecrementPage: boolean = false) => {
        if (!!!state.currentPage || state.currentPage <= 1) return; // TODO: Done.

        if (!noDecrementPage) state.currentPage -= 1;
        
        win.loadURL(URL + Page.getVideosPagePathname(state.currentPage));
    };

    const scanNextVideoPage = (noIncrementIndex: boolean = false) => {
        if (!Array.isArray(state.currentVideoURLs) || state.currentVideoURLs.length <= 0) return;
        if (state.currentVideoUrlIndex === undefined || state.currentVideoUrlIndex < 0) {
            state.currentVideoUrlIndex = 0;
        }

        if (!noIncrementIndex) state.currentVideoUrlIndex += 1;

        if (state.currentVideoUrlIndex >= state.currentVideoURLs.length) {
            scanNextVideosPage();
        }

        win.loadURL(state.currentVideoURLs[state.currentVideoUrlIndex]);
    };

    // PAGE STATE HANDLING
    
    ipcMain.on('pageLoaded', (e: any, location: Location, se: any) => {
        if (location.pathname === Page.LOGIN_PAGE) { // ON LOGIN PAGE
            win.webContents.send('authenticate', settings);

        } else if(location.pathname === Page.SELECT_YOUR_PAGE || location.pathname === Page.WELCOME_PAGE) { // ON "AFTER LOGIN / WELCOME" PAGE
            win.loadURL(URL + Page.ALL_VIDEOS);

        } else if(location.pathname === Page.ALL_VIDEOS) { // ON ALL VIDEOS PAGE
            requestVideoPagesAmount(win).then((pagesAmount: number) => {
                state.pagesAmount = pagesAmount;
                state.currentPage = pagesAmount;

                scanNextVideosPage(true);
            }).catch((errorMessage: string) => {
                console.error(errorMessage);
                app.exit(1);
            });

        } else if(Page.getVideosPageByPathname(location.pathname)) { // ON SPECIFIC VIDEOS PAGE
            requestCurrentVideosPageScan(win, state.currentPage!).then((videoURLs: string[]) => {
                if (videoURLs.length > 0) {
                    state.currentVideoURLs = videoURLs;
                    state.currentVideoUrlIndex = 0;

                    scanNextVideoPage(true);
                } else {
                    scanNextVideosPage();
                }
            }).catch((errorMessage: string) => {
                console.error(errorMessage);
                scanNextVideosPage();
            });

        } else if (state.currentVideoUrlIndex !== undefined) { // ON SPECIFIC VIDEO PAGE
            requestCurrentVideoPageScan(win).then((scan: VideoMeta) => {
                console.log('Video page scan: ', scan);
                scanNextVideoPage();
            }).catch((errorMessage: string) => {
                console.error(errorMessage);
                scanNextVideoPage();
            });

        } else { // ON UNKNOWN PAGE
            console.log('Unknown location: ', location);
        }
    });
});

function requestVideoPagesAmount(win: BrowserWindow): Promise<number> {
    return new Promise((resolve: Function, reject: Function) => {
        ipcMain.once('receiveVideoPagesAmount', (e: any, pagesAmount: number) => {
            resolve(pagesAmount);
        });

        ipcMain.once('errorGettingVideoPagesAmount', (e: any, errorMessage: string) => {
            reject(errorMessage);
        });

        win.webContents.send('sendVideoPagesAmount');
    });
}

function requestCurrentVideosPageScan(win: BrowserWindow, currentPage: number): Promise<string[]> {
    return new Promise((resolve: Function, reject: Function) => {
        ipcMain.once('receiveCurrentVideosPageScan', (e: any, videoURLs: string[]) => {
            resolve(videoURLs);
        });

        ipcMain.once('errorGettingCurrentVideosPageScan', (e: any, errorMessage: string) => {
            reject(errorMessage);
        });

        win.webContents.send('sendCurrentVideosPageScan', currentPage);
    });
}

function requestCurrentVideoPageScan(win: BrowserWindow): Promise<VideoMeta> {
    return new Promise((resolve: Function, reject: Function) => {
        ipcMain.once('receiveCurrentVideoPageScan', (e: any, scan: VideoMeta) => {
            resolve(scan);
        });

        ipcMain.once('errorGettingCurrentVideoPageScan', (e: any, errorMessage: string) => {
            reject(errorMessage);
        });

        win.webContents.send('sendCurrentVideoPageScan');
    });
}