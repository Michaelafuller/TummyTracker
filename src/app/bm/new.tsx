import { useRouter } from 'expo-router';
import { useState } from 'react';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { createLogEntry } from '@/db/repository';
import { BmForm } from '@/features/bm/BmForm';
import type { BuiltBmEntry } from '@/features/bm/formModel';

export default function NewBowelMovementScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(entry: BuiltBmEntry) {
    setSubmitting(true);
    try {
      await createLogEntry(entry);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScrollView>
      <BmForm onSubmit={handleSubmit} submitLabel="Save" submitting={submitting} />
    </FormScrollView>
  );
}
