import { useRouter } from 'expo-router';
import { useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { createMedication } from '@/db/repository';
import type { BuiltMedication } from '@/features/medications/formModel';
import { MedicationForm } from '@/features/medications/MedicationForm';

export default function NewMedicationScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(medication: BuiltMedication) {
    setSubmitting(true);
    try {
      await createMedication(medication);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScrollView>
      <MedicationForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
    </FormScrollView>
  );
}
