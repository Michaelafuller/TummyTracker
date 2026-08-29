import { getKeyboardController } from '../keyboard';

describe('getKeyboardController', () => {
  it('returns null when the native TurboModule is not registered (default Jest env)', () => {
    expect(getKeyboardController()).toBeNull();
  });

  it('returns null on repeated calls without throwing', () => {
    expect(getKeyboardController()).toBeNull();
    expect(getKeyboardController()).toBeNull();
  });
});

describe('getKeyboardController when the native module is registered', () => {
  it('requires and caches the module, probing the TurboModule registry only once', () => {
    jest.isolateModules(() => {
      // A fresh `require('react-native')` inside this isolated module
      // registry, spied in place (not replaced by a mock factory — spreading
      // the real module's exports to build a factory return value forces
      // every lazy `Object.defineProperty` getter on it to evaluate eagerly,
      // which crashes under Jest for native-only singletons like DevMenu).
      // `../keyboard`, required next in the same sandbox, resolves 'react-native'
      // to this same cached, spied instance.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above.
      const RN = require('react-native');
      const getSpy = jest.spyOn(RN.TurboModuleRegistry, 'get').mockReturnValue({});

      // The *real* `react-native-keyboard-controller` package still performs
      // its own native-linking check on import (independent of our probe)
      // and throws under Jest regardless, since the native side genuinely
      // isn't registered in this environment — that's the correct "old
      // client" path, already covered by the default-env tests above. To
      // exercise the "native module present" success path we stub the
      // package itself, standing in for a client built after the owner's
      // next EAS build actually links it.
      const fakeModule = { KeyboardProvider: () => null };
      jest.doMock('react-native-keyboard-controller', () => fakeModule);

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolated re-require needed to pick up the spy/mock above.
      const { getKeyboardController: freshGetKeyboardController } = require('../keyboard');

      const first = freshGetKeyboardController();
      const second = freshGetKeyboardController();

      expect(first).toBe(fakeModule);
      expect(second).toBe(first);
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith('KeyboardController');

      getSpy.mockRestore();
    });
  });

  it('returns null and swallows the error when require() throws after a positive probe', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment in the test above.
      const RN = require('react-native');
      jest.spyOn(RN.TurboModuleRegistry, 'get').mockReturnValue({});

      jest.doMock('react-native-keyboard-controller', () => {
        throw new Error('module not found');
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolated re-require needed to pick up the doMock above.
      const { getKeyboardController: freshGetKeyboardController } = require('../keyboard');

      expect(freshGetKeyboardController()).toBeNull();
    });
  });
});
