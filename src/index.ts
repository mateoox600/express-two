import { Application } from './Application';

export default function createApplication() {
    return new Application();
}

export * from './Application';

export * from './Types';

export * from './Request';
export * from './Response';

export * from './router';

export * from './utils';