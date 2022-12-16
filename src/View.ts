import { statSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { RenderingEngine } from './Types';

export interface ViewOptions {
    defaultEngine: string,
    root: string | string[],
    engines: Record<string, RenderingEngine>
}

export default class View {

    public defaultEngine: string;
    public ext: string;
    public root: string | string[];
    public engine: RenderingEngine;
    public path: string;

    constructor(public name: string, options: ViewOptions) {

        this.defaultEngine = options.defaultEngine;
        this.ext = extname(name);
        this.root = options.root;

        if(!this.ext && !this.defaultEngine) throw new Error('No default engine was specified and no extension was provided.');

        let fileName = name;
        
        if(!this.ext) {
            this.ext = this.defaultEngine[0] !== '.' ? '.' + this.defaultEngine : this.defaultEngine;

            fileName += this.ext;
        }

        if(!options.engines[this.ext]) {
            const mod = this.ext.slice(1);

            const fn = require(mod).__express;

            if(typeof fn !== 'function') throw new Error(`Module "${mod}" does not provide a view engine.`);

            options.engines[this.ext] = fn;
        }

        this.engine = options.engines[this.ext];

        const path = this.lookup(fileName);
        if(!path) throw new Error('Error while getting the file path');
        this.path = path;
    }

    public lookup(name: string): string | undefined {
        const roots = ([] as string[]).concat(this.root);

        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            
            const loc = resolve(root, name);
            const dir = dirname(loc);
            const file = basename(loc);

            return this.resolve(dir, file);
        }
    }

    public render(options: { cache?: boolean | undefined, [otherOptions: string]: unknown }, callback: (err: Error, html: string) => void) {
        this.engine(this.path, options, callback);
    }

    public resolve(dir: string, file: string) {
        let path = join(dir, file);
        let stat = tryStat(path);

        if(stat && stat.isFile()) return path;

        path = join(dir, basename(file, this.ext), 'index' + this.ext);
        stat = tryStat(path);

        if(stat && stat.isFile()) return path;
    }

}

function tryStat(path: string) {
    try {
        return statSync(path);
    }catch(_) {
        return undefined;
    }
}