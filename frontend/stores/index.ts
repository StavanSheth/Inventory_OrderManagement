// Frontend store boundary (Phase 1 foundation)
export interface StoreListener<T> {
  (state: T): void;
}
