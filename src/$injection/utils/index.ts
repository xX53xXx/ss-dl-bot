import { ipcRenderer } from 'electron';
import axios from 'axios';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../../consts';
import {
    Authenticated,
    EventParams,
    EventResponseParams,
    PageStructureError
} from '../../consts/events';
import {
    Params
} from '../../consts/pages';

export function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// ---

export function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]) {
    location.href = (URL + '/' + page).replace(/\/+/g, '/') + (args ? '?' + toQueryArgs(args) : '');
}

// ---

export function regEvent<EventName extends keyof EventParams>(eventName: EventName, callback: (params: EventParams[EventName], event: Event) => void) {
    ipcRenderer.on(eventName, (e, p) => callback(p, e));
}

export function sendEvent<EventName extends keyof EventResponseParams>(eventName: EventName, params: EventResponseParams[EventName]) {
    ipcRenderer.send(eventName, params);
}

// ---

export async function postRequest<PageName extends keyof Params>(pageName: PageName, params?: Params[PageName]) {
    return axios.post(pageName, params);
}

// ---

export function isAuthenticated(): boolean {
    const lbtn1Vis = !!document.querySelector('#menu-7574-particle > nav > ul > li.g-menu-item.g-menu-item-69799.g-menu-item-type-custom.g-standard.menu-item.menu-item-69799.menu-item-object-custom.menu-item-type-custom > a > span > span');
    const lbtn2Vis = !!document.querySelector('#g-mobilemenu-container > ul > li.g-menu-item.g-menu-item-type-custom.g-menu-item-69799.g-standard.menu-item.menu-item-type-custom.menu-item-object-custom.menu-item-69799 > a');
    const lbtn3Vis = !!document.querySelector('.am-user-identity-block_login');

    return lbtn1Vis || lbtn2Vis || lbtn3Vis;
}

export function sendIsAuthenticated(authenticated: boolean) {
    sendEvent(Authenticated, authenticated);
}

export function throwPageStructureError(message: string) {
    sendEvent(PageStructureError, message);
}

export function fixFailedChars(value: string): string {
    value = value.replace('Ã¶', 'ö');
    value = value.replace('Ã¤', 'ä');
    value = value.replace('Ã¼', 'ü');

    value = value.replace('ÃŸ', 'ß');
    value = value.replace('Â´', '\'');

    // ---

    value = value.replace('├Â', 'ö');

    value = value.replace('&amp;', '&');

    return value;
}