import { Navigate } from './consts/events';
import { regEvent } from './utils';

const sessionEvents = ['login', 'logout'] as const;
type SessionEvent = typeof sessionEvents[number];

type Listener = () => void|Promise<void>;

export const session = new (class {
    private _isAuthenticated: boolean = false;

    private _eventListeners: Record<SessionEvent, Array<Listener>> = {
        'login': [],
        'logout': []
    };


    protected emitEvent(event: SessionEvent) {
        for (const listener of this._eventListeners[event]) {
            listener();
        }
    }

    constructor() {
        regEvent(Navigate, ({ authenticated }) => {
            if (this._isAuthenticated !== authenticated) {
                this._isAuthenticated = authenticated;
                this.emitEvent(authenticated ? 'login' : 'logout');
            }
        });
    }

    get authenticated() {
        return this._isAuthenticated;
    }

    addEventListener(event: SessionEvent, listener: Listener) {
        if (!this._eventListeners[event].includes(listener)) {
            this._eventListeners[event].push(listener);
        }
    }

    removeEventListener(event: SessionEvent, listener: Listener) {
        const index = this._eventListeners[event].indexOf(listener);

        if (index >= 0) {
            this._eventListeners[event].splice(index, 1);
        }
    }
})();