import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';

import AppTabs from '../app-tabs';

// expo-router's real <Tabs>/<Tabs.Screen> need a navigation context this unit
// test doesn't set up, and <Tabs.Screen> renders no host node RNTL's query
// engine could find anyway (it's a config element, consumed by the real
// navigator). Mock <Tabs.Screen> as a spy instead, so this test can inspect
// exactly which screens AppTabs registers and in what order (HANDOFF.md §5:
// Settings leaves the tab bar, Meds joins between Journal and Insights).
const mockTabsScreen = jest.fn().mockReturnValue(null);
function MockTabs({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
MockTabs.Screen = (props: unknown) => mockTabsScreen(props);
jest.mock('expo-router', () => ({ Tabs: MockTabs }));

interface TabsScreenProps {
  name: string;
  options: {
    title: string;
    tabBarLabel: string;
    tabBarButtonTestID: string;
  };
}

function registeredScreens(): TabsScreenProps[] {
  return mockTabsScreen.mock.calls.map(([props]) => props as TabsScreenProps);
}

beforeEach(() => {
  mockTabsScreen.mockClear();
});

describe('AppTabs', () => {
  it('has no settings tab, and registers a meds tab between journal and insights', async () => {
    await render(<AppTabs />);
    const names = registeredScreens().map((props) => props.name);

    expect(names).not.toContain('settings');
    expect(names).toEqual(['index', 'explore', 'meds', 'insights', 'goals']);
  });

  it('the meds tab has the right title and testID', async () => {
    await render(<AppTabs />);
    const meds = registeredScreens().find((props) => props.name === 'meds');

    expect(meds?.options.title).toBe('Meds');
    expect(meds?.options.tabBarLabel).toBe('Meds');
    expect(meds?.options.tabBarButtonTestID).toBe('tab-meds');
  });
});
