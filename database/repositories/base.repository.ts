import { D1DatabaseLike } from '../types';

export abstract class BaseRepository {
  constructor(protected readonly db: D1DatabaseLike) {}
}
