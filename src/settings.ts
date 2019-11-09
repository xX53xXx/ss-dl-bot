import * as fs from 'fs';
import * as path from 'path';

export interface ISettings {
    // Sperma-Studio.com credentials (for prefilled login form, you still have to solve capture and login)
    // IMPORTANT: You can store your credentials also in "account.json", this file is ignored by git and will not be pushed
    username?: string; // Optional
    password?: string; // Optional

    // Where to store the downloaded stuff
    downloadLocation: string; // Required

    // Where to store the "JSON" database
    // IMPORTANT: This loction is relative to "downloadLocation", you can specify just the database file name
    // by setting this value to "<databaseFileName>.json" and the path will be "{downloadLocation}/<databaseFileName>.json"
    databaseLocation: string; // Required
}

const accountFilePath = path.normalize(path.join(__dirname, '..', 'account.json'));
let userCredentials: any = {};

if (fs.existsSync(accountFilePath)) {
    userCredentials = JSON.parse(fs.readFileSync(accountFilePath).toString());
}

export default {
    username: userCredentials.username,
    password: userCredentials.password,

    downloadLocation: path.normalize(path.join(__dirname, '..', 'out')),
    databaseLocation: 'db.json'
} as ISettings;