import assert from 'node:assert';
import http from 'node:http';

function startServer(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function performRequest(app, method, path, headers, body) {
  const server = await startServer(app);
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body,
  });
  const text = await response.text();
  let parsedBody;
  try {
    parsedBody = JSON.parse(text);
  } catch (_err) {
    parsedBody = text;
  }
  await stopServer(server);
  return {
    status: response.status,
    body: parsedBody,
    text,
    headers: response.headers,
  };
}

class TestRequest {
  constructor(app, method, path) {
    this.app = app;
    this.method = method;
    this.path = path;
    this.headers = {};
    this.payload = undefined;
  }

  set(name, value) {
    this.headers[name] = value;
    return this;
  }

  send(body) {
    this.payload = body;
    if (body && typeof body === 'object') {
      this.headers['content-type'] = this.headers['content-type'] || 'application/json';
      this.payload = JSON.stringify(body);
    }
    return this;
  }

  async expect(status, matcher) {
    const res = await this.then();
    if (status !== undefined) {
      assert.strictEqual(res.status, status);
    }
    if (matcher !== undefined) {
      assert.deepStrictEqual(res.body, matcher);
    }
    return res;
  }

  then(resolve, reject) {
    return performRequest(this.app, this.method, this.path, this.headers, this.payload).then(resolve, reject);
  }
}

class SuperTestClient {
  constructor(app) {
    this.app = app;
  }

  get(path) {
    return new TestRequest(this.app, 'GET', path);
  }

  post(path) {
    return new TestRequest(this.app, 'POST', path);
  }

  put(path) {
    return new TestRequest(this.app, 'PUT', path);
  }

  delete(path) {
    return new TestRequest(this.app, 'DELETE', path);
  }
}

export default function request(app) {
  return new SuperTestClient(app);
}
