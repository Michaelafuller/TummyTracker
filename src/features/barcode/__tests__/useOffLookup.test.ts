import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useOffLookup } from '../useOffLookup';

jest.mock('../api', () => ({
  fetchOffProduct: jest.fn().mockResolvedValue({ found: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  usePrefsStore.setState({ offlineMode: false, loaded: true });
});

describe('useOffLookup', () => {
  it('is idle (disabled) when barcode is null', async () => {
    const { result } = await renderHook(() => useOffLookup(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isPending).toBe(true);
  });

  it('is idle (disabled) when offline mode is active', async () => {
    usePrefsStore.setState({ offlineMode: true, loaded: true });
    const { result } = await renderHook(() => useOffLookup('0123456789'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is not idle when a barcode is present and offline mode is off', async () => {
    const { result } = await renderHook(() => useOffLookup('0123456789'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
