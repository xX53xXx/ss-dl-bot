import * as path from 'path';
import * as fs from 'fs';

import settings from '../settings';

const databasePath = path.isAbsolute(settings.databaseLocation) ?
                        settings.databaseLocation :
                        path.join(settings.downloadLocation, settings.databaseLocation);

let database = {};

export interface IDatabase {
    getPath: () => void;
    load: () => void;
    save: () => void;
}

export default {
    getPath: () => databasePath,

    load: () => {
        if (fs.existsSync(databasePath)) {
            
        }
    },
    save: () => {

    }
} as IDatabase;


