import test from "node:test";
import assert from "node:assert/strict";
import {
  RustChainApiError,
  RustChainClient,
  RustChainValidationError,
  createClient
} from "../src/index.js";

function mockFetch(handler) {
  return async (url, init) => {
    const result = await handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => result.body ?? "{}"
    };
  };
}

test("creates a client with defaults", () => {
  const client = createClient({ fetch: mockFetch(() => ({ status: 200 })) });
  assert.equal(client.baseUrl, "https://rustchain.org");
});

test("normalizes base URL", () => {
  const client = new RustChainClient({
    baseUrl: "https://example.test///",
    fetch: mockFetch(() => ({ status: 200 }))
  });
  assert.equal(client.baseUrl, "https://example.test");
});

test("fetches health endpoint", async () => {
  const client = new RustChainClient({
    baseUrl: "https://node.test",
    fetch: mockFetch((url, init) => {
      assert.equal(url, "https://node.test/health");
      assert.equal(init.method, "GET");
      return { status: 200, body: JSON.stringify({ ok: true, version: "2.2.1-rip200" }) };
    })
  });

  assert.deepEqual(await client.health(), { ok: true, version: "2.2.1-rip200" });
});

test("normalizes miners array responses", async () => {
  const client = new RustChainClient({
    fetch: mockFetch((url) => {
      assert.equal(url, "https://rustchain.org/api/miners?limit=5&offset=2&hardware_type=PowerPC");
      return { status: 200, body: JSON.stringify({ miners: [{ miner: "alice" }] }) };
    })
  });

  assert.deepEqual(await client.miners({ limit: 5, offset: 2, hardwareType: "PowerPC" }), [{ miner: "alice" }]);
});

test("validates balance miner id", async () => {
  const client = new RustChainClient({ fetch: mockFetch(() => ({ status: 200 })) });
  await assert.rejects(() => client.balance(""), RustChainValidationError);
});

test("posts signed transfer payload", async () => {
  const client = new RustChainClient({
    fetch: mockFetch((url, init) => {
      assert.equal(url, "https://rustchain.org/wallet/transfer/signed");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        from_address: "alice",
        to_address: "bob",
        amount_rtc: 1.25,
        nonce: "nonce-123",
        signature: "sig-abc",
        public_key: "pub-xyz"
      });
      return { status: 200, body: JSON.stringify({ success: true }) };
    })
  });

  assert.deepEqual(
    await client.transfer({
      fromAddress: "alice",
      toAddress: "bob",
      amountRtc: 1.25,
      nonce: "nonce-123",
      signature: "sig-abc",
      publicKey: "pub-xyz"
    }),
    { success: true }
  );
});

test("fetches transfer history by miner id", async () => {
  const client = new RustChainClient({
    fetch: mockFetch((url, init) => {
      assert.equal(url, "https://rustchain.org/wallet/history?miner_id=alice&limit=10");
      assert.equal(init.method, "GET");
      return { status: 200, body: JSON.stringify({ ok: true, transactions: [] }) };
    })
  });

  assert.deepEqual(await client.transferHistory({ minerId: "alice", limit: 10 }), { ok: true, transactions: [] });
});

test("fetches transfer history by address", async () => {
  const client = new RustChainClient({
    fetch: mockFetch((url) => {
      assert.equal(url, "https://rustchain.org/wallet/history?address=addr1");
      return { status: 200, body: JSON.stringify({ ok: true, transactions: [] }) };
    })
  });

  assert.deepEqual(await client.transferHistory({ address: "addr1" }), { ok: true, transactions: [] });
});

test("validates transfer history identifier", async () => {
  const client = new RustChainClient({ fetch: mockFetch(() => ({ status: 200 })) });
  await assert.rejects(() => client.transferHistory(), RustChainValidationError);
});

test("throws API errors with status and endpoint", async () => {
  const client = new RustChainClient({
    fetch: mockFetch(() => ({ status: 500, body: JSON.stringify({ error: "boom" }) }))
  });

  await assert.rejects(
    () => client.epoch(),
    (error) => error instanceof RustChainApiError && error.status === 500 && error.endpoint === "/epoch"
  );
});
