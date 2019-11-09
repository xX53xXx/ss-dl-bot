import { ipcRenderer } from 'electron';
import { ISettings } from 'settings';
import * as moment from 'moment';
import { VideoMeta } from 'entities/VideoEntry';

window.onload = (e: any) => {
    ipcRenderer.send('pageLoaded', location);
};

ipcRenderer.on('authenticate', (e: any, settings: ISettings) => {
    const frm = document.querySelector('form[name=login]');

    const sendError = () => {
        const errorMessage: string = 'Login: Document has changed. Code update required!';
        console.error(errorMessage);
        ipcRenderer.send('error', errorMessage);
    };

    if (frm) {
        const usernameEm = frm.querySelector('input#amember-login');
        const passwordEm = frm.querySelector('input#amember-pass');
        const stayLoggedInEm = frm.querySelector('input[name=remember_login]');

        if (!usernameEm || !passwordEm || !stayLoggedInEm) {
            sendError();
            return;
        }

        usernameEm.setAttribute('value', settings.username || '');
        passwordEm.setAttribute('value', settings.password || '');
        stayLoggedInEm.setAttribute('value', '1');
    } else {
        sendError();
    }
});

ipcRenderer.on('sendVideoPagesAmount', (e: any) => {
    const pages = document.querySelector('ul.pt-cv-pagination');

    if (pages) {
        const lastPage: any = pages.querySelector('li:nth-last-child(2)');
        ipcRenderer.send('receiveVideoPagesAmount', parseInt(lastPage.querySelector('a').innerHTML.trim(), 10));
    } else {
        const errorMessage: string = 'All Pages: Document has changed. Code update required!';
        console.error(errorMessage);
        ipcRenderer.send('errorGettingVideoPagesAmount', errorMessage);
    }
});

ipcRenderer.on('sendCurrentVideosPageScan', (e: any, currentVideoPage: number) => {
    const pageEntries = document.querySelectorAll('div[data-id=pt-cv-page-' + currentVideoPage + '] > div a:first-child');

    if (pageEntries && pageEntries.length > 0) {
        ipcRenderer.send('receiveCurrentVideosPageScan', Array.from(pageEntries).map((entry: any) => entry.getAttribute('href').trim()).reverse());
    } else {
        const errorMessage: string = 'Scan videos page ' + currentVideoPage + ': DOM has changed. Code update required!';
        console.error(errorMessage);
        ipcRenderer.send('errorGettingCurrentVideosPageScan', errorMessage);
    }
});

ipcRenderer.on('sendCurrentVideoPageScan', (e: any) => {
    const title = document.querySelector('h2.entry-title')!.innerHTML.trim();
    const date = document.querySelector('div.meta-date .date')!.innerHTML.trim();
    const tags = Array.from(document.querySelectorAll('div.meta-tags .tags a .single-tag')).map((tag) => tag.innerHTML.trim());
    const downloadLinkEntries = document.querySelectorAll('ul.download-versions li a');

    if (title && date && tags) {
        let totalClicks: number = 0;

        const downloadLinks = Array.from(downloadLinkEntries).map((link: any) => ({
            clicks: (((str: string) => {
                const mt = /(\d+)/ig.exec(str);

                if (mt) {
                    const clicks: number = parseInt(mt[1], 10);
                    totalClicks += clicks;
                    return clicks;
                }
            })(link.getAttribute('title')!.trim())),
            url: link.getAttribute('href')!.trim(),
            resolution: (((str: string) => {
                if (str.startsWith('-')) {
                    str = str.substr(2);
                }

                const strSplit = str.split('x');

                return [
                    parseInt(strSplit[0], 10),
                    parseInt(strSplit[1], 10)
                ]; // [ width, height ]
            })(link.innerHTML.trim()))
        }));
    
        ipcRenderer.send('receiveCurrentVideoPageScan', {
            title,
            date: (((date: string) => moment(date))(date)),
            tags,
            downloadLinks,
            clicks: totalClicks
        } as VideoMeta);
    } else {
        const errorMessage: string = 'Scan video page ' + location.pathname + ': DOM has changed. Code update required!';
        console.error(errorMessage);
        ipcRenderer.send('errorGettingCurrentVideoPageScan', errorMessage);
    }
});