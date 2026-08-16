import { listGoals, removeGoal, upsertGoal } from '@/db/repository';
import type { Goal } from '@/db/schema';
import { refreshCheckInIfEnabled } from '../checkInService';
import { useGoalsStore } from '../goalsStore';

jest.mock('@/db/repository', () => ({
  listGoals: jest.fn(),
  upsertGoal: jest.fn(),
  removeGoal: jest.fn(),
}));

jest.mock('../checkInService', () => ({
  refreshCheckInIfEnabled: jest.fn().mockResolvedValue(undefined),
}));

const PROTEIN_GOAL: Goal = { id: 'g1', nutrient: 'proteinG', direction: 'floor', threshold: 50, createdAt: 100 };
const FAT_GOAL: Goal = { id: 'g2', nutrient: 'fatG', direction: 'cap', threshold: 20, createdAt: 200 };

beforeEach(() => {
  useGoalsStore.setState({ goals: [], loaded: false });
  jest.clearAllMocks();
});

describe('goalsStore.load', () => {
  it('reads from listGoals and marks loaded:true', async () => {
    (listGoals as jest.Mock).mockResolvedValue([PROTEIN_GOAL]);
    await useGoalsStore.getState().load();
    expect(useGoalsStore.getState().goals).toEqual([PROTEIN_GOAL]);
    expect(useGoalsStore.getState().loaded).toBe(true);
  });
});

describe('goalsStore.upsert', () => {
  it('calls upsertGoal then refreshes goals from the repository', async () => {
    (upsertGoal as jest.Mock).mockResolvedValue(PROTEIN_GOAL);
    (listGoals as jest.Mock).mockResolvedValue([PROTEIN_GOAL]);
    await useGoalsStore.getState().upsert('proteinG', 'floor', 50);
    expect(upsertGoal).toHaveBeenCalledWith('proteinG', 'floor', 50);
    expect(useGoalsStore.getState().goals).toEqual([PROTEIN_GOAL]);
  });

  it('re-arms the check-in so its copy reflects the edited goal', async () => {
    (upsertGoal as jest.Mock).mockResolvedValue(PROTEIN_GOAL);
    (listGoals as jest.Mock).mockResolvedValue([PROTEIN_GOAL]);
    await useGoalsStore.getState().upsert('proteinG', 'floor', 50);
    expect(refreshCheckInIfEnabled).toHaveBeenCalled();
  });
});

describe('goalsStore.remove', () => {
  it('calls removeGoal then refreshes goals from the repository', async () => {
    useGoalsStore.setState({ goals: [PROTEIN_GOAL, FAT_GOAL], loaded: true });
    (removeGoal as jest.Mock).mockResolvedValue(undefined);
    (listGoals as jest.Mock).mockResolvedValue([FAT_GOAL]);
    await useGoalsStore.getState().remove('proteinG');
    expect(removeGoal).toHaveBeenCalledWith('proteinG');
    expect(useGoalsStore.getState().goals).toEqual([FAT_GOAL]);
  });

  it('re-arms the check-in after removing a goal', async () => {
    useGoalsStore.setState({ goals: [PROTEIN_GOAL, FAT_GOAL], loaded: true });
    (removeGoal as jest.Mock).mockResolvedValue(undefined);
    (listGoals as jest.Mock).mockResolvedValue([FAT_GOAL]);
    await useGoalsStore.getState().remove('proteinG');
    expect(refreshCheckInIfEnabled).toHaveBeenCalled();
  });
});
