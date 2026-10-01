// Frontend custom hook definitions (Phase 1 foundation)
export interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}
