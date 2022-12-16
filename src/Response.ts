import { IncomingMessage, ServerResponse } from 'http';
import { Request } from './Request';
import statuses from 'statuses';
import mime from 'mime-types';
import cookie from 'cookie';
import { Application } from './Application';
import { setCharset } from './utils';

const charsetRegExp = /;\s*charset\s*=/;

export class Response<ServerRequest extends IncomingMessage = Request> extends ServerResponse<ServerRequest> {

    public app: Application | undefined;
    
    public status(code: number) {
        this.statusCode = code;
        return this;
    }

    public links(links: Record<string, string>) {
        let link = this.get('Link') || '';
        if(link) link += ', ';
        return this.set('Link', link + Object.entries(links).map(([ rel, link ]) => `<${link}>; rel="${rel}"`).join(', '));
    }

    public send(body: string | number | boolean | object | Buffer): this {
        let chunk = body;
        let encoding: BufferEncoding | undefined = 'utf-8';
        let type: string | undefined;

        switch(typeof chunk) {
        case 'string':
            if(!this.get('Content-Type')) this.type('html');
            break;
        case 'boolean':
        case 'number':
        case 'object':
            if(chunk === null) chunk = '';
            else if(Buffer.isBuffer(chunk)){
                if(!this.get('Content-Type')) this.type('bin');
            } else return this.json(chunk);
            break;
        }

        if(typeof chunk === 'string') {
            encoding = 'utf8';
            type = this.get('Content-Type') as string | undefined;

            if(typeof type === 'string') this.set('Content-Type', setCharset(type, 'utf-8'));
        }

        const etagFn = this.app?.set('etag fn') as ((body: string | Buffer, encoding: BufferEncoding) => string) | undefined;
        const generateETag = !this.get('ETag') && typeof etagFn === 'function';

        let len: number | undefined;
        if(chunk !== undefined) {
            
            if(Buffer.isBuffer(chunk)) len = chunk.length;
            else if(!generateETag && chunk.length < 1000) len = Buffer.byteLength(chunk, encoding);
            else {
                chunk = Buffer.from(chunk, encoding);
                encoding = undefined;
                len = (chunk as Buffer).length;
            }
        
            this.set('Content-Length', len.toString());
        }
        
        let etag;
        if(generateETag && len !== undefined)
            if((etag = etagFn(chunk as string, encoding as BufferEncoding)))
                this.set('ETag', etag);
        
        if((this.req as unknown as Request).fresh) this.statusCode = 304;

        if(this.statusCode === 204 || this.statusCode === 304) {
            this.removeHeader('Content-Type');
            this.removeHeader('Content-Length');
            this.removeHeader('Transfer-Encoding');
            chunk = '';
        }

        if(this.statusCode === 205) {
            this.set('Content-Length', '0');
            this.removeHeader('Transfer-Encoding');
            chunk = '';
        }

        if(this.req.method === 'HEAD') this.end();
        else this.end(chunk, encoding as BufferEncoding);

        return this;
    }

    public json(obj: string | number | boolean | object) {
        const body = JSON.stringify(obj);

        if(!this.get('Content-Type')) this.set('Content-Type', 'application/json');

        return this.send(body);
    }

    // TODO: jsonp

    public sendStatus(statusCode: number) {
        const body = statuses(statusCode) || String(statusCode);

        this.statusCode = statusCode;
        this.type('txt');

        return this.send(body);
    }

    // TODO: sendFile
    // TODO: download

    public type(type: string) {
        const fullType = type.indexOf('/') === -1 ? mime.lookup(type) : type;
        if(!fullType) return this;
        return this.set('Content-Type', fullType);
    }

    // TODO: format
    // TODO: attachment
    
    public append(field: string, val: string | string[]) {

        const prev = this.get(field) as string | string[];
        let value: string[] = Array.isArray(val) ? val : [ val ];

        if(prev) value = Array.isArray(prev) ? prev.concat(val) : [ prev ].concat(val);

        return this.set(field, value);
    }

    public set(field: string, value: string | string[]) {

        if(field.toLowerCase() === 'content-type') {
            if(Array.isArray(value)) throw new TypeError('Content-Type cannot be set to an Array');
            if(!charsetRegExp.test(value)) {
                const charset = mime.charsets.lookup(value.split(';')[0]);
                if(charset) value += `; charset=${charset.toLowerCase()}`;
            }
        }

        this.setHeader(field, value);
        
        return this;
    }

    public get(field: string) {
        return this.getHeader(field);
    }

    public clearCookie(name: string, options?: { expires?: Date, path?: string }) {
        const opts = { ...{ expires: new Date(1), path: '/' }, ...options };

        return this.cookie(name, '', opts);
    }

    public cookie(name: string, value: string | object, options?: { expires?: Date, maxAge?: number, path?: string }) {
        const opts = { ...{ }, ...options };
        
        const val = typeof value === 'object' ? `j:${JSON.stringify(value)}` : value;

        if(opts.maxAge != null) {
            const maxAge = opts.maxAge as number;
            if(!isNaN(maxAge)) {
                opts.expires = new Date(Date.now() + maxAge);
                opts.maxAge = Math.floor(maxAge / 1000);
            }
        }

        if(opts.path == null) opts.path = '/';

        this.append('Set-Cookie', cookie.serialize(name, val, opts));

        return this;
    }

    // TODO: location
    // TODO: redirect
    // TODO: vary
    public render(name: string, options: Record<string, unknown> | ((err: Error, html: string) => void), callback?: (err: Error, html: string) => void) {
        
        const opts = (typeof options === 'function') ? {} : options;

        let done = callback;
        if(typeof options === 'function') done = options as (err: Error, html: string) => void;
        if(!done) done = (err: Error, html: string) => {
            if(err) throw err;
            this.send(html);
        };

        this.app?.render(name, opts, done);
    }
    

}