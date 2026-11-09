// Lokalny serwer sygnalizacyjny PeerJS do testów bez internetu.
// Uruchom: npm run peer-server
// Potem otwórz grę z parametrem: dist/index.html?ps=127.0.0.1
import express from 'express';
import http from 'node:http';
import { ExpressPeerServer } from 'peer';

const app = express();
const server = http.createServer(app);
app.use('/bar', ExpressPeerServer(server, { path: '/' }));
server.listen(9000, '127.0.0.1', () => console.log('PeerServer: ws://127.0.0.1:9000/bar'));
