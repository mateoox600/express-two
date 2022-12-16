import express, { Router } from '../src';

const app = express();

app.use(function test(req, res, next) {
    console.log('middleware');
    next();
});

app.get('/', (req, res) => {
    res.sendFile('README.MD');
});

const router = new Router();

router.get('/:id/', (req, res) => {
    res.send(req.params);
});

app.use('/test', router);

app.listen(36363, () => {
    console.log('Listening');
});