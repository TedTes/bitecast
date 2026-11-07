import { useLocalSearchParams } from 'expo-router';
import { LogForm } from '@/features/log-form';
export default function EditLogScreen() { const { id } = useLocalSearchParams<{ id: string }>(); return <LogForm editId={id} />; }
