import { VideoDetailsEntry } from "./entities/VideoDetails";
import { readJsonFile, writeJsonFile, useSettings } from './utils';


let _database: Array<VideoDetailsEntry> | undefined = undefined;

export const useDatabase = async (forceReload = false): Promise<Array<VideoDetailsEntry>> => {
    if (!_database || forceReload) {
        const settings = await useSettings();
        try {
            _database = await readJsonFile<Array<VideoDetailsEntry>>(settings.databaseLocation);
        } catch {
            _database = [];
        }
    }

    return _database;
};

export const saveDatabase = async () => {
    const settings = await useSettings();
    const db = await useDatabase();

    await writeJsonFile(settings.databaseLocation, db, true);
};

export const getEntryByUrl = async (url: string): Promise<VideoDetailsEntry | undefined> => {
    const db = await useDatabase();
    return db.find((etry) => (etry.listEntryData.url === url));
}

export const setEntry = async (entry: VideoDetailsEntry) => {
    const db = await useDatabase();
    let entryFound = false;

    for (let i = 0; i < db.length; i++) {
        if (db[i].listEntryData.url === entry.listEntryData.url) {
            db[i] = entry;
            entryFound = true;
            break;
        }
    }

    if (!entryFound) {
        db.push(entry);
    }

    await saveDatabase();
};