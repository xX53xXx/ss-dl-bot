import { BrowserWindow } from 'electron/main';
import { mkdirSync } from 'fs';
import { scanPage, useSettings, downloadVideo /*, writeJsonFile, readJsonFile*/ } from './utils';
import { ListEntry } from './entities/ListEntry';
// import { rootDir } from './entities/Settings';
import { useDatabase } from './db';

export async function main(win: BrowserWindow) {
    const settings = await useSettings();

    console.warn('IMPORTANT: The *.TS files are in a bad codec. Use a converter like ffmpeg to convert them into a better codec.');
    console.log('');

    mkdirSync(settings.downloadLocation, { recursive: true });

    let lastPage = 1;
    const entries: Array<ListEntry> = []; // await readJsonFile<Array<ListEntry>>(path.join(rootDir, 'cachedEntriesList.json'));

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
        
        // writeJsonFile(path.join(rootDir, 'cachedEntriesList.json'), entries, true);
    }

    for (const entry of entries) {
        await downloadVideo(entry);
        // break;
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