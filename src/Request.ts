import { IncomingMessage } from 'http';
import typeis from 'type-is';
import accepts from 'accepts';
import parseRange from 'range-parser';
import proxyAddr from 'proxy-addr';
import { isIP } from 'net';
import parseurl from 'parseurl';
import { Route } from './router/Route';
import { Response } from './Response';
import { NextFunction } from './Types';
import { ParsedQs } from 'qs';
import fresh from 'fresh';
import { Application } from './Application';

export class Request extends IncomingMessage {

    public app: Application | undefined;
    public baseUrl = '';
    public route: Route | undefined;
    public params: Record<string, string> = {};
    public res: Response | undefined;
    public next: NextFunction | undefined;
    public query: ParsedQs | undefined;

    public get(name: string) {
        if(!name) throw new TypeError('name argument is required to req.get');
        if(typeof name !== 'string') throw new TypeError('name must be a string to req.get');

        const nameLowerCase = name.toLowerCase();

        switch(nameLowerCase) {
        case 'referer':
        case 'referrer':
            return this.headers.referrer || this.headers.referer;
        default:
            return this.headers[nameLowerCase];
        }
    }

    public accepts(...types: string[]) {
        const accept = accepts(this);
        return accept.types(...types);
    }

    public acceptsEncodings(...encodings: string[]) {
        const accept = accepts(this);
        return accept.encodings(...encodings);
    }

    public acceptsCharsets(...charsets: string[]) {
        const accept = accepts(this);
        return accept.charsets(...charsets);
    }

    public acceptsLanguages(...languages: string[]) {
        const accept = accepts(this);
        return accept.languages(...languages);
    }

    public range(size: number, options?: parseRange.Options) {
        const range = this.get('Range');
        if(!range) return;
        if(Array.isArray(range)) return;
        return parseRange(size, range, options);
    }

    public is(...types: string[]) {
        return typeis(this, types);
    }

    public get protocol(): string {
        const proto = 'encrypted' in this.socket ? 'https' : 'http';

        const trust = this.app?.set('trust proxy fn') as (addr: string, i: number) => boolean;

        if(!trust(this.socket.remoteAddress as string, 0)) return proto;

        const header = this.get('X-Forwarded-Proto') as string || proto;
        const index = header.indexOf(',');

        return index !== -1 ? header.substring(0, index).trim() : header.trim();
    }
    
    
    public get secure(): boolean {
        return this.protocol === 'https';
    }

    public get ip(): string {
        const trust = this.app?.set('trust proxy fn') as (addr: string, i: number) => boolean;
        return proxyAddr(this, trust);
    }
    
    public get ips(): string[] {
        const trust = this.app?.set('trust proxy fn') as (addr: string, i: number) => boolean;
        const addrs = proxyAddr.all(this, trust);

        addrs.reverse().pop();

        return addrs;
    }
    
    public get subdomains(): string[] {
        const hostname = this.hostname;

        if(!hostname) return [];

        const offset = this.app?.set('subdomain offset') as number;
        const subdomains = !isIP(hostname) ? hostname.split('.').reverse() : [ hostname ];
        
        return subdomains.slice(offset);
    }

    public get path() {
        return parseurl(this)?.pathname;
    }

    public get hostname() {
        const trust = this.app?.set('trust proxy fn') as (addr: string, i: number) => boolean;
        let host = this.get('X-Forwarded-Host') as string;

        if(!host || !trust(this.socket.remoteAddress as string, 0))
            host = this.get('Host') as string;
        else if(host.indexOf(',') !== -1)
            host = host.substring(0, host.indexOf(',')).trimRight();

        if(!host) return;

        const offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
        const index = host.indexOf(':', offset);

        return index !== -1 ? host.substring(0, index) : host;
    }
    
    public get fresh(): boolean {
        if(this.method !== 'GET' && this.method !== 'HEAD') return false;

        if(!this.statusCode) return false;
        if((this.statusCode >= 200 && this.statusCode < 300) || this.statusCode === 304) return fresh(this.headers, { 'etag': this.res?.get('ETag'), 'last-modified': this.res?.get('Last-Modified') });

        return false;
    }

    public get stale() {
        return !this.fresh;
    }
    
    public get xhr() {
        const val = this.get('X-Requested-With') as string || '';
        return val.toLowerCase() === 'xmlhttprequest';
    }

}