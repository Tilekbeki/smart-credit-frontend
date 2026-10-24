import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiError,
  createApplication,
  downloadDocument,
  getAccessToken,
  getProfiles,
  listApplications,
  requestOtp,
  setAccessToken,
  setUnauthorizedHandler,
  submitApplication,
  updateApplication,
  uploadDocument,
  verifyOtp,
} from '../src/api.js';

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    setAccessToken(null);
    setUnauthorizedHandler(null);
  }
}

test('public profile and OTP requests omit bearer token and use exact JSON DTOs', async () => {
  setAccessToken('private-jwt');
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: true }, { status: url.endsWith('/request') ? 201 : 200 });
  }, async () => {
    await getProfiles();
    await requestOtp('profile-1');
    await verifyOtp('challenge-1', '1234');
  });

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/v1/demo/profiles',
    '/api/v1/auth/otp/request',
    '/api/v1/auth/otp/verify',
  ]);
  assert.ok(calls.every(({ options }) => !options.headers.has('Authorization')));
  assert.equal(calls[0].options.headers.has('Content-Type'), false);
  assert.equal(calls[1].options.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[1].options.body), { profileId: 'profile-1' });
  assert.deepEqual(JSON.parse(calls[2].options.body), { otpRequestId: 'challenge-1', code: '1234' });
});

test('draft create, patch and list pass bearer token, version and exact query', async () => {
  setAccessToken('jwt');
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ items: [], version: 2 });
  }, async () => {
    await createApplication({ productId: 'turnover' });
    await updateApplication('draft-1', { version: 1, requestedAmountRub: 900000 });
    await listApplications({ status: 'draft', limit: 20, offset: 0 });
  });

  assert.ok(calls.every(({ options }) => options.headers.get('Authorization') === 'Bearer jwt'));
  assert.equal(calls[0].url, '/api/v1/applications');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { productId: 'turnover' });
  assert.equal(calls[1].url, '/api/v1/applications/draft-1');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), { version: 1, requestedAmountRub: 900000 });
  assert.equal(calls[2].url, '/api/v1/applications?status=draft&limit=20&offset=0');
  assert.equal(calls[2].options.headers.has('Content-Type'), false);
});

test('submit sends no body or JSON Content-Type', async () => {
  setAccessToken('jwt');
  await withFetch(async (url, options) => {
    assert.equal(url, '/api/v1/applications/draft-1/submit');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer jwt');
    assert.equal(options.headers.has('Content-Type'), false);
    assert.equal(Object.hasOwn(options, 'body'), false);
    return Response.json({ status: 'submitted' }, { status: 202 });
  }, async () => {
    assert.deepEqual(await submitApplication('draft-1'), { status: 'submitted' });
  });
});

test('document upload uses exactly two multipart fields and download uses authenticated binary fetch', async () => {
  setAccessToken('jwt');
  const file = new File(['%PDF-example'], 'statement.pdf', { type: 'application/pdf' });
  let calls = 0;
  await withFetch(async (url, options) => {
    calls += 1;
    assert.equal(options.headers.get('Authorization'), 'Bearer jwt');
    assert.equal(options.headers.has('Content-Type'), false);
    if (calls === 1) {
      assert.equal(url, '/api/v1/applications/draft-1/documents');
      assert.equal(options.method, 'POST');
      assert.ok(options.body instanceof FormData);
      assert.deepEqual([...options.body.keys()], ['documentType', 'file']);
      assert.equal(options.body.get('documentType'), 'BANK_STATEMENT');
      assert.equal(options.body.get('file').name, 'statement.pdf');
      return Response.json({ documentId: 'doc-1' }, { status: 201 });
    }
    assert.equal(url, '/api/v1/applications/draft-1/documents/doc-1');
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: { 'Content-Type': 'application/pdf' },
    });
  }, async () => {
    await uploadDocument('draft-1', 'BANK_STATEMENT', file);
    const blob = await downloadDocument('draft-1', 'doc-1');
    assert.ok(blob instanceof Blob);
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [37, 80, 68, 70]);
  });
  assert.equal(calls, 2);
});

test('backend validation details and status remain available to forms', async () => {
  setAccessToken('jwt');
  await withFetch(async () => Response.json({
    error: 'validation_failed',
    message: 'Проверьте документы.',
    details: [{ field: 'documents.EQUIPMENT_INVOICE', code: 'required_document_missing', message: 'Загрузите документ.' }],
  }, { status: 422 }), async () => {
    await assert.rejects(submitApplication('draft-1'), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 422);
      assert.equal(error.code, 'validation_failed');
      assert.equal(error.details[0].field, 'documents.EQUIPMENT_INVOICE');
      return true;
    });
  });
});

test('401 on a protected request clears the in-memory token and notifies once', async () => {
  setAccessToken('expired-jwt');
  let notifications = 0;
  setUnauthorizedHandler(() => { notifications += 1; });
  await withFetch(async () => Response.json({ error: 'unauthorized', message: 'Повторите вход.' }, { status: 401 }), async () => {
    await assert.rejects(createApplication({}), (error) => error.status === 401 && error.code === 'unauthorized');
    assert.equal(getAccessToken(), null);
    assert.equal(notifications, 1);
    await assert.rejects(getProfiles(), (error) => error.status === 401);
    assert.equal(notifications, 1);
  });
});

test('network and malformed success responses have distinct error codes', async () => {
  await withFetch(async () => { throw new TypeError('offline'); }, async () => {
    await assert.rejects(getProfiles(), (error) => error instanceof ApiError && error.code === 'network_error' && error.status === 0);
  });
  await withFetch(async () => new Response('not-json', { status: 200 }), async () => {
    await assert.rejects(getProfiles(), (error) => error instanceof ApiError && error.code === 'invalid_response');
  });
});
