import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useOffLookup } from '@/features/barcode/useOffLookup';
import { usePrefillStore } from '@/features/logging/prefillStore';
import { useTheme } from '@/hooks/use-theme';
import { offProductToFormState } from '@/lib/openFoodFacts';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;

export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState<string | null>(null);
  const navigated = useRef(false);

  const lookup = useOffLookup(barcode);
  const setPrefill = usePrefillStore((state) => state.setPrefill);

  // Once a scan settles (found, missed, or errored), prefill and head to the form.
  useEffect(() => {
    if (!barcode || navigated.current || lookup.isLoading) return;

    if (lookup.isSuccess && lookup.data.found) {
      setPrefill(offProductToFormState(lookup.data));
    } else {
      // Miss or network error → manual entry with the barcode attached.
      setPrefill({ barcode });
    }
    navigated.current = true;
    router.replace('/entry/new');
  }, [barcode, lookup.isLoading, lookup.isSuccess, lookup.data, setPrefill, router]);

  if (!permission) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (!permission.granted) {
    return (
      <Centered>
        <ThemedText type="smallBold">Camera access needed</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.permissionText}>
          TummyTracker uses the camera to scan product barcodes.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
          onPress={requestPermission}
          style={[styles.button, { backgroundColor: theme.text }]}>
          <ThemedText style={{ color: theme.background }}>Grant access</ThemedText>
        </Pressable>
      </Centered>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        // Stop scanning once we have a code (handler becomes undefined).
        onBarcodeScanned={barcode ? undefined : ({ data }) => setBarcode(data)}
      />
      {/* Non-interactive reticle + hint overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.reticle} />
        <ThemedText style={styles.hint}>
          {barcode ? 'Looking up product…' : 'Point at a product barcode'}
        </ThemedText>
        {barcode ? <ActivityIndicator color="#fff" /> : null}
      </View>
      {/* Manual-entry escape hatch — rendered in its own touchable layer */}
      {!barcode && (
        <View style={styles.manualButtonContainer} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enter product manually"
            onPress={() => router.replace('/entry/new')}
            style={styles.manualButton}>
            <ThemedText style={styles.manualButtonLabel}>Enter manually</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <ThemedView style={styles.centered}>{children}</ThemedView>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  permissionText: {
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  reticle: {
    width: '70%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: Spacing.three,
  },
  hint: {
    color: '#fff',
    fontWeight: 600,
  },
  manualButtonContainer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  manualButton: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  manualButtonLabel: {
    color: '#000',
    fontWeight: Platform.select({ android: 700 }) ?? 600,
    fontSize: 15,
  },
});
