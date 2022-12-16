import finalhandler from 'finalhandler';
import { createServer } from 'http';
import { Request } from './Request';
import { Response } from './Response';
import { Router } from './router';
import { Route } from './router/Route';
import { Handle, methods, ParamHandle } from './Types';
import { compileETag, compileQueryParser, compileTrust } from './utils';

export class Application extends Router {

    public settings: Record<string, unknown> = {};
    public mountPath: string;

    constructor() {
        super();

        const env = process.env.NODE_ENV || 'development';

        this.enable('x-powered-by');
        this.set('etag', 'weak');
        this.set('env', env);
        this.set('query parser', 'extended');
        this.set('subdomain offset', 2);
        this.set('trust proxy', false);

        this.mountPath = '/';

        this.set('jsonp callback name', 'callback');

        if(env === 'production') this.enable('view cache');
    }

    public handle(req: Request, res: Response) {
        req.app = this;
        res.app = this;
        req.res = res;

        const done = finalhandler(req, res, {
            env: this.set('env') as string | undefined,
            onerror: (err) => {
                if(this.set('env') !== 'test') console.error(err.stack || err.toString());
            }
        });

        super.handle(req, res, done);
    }

    public param(name: string | string[], fn: ParamHandle) {

        if(Array.isArray(name)) {
            for (let i = 0; i < name.length; i++) this.param(name[i], fn);
            return this;
        }

        super.param(name, fn);

        return this;
    }

    public set(setting: string, val?: unknown): unknown {
        if(!val) {
            let settings = this.settings;

            while(settings && settings !== Object.prototype) {
                if(setting in settings) return settings[setting];
                settings = Object.getPrototypeOf(settings);
            }

            return undefined;
        }

        this.settings[setting] = val;

        switch(setting) {
        case 'etag':
            this.set('etat fn', compileETag(val));
            break;
        case 'query parser':
            this.set('query parser fn', compileQueryParser(val));
            break;
        case 'trust proxy':
            this.set('trust proxy fn', compileTrust(val));
            break;
        }

        return this;
    }

    public enabled(setting: string) {
        return Boolean(this.set(setting));
    }
    
    public disabled(setting: string) {
        return !this.set(setting);
    }

    public enable(setting: string) {
        return this.set(setting, true);
    }

    public disable(setting: string) {
        return this.set(setting, false);
    }

    public all(path: string, ...handles: Handle[]) {
        const route = this.route(path) as Route;
        
        for (const method of methods) route.method(method, ...handles);
        
        return this;
    }
    
    public listen(port: number, callback: () => void) {
        const server = createServer({
            IncomingMessage: Request,
            ServerResponse: Response
        }, this.handle.bind(this));
        return server.listen(port, callback);
    }

}