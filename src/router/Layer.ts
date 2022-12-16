import { ErrorHandle, Handle, NextFunction } from '../Types';
import { pathToRegexp, Key, TokensToRegexpOptions, ParseOptions } from 'path-to-regexp';
import { Request } from '../Request';
import { Response } from '../Response';
import { Route } from './Route';

export class Layer {

    public name: string;
    public params: Record<string, string> = { };
    public path: string | undefined;
    public regexp: RegExp;
    public keys: Key[] = [];
    public method: string | undefined;
    public route: Route | undefined;

    public fastStar: boolean;
    public fastSlash: boolean;

    constructor(path: string, public handle: Handle | ErrorHandle, options?: (TokensToRegexpOptions & ParseOptions)) {
        this.name = handle.name || '<anonymous>';
        this.regexp = pathToRegexp(path, this.keys = [], options);

        this.fastStar = path === '*';
        this.fastSlash = path === '/' && options?.end === false;
    }

    public handleError(error: string, req: Request, res: Response, next: NextFunction) {
        if(this.handle.length !== 4) return next(error);

        try {
            (this.handle as ErrorHandle)(error, req, res, next);
        }catch(err) {
            next(String(err));
        }
    }

    public handleRequest(req: Request, res: Response, next: NextFunction) {
        if(this.handle.length > 3) return next();

        try {
            (this.handle as Handle)(req, res, next);
        }catch(err) {
            next(String(err));
        }
    }

    public match(path: string) {
        let match;

        if(path != null) {
            if(this.fastSlash) {
                this.params = {};
                this.path = '';
                return true;
            }

            if(this.fastStar) {
                this.params = { '0': this.decodeParam(path) };
                this.path = path;
                return true;
            }

            match = this.regexp.exec(path);
        }

        if(!match) {
            this.params = { };
            this.path = undefined;
            return false;
        }

        this.params = {};
        this.path = match[0];

        for(let i = 1; i < match.length; i++) {
            const key = this.keys[i - 1];
            const prop = key.name;
            const val = this.decodeParam(match[i]);

            if(val !== undefined || !(Object.prototype.hasOwnProperty.call(this.params, prop))) this.params[prop] = val;
        }

        return true;
    }

    public decodeParam(val: string) {
        if(typeof val !== 'string' || val.length === 0) return val;

        try {
            return decodeURIComponent(val);
        }catch(err) {
            if(err instanceof URIError) err.message = `Failed to decode param '${val}'`;

            throw err;
        }
    }

}