import * as moment from 'moment';

export interface VideoDownloadLink {
    clicks: number;
    resolution: number[]; // [width, height]
    url: string;
}

export interface VideoMeta {
    title: string;
    tags: string[];
    date: moment.Moment;
    clicks: number;
    downloadLinks: VideoDownloadLink[];
}