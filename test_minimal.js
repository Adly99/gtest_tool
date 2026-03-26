import http from 'http';
const server = http.createServer((req, res) => res.end('native hello'));
server.listen(3000, () => {
    console.log("Listening via native HTTP on port 3000");
});
// deliberately keep loop alive manually
setInterval(() => console.log("Alive"), 1000);
