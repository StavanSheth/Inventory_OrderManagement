import seedDataJson from './seed-data.json';

export interface SeedData {
  branches: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    address?: string;
    phone?: string;
    email?: string;
    timezone: string;
  }>;
  categories: Array<{
    id: string;
    branch_id: string;
    name: string;
    active: number;
    sort_order: number;
  }>;
  products: Array<{
    id: string;
    branch_id: string;
    category_id: string;
    name: string;
    description: string;
    price: number;
    active: number;
  }>;
  raw_materials: Array<{
    id: string;
    branch_id: string;
    name: string;
    unit: string;
    current_quantity: number;
    reorder_threshold: number;
    active: number;
  }>;
  inventory: Array<{
    id: string;
    branch_id: string;
    product_id: string;
    quantity: number;
    reorder_threshold: number;
  }>;
}

export const seedData: SeedData = seedDataJson as SeedData;
