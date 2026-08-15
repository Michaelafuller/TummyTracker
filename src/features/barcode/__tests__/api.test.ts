import { fetchOffSearchResults } from '../api';

function mockFetchOnce(body: unknown) {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

describe('fetchOffSearchResults', () => {
  it('requests search.openfoodfacts.org/search with q and langs, and no sort_by', async () => {
    const mockFetch = mockFetchOnce({ hits: [] });
    await fetchOffSearchResults('banana');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://search.openfoodfacts.org/search');
    expect(requestedUrl.searchParams.get('q')).toBe('banana');
    expect(requestedUrl.searchParams.get('langs')).toBe('en');
    expect(requestedUrl.searchParams.get('page_size')).toBe('24');
    expect(requestedUrl.searchParams.has('sort_by')).toBe(false);
    expect(requestedUrl.searchParams.has('search_terms')).toBe(false);
    expect(requestedUrl.searchParams.has('search_simple')).toBe(false);
    expect(requestedUrl.searchParams.has('action')).toBe(false);
    expect(requestedUrl.searchParams.has('json')).toBe(false);
    expect(requestedUrl.searchParams.get('fields')).toContain('product_name_en');
  });

  it('sends a contact-email User-Agent', async () => {
    const mockFetch = mockFetchOnce({ hits: [] });
    await fetchOffSearchResults('banana');

    const options = mockFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(options.headers['User-Agent']).toBe('TummyTracker/1.0 (michaellovesellen@gmail.com)');
  });
});
