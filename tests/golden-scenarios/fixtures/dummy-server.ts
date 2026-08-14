/**
 * dummy-server.ts — GSS 测试假服务（bootstrap/assert 的注入入口，测试专用）
 *
 * 用途: bootstrap.ts 的 --entry 注入目标（铁律 12: 测真实 spawn/healthz/kill 路径，
 *       不 mock 管线——用最小假服务代替整个应用）。
 * 行为: /api/healthz → {status:"healthy"}；/api/data → {value:42}；其余 404。
 */
import * as http from 'http';

const port = Number(process.env.PORT || 3111);
const server = http.createServer((req, res) => {
  if (req.url === '/api/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', checks: {} }));
  } else if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ value: 42, name: 'dummy' }));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`dummy-server listening on ${port}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
