import {
    clone,
    sendEvent,
    isAuthenticated,
    fixFailedChars,
} from './utils';
import * as Page from '../consts/pages';
import { 
    Navigate, PageStructureError, PageStructureWarning, ScanPage, ScanVideoPage,
} from '../consts/events';
import { regEvent } from './utils';
import { useSettings } from '../utils';
import { URL } from '../consts';
import { ListEntry } from '../entities/ListEntry';
import { DownloadLink, VideoDetails } from '../entities/VideoDetails';

// --- On Load
window.onload = async () => {
    const authenticated = isAuthenticated();
    
    if (
        // SOME SECURITY: Go shure to write credentials into fields only if is on right site
        location.pathname.toLowerCase() === Page.Login.toLowerCase() &&
        location.protocol.toLowerCase() === 'https:' &&
        location.origin.toLowerCase() === URL.toLowerCase()
    ) {
        const { username, password } = await useSettings();

        const userInput = document.querySelector<HTMLInputElement>('input[name=amember_login]');
        const passInput = document.querySelector<HTMLInputElement>('input[name=amember_pass]');
        const remMeInput = document.querySelector<HTMLInputElement>('input[name=remember_login]');
        const remMeLbl = document.querySelector<HTMLInputElement>('label#am-form-login-remember');

        if (!userInput || !passInput || !remMeInput || !remMeLbl) {
            sendEvent(PageStructureWarning, 'Page html structure of login page changed.');
        } else {
            window.scrollTo(0, document.body.scrollHeight);
        }

        if (username && userInput) {
            userInput.value = username;
        }

        if (password && passInput) {
            passInput.value = password;
        }

        remMeLbl?.click();

        if (remMeInput) {
            remMeInput.value = '1';
        }
    } else if (Page.VideosList.toLowerCase().startsWith(location.pathname.toLowerCase())) {
        window.scrollTo(0, document.body.scrollHeight * 0.515);
    } else {
        const playerEm = document.querySelector<HTMLDivElement>('#live');

        if (playerEm) {
            window.scrollTo(0, playerEm.offsetTop - 100);
        }
    }

    sendEvent(Navigate, { location: clone<Location>(location), authenticated });
};


regEvent(ScanPage, () => {
    if (!Page.VideosList.toLowerCase().startsWith(location.pathname.toLowerCase())) {
        sendEvent(PageStructureError, 'Can\'t scan page ' + location.pathname);
        return;
    }

    const entriesList = document.querySelectorAll<HTMLDivElement>('#pt-cv-view-69c05fcd29 > div > div > div');

    if (!entriesList) {
        sendEvent(PageStructureError, 'Page html structure of list videos page changed');
        return;
    }

    if (entriesList.length <= 0 || !!entriesList[0].querySelector('div.alert')) {
        // End reached
        sendEvent(ScanPage, false);
        return;
    }

    const entries: Array<ListEntry> = [];

    for (const listEntry of entriesList) {
        const titleEm = listEntry.querySelector<HTMLAnchorElement>('h4 > a');
        const imgEm = listEntry.querySelector<HTMLImageElement>('a > img.pt-cv-thumbnail');
        const tagsList = listEntry.querySelectorAll<HTMLAnchorElement>('div > span.terms > a');

        if (!titleEm || !titleEm.getAttribute('href')) {
            sendEvent(PageStructureError, 'Page html structure of list videos page changed.');
            return;
        }

        if (!imgEm || !tagsList) {
            sendEvent(PageStructureWarning, 'Page html structure of list videos page changed.');
        }

        const entry: ListEntry = {
            name: fixFailedChars(titleEm.innerHTML.trim()),
            url: titleEm.href.trim(),
            imageUrl: imgEm?.src.trim(),
            tags: []
        };

        if (!!tagsList?.length) {
            for (const tagEntry of tagsList) {
                const name = tagEntry.innerHTML.trim();

                if (name) {
                    entry.tags.push({
                        name,
                        url: tagEntry.href?.trim()
                    });
                }
            }
        }

        entries.push(entry);
    }

    sendEvent(ScanPage, entries);

});

regEvent(ScanVideoPage, () => {
    const videoTitleEm = document.querySelector<HTMLTitleElement>('h2.entry-title');
    const publishedEm = document.querySelector<HTMLSpanElement>('section.entry-header > div.entry-meta > div.meta-date > span.date');
    const categoryEm = document.querySelector<HTMLSpanElement>('section.entry-header > div.entry-meta > div.meta-categories > span.categories > span');
    const tagsEmArray = document.querySelectorAll<HTMLSpanElement>('section.entry-header > div.entry-meta > div.meta-tags > span.tags > span');
    const downloadLinkEmArray = document.querySelectorAll<HTMLAnchorElement>('section.entry-content ul > li a');

    const pageStructureChangedText = 'Page html structure of detailed video page has possibly changed.';

    if (!downloadLinkEmArray?.length) {
        const movedEm = document.querySelectorAll('section.entry-content > blockquote > p');

        if (!movedEm) {
            const live = document.querySelector('#live');

            if (!live) {
                sendEvent(ScanVideoPage, 'broken');
                sendEvent(PageStructureWarning, pageStructureChangedText);
            } else {
                sendEvent(ScanVideoPage, 'no-download-links');
            }
        } else {
            sendEvent(ScanVideoPage, 'moved');
        }

        return;
    }

    if (!videoTitleEm || !publishedEm || !categoryEm || !tagsEmArray?.length) {
        sendEvent(PageStructureWarning, pageStructureChangedText);
    }

    const tags: Array<string> = [];
    const downloadLinks: Array<DownloadLink> = [];

    for (const tagEm of tagsEmArray) {
        tags.push(tagEm.innerHTML.trim());
    }

    for (const downloadLinkEm of downloadLinkEmArray) {
        downloadLinks.push({
            link: downloadLinkEm.href.trim(),
            name: downloadLinkEm.innerHTML.trim()
        });
    }

    const data: VideoDetails = {
        title: videoTitleEm?.innerHTML.trim(),
        published: publishedEm?.innerHTML.trim(),
        category: categoryEm?.innerHTML.trim(),
        tags,
        downloadLinks
    };

    sendEvent(ScanVideoPage, data);
});