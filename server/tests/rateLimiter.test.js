const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../rateLimiter');

function mockReq(ip) {
  return { ip };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    set(header, value) {
      this.headers[header] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('rateLimiter blocks after exceeding the threshold', () => {
  const limiter = createRateLimiter({ windowMs: 100, max: 2 });

  let nextCalled = 0;
  const next = () => {
    nextCalled += 1;
  };

  const res1 = mockRes();
  limiter(mockReq('1.1.1.1'), res1, next);
  const res2 = mockRes();
  limiter(mockReq('1.1.1.1'), res2, next);

  assert.equal(nextCalled, 2);

  const res3 = mockRes();
  limiter(mockReq('1.1.1.1'), res3, next);
  assert.equal(res3.statusCode, 429);
  assert.equal(res3.payload.error.includes('Too many requests'), true);
});
