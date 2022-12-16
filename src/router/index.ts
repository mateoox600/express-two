import { Request } from '../Request';
import { Response } from '../Response';
import { CalledParam, Handle, MethodsType, NextFunction, ParamHandle } from '../Types';
import { Layer } from './Layer';
import parseurl from 'parseurl';
import { Route } from './Route';
import { Key } from 'path-to-regexp';

export class Router {

    public params: Record<string, ParamHandle[]> = {};
    public stack: Layer[] = [];

    public param(name: string, fn: ParamHandle) {
        
        if(name[0] === ':') name = name.slice(1);

        if(typeof fn !== 'function') throw new Error(`invalid param() call for ${name}, got ${fn}`);

        (this.params[name] = this.params[name] || []).push(fn);
        return this;
    }

    public handle(req: Request, res: Response, out: NextFunction) {

        const protohost = this.getProtohost(req.url) || '';
        const paramCalled: Record<string, CalledParam> = {};
        
        let idx = 0;
        let sync = 0;
        let slashAdded = false;
        let removed = '';

        let options: string[] = [];

        const parentParams = req.params;
        const parentUrl = req.baseUrl || '';

        let done = this.restore(out, req);

        if(req.method === 'OPTIONS') done = this.wrapNextFunction(done, (old, err) => {
            if(err || options.length === 0) return old(err);
            const body = options.join(',');
            res.set('Allow', body);
            res.send(body);
        });

        const next = (err?: string) => {
            let layerError = err === 'route' ? undefined : err;

            if(slashAdded) {
                req.url = req.url?.slice(1);
                slashAdded = false;
            }

            if(removed.length !== 0) {
                req.baseUrl = parentUrl;
                req.url = protohost + removed + req.url?.slice(protohost?.length);
                removed = '';
            }

            if(layerError === 'router') {
                setImmediate(done, undefined);
                return;
            }

            if(idx >= this.stack.length) {
                setImmediate(done, layerError);
                return;
            }

            if(++sync > 100) {
                setImmediate(next, err);
                return;
            }
            
            const path = parseurl(req)?.pathname;
            
            if(path == null) return done(layerError);

            let layer: Layer | undefined;
            let match = false;
            let route: Route | undefined;
            
            while(match !== true && idx < this.stack.length) {
                layer = this.stack[idx++];
                match = layer.match(path);
                route = layer.route;
                
                if(typeof match !== 'boolean') layerError = layerError || match;
                
                if(match !== true) continue;
                if(!route) continue;
                if(layerError) {
                    match = false;
                    continue;
                }
                
                const hasMethod = route.handlesMethod(req.method as string);

                if(!hasMethod && req.method === 'OPTIONS') options = [ ...new Set(...options, ...route.options()) ];
                
                if(!hasMethod && req.method !== 'HEAD') match = false;
            }

            if(match !== true) return done(layerError);

            if(route) req.route = route;
            
            if(layer) req.params = { ...layer.params, ...parentParams };

            this.processParams(layer as Layer, paramCalled, req, res, (err?: string) => {
                if(err) next(layerError || err);
                else if(route) layer?.handleRequest(req, res, next);
                else trimPrefix(layer as Layer, layerError || '', layer?.path || '', path);
            });

            sync = 0;
        };

        function trimPrefix(layer: Layer, layerError: string, layerPath: string, path: string) {
            if(layerPath.length !== 0) {
                if(layerPath !== path.slice(0, layerPath.length)) {
                    next(layerError);
                    return;
                }

                const c = path[layerPath.length];
                if(c && c !== '/' && c !== '.') return next(layerError);
                
                removed = layerPath;
                req.url = protohost + req.url?.slice(protohost?.length + removed.length);

                if(!protohost && req.url[0] !== '/') {
                    req.url = '/' + (req.url || '');
                    slashAdded = true;
                }

                req.baseUrl = parentUrl + (removed[removed.length - 1] === '/' ? removed.substring(0, removed.length - 1) : removed);
            }

            if(layerError) layer.handleError(layerError, req, res, next);
            else layer.handleRequest(req, res, next);
        }
        
        next();
    }

    public processParams(layer: Layer, called: Record<string, CalledParam>, req: Request, res: Response, done: NextFunction) {
        const params = this.params;

        const keys = layer.keys;
        if(!keys || keys.length === 0) return done();

        let i = 0;
        let name;
        let paramIndex = 0;
        let key: Key;
        let paramVal: string;
        let paramCallbacks: ParamHandle[] = [];
        let paramCalled: CalledParam;

        function param(err?: string): void {
            if(err) return done(err);

            if(i >= keys.length) return done();

            paramIndex = 0;
            key = keys[i++];
            name = key.name;
            paramVal = req.params[name];
            paramCallbacks = params[name];
            paramCalled = called[name];

            if(paramVal === undefined || !paramCallbacks) return param();

            if(paramCalled && (paramCalled.match === paramVal || (paramCalled.error && paramCalled.error !== 'route'))) {
                req.params[name] = paramCalled.value;
                return param(paramCalled.error);
            }

            called[name] = paramCalled = {
                error: undefined,
                match: paramVal,
                value: paramVal
            };
        
            paramCallback();
        }

        function paramCallback(err?: string): void {
            const fn = paramCallbacks[paramIndex++];

            paramCalled.value = req.params[key.name];

            if(err) {
                paramCalled.error = err;
                param(err);
                return;
            }

            if(!fn) return param();

            try {
                fn(req, res, paramCallback, paramVal, key.name.toString());
            }catch(e) {
                paramCallback(e as string);
            }
        }

        param();
    }

    public use(fn: Router | Handle | string, ...handles: (Router | Handle)[]) {
        let offset = 0;
        let path = '/';

        if(typeof fn !== 'function' && !(fn instanceof Router)) {
            let arg = fn;

            while(Array.isArray(arg) && arg.length !== 0) arg = arg[0];

            if(typeof arg !== 'function') {
                offset = 1;
                path = fn;
            }
        }

        const callbacks = (offset !== 0 ? handles : [ fn, ...handles ]).flat();

        if(callbacks.length === 0) throw new TypeError('Router.use() requires a middleware function');
        
        for (let i = 0; i < callbacks.length; i++) {
            let fn = callbacks[i];
            if(fn instanceof Router) fn = fn.handle.bind(fn);
            if(typeof fn !== 'function') throw new TypeError(`Router.use() requires a middleware function but got a ${typeof fn}`);

            const layer = new Layer(path, fn, { strict: false, sensitive: false, end: false });
            layer.route = undefined;

            this.stack.push(layer);
        }

        return this;
    }

    public route(path: string) {
        const route = new Route(path);

        const layer = new Layer(path, route.dispatch.bind(route), { strict: false, sensitive: false, end: true });
        layer.route = route;

        this.stack.push(layer);
        return route;
    }

    public method(name: MethodsType, path: string, ...handles: Handle[]) {
        const route = this.route(path);
        route.method(name, ...handles);
        return this;
    }

    public get(path: string, ...handles: Handle[]) {
        return this.method('get', path, ...handles);
    }

    public post(path: string, ...handles: Handle[]) {
        return this.method('post', path, ...handles);
    }

    public put(path: string, ...handles: Handle[]) {
        return this.method('put', path, ...handles);
    }

    public head(path: string, ...handles: Handle[]) {
        return this.method('head', path, ...handles);
    }

    public delete(path: string, ...handles: Handle[]) {
        return this.method('delete', path, ...handles);
    }

    public options(path: string, ...handles: Handle[]) {
        return this.method('options', path, ...handles);
    }

    public trace(path: string, ...handles: Handle[]) {
        return this.method('trace', path, ...handles);
    }

    public copy(path: string, ...handles: Handle[]) {
        return this.method('copy', path, ...handles);
    }

    public lock(path: string, ...handles: Handle[]) {
        return this.method('lock', path, ...handles);
    }

    public mkcol(path: string, ...handles: Handle[]) {
        return this.method('mkcol', path, ...handles);
    }

    public move(path: string, ...handles: Handle[]) {
        return this.method('move', path, ...handles);
    }

    public purge(path: string, ...handles: Handle[]) {
        return this.method('purge', path, ...handles);
    }

    public propfind(path: string, ...handles: Handle[]) {
        return this.method('propfind', path, ...handles);
    }

    public proppatch(path: string, ...handles: Handle[]) {
        return this.method('proppatch', path, ...handles);
    }

    public unlock(path: string, ...handles: Handle[]) {
        return this.method('report', path, ...handles);
    }

    public report(path: string, ...handles: Handle[]) {
        return this.method('report', path, ...handles);
    }

    public mkactivity(path: string, ...handles: Handle[]) {
        return this.method('mkactivity', path, ...handles);
    }

    public checkout(path: string, ...handles: Handle[]) {
        return this.method('merge', path, ...handles);
    }

    public msearch(path: string, ...handles: Handle[]) {
        return this.method('m-search', path, ...handles);
    }

    public notify(path: string, ...handles: Handle[]) {
        return this.method('notify', path, ...handles);
    }

    public subscribe(path: string, ...handles: Handle[]) {
        return this.method('subscribe', path, ...handles);
    }

    public unsubscribe(path: string, ...handles: Handle[]) {
        return this.method('unsubscribe', path, ...handles);
    }

    public patch(path: string, ...handles: Handle[]) {
        return this.method('patch', path, ...handles);
    }

    public search(path: string, ...handles: Handle[]) {
        return this.method('search', path, ...handles);
    }

    public connect(path: string, ...handles: Handle[]) {
        return this.method('connect', path, ...handles);
    }

    public getProtohost(url: string | undefined) {
        if(!url || url.length === 0 || url[0] === '/') return undefined;

        const searchIndex = url.indexOf('?');
        const pathLength = searchIndex !== -1 ? searchIndex : url.length;
        const fqdnIndex = url.slice(0, pathLength).indexOf('://');

        return fqdnIndex !== -1 ? url.substring(0, url.indexOf('/', 3 + fqdnIndex)) : undefined;
    }

    private restore(fn: NextFunction, request: Request) {

        const baseUrl = request.baseUrl;
        const next = request.next;
        const params = request.params;

        return (err?: string) => {

            request.baseUrl = baseUrl;
            request.next = next;
            request.params = params;

            return fn(err);
        };
    }

    private wrapNextFunction(oldFn: NextFunction, fn: (old: NextFunction, err?: string) => void): NextFunction {
        return (err?: string) => {
            fn(oldFn, err);
        };
    }

}

export * from './Layer';
export * from './Route';