import { VideoDetails } from '../entities/VideoDetails';
import { ListEntry } from '../entities/ListEntry';

export const PageStructureError = 'error-page-structure';
export const PageStructureWarning = 'warning-page-structure';

export const Navigate = 'navigate';
export const Authenticated = 'authenticated';
export const ScanPage = 'scan-page';
export const ScanVideoPage = 'scan-video-page';
export const StartVideoStream = 'start-video-stream';

export type NavigationResponse = {
    location: Location;
    authenticated: boolean;
};


// From main to browser
export type EventParams = {
    [Navigate]: string; // url
    [ScanPage]: undefined;
    [ScanVideoPage]: undefined;
};

// From browser to main
export type EventResponseParams = {
    [Navigate]: NavigationResponse;
    [Authenticated]: boolean;
    [ScanPage]: ReadonlyArray<ListEntry> | false;
    [ScanVideoPage]: VideoDetails | false | 'moved' | 'broken';
    [StartVideoStream]: string;


    [PageStructureError]: string;
    [PageStructureWarning]: string;
};