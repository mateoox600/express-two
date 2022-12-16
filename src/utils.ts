
import etagCreate from 'etag';
import proxyAddr from 'proxy-addr';
import contentType from 'content-type';
import QueryString from 'qs';

export const etag = createETagGenerator({ weak: false });
export const wetag = createETagGenerator({ weak: true });

export function compileETag(val: unknown): (body: string | Buffer, encoding: BufferEncoding) => string {
    switch (val) {
    case true:
    case 'weak':
        return wetag;
    case false:
    case 'strong':
        return etag;
    default:
        throw new TypeError(`unknown value for etag function: ${val}`);
    }
}

export function compileQueryParser(val: unknown) {
    switch (val) {
    case true:
    case 'simple':
        return QueryString.parse;
    case false:
        return { };
    case 'extended':
        return parseExtendedQueryString;
    default:
        throw new TypeError('unknown value for query parser function: ' + val);
    }
}

export function compileTrust(val: unknown) {
    if(val === true) return () => true;

    if(typeof val === 'number') return (a: unknown, i: number) => i < (val as number);

    if(typeof val === 'string') val = val.split(',').map((v) => v.trim());

    return proxyAddr.compile((val as string[]) || []);
}

export function setCharset(type: string, charset: string) {
    if(!type || !charset) return type;

    const parsed = contentType.parse(type);

    parsed.parameters.charset = charset;

    return contentType.format(parsed);
}

function createETagGenerator(options: { weak: boolean }) {
    return (body: string | Buffer, encoding: BufferEncoding) => {
        const buf = !Buffer.isBuffer(body) ? Buffer.from(body as string, encoding) : body;

        return etagCreate(buf, options);
    };
}

function parseExtendedQueryString(str: string) {
    return QueryString.parse(str, { allowPrototypes: true });
}