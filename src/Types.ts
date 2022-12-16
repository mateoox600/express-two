import QueryString from 'qs';
import { Request } from './Request';
import { Response } from './Response';

export type NextFunction = (err?: string) => void;
export type Handle = (req: Request, res: Response, next: NextFunction) => void;
export type ErrorHandle = (error: string, req: Request, res: Response, next: NextFunction) => void;
export type ParamHandle = (req: Request, res: Response, next: NextFunction, value: string, key: string) => void;

export type QueryParser = typeof QueryString.parse;

export interface CalledParam {
    error: undefined | string,
    match: string,
    value: string
}

export const methods = [
    'get',
    'post',
    'put',
    'head',
    'delete',
    'options',
    'trace',
    'copy',
    'lock',
    'mkcol',
    'move',
    'purge',
    'propfind',
    'proppatch',
    'unlock',
    'report',
    'mkactivity',
    'checkout',
    'merge',
    'm-search',
    'notify',
    'subscribe',
    'unsubscribe',
    'patch',
    'search',
    'connect'
];
export type MethodsType = 'get' | 'post' | 'put' | 'head' | 'delete' | 'options' |
    'trace' | 'copy' | 'lock' | 'mkcol' | 'move' | 'purge' |
    'propfind' | 'proppatch' | 'unlock' | 'report' | 'mkactivity' | 'checkout' |
    'merge' | 'm-search' | 'notify' | 'subscribe' | 'unsubscribe' | 'patch' |
    'search' | 'connect';