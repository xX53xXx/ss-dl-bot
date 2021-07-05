import { BrowserWindow } from 'electron/main';
import { mkdirSync, existsSync } from 'fs';
import { scanPage, useSettings, writeJsonFile, readJsonFile, navigate, callEvent, waitForInternet, downloadFile, downloadStream } from './utils';
import { ListEntry } from './entities/ListEntry';
import { rootDir } from './entities/Settings';
import { useDatabase } from './db';
import path from 'path';
import { ScanVideoPage } from './consts/events';
import { DownloadLink, VideoDetailsEntry, VideoDetails } from './entities/VideoDetails';
import filenamify from 'filenamify';
import { getEntryByUrl, setEntry } from './db';
import { session } from './session';
import { URL } from './consts';
import { sync as commandExists } from 'command-exists';
import { spawnSync } from 'child_process';
import { unlinkSync } from 'original-fs';

let forceStreamDownloads: ReadonlyArray<string> = [];

type CachedVideosList<TTS = string> = {
    ts: TTS;
    data: Array<ListEntry>;
};

export async function main(win: BrowserWindow) {
    const settings = await useSettings();

    console.warn('IMPORTANT: The *.TS files are in a bad codec. Use a converter like ffmpeg to convert them into a better codec.');
    console.log('');

    mkdirSync(settings.downloadLocation, { recursive: true });

    forceStreamDownloads = (await readJsonFile<typeof forceStreamDownloads>(path.join(rootDir, 'forceStreamDownloads.json'))).map((uri) => URL + uri);

    let lastPage = 1;
    const cachedEntries = await readJsonFile<CachedVideosList>(path.join(rootDir, 'cachedEntriesList.json'), {ts: '2000-01-01', data: []});
    const entries: Array<ListEntry> = (new Date().getTime() - new Date(cachedEntries.ts).getTime()) > (1000 * 60 * 60 * 12) /* 12h */ ? [] : cachedEntries.data;

    if (entries.length <= 0) {
        do {
            const pageEntries = await scanPage(lastPage);

            if (pageEntries) {
                lastPage++;
                entries.push(...pageEntries);
            } else {
                lastPage--;
                break;
            }
        } while (true);

        entries.reverse();
        
        await writeJsonFile(path.join(rootDir, 'cachedEntriesList.json'), {
            ts: new Date(),
            data: entries
        }, true);
    }

    for (const entry of entries) {
        if (!session.authenticated) {
            console.warn('Auth lost');
            return;
        }

        await downloadVideo(entry);
    }

    console.log();
    console.log();
    console.log('Summary to check manually: ');

    const db = await useDatabase();
    for (const entry of db) {
        if (entry.status !== 'DONE') {
            console.log(`[${entry.status}] ${entry.title || entry.filename} -> ${entry.listEntryData.url}`);
        }
    }
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

    let vidEntry: VideoDetailsEntry = {
        ...dbEntry,
        downloadLinks: [],
        tags: [],
        listEntryData: entry,
        filename: '',
        lastStatusUpdate: new Date(),
        status: 'TODO',
    };

    await setEntry(vidEntry);

    if (videoDetailsData === 'moved') {
        console.warn('Video has been moved: ', entry.name, entry.url);
        vidEntry.status = 'MOVED';
        vidEntry.lastStatusUpdate = new Date();
        await setEntry(vidEntry);
        return;
    }  else if (videoDetailsData === 'broken') {
        console.warn('Page structure is broken: ', entry.name, entry.url);
        vidEntry.status = 'PAGE-BROKEN';
        vidEntry.lastStatusUpdate = new Date();
        await setEntry(vidEntry);
        return;
    }
    
     let fileName = filenamify((videoDetailsData.tags.map((tag) => tag.replace(/ /g, '-')).join(' ') + ' ' + videoDetailsData.title || '').replace(/&amp;/g, '&').trim());
    let nr = 0;

    /* while ((!fileName.length && !nr) || existsSync(path.join(settings.downloadLocation, fileName + (nr > 0 ? ' #' + nr : '') + '.mp4'))) {
        nr++;
    } */

    fileName = (fileName + (nr > 0 ? ' #' + nr : '') + '.mp4').trim();

    vidEntry = {
        ...vidEntry,
        ...videoDetailsData,
        filename: fileName
    };

    const mp4Exists = existsSync(path.join(settings.downloadLocation, fileName));
    const tsExists = existsSync(path.join(settings.downloadLocation, fileName.substr(0, fileName.lastIndexOf('.')) + '.ts'));

    if (mp4Exists || tsExists) {
        if (tsExists) {
            vidEntry.filename = path.join(settings.downloadLocation, fileName.substr(0, fileName.lastIndexOf('.')) + '.ts');
        }

        vidEntry.status = 'DONE';
        await setEntry(vidEntry);
        return;
    }
    
    const downloadAsStream = async (videoDetailsData: VideoDetails) => {
        if (!videoDetailsData.streamManifestUrl) throw new Error('Stream manifest url must be set!');

        try {
            const streamDownloadPath = path.join(settings.downloadLocation, fileName.substr(0, fileName.lastIndexOf('.')) + '.ts');
            await downloadStream(videoDetailsData.streamManifestUrl, streamDownloadPath);

            if (commandExists('ffmpeg')) {
                const streamDownloadPathConverted = path.join(settings.downloadLocation, fileName);

                spawnSync(`ffmpeg -i "${streamDownloadPath}" -c copy "${streamDownloadPathConverted}"`);

                if (existsSync(streamDownloadPathConverted)) {
                    unlinkSync(streamDownloadPath);
                }
            }

            return true;
        } catch {
            return false;
        }
    };
    
    if (videoDetailsData.downloadLinks.length <= 0 || forceStreamDownloads.indexOf(entry.url) >= 0) {
        if (videoDetailsData.streamManifestUrl) {
            if (await downloadAsStream(videoDetailsData)) {
                vidEntry.status = 'DONE';
            } else {
                vidEntry.status = 'ERROR';
                console.error(`Download error for file "${fileName}": `, vidEntry.title || vidEntry.filename, entry.url);
            }
        } else {
            vidEntry.status = 'NO-DOWNLOADS';
        }

        vidEntry.lastStatusUpdate = new Date();
        await setEntry(vidEntry);
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

    await waitForInternet();

    try { 
        await downloadFile(bestUrl.link, {
            directory: settings.downloadLocation,
            filename: fileName,
        });

        vidEntry.status = 'DONE';
        process.stdout.write(`Done downloading "${vidEntry.filename}"                                                                                                      \r\n`);
    } catch (ex) {
        if (await downloadAsStream(videoDetailsData)) {
            vidEntry.status = 'DONE';
        } else {
            vidEntry.status = 'ERROR';
            console.error(`Download error for file "${fileName}": `, vidEntry.title || vidEntry.filename, entry.url);
        }
    } finally {
        vidEntry.lastStatusUpdate = new Date();
        await setEntry(vidEntry);
    }
}