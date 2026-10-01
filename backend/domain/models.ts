export interface DomainEntity<TId = string> {
  id: TId;
  createdAt: Date;
  updatedAt: Date;
}
