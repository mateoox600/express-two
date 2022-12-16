import { Application } from '../src/Application';
import { Router } from '../src/router';

const app = new Application();

app.use(function test(req, res, next) {
    console.log('middleware');
    next();
});

const router = new Router();

router.get('/:id/', (req, res) => {
    res.send(req.params);
});

app.use('/test', router);

app.listen(36363, () => {
    console.log('Listening');
});
/*
import express, { Router } from 'express';

const app = express();

app.use(function test(req, res, next) {
    console.trace();
    console.log('middleware');
    next();
});

const router = Router();

router.get('/:id/', (req, res) => {
    res.send(req.params);
});

app.use('/test', router);

app.listen(36363, () => {
    console.log('Listening');
});*/