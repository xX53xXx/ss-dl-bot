export const LOGIN_PAGE                         : string = '/amember/login/';
export const SELECT_YOUR_PAGE                   : string = '/select-your-member-page/';
export const WELCOME_PAGE                       : string = '/welcome-to-our-member-area/';
export const ALL_VIDEOS                         : string = '/all-videos/';

export function getVideosPageByPathname(pathname: string): number | undefined {
    const mt = (new RegExp(ALL_VIDEOS + 'pages/(\\d+)/', 'is')).exec(pathname);

    if (mt) {
        return parseInt(mt[1], 10);
    }
}

export function getVideosPagePathname(page: number): string {
    return ALL_VIDEOS + 'pages/' + page + '/';
}