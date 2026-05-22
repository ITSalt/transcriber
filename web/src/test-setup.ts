import "@testing-library/jest-dom";

// jsdom's AbortSignal (created via globalThis.AbortController) is not an
// instance of undici's AbortSignal. When react-router 7 internally builds a
// navigation Request, the Request constructor (jsdom → undici) does a webidl
// instanceof check on the signal and throws:
//   TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an
//   instance of AbortSignal
// All tests that exercise navigation in this test-environment mock fetch, so
// the signal is never actually used. Strip it before delegating to the real
// constructor. Production code is unaffected — this only runs in vitest.
const OriginalRequest = globalThis.Request;
class PatchedRequest extends OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal: _signal, ...rest } = init;
      super(input, rest);
    } else {
      super(input, init);
    }
  }
}
globalThis.Request = PatchedRequest as typeof Request;
