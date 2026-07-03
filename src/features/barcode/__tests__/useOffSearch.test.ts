import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useOffSearch } from '../useOffSearch';

jest.mock('../api', () => ({
  fetchOffSearchResults: jest.fn().mockResolvedValue([]),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
});

describe('useOffSearch', () => {
  it('is idle (disabled) when query is null', async () => {
    const { result } = await renderHook(() => useOffSearch(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is idle (disabled) when the query is shorter than 2 chars', async () => {
    const { result } = await renderHook(() => useOffSearch('a'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is idle (disabled) when offline mode is active', async () => {
    usePrefsStore.setState({ offlineMode: true, loaded: true });
    const { result } = await renderHook(() => useOffSearch('banana'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is not idle when a valid query is present and offline mode is off', async () => {
    const { result } = await renderHook(() => useOffSearch('banana'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
