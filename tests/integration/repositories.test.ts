import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { InventoryItemType, InventoryMovementType } from '../../shared/enums/inventory.enum';

describe('Repository Layer Read/Write & Scoping', () => {
  let db = createMemoryD1Database();
  let branchRepo: BranchRepository;
  let userRepo: UserRepository;
  let productRepo: ProductRepository;
  let inventoryRepo: InventoryRepository;
  let orderRepo: OrderRepository;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    branchRepo = new BranchRepository(db);
    userRepo = new UserRepository(db);
    productRepo = new ProductRepository(db);
    inventoryRepo = new InventoryRepository(db);
    orderRepo = new OrderRepository(db);
  });

  it('proves BranchRepository operations', async () => {
    const branch = await branchRepo.create({
      id: 'br-test-1',
      name: 'Test Parlour',
      code: 'TEST-01',
      address: '123 Sweet Lane',
      phone: '+91 99999 11111',
      timezone: 'Asia/Kolkata',
    });

    assert.strictEqual(branch.id, 'br-test-1');
    assert.strictEqual(branch.name, 'Test Parlour');

    const byId = await branchRepo.findById('br-test-1');
    assert.strictEqual(byId?.code, 'TEST-01');

    const byCode = await branchRepo.findByCode('TEST-01');
    assert.strictEqual(byCode?.id, 'br-test-1');

    const list = await branchRepo.listAll();
    assert.strictEqual(list.length, 1);
  });

  it('proves UserRepository and membership operations', async () => {
    await branchRepo.create({
      id: 'br-test-user',
      name: 'User Test Branch',
      code: 'UTB-01',
    });

    const user = await userRepo.create({
      id: 'usr-1',
      firebase_uid: 'firebase-uid-123',
      email: 'operator@example.com',
      display_name: 'Anita Scoop',
      phone: '+91 98888 22222',
    });

    assert.strictEqual(user.id, 'usr-1');
    assert.strictEqual(user.firebase_uid, 'firebase-uid-123');

    const membership = await userRepo.addMembership(
      'mem-1',
      user.id,
      'br-test-user',
      UserRole.BRANCH_OPERATOR,
      MembershipStatus.ACTIVE,
    );

    assert.strictEqual(membership.role, UserRole.BRANCH_OPERATOR);

    const userMemberships = await userRepo.getMemberships(user.id);
    assert.strictEqual(userMemberships.length, 1);
    assert.strictEqual(userMemberships[0].branch_id, 'br-test-user');
  });

  it('proves ProductRepository branch scoping', async () => {
    await branchRepo.create({ id: 'br-p1', name: 'Branch P1', code: 'P1-01' });
    await branchRepo.create({ id: 'br-p2', name: 'Branch P2', code: 'P2-02' });

    const cat1 = await productRepo.createCategory({
      id: 'cat-p1',
      branch_id: 'br-p1',
      name: 'Scoops P1',
    });

    const prod1 = await productRepo.create({
      id: 'prod-p1',
      branch_id: 'br-p1',
      category_id: cat1.id,
      name: 'Vanilla Bean',
      price: 150,
    });

    assert.strictEqual(prod1.branch_id, 'br-p1');

    // List by branch P1 contains the product
    const p1List = await productRepo.listByBranch('br-p1');
    assert.strictEqual(p1List.length, 1);
    assert.strictEqual(p1List[0].id, 'prod-p1');

    // List by branch P2 is empty
    const p2List = await productRepo.listByBranch('br-p2');
    assert.strictEqual(p2List.length, 0);

    // Branch P1 can find product via findByBranch
    const p1Product = await productRepo.findByBranch('br-p1', 'prod-p1');
    assert.ok(p1Product);
    assert.strictEqual(p1Product.name, 'Vanilla Bean');

    // Branch P2 cannot access Branch P1 product via findByBranch (cross-branch rejection)
    const crossBranchProduct = await productRepo.findByBranch('br-p2', 'prod-p1');
    assert.strictEqual(crossBranchProduct, null);
  });

  it('proves InventoryRepository stock tracking & movements', async () => {
    await branchRepo.create({ id: 'br-inv', name: 'Branch Inv', code: 'INV-01' });
    const cat = await productRepo.createCategory({
      id: 'cat-inv',
      branch_id: 'br-inv',
      name: 'Cones',
    });
    const prod = await productRepo.create({
      id: 'prod-inv',
      branch_id: 'br-inv',
      category_id: cat.id,
      name: 'Waffle Cone',
      price: 40,
    });

    const stock = await inventoryRepo.upsertStock({
      id: 'inv-1',
      branch_id: 'br-inv',
      product_id: prod.id,
      quantity: 100,
      reorder_threshold: 20,
    });

    assert.strictEqual(stock.quantity, 100);

    const movement = await inventoryRepo.recordMovement({
      id: 'mov-1',
      branch_id: 'br-inv',
      inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
      product_id: prod.id,
      quantity_delta: -5,
      movement_type: InventoryMovementType.ORDER_CONSUMPTION,
      reason: 'Order ORD-101 fulfilled',
    });

    assert.strictEqual(movement.quantity_delta, -5);
    const movements = await inventoryRepo.listMovements('br-inv');
    assert.strictEqual(movements.length, 1);
    assert.strictEqual(movements[0].movement_type, InventoryMovementType.ORDER_CONSUMPTION);
  });

  it('proves OrderRepository creation with snapshots and branch scoping', async () => {
    await branchRepo.create({ id: 'br-ord', name: 'Branch Ord', code: 'ORD-01' });
    const user = await userRepo.create({
      id: 'usr-cust',
      firebase_uid: 'fb-cust-99',
      email: 'customer@example.com',
      display_name: 'Rahul K',
    });
    const cat = await productRepo.createCategory({
      id: 'cat-ord',
      branch_id: 'br-ord',
      name: 'Sundaes',
    });
    const prod = await productRepo.create({
      id: 'prod-ord',
      branch_id: 'br-ord',
      category_id: cat.id,
      name: 'Hot Brownie Sundae',
      price: 220,
    });

    const order = await orderRepo.create({
      id: 'ord-1001',
      order_number: 'ORD-1001',
      branch_id: 'br-ord',
      customer_user_id: user.id,
      status: OrderStatus.PENDING,
      subtotal: 220,
      discount: 0,
      tax: 11,
      total: 231,
      payment_status: PaymentStatus.PENDING,
      payment_method: PaymentMethod.UPI,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      items: [
        {
          id: 'item-1001-1',
          product_id: prod.id,
          product_name_snapshot: 'Hot Brownie Sundae',
          unit_price_snapshot: 220,
          quantity: 1,
          line_discount: 0,
          line_total: 220,
        },
      ],
    });

    assert.strictEqual(order.id, 'ord-1001');
    assert.strictEqual(order.total, 231);

    const items = await orderRepo.getOrderItems(order.id);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].product_name_snapshot, 'Hot Brownie Sundae');
    assert.strictEqual(items[0].unit_price_snapshot, 220);

    const branchOrders = await orderRepo.listByBranch('br-ord');
    assert.strictEqual(branchOrders.length, 1);

    const custOrders = await orderRepo.listByCustomer(user.id);
    assert.strictEqual(custOrders.length, 1);

    // Branch order lookup via findByBranch
    const scopedOrder = await orderRepo.findByBranch('br-ord', 'ord-1001');
    assert.ok(scopedOrder);
    assert.strictEqual(scopedOrder.id, 'ord-1001');

    // Cross-branch order lookup must return null
    const crossBranchOrder = await orderRepo.findByBranch('br-other', 'ord-1001');
    assert.strictEqual(crossBranchOrder, null);
  });
});
