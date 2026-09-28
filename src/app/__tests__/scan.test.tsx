import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import ScanScreen from '../scan';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Only the permission-not-granted path is under test here (HANDOFF.md #16
// §3) — no camera/barcode behavior to mock beyond the permission hook.
const mockRequestPermission = jest.fn();
let mockPermission: { granted: boolean } | null = { granted: false };
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: () => null,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { granted: false };
});

describe('ScanScreen — camera permission not granted', () => {
  it('offers "Enter manually" alongside "Grant access"', async () => {
    const { findByLabelText } = await render(<ScanScreen />, { wrapper });

    expect(await findByLabelText('Grant camera permission')).toBeTruthy();
    expect(await findByLabelText('Enter product manually')).toBeTruthy();
  });

  it('"Enter manually" replaces with /meal/component without requesting the permission', async () => {
    const { findByLabelText } = await render(<ScanScreen />, { wrapper });

    await fireEvent.press(await findByLabelText('Enter product manually'));

    expect(mockReplace).toHaveBeenCalledWith('/meal/component');
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
