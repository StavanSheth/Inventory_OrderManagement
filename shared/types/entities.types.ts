import { Id, IsoDateTimeUtc } from './common.types';
import { UserRole, MembershipStatus } from '../enums/roles.enum';
import { BranchStatus } from '../enums/branch.enum';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../enums/order.enum';
import { InventoryMovementType, InventoryItemType } from '../enums/inventory.enum';
import { DiscountType, OfferType } from '../enums/promotions.enum';

export interface Branch {
  id: Id;
  name: string;
  code: string;
  status: BranchStatus;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface User {
  id: Id;
  firebase_uid: string;
  email: string;
  display_name: string;
  phone?: string | null;
  role: UserRole;
  pin_hash?: string | null;
  failed_pin_attempts?: number;
  pin_locked_until?: IsoDateTimeUtc | null;
  status: string;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface BranchMembership {
  id: Id;
  user_id: Id;
  branch_id: Id;
  role: UserRole;
  status: MembershipStatus;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface CustomerProfile {
  id: Id;
  user_id: Id;
  preferred_branch_id?: Id | null;
  marketing_opt_in: boolean;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface Category {
  id: Id;
  branch_id: Id;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface ServingSizeOption {
  name: string;
  size: string;
  price: number;
}

export interface Product {
  id: Id;
  branch_id: Id;
  name: string;
  description?: string | null;
  category_id: Id;
  price: number; // in cents/paise or numeric unit
  selling_price?: number;
  tax_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  serving_size?: string;
  price_rate?: number;
  serving_sizes_json?: string;
  active: boolean;
  image_url?: string | null;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface RawMaterial {
  id: Id;
  branch_id: Id;
  name: string;
  unit: string;
  current_quantity: number;
  reorder_threshold: number;
  active: boolean;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface ProductComponent {
  id: Id;
  product_id: Id;
  raw_material_id: Id;
  quantity_required: number;
  unit: string;
}

export interface Inventory {
  id: Id;
  branch_id: Id;
  product_id: Id;
  quantity: number;
  reorder_threshold: number;
  selling_price?: number;
  tax_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  serving_size?: string;
  price_rate?: number;
  serving_sizes_json?: string;
  updated_at: IsoDateTimeUtc;
}

export interface InventoryMovement {
  id: Id;
  branch_id: Id;
  inventory_item_type: InventoryItemType;
  product_id?: Id | null;
  raw_material_id?: Id | null;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  reason?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  actor_user_id?: Id | null;
  created_at: IsoDateTimeUtc;
}

export interface Order {
  id: Id;
  order_number: string;
  branch_id: Id;
  customer_user_id: Id;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  coupon_id?: Id | null;
  offer_id?: Id | null;
  coupon_code_snapshot?: string | null;
  coupon_discount_snapshot?: number;
  offer_discount_snapshot?: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  placed_at: IsoDateTimeUtc;
  expires_at: IsoDateTimeUtc;
  confirmed_at?: IsoDateTimeUtc | null;
  completed_at?: IsoDateTimeUtc | null;
  cancelled_at?: IsoDateTimeUtc | null;
  expired_at?: IsoDateTimeUtc | null;
  last_edited_at?: IsoDateTimeUtc | null;
  cancellation_reason?: string | null;
  refund_amount?: number;
  items?: OrderItem[];
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface OrderItem {
  id: Id;
  order_id: Id;
  product_id: Id;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_discount: number;
  line_total: number;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface Payment {
  id: Id;
  order_id: Id;
  branch_id: Id;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  confirmed_by?: Id | null;
  confirmed_at?: IsoDateTimeUtc | null;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface Offer {
  id: Id;
  branch_id: Id;
  name: string;
  description?: string | null;
  offer_type: OfferType;
  configuration_json: string;
  start_at: IsoDateTimeUtc;
  end_at: IsoDateTimeUtc;
  active: boolean;
  usage_limit?: number | null;
  usage_count: number;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface Coupon {
  id: Id;
  branch_id: Id;
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount?: number | null;
  minimum_order_value: number;
  total_usage_limit?: number | null;
  per_user_usage_limit?: number | null;
  per_user_daily_limit?: number | null;
  start_at: IsoDateTimeUtc;
  end_at: IsoDateTimeUtc;
  active: boolean;
  usage_count: number;
  created_at: IsoDateTimeUtc;
  updated_at: IsoDateTimeUtc;
}

export interface CouponUsage {
  id: Id;
  coupon_id: Id;
  user_id: Id;
  order_id: Id;
  discount_amount: number;
  used_at: IsoDateTimeUtc;
}

export interface BranchSettings {
  id: Id;
  branch_id: Id;
  session_timeout_value: number;
  session_timeout_unit: string;
  order_expiry_minutes: number;
  order_edit_window_minutes: number;
  configuration_json?: string | null;
  updated_at: IsoDateTimeUtc;
}

export interface ApplicationSession {
  id: Id;
  session_token_hash: string;
  user_id: Id;
  branch_id?: Id | null;
  scope: 'BRANCH' | 'GLOBAL';
  authenticated_at: IsoDateTimeUtc;
  pin_verified_at?: IsoDateTimeUtc | null;
  expires_at: IsoDateTimeUtc;
  revoked_at?: IsoDateTimeUtc | null;
  created_at: IsoDateTimeUtc;
}

export interface AuditLog {
  id: Id;
  branch_id?: Id | null;
  actor_user_id?: Id | null;
  actor_type?: 'USER' | 'SYSTEM';
  action: string;
  entity_type: string;
  entity_id: string;
  metadata_json?: string | null;
  created_at: IsoDateTimeUtc;
}

export interface MessagingCampaign {
  id: Id;
  branch_id: Id;
  created_by: Id;
  audience_type: string;
  filters_json?: string | null;
  message_body: string;
  offer_id?: Id | null;
  status: string;
  simulated_count: number;
  created_at: IsoDateTimeUtc;
}

export interface DeletionJob {
  id: Id;
  requested_by: Id;
  branch_id?: Id | null;
  start_at: IsoDateTimeUtc;
  end_at: IsoDateTimeUtc;
  selected_modules_json: string;
  preview_counts_json?: string | null;
  status: string;
  created_at: IsoDateTimeUtc;
  completed_at?: IsoDateTimeUtc | null;
}
