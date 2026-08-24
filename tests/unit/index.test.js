const { ping } = require('../../src/index');

test('ping devuelve pong', () => {
  expect(ping()).toBe('pong');
});
