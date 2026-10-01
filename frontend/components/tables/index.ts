// Table component boundary exports (Phase 1 foundation)
export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  width?: string | number;
}
