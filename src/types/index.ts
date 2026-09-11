// ============================================================================
// ZONE 1: CORE ENUMS & LITERALS
// ============================================================================

export type AnimalCategory = 'OWL' | 'RAPTOR' | 'MAMMAL' | 'EXOTIC' | 'INVERT' | 'AQUATIC' | string;
export type RecordType = 'INDIVIDUAL' | 'GROUP' | 'COLLECTION';
export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN' | 'MIXED_GROUP';
export type IUCNStatus = 'NE' | 'DD' | 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX';

// The new unified feeding outcome (replaces multiple booleans)
export type DietOutcome = 'EATEN' | 'REFUSED' | 'FASTING' | 'NOT_CAST' | 'REGURGITATED';

// The scheduling triage states
export type ScheduleStatus = 'PENDING' | 'COMPLETED' | 'REFUSED' | 'FASTING' | 'NOT_CAST';

// ============================================================================
// ZONE 2: DATABASE ENTITIES (EXACT POSTGRESQL ROW DEFINITIONS)
// ============================================================================

export interface User {
  id: string; // uuid
  email: string | null;
  name: string | null;
  role: string | null; // Mapped to RBAC
  initials: string | null; // Legacy, replaced by conducted_by UUIDs
  is_active: boolean;
  avatar_url: string | null;
  phone: string | null;
  pin: string | null;
  requires_password_change: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Animal {
  id: string; // uuid
  parent_group_id: string | null; // For enclosures or mobs
  record_type: RecordType; // Inferred from previous logic
  name: string;
  species: string | null;
  latin_name: string | null;
  category: AnimalCategory | null;
  location: string | null;
  profile_image_url: string | null;
  distribution_map_url: string | null;
  hazard_rating: string | null;
  is_venomous: boolean;
  weight_unit: string;
  flying_weight: number | null;
  winter_weight: number | null;
  average_target_weight: number | null;
  date_of_birth: string | null;
  is_dob_unknown: boolean;
  gender: Gender | null;
  microchip_id: string | null;
  ring_number: string | null;
  has_no_id: boolean;
  red_list_status: IUCNStatus;
  description: string | null;
  special_requirements: string | null;
  critical_husbandry_notes: string | null;
  ambient_temp_only: boolean;
  target_day_temp_c: number | null;
  target_night_temp_c: number | null;
  target_humidity_min_percent: number | null;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FeedingSchedule {
  id: string; // uuid
  animal_id: string; // uuid
  scheduled_date: string; // YYYY-MM-DD
  food_type: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  status: ScheduleStatus;
  supplements: string | null;
  notes: string | null;
  presentation_method: string | null;
  is_deleted: boolean;
  logged_feed_id: string | null; // uuid linking to feed_logs/daily_logs
  created_by: string | null; // uuid
  created_at?: string;
  updated_at?: string;
}

export interface DailyLog {
  id: string; // uuid
  animal_id: string; // uuid
  conducted_by: string; // uuid (Replaced 'initials' per KOA-Manager doc)
  recorded_at: string; // timestamp
  log_type: 'HUSBANDRY' | 'FEEDING' | 'CLINICAL' | 'NOTE';
  outcome: DietOutcome | null; // The new categorical field
  schedule_id: string | null; // Bidirectional link to FeedingSchedule
  food_item: string | null;
  quantity_offered: number | null;
  quantity_unit: string | null;
  supplements_given: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_by?: string; // uuid
  created_at?: string;
  updated_at?: string;
}

export interface WeightLog {
  id: string; // uuid
  animal_id: string; // uuid
  recorded_by: string; // uuid
  recorded_at: string; // timestamp
  weight: number;
  weight_unit: string;
  is_deleted: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OperationalList {
  id: string; // uuid
  category: string; // e.g., 'food_type', 'supplements', 'locations'
  name: string;
  animal_category: AnimalCategory | null; // Used to filter lists by Exotics/Owls
  is_deleted: boolean;
  created_at?: string;
}

export interface RBACMatrix {
  id: string;
  role: string;
  capabilities: string[]; // e.g., ['husbandry:read', 'clinical:write']
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// ZONE 3: COMPONENT & JOIN TYPES (DASHBOARD VIEWS)
// ============================================================================

/**
 * Used for the Exotics "Next Feed" Triage Radar
 * Contains the joined animal data necessary for the prep cards.
 */
export interface FeedingScheduleWithAnimal extends FeedingSchedule {
  animals: Pick<Animal, 'id' | 'name' | 'species' | 'category' | 'profile_image_url'>;
}

/**
 * Used for the grouped interval visualization (e.g., "5 feeds remaining")
 */
export interface GroupedFeedingSchedule {
  animal_id: string;
  food_type: string | null;
  quantity: number | null;
  supplements: string | null;
  feed_not_required: boolean;
  start_date: string;
  end_date: string;
  count: number;
  child_ids: string[]; // UUIDs of the grouped schedules
}

// ============================================================================
// ZONE 4: MUTATION PAYLOADS (WRITE LAYER)
// ============================================================================

/**
 * Payload sent from `<FeedModal />` or `<DailyLogFormModal />`
 * Omitts DB-generated fields to ensure type safety in offline mutations.
 */
export interface FeedLogPayload {
  animal_id: string;
  conducted_by: string; // Required UUID of the keeper
  recorded_at: string;
  log_type: 'FEEDING';
  outcome: DietOutcome;
  food_item?: string | null;
  quantity_offered?: number | null;
  quantity_unit?: string | null;
  supplements_given?: string | null;
  notes?: string | null;
  schedule_id?: string | null; // Null if ad-hoc
}

/**
 * Payload sent from `AnimalFormModal.tsx`
 */
export type AnimalPayload = Omit<Animal, 'id' | 'created_at' | 'updated_at'> & {
  id?: string; // Optional for updates vs inserts
};

/**
 * Payload sent from `<FeedingScheduleModal />`
 */
export interface CreateSchedulePayload {
  animal_id: string;
  scheduled_date: string;
  food_type: string | null;
  quantity: number | null;
  quantity_unit: string;
  status: ScheduleStatus;
  supplements: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_by: string;
}