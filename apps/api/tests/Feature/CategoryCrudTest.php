<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\CategoryType;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryCrudTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    private function actingAsMember(): void
    {
        $role = Role::factory()->create(['name' => 'Member']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_categories_require_authentication(): void
    {
        $this->getJson('/api/v1/categories')->assertUnauthorized();
    }

    public function test_categories_are_forbidden_for_non_admin_roles(): void
    {
        $this->actingAsMember();

        $this->getJson('/api/v1/categories')->assertForbidden();
    }

    public function test_can_create_and_list_category_with_seo_and_order_form_fields(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();

        $this->postJson('/api/v1/categories', [
            'type_id' => $type->id,
            'name' => 'Mobile Legends',
            'sub_name' => 'Diamonds',
            'code' => 'ml-diamonds',
            'slug' => 'mobile-legends-diamonds',
            'uid_parser' => 'ML UID+Zone Parser',
            'region' => 'Southeast Asia',
            'status' => true,
            'order_form_fields' => [
                ['key' => 'user_id', 'label' => 'User ID', 'required' => true],
                ['key' => 'zone_id', 'label' => 'Zone ID', 'required' => true],
            ],
            'meta_title' => 'Top Up ML Diamonds',
            'meta_description' => 'Cheapest ML diamonds top up.',
            'meta_keywords' => ['top up ml', 'diamond ml'],
            'meta_robots' => 'Index, Follow',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Mobile Legends')
            ->assertJsonPath('data.slug', 'mobile-legends-diamonds')
            ->assertJsonPath('data.order_form_fields.0.key', 'user_id')
            ->assertJsonPath('data.meta_keywords.1', 'diamond ml');

        $this->getJson('/api/v1/categories?search=Mobile&per_page=5')
            ->assertOk()
            ->assertJsonPath('data.data.0.code', 'ml-diamonds')
            ->assertJsonPath('data.meta.per_page', 5);
    }

    public function test_thumbnail_and_banner_uploads_persist_and_reach_the_storefront(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();

        // Thumbnail = portrait card background; banner = wide checkout header.
        // Both are separate from the square logo overlay.
        $response = $this->postJson('/api/v1/categories', [
            'type_id' => $type->id,
            'name' => 'Mobile Legends',
            'code' => 'ml-diamonds',
            'slug' => 'mobile-legends',
            'status' => true,
            'thumbnail' => UploadedFile::fake()->image('card.jpg', 600, 800),
            'banner' => UploadedFile::fake()->image('header.jpg', 1600, 400),
        ])->assertCreated();

        $thumbnailPath = Category::firstWhere('code', 'ml-diamonds')->thumbnail;
        $bannerPath = Category::firstWhere('code', 'ml-diamonds')->banner;

        $this->assertNotNull($thumbnailPath, 'thumbnail column should be populated');
        $this->assertNotNull($bannerPath, 'banner column should be populated');
        Storage::disk('public')->assertExists($thumbnailPath);
        Storage::disk('public')->assertExists($bannerPath);

        $response
            ->assertJsonPath('data.thumbnail', $thumbnailPath)
            ->assertJsonPath('data.banner', $bannerPath);

        // The storefront card reads thumbnail_url as its background; banner_url
        // is the checkout header. Both must now be non-null.
        $game = $this->getJson('/api/v1/games/mobile-legends')->assertOk()->json('data');
        $this->assertNotNull($game['thumbnail_url']);
        $this->assertNotNull($game['banner_url']);
    }

    public function test_updating_a_thumbnail_replaces_the_previous_file(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        $category = Category::factory()->create([
            'type_id' => $type->id,
            'thumbnail' => 'categories/thumbnails/old.webp',
        ]);
        Storage::disk('public')->put('categories/thumbnails/old.webp', 'stale');

        $this->putJson("/api/v1/categories/{$category->id}", [
            'type_id' => $type->id,
            'name' => $category->name,
            'code' => $category->code,
            'status' => true,
            'thumbnail' => UploadedFile::fake()->image('new.jpg', 600, 800),
        ])->assertOk();

        Storage::disk('public')->assertMissing('categories/thumbnails/old.webp');
        Storage::disk('public')->assertExists($category->fresh()->thumbnail);
    }

    public function test_validation_rejects_duplicate_code_and_slug(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        Category::factory()->create(['code' => 'taken-code', 'slug' => 'taken-slug', 'type_id' => $type->id]);

        $this->postJson('/api/v1/categories', [
            'type_id' => $type->id,
            'name' => 'Duplicate',
            'code' => 'taken-code',
            'slug' => 'taken-slug',
            'status' => true,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['code', 'slug']);
    }

    public function test_can_update_and_delete_category(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        $category = Category::factory()->create(['type_id' => $type->id, 'name' => 'Old Name']);

        $this->putJson("/api/v1/categories/{$category->id}", [
            'type_id' => $type->id,
            'name' => 'New Name',
            'code' => $category->code,
            'status' => false,
        ])->assertOk()
            ->assertJsonPath('data.name', 'New Name')
            ->assertJsonPath('data.status', false);

        $this->deleteJson("/api/v1/categories/{$category->id}")->assertOk();
        $this->assertDatabaseCount('categories', 0);
    }

    public function test_nickname_check_toggle_still_persists_while_the_storefront_flag_is_off(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        $category = Category::factory()->create([
            'type_id' => $type->id,
            'slug' => 'free-fire',
            'validasi_nickname' => 'https://api.example.com/validate/ff',
            'nickname_check_enabled' => true,
        ]);

        // Turn the check off — the form resubmits the provider, which stays put.
        $this->putJson("/api/v1/categories/{$category->id}", [
            'type_id' => $type->id,
            'name' => $category->name,
            'code' => $category->code,
            'slug' => 'free-fire',
            'status' => true,
            'validasi_nickname' => 'https://api.example.com/validate/ff',
            'nickname_check_enabled' => false,
        ])->assertOk();

        // The stored values survive, so switching the feature back on needs no
        // re-entry of the provider URL.
        $this->assertDatabaseHas('categories', [
            'id' => $category->id,
            'nickname_check_enabled' => false,
            'validasi_nickname' => 'https://api.example.com/validate/ff',
        ]);
        $this->getJson('/api/v1/games/free-fire')
            ->assertOk()
            ->assertJsonPath('data.supports_nickname_check', false);

        // Flip it back on: it is stored again, but the storefront still gets
        // nothing while the platform-wide switch is off.
        $this->putJson("/api/v1/categories/{$category->id}", [
            'type_id' => $type->id,
            'name' => $category->name,
            'code' => $category->code,
            'slug' => 'free-fire',
            'status' => true,
            'validasi_nickname' => 'https://api.example.com/validate/ff',
            'nickname_check_enabled' => true,
        ])->assertOk();

        $this->assertDatabaseHas('categories', [
            'id' => $category->id,
            'nickname_check_enabled' => true,
        ]);
        $this->getJson('/api/v1/games/free-fire')
            ->assertOk()
            ->assertJsonPath('data.supports_nickname_check', false);
    }

    public function test_order_form_fields_accepts_a_json_string_from_multipart(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        $category = Category::factory()->create(['type_id' => $type->id]);

        // The admin form posts multipart (it carries a logo file), so this nested
        // field arrives JSON-encoded as a string. It must still validate + persist
        // rather than 422 with "order form fields must be an array".
        $this->putJson("/api/v1/categories/{$category->id}", [
            'type_id' => $type->id,
            'name' => 'Mobile Legends',
            'code' => $category->code,
            'status' => true,
            'order_form_fields' => json_encode([
                'customer_no_template' => '{user_id}{zone_id}',
                'fields' => [
                    ['key' => 'user_id', 'label' => 'User ID', 'required' => true],
                    ['key' => 'zone_id', 'label' => 'Zone ID', 'required' => true],
                ],
            ]),
        ])->assertOk()
            ->assertJsonPath('data.order_form_fields.fields.0.key', 'user_id');
    }

    public function test_status_toggle_updates_status_without_touching_other_columns(): void
    {
        $this->actingAsAdmin();
        $type = CategoryType::factory()->create();
        $category = Category::factory()->create([
            'type_id' => $type->id,
            'name' => 'Mobile Legends',
            'code' => 'ml-diamonds',
            'sub_name' => 'Diamonds',
            'status' => true,
            'order_form_fields' => [
                ['key' => 'user_id', 'label' => 'User ID', 'required' => true],
            ],
        ]);

        // A status-only payload must succeed — the storefront switch does not
        // resend the whole entity — and must leave every other column intact.
        $this->postJson("/api/v1/categories/{$category->id}/status", ['status' => false])
            ->assertOk()
            ->assertJsonPath('data.status', false);

        $this->assertDatabaseHas('categories', [
            'id' => $category->id,
            'status' => false,
            'name' => 'Mobile Legends',
            'code' => 'ml-diamonds',
            'sub_name' => 'Diamonds',
        ]);
        $this->assertSame(
            [['key' => 'user_id', 'label' => 'User ID', 'required' => true]],
            $category->fresh()->order_form_fields,
        );
    }

    public function test_status_toggle_rejects_a_non_boolean_status(): void
    {
        $this->actingAsAdmin();
        $category = Category::factory()->create();

        $this->postJson("/api/v1/categories/{$category->id}/status", ['status' => 'nope'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);
    }

    public function test_list_filters_by_type_id(): void
    {
        $this->actingAsAdmin();
        $typeA = CategoryType::factory()->create();
        $typeB = CategoryType::factory()->create();
        Category::factory()->create(['type_id' => $typeA->id, 'name' => 'In Type A']);
        Category::factory()->create(['type_id' => $typeB->id, 'name' => 'In Type B']);

        $this->getJson("/api/v1/categories?type_id={$typeA->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.name', 'In Type A');
    }
}
