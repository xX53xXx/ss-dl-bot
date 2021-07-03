export const Home = '/';
export const Login = '/amember/login/';
export const Logout = '/amember/logout/';

export const VideosList = '/all-videos/?_page=:page';
export const Video = '/video/:id/view';

export type Params = {
    [Home]: undefined;
    [Login]: undefined;
    [Logout]: undefined;
    [VideosList]: {
        page: number;
    };
    
    [Video]: {
        id: number;
    };
};