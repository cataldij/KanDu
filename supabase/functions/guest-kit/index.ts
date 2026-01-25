/**
 * Guest Kit Management Edge Function
 * Handles CRUD operations for guest kits and items
 *
 * Endpoints:
 * POST /functions/v1/guest-kit
 *   - action: 'create' | 'update' | 'delete' | 'get' | 'list'
 *   - action: 'add-item' | 'update-item' | 'delete-item'
 *   - action: 'generate-slug'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAuth, unauthorizedResponse, errorResponse, successResponse } from '../_shared/auth.ts';

interface HomeBaseImage {
  url: string;
  angle: 'front' | 'right' | 'back' | 'left' | 'exit';
  description?: string;
}

interface GuestKit {
  id?: string;
  user_id?: string;
  slug?: string;
  kit_type?: 'home' | 'rental';
  display_name: string;
  expires_at?: string;
  is_active?: boolean;
  access_pin?: string;
  homeowner_name?: string;
  homeowner_phone?: string;
  show_phone_to_guest?: boolean;
  home_base_image_url?: string;
  home_base_images?: HomeBaseImage[]; // Multi-angle kitchen scan
  home_base_scan_complete?: boolean;
  home_base_description?: string;
  wifi_network?: string;
  wifi_password?: string;
  address?: string;
  show_address?: boolean;
  checkin_time?: string;
  checkout_time?: string;
  checkin_instructions?: string;
  checkout_instructions?: string;
  house_rules?: string;
}

interface GuestKitItem {
  id?: string;
  kit_id: string;
  zone_id?: string;
  item_type: string;
  custom_name?: string;
  hint?: string;
  overview_image_url?: string;
  destination_image_url: string;
  control_image_url?: string;
  instructions?: string;
  warning_text?: string;
  route_description?: string;
  priority?: 'critical' | 'important' | 'helpful';
  category?: 'safety' | 'utilities' | 'appliances' | 'info';
  display_order?: number;
  icon_name?: string;
}

interface ZoneImage {
  url: string;
  angle: 'front' | 'right' | 'back' | 'left';
  description?: string;
}

interface PathwayImage {
  url: string;
  sequence: number;
  label: string;
  description?: string;
}

interface GuestKitZone {
  id?: string;
  kit_id: string;
  name: string;
  zone_type: string;
  icon_name?: string;
  zone_images?: ZoneImage[];
  zone_scan_complete?: boolean;
  zone_description?: string;
  pathway_images?: PathwayImage[];
  pathway_complete?: boolean;
  pathway_description?: string;
  display_order?: number;
}

// Zone type icons mapping
const ZONE_TYPE_ICONS: Record<string, string> = {
  basement: 'layers',
  garage: 'car',
  utility_room: 'construct',
  laundry: 'shirt',
  bedroom: 'bed',
  bathroom: 'water',
  outdoor: 'leaf',
  attic: 'home',
  custom: 'location',
};

// Item type definitions with icons and default names
const ITEM_TYPES = {
  // Safety (Critical)
  water_shutoff: { name: 'Water Shutoff', icon: 'water', priority: 'critical', category: 'safety' },
  gas_shutoff: { name: 'Gas Shutoff', icon: 'flame', priority: 'critical', category: 'safety' },
  electrical_panel: { name: 'Electrical Panel', icon: 'flash', priority: 'critical', category: 'safety' },
  fire_extinguisher: { name: 'Fire Extinguisher', icon: 'bonfire', priority: 'critical', category: 'safety' },
  first_aid: { name: 'First Aid Kit', icon: 'medkit', priority: 'critical', category: 'safety' },
  emergency_exits: { name: 'Emergency Exits', icon: 'exit', priority: 'critical', category: 'safety' },
  smoke_detector: { name: 'Smoke Detector', icon: 'alert-circle', priority: 'important', category: 'safety' },
  co_detector: { name: 'CO Detector', icon: 'warning', priority: 'important', category: 'safety' },

  // Utilities (Important)
  thermostat: { name: 'Thermostat', icon: 'thermometer', priority: 'important', category: 'utilities' },
  water_heater: { name: 'Water Heater', icon: 'water', priority: 'important', category: 'utilities' },
  furnace: { name: 'Furnace', icon: 'flame', priority: 'important', category: 'utilities' },
  ac_unit: { name: 'AC Unit', icon: 'snow', priority: 'important', category: 'utilities' },
  circuit_breaker: { name: 'Circuit Breaker', icon: 'flash', priority: 'important', category: 'utilities' },

  // Appliances (Helpful)
  washer_dryer: { name: 'Washer & Dryer', icon: 'shirt', priority: 'helpful', category: 'appliances' },
  dishwasher: { name: 'Dishwasher', icon: 'cafe', priority: 'helpful', category: 'appliances' },
  oven: { name: 'Oven', icon: 'flame', priority: 'helpful', category: 'appliances' },
  garbage_disposal: { name: 'Garbage Disposal', icon: 'trash', priority: 'helpful', category: 'appliances' },
  coffee_maker: { name: 'Coffee Maker', icon: 'cafe', priority: 'helpful', category: 'appliances' },
  tv_remote: { name: 'TV & Remote', icon: 'tv', priority: 'helpful', category: 'appliances' },

  // Info (Helpful)
  wifi_router: { name: 'WiFi Router', icon: 'wifi', priority: 'helpful', category: 'info' },
  garage_door: { name: 'Garage Door', icon: 'car', priority: 'helpful', category: 'info' },
  door_locks: { name: 'Door Locks', icon: 'key', priority: 'helpful', category: 'info' },
  trash_recycling: { name: 'Trash & Recycling', icon: 'trash-bin', priority: 'helpful', category: 'info' },
  pool_controls: { name: 'Pool Controls', icon: 'water', priority: 'helpful', category: 'info' },
  hot_tub: { name: 'Hot Tub', icon: 'water', priority: 'helpful', category: 'info' },

  // Custom
  custom: { name: 'Custom Item', icon: 'location', priority: 'helpful', category: 'info' },
};

// Helper to ensure storage bucket exists
async function ensureStorageBucket(supabase: any, bucketName: string): Promise<void> {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    const bucketExists = buckets?.some((b: any) => b.name === bucketName);
    if (!bucketExists) {
      console.log(`Creating storage bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      });
      if (createError && !createError.message?.includes('already exists')) {
        console.error('Error creating bucket:', createError);
      } else {
        console.log(`Storage bucket '${bucketName}' created successfully`);
      }
    }
  } catch (err) {
    console.error('ensureStorageBucket error:', err);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return unauthorizedResponse(authError || 'Authentication required');
    }

    const body = await req.json();
    const { action } = body;

    console.log(`[guest-kit] Action: ${action}, User: ${user.id}`);

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ensure storage bucket exists for image-related actions
    if (['create', 'update', 'add-item', 'update-item', 'create-zone', 'update-zone'].includes(action)) {
      await ensureStorageBucket(supabase, 'images');
    }

    switch (action) {
      // ============================================
      // GUEST KIT OPERATIONS
      // ============================================

      case 'create': {
        const { kit } = body as { kit: GuestKit };

        console.log('[guest-kit] Creating new kit:', JSON.stringify(kit, null, 2).substring(0, 500));

        if (!kit.display_name) {
          return errorResponse('display_name is required', 400);
        }

        // Generate slug from display name
        console.log('[guest-kit] Generating slug for:', kit.display_name);
        const { data: slugData, error: slugError } = await supabase
          .rpc('generate_guest_kit_slug', { base_name: kit.display_name });

        if (slugError) {
          console.error('[guest-kit] Slug generation error:', slugError);
          return errorResponse(`Failed to generate slug: ${slugError.message}`, 500);
        }
        console.log('[guest-kit] Generated slug:', slugData);

        const newKit = {
          user_id: user.id,
          slug: slugData,
          kit_type: kit.kit_type || 'home',
          display_name: kit.display_name,
          expires_at: kit.expires_at || null,
          is_active: true,
          access_pin: kit.access_pin || null,
          homeowner_name: kit.homeowner_name || null,
          homeowner_phone: kit.homeowner_phone || null,
          show_phone_to_guest: kit.show_phone_to_guest ?? true,
          home_base_image_url: kit.home_base_image_url || null,
          home_base_images: kit.home_base_images || [],
          home_base_scan_complete: kit.home_base_scan_complete ?? false,
          home_base_description: kit.home_base_description || 'Kitchen',
          wifi_network: kit.wifi_network || null,
          wifi_password: kit.wifi_password || null,
          address: kit.address || null,
          show_address: kit.show_address ?? false,
          checkin_time: kit.checkin_time || null,
          checkout_time: kit.checkout_time || null,
          checkin_instructions: kit.checkin_instructions || null,
          checkout_instructions: kit.checkout_instructions || null,
          house_rules: kit.house_rules || null,
        };

        console.log('[guest-kit] Inserting kit into database...');
        const { data, error } = await supabase
          .from('guest_kits')
          .insert(newKit)
          .select()
          .single();

        if (error) {
          console.error('[guest-kit] Create kit error:', error);
          console.error('[guest-kit] Error details:', JSON.stringify(error, null, 2));
          return errorResponse(`Failed to create guest kit: ${error.message}`, 500);
        }

        console.log('[guest-kit] Kit created successfully:', data.id);
        return successResponse({ kit: data, itemTypes: ITEM_TYPES });
      }

      case 'update': {
        const { kitId, updates } = body as { kitId: string; updates: Partial<GuestKit> };

        if (!kitId) {
          return errorResponse('kitId is required', 400);
        }

        // Remove fields that shouldn't be updated directly
        delete updates.id;
        delete updates.user_id;
        delete updates.slug;

        const { data, error } = await supabase
          .from('guest_kits')
          .update(updates)
          .eq('id', kitId)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) {
          console.error('Update kit error:', error);
          return errorResponse('Failed to update guest kit', 500);
        }

        return successResponse({ kit: data });
      }

      case 'delete': {
        const { kitId } = body as { kitId: string };

        if (!kitId) {
          return errorResponse('kitId is required', 400);
        }

        const { error } = await supabase
          .from('guest_kits')
          .delete()
          .eq('id', kitId)
          .eq('user_id', user.id);

        if (error) {
          console.error('Delete kit error:', error);
          return errorResponse('Failed to delete guest kit', 500);
        }

        return successResponse({ deleted: true });
      }

      case 'get': {
        const { kitId } = body as { kitId: string };

        if (!kitId) {
          return errorResponse('kitId is required', 400);
        }

        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('*')
          .eq('id', kitId)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Guest kit not found', 404);
        }

        // Get items for this kit
        const { data: items, error: itemsError } = await supabase
          .from('guest_kit_items')
          .select('*')
          .eq('kit_id', kitId)
          .order('display_order', { ascending: true });

        return successResponse({
          kit,
          items: items || [],
          itemTypes: ITEM_TYPES,
        });
      }

      case 'list': {
        const { data: kits, error } = await supabase
          .from('guest_kits')
          .select(`
            *,
            guest_kit_items(count)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('List kits error:', error);
          return errorResponse('Failed to list guest kits', 500);
        }

        return successResponse({ kits: kits || [], itemTypes: ITEM_TYPES });
      }

      // ============================================
      // ITEM OPERATIONS
      // ============================================

      case 'add-item': {
        const { item } = body as { item: GuestKitItem };

        if (!item.kit_id || !item.item_type || !item.destination_image_url) {
          return errorResponse('kit_id, item_type, and destination_image_url are required', 400);
        }

        // Verify user owns this kit
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', item.kit_id)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Guest kit not found or unauthorized', 404);
        }

        // Get item type defaults
        const itemTypeDefaults = ITEM_TYPES[item.item_type as keyof typeof ITEM_TYPES] || ITEM_TYPES.custom;

        // Get next display order
        const { data: lastItem } = await supabase
          .from('guest_kit_items')
          .select('display_order')
          .eq('kit_id', item.kit_id)
          .order('display_order', { ascending: false })
          .limit(1)
          .single();

        const newItem = {
          kit_id: item.kit_id,
          item_type: item.item_type,
          custom_name: item.custom_name || null,
          hint: item.hint || null,
          overview_image_url: item.overview_image_url || null,
          destination_image_url: item.destination_image_url,
          control_image_url: item.control_image_url || null,
          instructions: item.instructions || null,
          warning_text: item.warning_text || null,
          route_description: item.route_description || null,
          priority: item.priority || itemTypeDefaults.priority,
          category: item.category || itemTypeDefaults.category,
          display_order: item.display_order ?? ((lastItem?.display_order || 0) + 1),
          icon_name: item.icon_name || itemTypeDefaults.icon,
        };

        const { data, error } = await supabase
          .from('guest_kit_items')
          .insert(newItem)
          .select()
          .single();

        if (error) {
          console.error('Add item error:', error);
          return errorResponse('Failed to add item', 500);
        }

        return successResponse({ item: data });
      }

      case 'update-item': {
        const { itemId, updates } = body as { itemId: string; updates: Partial<GuestKitItem> };

        if (!itemId) {
          return errorResponse('itemId is required', 400);
        }

        // Verify user owns the kit that contains this item
        const { data: existingItem, error: itemCheckError } = await supabase
          .from('guest_kit_items')
          .select('kit_id')
          .eq('id', itemId)
          .single();

        if (itemCheckError || !existingItem) {
          return errorResponse('Item not found', 404);
        }

        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', existingItem.kit_id)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Unauthorized', 403);
        }

        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.kit_id;

        const { data, error } = await supabase
          .from('guest_kit_items')
          .update(updates)
          .eq('id', itemId)
          .select()
          .single();

        if (error) {
          console.error('Update item error:', error);
          return errorResponse('Failed to update item', 500);
        }

        return successResponse({ item: data });
      }

      case 'delete-item': {
        const { itemId } = body as { itemId: string };

        if (!itemId) {
          return errorResponse('itemId is required', 400);
        }

        // Verify user owns the kit
        const { data: existingItem } = await supabase
          .from('guest_kit_items')
          .select('kit_id')
          .eq('id', itemId)
          .single();

        if (!existingItem) {
          return errorResponse('Item not found', 404);
        }

        const { data: kit } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', existingItem.kit_id)
          .eq('user_id', user.id)
          .single();

        if (!kit) {
          return errorResponse('Unauthorized', 403);
        }

        const { error } = await supabase
          .from('guest_kit_items')
          .delete()
          .eq('id', itemId);

        if (error) {
          console.error('Delete item error:', error);
          return errorResponse('Failed to delete item', 500);
        }

        return successResponse({ deleted: true });
      }

      case 'get-item-types': {
        return successResponse({ itemTypes: ITEM_TYPES });
      }

      // ============================================
      // ZONE OPERATIONS
      // ============================================

      case 'create-zone': {
        const { zone } = body as { zone: GuestKitZone };

        if (!zone.kit_id || !zone.name || !zone.zone_type) {
          return errorResponse('kit_id, name, and zone_type are required', 400);
        }

        // Verify user owns this kit
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', zone.kit_id)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Guest kit not found or unauthorized', 404);
        }

        // Get next display order
        const { data: lastZone } = await supabase
          .from('guest_kit_zones')
          .select('display_order')
          .eq('kit_id', zone.kit_id)
          .order('display_order', { ascending: false })
          .limit(1)
          .single();

        const newZone = {
          kit_id: zone.kit_id,
          name: zone.name,
          zone_type: zone.zone_type,
          icon_name: zone.icon_name || ZONE_TYPE_ICONS[zone.zone_type] || 'location',
          zone_images: zone.zone_images || [],
          zone_scan_complete: zone.zone_scan_complete || false,
          zone_description: zone.zone_description || null,
          pathway_images: zone.pathway_images || [],
          pathway_complete: zone.pathway_complete || false,
          pathway_description: zone.pathway_description || null,
          display_order: zone.display_order ?? ((lastZone?.display_order || 0) + 1),
        };

        const { data, error } = await supabase
          .from('guest_kit_zones')
          .insert(newZone)
          .select()
          .single();

        if (error) {
          console.error('Create zone error:', error);
          return errorResponse('Failed to create zone', 500);
        }

        return successResponse({ zone: data });
      }

      case 'update-zone': {
        const { zoneId, updates } = body as { zoneId: string; updates: Partial<GuestKitZone> };

        if (!zoneId) {
          return errorResponse('zoneId is required', 400);
        }

        // Verify user owns the kit that contains this zone
        const { data: existingZone, error: zoneCheckError } = await supabase
          .from('guest_kit_zones')
          .select('kit_id')
          .eq('id', zoneId)
          .single();

        if (zoneCheckError || !existingZone) {
          return errorResponse('Zone not found', 404);
        }

        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', existingZone.kit_id)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Unauthorized', 403);
        }

        // Remove fields that shouldn't be updated
        delete (updates as any).id;
        delete (updates as any).kit_id;

        const { data, error } = await supabase
          .from('guest_kit_zones')
          .update(updates)
          .eq('id', zoneId)
          .select()
          .single();

        if (error) {
          console.error('Update zone error:', error);
          return errorResponse('Failed to update zone', 500);
        }

        return successResponse({ zone: data });
      }

      case 'delete-zone': {
        const { zoneId } = body as { zoneId: string };

        if (!zoneId) {
          return errorResponse('zoneId is required', 400);
        }

        // Verify user owns the kit
        const { data: existingZone } = await supabase
          .from('guest_kit_zones')
          .select('kit_id')
          .eq('id', zoneId)
          .single();

        if (!existingZone) {
          return errorResponse('Zone not found', 404);
        }

        const { data: kit } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', existingZone.kit_id)
          .eq('user_id', user.id)
          .single();

        if (!kit) {
          return errorResponse('Unauthorized', 403);
        }

        // Delete the zone (items will have zone_id set to null due to ON DELETE SET NULL)
        const { error } = await supabase
          .from('guest_kit_zones')
          .delete()
          .eq('id', zoneId);

        if (error) {
          console.error('Delete zone error:', error);
          return errorResponse('Failed to delete zone', 500);
        }

        return successResponse({ deleted: true });
      }

      case 'list-zones': {
        const { kitId } = body as { kitId: string };

        if (!kitId) {
          return errorResponse('kitId is required', 400);
        }

        // Verify user owns this kit
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', kitId)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Guest kit not found or unauthorized', 404);
        }

        const { data: zones, error } = await supabase
          .from('guest_kit_zones')
          .select('*')
          .eq('kit_id', kitId)
          .order('display_order', { ascending: true });

        if (error) {
          console.error('List zones error:', error);
          return errorResponse('Failed to list zones', 500);
        }

        return successResponse({ zones: zones || [] });
      }

      case 'get-zone': {
        const { zoneId } = body as { zoneId: string };

        if (!zoneId) {
          return errorResponse('zoneId is required', 400);
        }

        const { data: zone, error: zoneError } = await supabase
          .from('guest_kit_zones')
          .select('*')
          .eq('id', zoneId)
          .single();

        if (zoneError || !zone) {
          return errorResponse('Zone not found', 404);
        }

        // Verify user owns this kit
        const { data: kit, error: kitError } = await supabase
          .from('guest_kits')
          .select('id')
          .eq('id', zone.kit_id)
          .eq('user_id', user.id)
          .single();

        if (kitError || !kit) {
          return errorResponse('Unauthorized', 403);
        }

        // Get items in this zone
        const { data: items } = await supabase
          .from('guest_kit_items')
          .select('*')
          .eq('zone_id', zoneId)
          .order('display_order', { ascending: true });

        return successResponse({ zone, items: items || [] });
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[guest-kit] Function error:', error.message);
    return errorResponse('Internal server error', 500);
  }
});
