import { supabase } from './supabase';
import { FreeDiagnosis, AdvancedDiagnosis } from './gemini';

export type DiagnosisStatus = 'open' | 'watching' | 'resolved';

export interface SavedDiagnosis {
  id: string;
  user_id: string;
  category: string;
  description: string;
  diagnosis_data: FreeDiagnosis | AdvancedDiagnosis;
  is_advanced: boolean;
  created_at: string;
  status: DiagnosisStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  follow_up_at: string | null;
}

export interface DiagnosisUpdate {
  status?: DiagnosisStatus;
  resolution_note?: string | null;
  resolved_at?: string | null;
  follow_up_at?: string | null;
}

export async function saveDiagnosis(
  userId: string,
  category: string,
  description: string,
  diagnosisData: FreeDiagnosis | AdvancedDiagnosis,
  isAdvanced: boolean
): Promise<{ data: SavedDiagnosis | null; error: Error | null }> {
  try {
    // Set follow_up_at to 3 days from now
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 3);

    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        user_id: userId,
        category,
        description,
        diagnosis_data: diagnosisData,
        is_advanced: isAdvanced,
        status: 'open',
        follow_up_at: followUpDate.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { data: data as SavedDiagnosis, error: null };
  } catch (error) {
    console.error('Error saving diagnosis:', error);
    return { data: null, error: error as Error };
  }
}

export async function updateDiagnosis(
  diagnosisId: string,
  updates: DiagnosisUpdate
): Promise<{ data: SavedDiagnosis | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('diagnoses')
      .update(updates)
      .eq('id', diagnosisId)
      .select()
      .single();

    if (error) throw error;
    return { data: data as SavedDiagnosis, error: null };
  } catch (error) {
    console.error('Error updating diagnosis:', error);
    return { data: null, error: error as Error };
  }
}

export async function getUserDiagnoses(
  userId: string
): Promise<{ data: SavedDiagnosis[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: (data as SavedDiagnosis[]) || [], error: null };
  } catch (error) {
    console.error('Error fetching diagnoses:', error);
    return { data: [], error: error as Error };
  }
}

export async function getDiagnosisById(
  diagnosisId: string
): Promise<{ data: SavedDiagnosis | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .eq('id', diagnosisId)
      .single();

    if (error) throw error;
    return { data: data as SavedDiagnosis, error: null };
  } catch (error) {
    console.error('Error fetching diagnosis:', error);
    return { data: null, error: error as Error };
  }
}

export async function deleteDiagnosis(
  diagnosisId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('diagnoses')
      .delete()
      .eq('id', diagnosisId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting diagnosis:', error);
    return { error: error as Error };
  }
}

export async function getDueFollowUp(
  userId: string
): Promise<{ data: SavedDiagnosis | null; error: Error | null }> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'resolved')
      .lte('follow_up_at', now)
      .order('follow_up_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { data: data as SavedDiagnosis | null, error: null };
  } catch (error) {
    console.error('Error fetching due follow-up:', error);
    return { data: null, error: error as Error };
  }
}

// Helper to get category display info
export function getCategoryInfo(category: string): { name: string; emoji: string } {
  const categories: Record<string, { name: string; emoji: string }> = {
    plumbing: { name: 'Plumbing', emoji: '🚰' },
    electrical: { name: 'Electrical', emoji: '⚡' },
    appliances: { name: 'Appliances', emoji: '🔧' },
    hvac: { name: 'HVAC', emoji: '❄️' },
    automotive: { name: 'Automotive', emoji: '🚗' },
    other: { name: 'Other', emoji: '🏠' },
  };
  return categories[category] || { name: 'Unknown', emoji: '❓' };
}

// Helper to format date nicely
export function formatDiagnosisDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}
