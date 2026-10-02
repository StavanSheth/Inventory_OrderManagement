import { D1DatabaseLike } from '../types';
import { hashPin } from '../../backend/services/auth/pin-hasher';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { InventoryMovementType, InventoryItemType } from '../../shared/enums/inventory.enum';
import { DiscountType, OfferType } from '../../shared/enums/promotions.enum';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';

export interface ComprehensiveSeedResult {
  branches: number;
  branchSettings: number;
  users: number;
  memberships: number;
  customerProfiles: number;
  categories: number;
  products: number;
  rawMaterials: number;
  productComponents: number;
  inventory: number;
  inventoryMovements: number;
  offers: number;
  coupons: number;
  orders: number;
  orderItems: number;
  payments: number;
  couponUsages: number;
  auditLogs: number;
  applicationSessions: number;
}

export async function runComprehensiveSeed(db: D1DatabaseLike): Promise<ComprehensiveSeedResult> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const now = new Date();
  const nowIso = now.toISOString();

  const minutesAgo = (mins: number) => new Date(now.getTime() - mins * 60 * 1000).toISOString();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const daysAhead = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  // --------------------------------------------------------------------------
  // 1. Branches (covering ACTIVE, INACTIVE, and CLOSED)
  // --------------------------------------------------------------------------
  const branches = [
    {
      id: 'branch-alpha',
      name: 'Melt Parlour - Downtown Alpha',
      code: 'ALPHA-01',
      status: BranchStatus.ACTIVE,
      address: '101 Scoop Boulevard, Alpha District, Mumbai',
      phone: '+91 90000 00001',
      email: 'alpha@melt.example.internal',
      timezone: 'Asia/Kolkata',
    },
    {
      id: 'branch-beta',
      name: 'Melt Parlour - Uptown Beta',
      code: 'BETA-02',
      status: BranchStatus.ACTIVE,
      address: '202 Waffle Avenue, Beta Heights, Mumbai',
      phone: '+91 90000 00002',
      email: 'beta@melt.example.internal',
      timezone: 'Asia/Kolkata',
    },
    {
      id: 'branch-gamma',
      name: 'Melt Parlour - West End Express',
      code: 'GAMMA-03',
      status: BranchStatus.INACTIVE,
      address: '303 Terminal Concourse, West End',
      phone: '+91 90000 00003',
      email: 'gamma@melt.example.internal',
      timezone: 'Asia/Kolkata',
    },
    {
      id: 'branch-delta',
      name: 'Melt Parlour - Seaside Kiosk',
      code: 'DELTA-04',
      status: BranchStatus.CLOSED,
      address: '404 Coastal Promenade, Delta Sands',
      phone: '+91 90000 00004',
      email: 'delta@melt.example.internal',
      timezone: 'Asia/Kolkata',
    },
  ];

  for (const b of branches) {
    await db
      .prepare(`
        INSERT INTO branches (id, name, code, status, address, phone, email, timezone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          updated_at = excluded.updated_at
      `)
      .bind(b.id, b.name, b.code, b.status, b.address, b.phone, b.email, b.timezone, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 2. Branch Settings
  // --------------------------------------------------------------------------
  for (const b of branches) {
    await db
      .prepare(`
        INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, configuration_json, updated_at)
        VALUES (?, ?, 8, 'HOURS', 15, 60, '{}', ?)
        ON CONFLICT(branch_id) DO UPDATE SET
          session_timeout_value = excluded.session_timeout_value,
          updated_at = excluded.updated_at
      `)
      .bind(`settings-${b.id}`, b.id, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 3. Users (Owner, Operators, and Customers)
  // --------------------------------------------------------------------------
  const defaultPinHash = await hashPin('123456');

  const users = [
    {
      id: 'usr-owner-1',
      firebase_uid: 'fb-owner-master',
      email: 'owner@melt.example.com',
      display_name: 'Stavan Sheth (Owner)',
      phone: '+91 98765 00001',
      role: UserRole.OWNER,
      pin_hash: defaultPinHash,
    },
    {
      id: 'usr-op-alpha',
      firebase_uid: 'fb-op-alpha',
      email: 'operator.alpha@melt.example.com',
      display_name: 'Raj Patel (Alpha Lead)',
      phone: '+91 98765 00002',
      role: UserRole.CUSTOMER,
      pin_hash: defaultPinHash,
    },
    {
      id: 'usr-op-beta',
      firebase_uid: 'fb-op-beta',
      email: 'operator.beta@melt.example.com',
      display_name: 'Priya Sharma (Beta Manager)',
      phone: '+91 98765 00003',
      role: UserRole.CUSTOMER,
      pin_hash: defaultPinHash,
    },
    {
      id: 'usr-cust-alice',
      firebase_uid: 'fb-cust-alice',
      email: 'alice@example.com',
      display_name: 'Alice Walker',
      phone: '+91 98765 11111',
      role: UserRole.CUSTOMER,
      pin_hash: null,
    },
    {
      id: 'usr-cust-bob',
      firebase_uid: 'fb-cust-bob',
      email: 'bob@example.com',
      display_name: 'Bob Miller',
      phone: '+91 98765 22222',
      role: UserRole.CUSTOMER,
      pin_hash: null,
    },
    {
      id: 'usr-cust-charlie',
      firebase_uid: 'fb-cust-charlie',
      email: 'charlie@example.com',
      display_name: 'Charlie Patel',
      phone: '+91 98765 33333',
      role: UserRole.CUSTOMER,
      pin_hash: null,
    },
    {
      id: 'usr-cust-diana',
      firebase_uid: 'fb-cust-diana',
      email: 'diana@example.com',
      display_name: 'Diana Roy',
      phone: '+91 98765 44444',
      role: UserRole.CUSTOMER,
      pin_hash: null,
    },
    {
      id: 'usr-cust-evan',
      firebase_uid: 'fb-cust-evan',
      email: 'evan@example.com',
      display_name: 'Evan Wright',
      phone: '+91 98765 55555',
      role: UserRole.CUSTOMER,
      pin_hash: null,
    },
  ];

  for (const u of users) {
    await db
      .prepare(`
        INSERT INTO users (id, firebase_uid, email, display_name, phone, role, pin_hash, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name = excluded.display_name,
          role = excluded.role,
          pin_hash = excluded.pin_hash,
          updated_at = excluded.updated_at
      `)
      .bind(u.id, u.firebase_uid, u.email, u.display_name, u.phone, u.role, u.pin_hash, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 4. Branch Memberships (Operators attached to branches)
  // --------------------------------------------------------------------------
  const memberships = [
    {
      id: 'mem-op-alpha',
      user_id: 'usr-op-alpha',
      branch_id: 'branch-alpha',
      role: UserRole.BRANCH_OPERATOR,
      status: MembershipStatus.ACTIVE,
    },
    {
      id: 'mem-op-beta',
      user_id: 'usr-op-beta',
      branch_id: 'branch-beta',
      role: UserRole.BRANCH_OPERATOR,
      status: MembershipStatus.ACTIVE,
    },
    {
      id: 'mem-cust-suspended',
      user_id: 'usr-cust-evan',
      branch_id: 'branch-gamma',
      role: UserRole.BRANCH_OPERATOR,
      status: MembershipStatus.SUSPENDED,
    },
  ];

  for (const m of memberships) {
    await db
      .prepare(`
        INSERT INTO branch_memberships (id, user_id, branch_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, branch_id) DO UPDATE SET
          role = excluded.role,
          status = excluded.status,
          updated_at = excluded.updated_at
      `)
      .bind(m.id, m.user_id, m.branch_id, m.role, m.status, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 5. Customer Profiles
  // --------------------------------------------------------------------------
  const customerProfiles = [
    { id: 'prof-alice', user_id: 'usr-cust-alice', preferred_branch_id: 'branch-alpha', marketing_opt_in: 1 },
    { id: 'prof-bob', user_id: 'usr-cust-bob', preferred_branch_id: 'branch-beta', marketing_opt_in: 0 },
    { id: 'prof-charlie', user_id: 'usr-cust-charlie', preferred_branch_id: 'branch-alpha', marketing_opt_in: 1 },
    { id: 'prof-diana', user_id: 'usr-cust-diana', preferred_branch_id: 'branch-beta', marketing_opt_in: 1 },
    { id: 'prof-evan', user_id: 'usr-cust-evan', preferred_branch_id: null, marketing_opt_in: 0 },
  ];

  for (const cp of customerProfiles) {
    await db
      .prepare(`
        INSERT INTO customer_profiles (id, user_id, preferred_branch_id, marketing_opt_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          preferred_branch_id = excluded.preferred_branch_id,
          marketing_opt_in = excluded.marketing_opt_in,
          updated_at = excluded.updated_at
      `)
      .bind(cp.id, cp.user_id, cp.preferred_branch_id, cp.marketing_opt_in, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 6. Categories (Active & Inactive)
  // --------------------------------------------------------------------------
  const categories = [
    // Alpha Categories
    { id: 'cat-alpha-scoops', branch_id: 'branch-alpha', name: 'Handmade Scoops', active: 1, sort_order: 1 },
    { id: 'cat-alpha-sundaes', branch_id: 'branch-alpha', name: 'Signature Sundaes', active: 1, sort_order: 2 },
    { id: 'cat-alpha-waffles', branch_id: 'branch-alpha', name: 'Waffles & Cones', active: 1, sort_order: 3 },
    { id: 'cat-alpha-archived', branch_id: 'branch-alpha', name: 'Archived Seasonal Flavors', active: 0, sort_order: 99 },
    // Beta Categories
    { id: 'cat-beta-scoops', branch_id: 'branch-beta', name: 'Artisanal Scoops', active: 1, sort_order: 1 },
    { id: 'cat-beta-tubs', branch_id: 'branch-beta', name: 'Take-Home Tubs', active: 1, sort_order: 2 },
    { id: 'cat-beta-beverages', branch_id: 'branch-beta', name: 'Affogatos & Shakes', active: 1, sort_order: 3 },
  ];

  for (const c of categories) {
    await db
      .prepare(`
        INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          active = excluded.active,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `)
      .bind(c.id, c.branch_id, c.name, c.active, c.sort_order, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 7. Products (All price tiers, active and inactive)
  // --------------------------------------------------------------------------
  const products = [
    // Alpha Products
    {
      id: 'prod-alpha-pistachio',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Roasted Pistachio Scoop',
      description: 'Slow-churned roasted Sicilian pistachio gelato with crushed kernels.',
      price: 180,
      active: 1,
    },
    {
      id: 'prod-alpha-belgian-sundae',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-sundaes',
      name: 'Warm Fudge Belgian Sundae',
      description: 'Double dark chocolate scoop topped with hot molten chocolate fudge and toasted almonds.',
      price: 260,
      active: 1,
    },
    {
      id: 'prod-alpha-madagascar-vanilla',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Madagascar Bourbon Vanilla',
      description: 'Pure Bourbon vanilla pod bean specks folded with rich jersey cream.',
      price: 150,
      active: 1,
    },
    {
      id: 'prod-alpha-dark-chocolate',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: '70% Single Origin Dark Chocolate',
      description: 'Velvety Ecuadorian dark chocolate churned to silky perfection.',
      price: 190,
      active: 1,
    },
    {
      id: 'prod-alpha-waffle-basket',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-waffles',
      name: 'Crispy Caramel Waffle Basket',
      description: 'Handcrafted golden waffle cup drizzled with sea salt butter caramel.',
      price: 120,
      active: 1,
    },
    {
      id: 'prod-alpha-mango',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Alphonso Mango Scoop',
      description: 'Ratnagiri Alphonsos churned fresh, folded into sweet malai cream.',
      price: 140,
      active: 1,
    },
    {
      id: 'prod-alpha-strawberry',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Strawberry Cream Scoop',
      description: 'Fresh seasonal strawberries with homemade ripple jam.',
      price: 140,
      active: 1,
    },
    {
      id: 'prod-alpha-coffee',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Filter Coffee Scoop',
      description: 'Real South Indian decoction with organic jaggery.',
      price: 150,
      active: 1,
    },
    {
      id: 'prod-alpha-meetha',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-scoops',
      name: 'Double ka Meetha Scoop',
      description: 'Saffron cream, caramelised bread, and toasted almond slivers.',
      price: 160,
      active: 1,
    },
    {
      id: 'prod-alpha-seasonal-berry',
      branch_id: 'branch-alpha',
      category_id: 'cat-alpha-archived',
      name: 'Wild Berry Sorbet (Summer Archived)',
      description: 'Seasonal wild blueberry and raspberry water ice.',
      price: 210,
      active: 0,
    },
    // Beta Products
    {
      id: 'prod-beta-alphonso',
      branch_id: 'branch-beta',
      category_id: 'cat-beta-scoops',
      name: 'Ratnagiri Alphonso Scoop',
      description: 'Fresh summer Alphonso mango purée folded with sweet pasture-raised cream.',
      price: 190,
      active: 1,
    },
    {
      id: 'prod-beta-cold-brew-tub',
      branch_id: 'branch-beta',
      category_id: 'cat-beta-tubs',
      name: 'Cold Brew Espresso Tub (500ml)',
      description: 'Single-origin Arabica cold brew espresso infused artisanal gelato pint.',
      price: 450,
      active: 1,
    },
    {
      id: 'prod-beta-salted-caramel',
      branch_id: 'branch-beta',
      category_id: 'cat-beta-tubs',
      name: 'Sea Salt Caramel Tub (500ml)',
      description: 'Fleur de sel French caramel gelato pint.',
      price: 420,
      active: 1,
    },
    {
      id: 'prod-beta-matcha-green',
      branch_id: 'branch-beta',
      category_id: 'cat-beta-scoops',
      name: 'Kyoto Ceremonial Matcha Gelato',
      description: 'Uji matcha blended with organic whole milk.',
      price: 240,
      active: 1,
    },
  ];

  for (const p of products) {
    await db
      .prepare(`
        INSERT INTO products (id, branch_id, category_id, name, description, price, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          price = excluded.price,
          active = excluded.active,
          updated_at = excluded.updated_at
      `)
      .bind(p.id, p.branch_id, p.category_id, p.name, p.description, p.price, p.active, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 8. Raw Materials (Permutations: High stock, Low stock below threshold, Zero stock)
  // --------------------------------------------------------------------------
  const rawMaterials = [
    // Alpha Materials
    { id: 'raw-alpha-milk', branch_id: 'branch-alpha', name: 'A2 Whole Milk', unit: 'LITER', current_quantity: 150, reorder_threshold: 30, active: 1 },
    { id: 'raw-alpha-cream', branch_id: 'branch-alpha', name: 'Fresh Dairy Cream 36%', unit: 'LITER', current_quantity: 85, reorder_threshold: 20, active: 1 },
    { id: 'raw-alpha-sugar', branch_id: 'branch-alpha', name: 'Organic Cane Sugar', unit: 'KG', current_quantity: 90, reorder_threshold: 25, active: 1 },
    { id: 'raw-alpha-pistachio-paste', branch_id: 'branch-alpha', name: 'Sicilian Pistachio Paste', unit: 'KG', current_quantity: 4.5, reorder_threshold: 10, active: 1 }, // Low stock!
    { id: 'raw-alpha-chocolate-callets', branch_id: 'branch-alpha', name: 'Belgian Dark Callets 70%', unit: 'KG', current_quantity: 3.2, reorder_threshold: 8, active: 1 }, // Low stock!
    { id: 'raw-alpha-vanilla-beans', branch_id: 'branch-alpha', name: 'Madagascar Vanilla Pods', unit: 'KG', current_quantity: 0, reorder_threshold: 2, active: 1 }, // Zero stock!
    { id: 'raw-alpha-waffle-mix', branch_id: 'branch-alpha', name: 'Artisan Waffle Batter Mix', unit: 'KG', current_quantity: 40, reorder_threshold: 10, active: 1 },
    // Beta Materials
    { id: 'raw-beta-milk', branch_id: 'branch-beta', name: 'A2 Whole Milk', unit: 'LITER', current_quantity: 120, reorder_threshold: 25, active: 1 },
    { id: 'raw-beta-cream', branch_id: 'branch-beta', name: 'Heavy Whipping Cream', unit: 'LITER', current_quantity: 65, reorder_threshold: 15, active: 1 },
    { id: 'raw-beta-mango-pulp', branch_id: 'branch-beta', name: 'Alphonso Mango Purée', unit: 'KG', current_quantity: 3.5, reorder_threshold: 15, active: 1 }, // Low stock!
    { id: 'raw-beta-coffee-beans', branch_id: 'branch-beta', name: 'Arabica Espresso Roast Beans', unit: 'KG', current_quantity: 18, reorder_threshold: 5, active: 1 },
    { id: 'raw-beta-matcha-powder', branch_id: 'branch-beta', name: 'Ceremonial Uji Matcha Powder', unit: 'KG', current_quantity: 1.2, reorder_threshold: 2, active: 1 }, // Low stock!
  ];

  for (const r of rawMaterials) {
    await db
      .prepare(`
        INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          current_quantity = excluded.current_quantity,
          reorder_threshold = excluded.reorder_threshold,
          updated_at = excluded.updated_at
      `)
      .bind(r.id, r.branch_id, r.name, r.unit, r.current_quantity, r.reorder_threshold, r.active, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 9. Bill of Materials / Recipes (product_components)
  // --------------------------------------------------------------------------
  const productComponents = [
    { id: 'comp-pistachio-milk', product_id: 'prod-alpha-pistachio', raw_material_id: 'raw-alpha-milk', quantity_required: 0.15, unit: 'LITER' },
    { id: 'comp-pistachio-cream', product_id: 'prod-alpha-pistachio', raw_material_id: 'raw-alpha-cream', quantity_required: 0.1, unit: 'LITER' },
    { id: 'comp-pistachio-sugar', product_id: 'prod-alpha-pistachio', raw_material_id: 'raw-alpha-sugar', quantity_required: 0.03, unit: 'KG' },
    { id: 'comp-pistachio-paste', product_id: 'prod-alpha-pistachio', raw_material_id: 'raw-alpha-pistachio-paste', quantity_required: 0.04, unit: 'KG' },

    { id: 'comp-sundae-milk', product_id: 'prod-alpha-belgian-sundae', raw_material_id: 'raw-alpha-milk', quantity_required: 0.2, unit: 'LITER' },
    { id: 'comp-sundae-cream', product_id: 'prod-alpha-belgian-sundae', raw_material_id: 'raw-alpha-cream', quantity_required: 0.15, unit: 'LITER' },
    { id: 'comp-sundae-choc', product_id: 'prod-alpha-belgian-sundae', raw_material_id: 'raw-alpha-chocolate-callets', quantity_required: 0.08, unit: 'KG' },

    { id: 'comp-vanilla-beans', product_id: 'prod-alpha-madagascar-vanilla', raw_material_id: 'raw-alpha-vanilla-beans', quantity_required: 0.01, unit: 'KG' },

    { id: 'comp-alphonso-milk', product_id: 'prod-beta-alphonso', raw_material_id: 'raw-beta-milk', quantity_required: 0.15, unit: 'LITER' },
    { id: 'comp-alphonso-pulp', product_id: 'prod-beta-alphonso', raw_material_id: 'raw-beta-mango-pulp', quantity_required: 0.08, unit: 'KG' },

    { id: 'comp-coldbrew-beans', product_id: 'prod-beta-cold-brew-tub', raw_material_id: 'raw-beta-coffee-beans', quantity_required: 0.05, unit: 'KG' },
    { id: 'comp-coldbrew-milk', product_id: 'prod-beta-cold-brew-tub', raw_material_id: 'raw-beta-milk', quantity_required: 0.35, unit: 'LITER' },
  ];

  for (const pc of productComponents) {
    await db
      .prepare(`
        INSERT INTO product_components (id, product_id, raw_material_id, quantity_required, unit)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          quantity_required = excluded.quantity_required,
          unit = excluded.unit
      `)
      .bind(pc.id, pc.product_id, pc.raw_material_id, pc.quantity_required, pc.unit)
      .run();
  }

  // --------------------------------------------------------------------------
  // 10. Inventory (Stock levels: High, Low at/below threshold, Zero out-of-stock)
  // --------------------------------------------------------------------------
  const inventory = [
    // Alpha Inventory
    { id: 'inv-alpha-pistachio', branch_id: 'branch-alpha', product_id: 'prod-alpha-pistachio', quantity: 45, reorder_threshold: 10 }, // High
    { id: 'inv-alpha-belgian-sundae', branch_id: 'branch-alpha', product_id: 'prod-alpha-belgian-sundae', quantity: 4, reorder_threshold: 10 }, // Low stock!
    { id: 'inv-alpha-madagascar-vanilla', branch_id: 'branch-alpha', product_id: 'prod-alpha-madagascar-vanilla', quantity: 0, reorder_threshold: 5 }, // Out of stock!
    { id: 'inv-alpha-dark-chocolate', branch_id: 'branch-alpha', product_id: 'prod-alpha-dark-chocolate', quantity: 38, reorder_threshold: 8 }, // High
    { id: 'inv-alpha-mango', branch_id: 'branch-alpha', product_id: 'prod-alpha-mango', quantity: 50, reorder_threshold: 12 }, // High
    { id: 'inv-alpha-strawberry', branch_id: 'branch-alpha', product_id: 'prod-alpha-strawberry', quantity: 45, reorder_threshold: 10 }, // High
    { id: 'inv-alpha-coffee', branch_id: 'branch-alpha', product_id: 'prod-alpha-coffee', quantity: 40, reorder_threshold: 10 }, // High
    { id: 'inv-alpha-meetha', branch_id: 'branch-alpha', product_id: 'prod-alpha-meetha', quantity: 35, reorder_threshold: 8 }, // High
    { id: 'inv-alpha-waffle-basket', branch_id: 'branch-alpha', product_id: 'prod-alpha-waffle-basket', quantity: 5, reorder_threshold: 10 }, // Low stock!
    // Beta Inventory
    { id: 'inv-beta-alphonso', branch_id: 'branch-beta', product_id: 'prod-beta-alphonso', quantity: 60, reorder_threshold: 15 }, // High
    { id: 'inv-beta-cold-brew-tub', branch_id: 'branch-beta', product_id: 'prod-beta-cold-brew-tub', quantity: 3, reorder_threshold: 6 }, // Low stock!
    { id: 'inv-beta-salted-caramel', branch_id: 'branch-beta', product_id: 'prod-beta-salted-caramel', quantity: 14, reorder_threshold: 4 }, // High
    { id: 'inv-beta-matcha-green', branch_id: 'branch-beta', product_id: 'prod-beta-matcha-green', quantity: 22, reorder_threshold: 5 }, // High
  ];

  for (const inv of inventory) {
    await db
      .prepare(`
        INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET
          quantity = excluded.quantity,
          reorder_threshold = excluded.reorder_threshold,
          updated_at = excluded.updated_at
      `)
      .bind(inv.id, inv.branch_id, inv.product_id, inv.quantity, inv.reorder_threshold, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 11. Inventory Movements (Covering all 10 movement types across products & raw materials)
  // --------------------------------------------------------------------------
  const inventoryMovements = [
    {
      id: 'mov-001',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.RAW_MATERIAL,
      product_id: null,
      raw_material_id: 'raw-alpha-milk',
      quantity_delta: 100,
      movement_type: InventoryMovementType.REFILL,
      reason: 'Morning dairy delivery batch from farm co-op',
      reference_type: 'PURCHASE_INVOICE',
      reference_id: 'PO-2026-001',
      actor_user_id: 'usr-op-alpha',
      created_at: daysAgo(2),
    },
    {
      id: 'mov-002',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.RAW_MATERIAL,
      product_id: null,
      raw_material_id: 'raw-alpha-pistachio-paste',
      quantity_delta: -2.5,
      movement_type: InventoryMovementType.RAW_MATERIAL_CONSUMPTION,
      reason: 'Consumed for morning gelato churn cycle',
      reference_type: 'PRODUCTION_BATCH',
      reference_id: 'BATCH-ALPHA-44',
      actor_user_id: 'usr-op-alpha',
      created_at: daysAgo(1),
    },
    {
      id: 'mov-003',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-alpha-pistachio',
      raw_material_id: null,
      quantity_delta: -2,
      movement_type: InventoryMovementType.ORDER_CONSUMPTION,
      reason: 'Order fulfillment deduction',
      reference_type: 'ORDER',
      reference_id: 'ALPHA-01-20261002-0003',
      actor_user_id: 'usr-op-alpha',
      created_at: minutesAgo(45),
    },
    {
      id: 'mov-004',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-alpha-belgian-sundae',
      raw_material_id: null,
      quantity_delta: 5,
      movement_type: InventoryMovementType.ADJUSTMENT,
      reason: 'Audit cycle surplus count adjustment',
      reference_type: 'AUDIT',
      reference_id: 'AUDIT-2026-Q4',
      actor_user_id: 'usr-owner-1',
      created_at: daysAgo(3),
    },
    {
      id: 'mov-005',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.RAW_MATERIAL,
      product_id: null,
      raw_material_id: 'raw-alpha-cream',
      quantity_delta: -4,
      movement_type: InventoryMovementType.DAMAGE,
      reason: 'Dropped milk crate during warehouse transfer',
      reference_type: 'INCIDENT',
      reference_id: 'INC-8812',
      actor_user_id: 'usr-op-alpha',
      created_at: daysAgo(4),
    },
    {
      id: 'mov-006',
      branch_id: 'branch-beta',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-beta-alphonso',
      raw_material_id: null,
      quantity_delta: -3,
      movement_type: InventoryMovementType.WASTE,
      reason: 'Freezer door power flicker melted top display layer',
      reference_type: 'WASTE_LOG',
      reference_id: 'WST-2026-09',
      actor_user_id: 'usr-op-beta',
      created_at: daysAgo(5),
    },
    {
      id: 'mov-007',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-alpha-madagascar-vanilla',
      raw_material_id: null,
      quantity_delta: 1,
      movement_type: InventoryMovementType.ORDER_REVERSAL,
      reason: 'Restocked item from customer cancelled order',
      reference_type: 'ORDER_CANCEL',
      reference_id: 'ALPHA-01-20261002-0007',
      actor_user_id: 'usr-op-alpha',
      created_at: minutesAgo(90),
    },
    {
      id: 'mov-008',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.RAW_MATERIAL,
      product_id: null,
      raw_material_id: 'raw-alpha-sugar',
      quantity_delta: 10,
      movement_type: InventoryMovementType.CORRECTION,
      reason: 'Supplier invoice weight discrepancy reconciled',
      reference_type: 'INVOICE_ADJUSTMENT',
      reference_id: 'CORR-114',
      actor_user_id: 'usr-op-alpha',
      created_at: daysAgo(6),
    },
    {
      id: 'mov-009',
      branch_id: 'branch-alpha',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-alpha-dark-chocolate',
      raw_material_id: null,
      quantity_delta: 15,
      movement_type: InventoryMovementType.MANUAL_INCREASE,
      reason: 'Special holiday batch produced manually',
      reference_type: 'KITCHEN_LOG',
      reference_id: 'MAN-901',
      actor_user_id: 'usr-op-alpha',
      created_at: daysAgo(7),
    },
    {
      id: 'mov-010',
      branch_id: 'branch-beta',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: 'prod-beta-cold-brew-tub',
      raw_material_id: null,
      quantity_delta: -2,
      movement_type: InventoryMovementType.MANUAL_DECREASE,
      reason: 'Tasting event promotional samples',
      reference_type: 'MARKETING_EVENT',
      reference_id: 'EVT-77',
      actor_user_id: 'usr-op-beta',
      created_at: daysAgo(8),
    },
  ];

  for (const m of inventoryMovements) {
    await db
      .prepare(`
        INSERT INTO inventory_movements (id, branch_id, inventory_item_type, product_id, raw_material_id, quantity_delta, movement_type, reason, reference_type, reference_id, actor_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .bind(m.id, m.branch_id, m.inventory_item_type, m.product_id, m.raw_material_id, m.quantity_delta, m.movement_type, m.reason, m.reference_type, m.reference_id, m.actor_user_id, m.created_at)
      .run();
  }

  // --------------------------------------------------------------------------
  // 12. Offers (Covering BUY_X_GET_Y, FLAT, COMBO, Active and Inactive)
  // --------------------------------------------------------------------------
  const offers = [
    {
      id: 'offer-buy1get1',
      branch_id: 'branch-beta',
      name: 'Happy Hour Buy 1 Get 1 Tubs',
      description: 'Buy one cold brew tub and receive the second one free.',
      offer_type: OfferType.BUY_X_GET_Y,
      configuration_json: JSON.stringify({ buyQuantity: 1, getQuantity: 1, targetProductId: 'prod-beta-cold-brew-tub' }),
      start_at: daysAgo(10),
      end_at: daysAhead(20),
      active: 1,
      usage_limit: 100,
      usage_count: 5,
    },
    {
      id: 'offer-flat50',
      branch_id: 'branch-alpha',
      name: 'Flat ₹50 Off Orders Above ₹400',
      description: 'Instant ₹50 discount for orders exceeding ₹400.',
      offer_type: OfferType.FLAT,
      configuration_json: JSON.stringify({ flatDiscount: 50, minimumOrderValue: 400 }),
      start_at: daysAgo(30),
      end_at: daysAhead(30),
      active: 1,
      usage_limit: 500,
      usage_count: 18,
    },
    {
      id: 'offer-combo',
      branch_id: 'branch-alpha',
      name: 'Artisan Scoop + Sundae Combo Deal',
      description: 'Flat ₹40 combo savings when ordering both sundae and artisan scoop.',
      offer_type: OfferType.COMBO,
      configuration_json: JSON.stringify({ comboDiscount: 40 }),
      start_at: daysAgo(15),
      end_at: daysAhead(15),
      active: 1,
      usage_limit: 200,
      usage_count: 12,
    },
    {
      id: 'offer-expired',
      branch_id: 'branch-alpha',
      name: 'Early Bird Summer Launch 2025',
      description: 'Expired promotional campaign discount.',
      offer_type: OfferType.FLAT,
      configuration_json: JSON.stringify({ flatDiscount: 75 }),
      start_at: daysAgo(90),
      end_at: daysAgo(30),
      active: 0,
      usage_limit: 50,
      usage_count: 50,
    },
  ];

  for (const o of offers) {
    await db
      .prepare(`
        INSERT INTO offers (id, branch_id, name, description, offer_type, configuration_json, start_at, end_at, active, usage_limit, usage_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          active = excluded.active,
          updated_at = excluded.updated_at
      `)
      .bind(o.id, o.branch_id, o.name, o.description, o.offer_type, o.configuration_json, o.start_at, o.end_at, o.active, o.usage_limit, o.usage_count, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 13. Coupons (PERCENTAGE, FIXED, min order, per user limits, Active & Expired)
  // --------------------------------------------------------------------------
  const coupons = [
    {
      id: 'coup-alpha-melt20',
      branch_id: 'branch-alpha',
      code: 'MELT20',
      name: '20% Welcome Savings',
      discount_type: DiscountType.PERCENTAGE,
      discount_value: 20,
      max_discount: 100,
      minimum_order_value: 200,
      total_usage_limit: 500,
      per_user_usage_limit: 5,
      per_user_daily_limit: 2,
      start_at: daysAgo(30),
      end_at: daysAhead(60),
      active: 1,
      usage_count: 6,
    },
    {
      id: 'coup-alpha-first50',
      branch_id: 'branch-alpha',
      code: 'FIRST50',
      name: 'First Order Flat ₹50 Off',
      discount_type: DiscountType.FIXED,
      discount_value: 50,
      max_discount: 50,
      minimum_order_value: 150,
      total_usage_limit: 1000,
      per_user_usage_limit: 1,
      per_user_daily_limit: 1,
      start_at: daysAgo(30),
      end_at: daysAhead(90),
      active: 1,
      usage_count: 2,
    },
    {
      id: 'coup-alpha-vip100',
      branch_id: 'branch-alpha',
      code: 'VIP100',
      name: 'VIP Club ₹100 Off',
      discount_type: DiscountType.FIXED,
      discount_value: 100,
      max_discount: 100,
      minimum_order_value: 400,
      total_usage_limit: 50,
      per_user_usage_limit: 2,
      per_user_daily_limit: 1,
      start_at: daysAgo(10),
      end_at: daysAhead(20),
      active: 1,
      usage_count: 1,
    },
    {
      id: 'coup-alpha-expired',
      branch_id: 'branch-alpha',
      code: 'EXPIRED30',
      name: 'Expired 30% Off Voucher',
      discount_type: DiscountType.PERCENTAGE,
      discount_value: 30,
      max_discount: 150,
      minimum_order_value: 300,
      total_usage_limit: 20,
      per_user_usage_limit: 1,
      per_user_daily_limit: 1,
      start_at: daysAgo(60),
      end_at: daysAgo(15),
      active: 0,
      usage_count: 20,
    },
    {
      id: 'coup-beta-melt20',
      branch_id: 'branch-beta',
      code: 'MELT20',
      name: '20% Off Beta Tubs',
      discount_type: DiscountType.PERCENTAGE,
      discount_value: 20,
      max_discount: 100,
      minimum_order_value: 200,
      total_usage_limit: 250,
      per_user_usage_limit: 3,
      per_user_daily_limit: 1,
      start_at: daysAgo(20),
      end_at: daysAhead(40),
      active: 1,
      usage_count: 3,
    },
  ];

  for (const c of coupons) {
    await db
      .prepare(`
        INSERT INTO coupons (id, branch_id, code, name, discount_type, discount_value, max_discount, minimum_order_value, total_usage_limit, per_user_usage_limit, per_user_daily_limit, start_at, end_at, active, usage_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          active = excluded.active,
          updated_at = excluded.updated_at
      `)
      .bind(c.id, c.branch_id, c.code, c.name, c.discount_type, c.discount_value, c.max_discount, c.minimum_order_value, c.total_usage_limit, c.per_user_usage_limit, c.per_user_daily_limit, c.start_at, c.end_at, c.active, c.usage_count, nowIso, nowIso)
      .run();
  }

  // --------------------------------------------------------------------------
  // 14. Orders (Complete matrix of OrderStatus, PaymentStatus, and PaymentMethod)
  // --------------------------------------------------------------------------
  interface SeedOrderDefinition {
    id: string;
    orderNumber: string;
    branchId: string;
    customerId: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    couponId?: string;
    couponCodeSnapshot?: string;
    couponDiscountSnapshot?: number;
    offerId?: string;
    offerDiscountSnapshot?: number;
    placedAt: string;
    expiresAt: string;
    confirmedAt?: string;
    completedAt?: string;
    cancelledAt?: string;
    expiredAt?: string;
    items: Array<{
      productId: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      lineDiscount: number;
      lineTotal: number;
    }>;
  }

  const orderDefinitions: SeedOrderDefinition[] = [
    // 1. PENDING status + PENDING payment (UPI) - Just placed today
    {
      id: 'ord-001',
      orderNumber: 'ALPHA-01-20261002-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-alice',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 300,
      discount: 0,
      tax: 15,
      total: 315,
      placedAt: minutesAgo(10),
      expiresAt: minutesAgo(-5), // 5 mins in future
      items: [
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 0, lineTotal: 180 },
        { productId: 'prod-alpha-waffle-basket', productName: 'Crispy Caramel Waffle Basket', unitPrice: 120, quantity: 1, lineDiscount: 0, lineTotal: 120 },
      ],
    },
    // 2. PENDING status + RECORDED payment (UPI with coupon FIRST50) - Customer submitted UPI ref
    {
      id: 'ord-002',
      orderNumber: 'ALPHA-01-20261002-0002',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-bob',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.RECORDED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 260,
      discount: 50,
      tax: 10.5,
      total: 220.5,
      couponId: 'coup-alpha-first50',
      couponCodeSnapshot: 'FIRST50',
      couponDiscountSnapshot: 50,
      placedAt: minutesAgo(25),
      expiresAt: minutesAgo(10),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 1, lineDiscount: 50, lineTotal: 210 },
      ],
    },
    // 3. CONFIRMED status + VERIFIED payment (CASH with offer FLAT50) - Kitchen queued
    {
      id: 'ord-003',
      orderNumber: 'ALPHA-01-20261002-0003',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-charlie',
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.CASH,
      subtotal: 550,
      discount: 50,
      tax: 25,
      total: 525,
      offerId: 'offer-flat50',
      offerDiscountSnapshot: 50,
      placedAt: minutesAgo(40),
      expiresAt: minutesAgo(25),
      confirmedAt: minutesAgo(35),
      items: [
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 2, lineDiscount: 25, lineTotal: 335 },
        { productId: 'prod-alpha-dark-chocolate', productName: '70% Single Origin Dark Chocolate', unitPrice: 190, quantity: 1, lineDiscount: 25, lineTotal: 165 },
      ],
    },
    // 4. PREPARING status + VERIFIED payment (UPI with coupon MELT20) - Scooping/blending in kitchen
    {
      id: 'ord-004',
      orderNumber: 'ALPHA-01-20261002-0004',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-diana',
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 520,
      discount: 100,
      tax: 21,
      total: 441,
      couponId: 'coup-alpha-melt20',
      couponCodeSnapshot: 'MELT20',
      couponDiscountSnapshot: 100,
      placedAt: minutesAgo(50),
      expiresAt: minutesAgo(35),
      confirmedAt: minutesAgo(45),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 2, lineDiscount: 100, lineTotal: 420 },
      ],
    },
    // 5. READY status + VERIFIED payment (CARD) - Waiting at pickup counter
    {
      id: 'ord-005',
      orderNumber: 'ALPHA-01-20261002-0005',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-evan',
      status: OrderStatus.READY,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.CARD,
      subtotal: 310,
      discount: 0,
      tax: 15.5,
      total: 325.5,
      placedAt: minutesAgo(75),
      expiresAt: minutesAgo(60),
      confirmedAt: minutesAgo(70),
      items: [
        { productId: 'prod-alpha-dark-chocolate', productName: '70% Single Origin Dark Chocolate', unitPrice: 190, quantity: 1, lineDiscount: 0, lineTotal: 190 },
        { productId: 'prod-alpha-waffle-basket', productName: 'Crispy Caramel Waffle Basket', unitPrice: 120, quantity: 1, lineDiscount: 0, lineTotal: 120 },
      ],
    },
    // 6. COMPLETED status + COMPLETED payment (ONLINE with offer COMBO) - Delivered today
    {
      id: 'ord-006',
      orderNumber: 'ALPHA-01-20261002-0006',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-alice',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.ONLINE,
      subtotal: 560,
      discount: 40,
      tax: 26,
      total: 546,
      offerId: 'offer-combo',
      offerDiscountSnapshot: 40,
      placedAt: minutesAgo(120),
      expiresAt: minutesAgo(105),
      confirmedAt: minutesAgo(115),
      completedAt: minutesAgo(95),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 1, lineDiscount: 20, lineTotal: 240 },
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 10, lineTotal: 170 },
        { productId: 'prod-alpha-waffle-basket', productName: 'Crispy Caramel Waffle Basket', unitPrice: 120, quantity: 1, lineDiscount: 10, lineTotal: 110 },
      ],
    },
    // 7. CANCELLED status + REFUNDED payment (UPI) - Customer requested cancellation
    {
      id: 'ord-007',
      orderNumber: 'ALPHA-01-20261002-0007',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-charlie',
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 180,
      discount: 0,
      tax: 9,
      total: 189,
      placedAt: minutesAgo(180),
      expiresAt: minutesAgo(165),
      cancelledAt: minutesAgo(170),
      items: [
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 0, lineTotal: 180 },
      ],
    },
    // 8. EXPIRED status + FAILED payment (UPI) - Checkout window expired without payment
    {
      id: 'ord-008',
      orderNumber: 'ALPHA-01-20261002-0008',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-diana',
      status: OrderStatus.EXPIRED,
      paymentStatus: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 190,
      discount: 0,
      tax: 9.5,
      total: 199.5,
      placedAt: minutesAgo(240),
      expiresAt: minutesAgo(225),
      expiredAt: minutesAgo(225),
      items: [
        { productId: 'prod-alpha-dark-chocolate', productName: '70% Single Origin Dark Chocolate', unitPrice: 190, quantity: 1, lineDiscount: 0, lineTotal: 190 },
      ],
    },

    // 9. Beta Branch: PENDING + PENDING (CASH)
    {
      id: 'ord-009',
      orderNumber: 'BETA-02-20261002-0001',
      branchId: 'branch-beta',
      customerId: 'usr-cust-alice',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.CASH,
      subtotal: 430,
      discount: 0,
      tax: 21.5,
      total: 451.5,
      placedAt: minutesAgo(15),
      expiresAt: minutesAgo(-10),
      items: [
        { productId: 'prod-beta-alphonso', productName: 'Ratnagiri Alphonso Scoop', unitPrice: 190, quantity: 1, lineDiscount: 0, lineTotal: 190 },
        { productId: 'prod-beta-matcha-green', productName: 'Kyoto Ceremonial Matcha Gelato', unitPrice: 240, quantity: 1, lineDiscount: 0, lineTotal: 240 },
      ],
    },
    // 10. Beta Branch: CONFIRMED + VERIFIED (CARD with offer BUY_X_GET_Y)
    {
      id: 'ord-010',
      orderNumber: 'BETA-02-20261002-0002',
      branchId: 'branch-beta',
      customerId: 'usr-cust-bob',
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.CARD,
      subtotal: 900,
      discount: 450,
      tax: 22.5,
      total: 472.5,
      offerId: 'offer-buy1get1',
      offerDiscountSnapshot: 450,
      placedAt: minutesAgo(35),
      expiresAt: minutesAgo(20),
      confirmedAt: minutesAgo(30),
      items: [
        { productId: 'prod-beta-cold-brew-tub', productName: 'Cold Brew Espresso Tub (500ml)', unitPrice: 450, quantity: 2, lineDiscount: 450, lineTotal: 450 },
      ],
    },
    // 11. Beta Branch: PREPARING + VERIFIED (UPI)
    {
      id: 'ord-011',
      orderNumber: 'BETA-02-20261002-0003',
      branchId: 'branch-beta',
      customerId: 'usr-cust-charlie',
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 420,
      discount: 0,
      tax: 21,
      total: 441,
      placedAt: minutesAgo(45),
      expiresAt: minutesAgo(30),
      confirmedAt: minutesAgo(40),
      items: [
        { productId: 'prod-beta-salted-caramel', productName: 'Sea Salt Caramel Tub (500ml)', unitPrice: 420, quantity: 1, lineDiscount: 0, lineTotal: 420 },
      ],
    },
    // 12. Beta Branch: COMPLETED + COMPLETED (UPI with coupon MELT20)
    {
      id: 'ord-012',
      orderNumber: 'BETA-02-20261002-0004',
      branchId: 'branch-beta',
      customerId: 'usr-cust-diana',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 640,
      discount: 100,
      tax: 27,
      total: 567,
      couponId: 'coup-beta-melt20',
      couponCodeSnapshot: 'MELT20',
      couponDiscountSnapshot: 100,
      placedAt: minutesAgo(180),
      expiresAt: minutesAgo(165),
      confirmedAt: minutesAgo(175),
      completedAt: minutesAgo(150),
      items: [
        { productId: 'prod-beta-alphonso', productName: 'Ratnagiri Alphonso Scoop', unitPrice: 190, quantity: 1, lineDiscount: 30, lineTotal: 160 },
        { productId: 'prod-beta-cold-brew-tub', productName: 'Cold Brew Espresso Tub (500ml)', unitPrice: 450, quantity: 1, lineDiscount: 70, lineTotal: 380 },
      ],
    },

    // 13. Historical: Yesterday COMPLETED (CASH with coupon MELT20)
    {
      id: 'ord-hist-01',
      orderNumber: 'ALPHA-01-20261001-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-bob',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.CASH,
      subtotal: 360,
      discount: 72,
      tax: 14.4,
      total: 302.4,
      couponId: 'coup-alpha-melt20',
      couponCodeSnapshot: 'MELT20',
      couponDiscountSnapshot: 72,
      placedAt: daysAgo(1),
      expiresAt: daysAgo(1),
      confirmedAt: daysAgo(1),
      completedAt: daysAgo(1),
      items: [
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 2, lineDiscount: 72, lineTotal: 288 },
      ],
    },
    // 14. Historical: 2 Days Ago COMPLETED (CARD)
    {
      id: 'ord-hist-02',
      orderNumber: 'ALPHA-01-20260930-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-charlie',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.CARD,
      subtotal: 520,
      discount: 0,
      tax: 26,
      total: 546,
      placedAt: daysAgo(2),
      expiresAt: daysAgo(2),
      confirmedAt: daysAgo(2),
      completedAt: daysAgo(2),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 2, lineDiscount: 0, lineTotal: 520 },
      ],
    },
    // 15. Historical: 3 Days Ago COMPLETED (UPI with offer FLAT50)
    {
      id: 'ord-hist-03',
      orderNumber: 'ALPHA-01-20260929-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-diana',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 440,
      discount: 50,
      tax: 19.5,
      total: 409.5,
      offerId: 'offer-flat50',
      offerDiscountSnapshot: 50,
      placedAt: daysAgo(3),
      expiresAt: daysAgo(3),
      confirmedAt: daysAgo(3),
      completedAt: daysAgo(3),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 1, lineDiscount: 25, lineTotal: 235 },
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 25, lineTotal: 155 },
      ],
    },
    // 16. Historical: 5 Days Ago Beta COMPLETED (ONLINE)
    {
      id: 'ord-hist-04',
      orderNumber: 'BETA-02-20260927-0001',
      branchId: 'branch-beta',
      customerId: 'usr-cust-evan',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.ONLINE,
      subtotal: 450,
      discount: 0,
      tax: 22.5,
      total: 472.5,
      placedAt: daysAgo(5),
      expiresAt: daysAgo(5),
      confirmedAt: daysAgo(5),
      completedAt: daysAgo(5),
      items: [
        { productId: 'prod-beta-cold-brew-tub', productName: 'Cold Brew Espresso Tub (500ml)', unitPrice: 450, quantity: 1, lineDiscount: 0, lineTotal: 450 },
      ],
    },
    // 17. Historical: 7 Days Ago COMPLETED (CASH)
    {
      id: 'ord-hist-05',
      orderNumber: 'ALPHA-01-20260925-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-alice',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.CASH,
      subtotal: 260,
      discount: 0,
      tax: 13,
      total: 273,
      placedAt: daysAgo(7),
      expiresAt: daysAgo(7),
      confirmedAt: daysAgo(7),
      completedAt: daysAgo(7),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 1, lineDiscount: 0, lineTotal: 260 },
      ],
    },
    // 18. Historical: 10 Days Ago Beta COMPLETED (UPI with coupon FIRST50)
    {
      id: 'ord-hist-06',
      orderNumber: 'BETA-02-20260922-0001',
      branchId: 'branch-beta',
      customerId: 'usr-cust-charlie',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 380,
      discount: 50,
      tax: 16.5,
      total: 346.5,
      couponId: 'coup-alpha-first50',
      couponCodeSnapshot: 'FIRST50',
      couponDiscountSnapshot: 50,
      placedAt: daysAgo(10),
      expiresAt: daysAgo(10),
      confirmedAt: daysAgo(10),
      completedAt: daysAgo(10),
      items: [
        { productId: 'prod-beta-alphonso', productName: 'Ratnagiri Alphonso Scoop', unitPrice: 190, quantity: 2, lineDiscount: 50, lineTotal: 330 },
      ],
    },
    // 19. Historical: 14 Days Ago COMPLETED (ONLINE)
    {
      id: 'ord-hist-07',
      orderNumber: 'ALPHA-01-20260918-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-bob',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.ONLINE,
      subtotal: 610,
      discount: 0,
      tax: 30.5,
      total: 640.5,
      placedAt: daysAgo(14),
      expiresAt: daysAgo(14),
      confirmedAt: daysAgo(14),
      completedAt: daysAgo(14),
      items: [
        { productId: 'prod-alpha-dark-chocolate', productName: '70% Single Origin Dark Chocolate', unitPrice: 190, quantity: 2, lineDiscount: 0, lineTotal: 380 },
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 0, lineTotal: 180 },
        { productId: 'prod-alpha-waffle-basket', productName: 'Crispy Caramel Waffle Basket', unitPrice: 120, quantity: 1, lineDiscount: 0, lineTotal: 120 },
      ],
    },
    // 20. Historical: 21 Days Ago COMPLETED (UPI with offer COMBO)
    {
      id: 'ord-hist-08',
      orderNumber: 'ALPHA-01-20260911-0001',
      branchId: 'branch-alpha',
      customerId: 'usr-cust-diana',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.UPI,
      subtotal: 560,
      discount: 40,
      tax: 26,
      total: 546,
      offerId: 'offer-combo',
      offerDiscountSnapshot: 40,
      placedAt: daysAgo(21),
      expiresAt: daysAgo(21),
      confirmedAt: daysAgo(21),
      completedAt: daysAgo(21),
      items: [
        { productId: 'prod-alpha-belgian-sundae', productName: 'Warm Fudge Belgian Sundae', unitPrice: 260, quantity: 1, lineDiscount: 20, lineTotal: 240 },
        { productId: 'prod-alpha-pistachio', productName: 'Roasted Pistachio Scoop', unitPrice: 180, quantity: 1, lineDiscount: 10, lineTotal: 170 },
        { productId: 'prod-alpha-waffle-basket', productName: 'Crispy Caramel Waffle Basket', unitPrice: 120, quantity: 1, lineDiscount: 10, lineTotal: 110 },
      ],
    },
    // 21. Historical: 28 Days Ago Beta COMPLETED (CARD)
    {
      id: 'ord-hist-09',
      orderNumber: 'BETA-02-20260904-0001',
      branchId: 'branch-beta',
      customerId: 'usr-cust-alice',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.CARD,
      subtotal: 420,
      discount: 0,
      tax: 21,
      total: 441,
      placedAt: daysAgo(28),
      expiresAt: daysAgo(28),
      confirmedAt: daysAgo(28),
      completedAt: daysAgo(28),
      items: [
        { productId: 'prod-beta-salted-caramel', productName: 'Sea Salt Caramel Tub (500ml)', unitPrice: 420, quantity: 1, lineDiscount: 0, lineTotal: 420 },
      ],
    },
  ];

  // Insert Orders
  for (const ord of orderDefinitions) {
    const existingOrder = await db
      .prepare('SELECT id FROM orders WHERE id = ?')
      .bind(ord.id)
      .first();

    if (!existingOrder) {
      await db
        .prepare(`
          INSERT INTO orders (
            id, order_number, branch_id, customer_user_id, status, subtotal, discount, tax, total,
            coupon_id, coupon_code_snapshot, coupon_discount_snapshot, offer_id, offer_discount_snapshot,
            payment_status, payment_method, placed_at, expires_at, confirmed_at, completed_at, cancelled_at, expired_at,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          ord.id,
          ord.orderNumber,
          ord.branchId,
          ord.customerId,
          ord.status,
          ord.subtotal,
          ord.discount,
          ord.tax,
          ord.total,
          ord.couponId ?? null,
          ord.couponCodeSnapshot ?? null,
          ord.couponDiscountSnapshot ?? 0,
          ord.offerId ?? null,
          ord.offerDiscountSnapshot ?? 0,
          ord.paymentStatus,
          ord.paymentMethod,
          ord.placedAt,
          ord.expiresAt,
          ord.confirmedAt ?? null,
          ord.completedAt ?? null,
          ord.cancelledAt ?? null,
          ord.expiredAt ?? null,
          ord.placedAt,
          ord.completedAt ?? ord.placedAt,
        )
        .run();
    }

    // Insert Order Items
    for (let idx = 0; idx < ord.items.length; idx++) {
      const item = ord.items[idx];
      const itemId = `item-${ord.id}-${idx + 1}`;
      const existingItem = await db
        .prepare('SELECT id FROM order_items WHERE id = ?')
        .bind(itemId)
        .first();

      if (!existingItem) {
        await db
          .prepare(`
            INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_discount, line_total, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(itemId, ord.id, item.productId, item.productName, item.unitPrice, item.quantity, item.lineDiscount, item.lineTotal, ord.placedAt, ord.placedAt)
          .run();
      }
    }

    // Insert Corresponding Payment (matching amount & status to preserve DB triggers)
    const paymentId = `pay-${ord.id}`;
    const confirmedBy = (ord.paymentStatus === PaymentStatus.VERIFIED || ord.paymentStatus === PaymentStatus.COMPLETED)
      ? (ord.branchId === 'branch-alpha' ? 'usr-op-alpha' : 'usr-op-beta')
      : null;
    const confirmedAt = (ord.paymentStatus === PaymentStatus.VERIFIED || ord.paymentStatus === PaymentStatus.COMPLETED)
      ? (ord.confirmedAt ?? ord.placedAt)
      : null;

    const existingPayment = await db
      .prepare('SELECT id FROM payments WHERE id = ?')
      .bind(paymentId)
      .first();

    if (!existingPayment) {
      await db
        .prepare(`
          INSERT INTO payments (id, order_id, branch_id, method, amount, status, confirmed_by, confirmed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(paymentId, ord.id, ord.branchId, ord.paymentMethod, ord.total, ord.paymentStatus, confirmedBy, confirmedAt, ord.placedAt, ord.completedAt ?? ord.placedAt)
        .run();
    }

    // If coupon was applied, insert coupon usage record idempotently
    if (ord.couponId && ord.discount > 0) {
      const usageId = `usage-${ord.id}`;
      const existingUsage = await db
        .prepare('SELECT id FROM coupon_usages WHERE id = ?')
        .bind(usageId)
        .first();

      if (!existingUsage) {
        await db
          .prepare(`
            INSERT INTO coupon_usages (id, coupon_id, user_id, order_id, discount_amount, used_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(usageId, ord.couponId, ord.customerId, ord.id, ord.discount, ord.placedAt)
          .run();
      }
    }
  }

  // --------------------------------------------------------------------------
  // 15. Audit Logs (Trail of representative user and system actions)
  // --------------------------------------------------------------------------
  const auditLogs = [
    {
      id: 'audit-001',
      branch_id: 'branch-alpha',
      actor_user_id: 'usr-owner-1',
      actor_type: 'USER',
      action: 'SYSTEM_INITIALIZATION',
      entity_type: 'PLATFORM',
      entity_id: 'global-melt',
      metadata_json: JSON.stringify({ message: 'Comprehensive development environment seeded' }),
      created_at: daysAgo(30),
    },
    {
      id: 'audit-002',
      branch_id: 'branch-alpha',
      actor_user_id: 'usr-op-alpha',
      actor_type: 'USER',
      action: 'ORDER_CONFIRMED',
      entity_type: 'ORDER',
      entity_id: 'ord-003',
      metadata_json: JSON.stringify({ orderNumber: 'ALPHA-01-20261002-0003', method: 'CASH' }),
      created_at: minutesAgo(35),
    },
    {
      id: 'audit-003',
      branch_id: 'branch-alpha',
      actor_user_id: null,
      actor_type: 'SYSTEM',
      action: 'ORDER_EXPIRED',
      entity_type: 'ORDER',
      entity_id: 'ord-008',
      metadata_json: JSON.stringify({ reason: 'Checkout inactivity timeout cron executed' }),
      created_at: minutesAgo(225),
    },
    {
      id: 'audit-004',
      branch_id: 'branch-beta',
      actor_user_id: 'usr-op-beta',
      actor_type: 'USER',
      action: 'INVENTORY_REFILL',
      entity_type: 'RAW_MATERIAL',
      entity_id: 'raw-beta-milk',
      metadata_json: JSON.stringify({ addedQuantity: 100, unit: 'LITER' }),
      created_at: daysAgo(2),
    },
  ];

  for (const a of auditLogs) {
    await db
      .prepare(`
        INSERT INTO audit_logs (id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .bind(a.id, a.branch_id, a.actor_user_id, a.actor_type, a.action, a.entity_type, a.entity_id, a.metadata_json, a.created_at)
      .run();
  }

  // --------------------------------------------------------------------------
  // 16. Application Sessions (Active sessions for quick login / testing)
  // --------------------------------------------------------------------------
  const sessions = [
    {
      id: 'sess-owner-global',
      token_hash: 'hash-tok-owner-global-demo',
      user_id: 'usr-owner-1',
      branch_id: null,
      scope: 'GLOBAL',
      authenticated_at: minutesAgo(30),
      pin_verified_at: minutesAgo(30),
      expires_at: daysAhead(1),
    },
    {
      id: 'sess-op-alpha',
      token_hash: 'hash-tok-op-alpha-demo',
      user_id: 'usr-op-alpha',
      branch_id: 'branch-alpha',
      scope: 'BRANCH',
      authenticated_at: minutesAgo(60),
      pin_verified_at: minutesAgo(60),
      expires_at: daysAhead(1),
    },
    {
      id: 'sess-op-beta',
      token_hash: 'hash-tok-op-beta-demo',
      user_id: 'usr-op-beta',
      branch_id: 'branch-beta',
      scope: 'BRANCH',
      authenticated_at: minutesAgo(45),
      pin_verified_at: minutesAgo(45),
      expires_at: daysAhead(1),
    },
  ];

  for (const s of sessions) {
    await db
      .prepare(`
        INSERT INTO application_sessions (id, session_token_hash, user_id, branch_id, scope, authenticated_at, pin_verified_at, expires_at, revoked_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .bind(s.id, s.token_hash, s.user_id, s.branch_id, s.scope, s.authenticated_at, s.pin_verified_at, s.expires_at, nowIso)
      .run();
  }

  // Calculate total counts
  const totalItemsCount = orderDefinitions.reduce((acc, o) => acc + o.items.length, 0);
  const totalCouponUsages = orderDefinitions.filter((o) => o.couponId && o.discount > 0).length;

  return {
    branches: branches.length,
    branchSettings: branches.length,
    users: users.length,
    memberships: memberships.length,
    customerProfiles: customerProfiles.length,
    categories: categories.length,
    products: products.length,
    rawMaterials: rawMaterials.length,
    productComponents: productComponents.length,
    inventory: inventory.length,
    inventoryMovements: inventoryMovements.length,
    offers: offers.length,
    coupons: coupons.length,
    orders: orderDefinitions.length,
    orderItems: totalItemsCount,
    payments: orderDefinitions.length,
    couponUsages: totalCouponUsages,
    auditLogs: auditLogs.length,
    applicationSessions: sessions.length,
  };
}
