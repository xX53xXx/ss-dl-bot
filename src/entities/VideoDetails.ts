import { ListEntry } from "./ListEntry";

export interface DownloadLink {
    name: string;
    link: string;
}

export interface VideoDetails {
    title?: string;
    published?: string; // Example: 27 March 2021
    category?: string;
    tags: Array<string>;
    downloadLinks: Array<DownloadLink>;
}

export interface VideoDetailsEntry extends VideoDetails {
    filename: string;
    listEntryData: ListEntry;
    status: 'TODO' | 'DONE' | 'ERROR';
    lastStatusUpdate: Date;
}