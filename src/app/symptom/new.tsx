import { useRouter } from 'expo-router';
import { useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { createLogEntries } from '@/db/repository';
import { SymptomForm } from '@/features/symptoms/SymptomForm';
import type { BuiltSymptomEntry } from '@/features/symptoms/formModel';

export default function NewSymptomScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(entries: BuiltSymptomEntry[]) {
    setSubmitting(true);
    try {
      await createLogEntries(entries);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScrollView>
      <SymptomForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
    </FormScrollView>
  );
}
