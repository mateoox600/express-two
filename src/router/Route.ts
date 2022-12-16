import { Request } from '../Request';
import { Response } from '../Response';
import { Handle } from '../Types';
import { Layer } from './Layer';

export class Route {

    public stack: Layer[] = [];
    public methods: Record<string, boolean> = {};

    constructor(public path: string) { }

    public handlesMethod(method: string) {
        if(this.methods._all) return true;

        let name = method.toLowerCase();

        if(name === 'head' && !this.methods['head']) name = 'get';

        return Boolean(this.methods[name]);
    }

    public options() {
        const methods = Object.keys(this.methods);

        if(this.methods.get && !this.methods.head) methods.push('head');

        for (let i = 0; i < methods.length; i++) methods[i] = methods[i].toUpperCase();

        return methods;
    }

    public dispatch(req: Request, res: Response, done: (err?: string) => void) {
        let idx = 0;
        const stack = this.stack;
        let sync = 0;

        if(stack.length === 0) return done();
        
        let method = req.method?.toLowerCase();
        if(method === 'head' && !this.methods['head']) method = 'get';

        next();

        function next(err?: string): unknown {
            if(err && err === 'route') return done();
            if(err && err === 'router') return done(err);

            if(++sync > 100) return setImmediate(next, err);

            const layer = stack[idx++];

            if(!layer) return done(err);

            if(layer.method && layer.method !== method) next(err);
            else if(err) layer.handleError(err, req, res, next);
            else layer.handleRequest(req, res, next);

            sync = 0;
        }
    }

    public all(...handles: Handle[]) {
        for (let i = 0; i < handles.length; i++) {
            const handle = handles[i];
            
            const layer = new Layer('/', handle);
            layer.method = undefined;

            this.methods._all = true;
            this.stack.push(layer);
        }

        return this;
    }

    public method(name: string, ...handles: Handle[]) {
        for (const handle of handles) {
            if(typeof handle !== 'function') throw new TypeError(`Route.${name}() requires a callback function but got a ${typeof handle}`);

            const layer = new Layer('/', handle);
            layer.method = name;

            this.methods[name] = true;
            this.stack.push(layer);
        }
    }

}