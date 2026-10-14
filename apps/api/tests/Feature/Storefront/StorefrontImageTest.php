<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Category;
use App\Models\CategoryType;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * An image an operator uploads in the admin has to be loadable by a customer on
 * the storefront.
 *
 * The two halves meet in exactly two places — the disk the file lands on, and
 * the URL the storefront resource builds for it — so both are pinned here,
 * including the case where the file is gone. The storefront renders whatever
 * `*_url` it is given, so a dead URL is a broken image there; null is not, it
 * is the bundled placeholder.
 */
class StorefrontImageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    public function test_a_logo_uploaded_in_the_admin_is_served_to_the_storefront(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $type = CategoryType::factory()->create();

        $this->postJson('/api/v1/categories', [
            'type_id' => $type->id,
            'name' => 'Mobile Legends',
            'code' => 'mlbb',
            'slug' => 'mobile-legends',
            'status' => true,
            'logo' => UploadedFile::fake()->image('logo.jpg', 1200, 1200),
        ])->assertCreated();

        // Where the admin's upload actually landed…
        $stored = Category::where('slug', 'mobile-legends')->value('logo');
        $this->assertNotNull($stored);
        Storage::disk('public')->assertExists($stored);

        // …is what the storefront is pointed at.
        $url = $this->getJson('/api/v1/games/mobile-legends')
            ->assertOk()
            ->json('data.logo_url');

        $this->assertIsString($url);
        $this->assertStringContainsString($stored, $url);
    }

    public function test_a_logo_replaced_in_the_admin_points_the_storefront_at_the_new_file(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $type = CategoryType::factory()->create();
        $category = Category::factory()->create([
            'type_id' => $type->id,
            'slug' => 'mobile-legends',
            'status' => true,
            'logo' => 'categories/logos/old.webp',
        ]);
        Storage::disk('public')->put('categories/logos/old.webp', 'old');

        $this->postJson("/api/v1/categories/{$category->id}", [
            '_method' => 'PUT',
            'type_id' => $type->id,
            'name' => $category->name,
            'code' => $category->code,
            'slug' => 'mobile-legends',
            'status' => true,
            'logo' => UploadedFile::fake()->image('new.jpg', 1200, 1200),
        ])->assertOk();

        $stored = $category->fresh()->logo;
        $this->assertNotSame('categories/logos/old.webp', $stored);
        Storage::disk('public')->assertExists($stored);

        // The replaced file is gone, so no customer can still be served it.
        Storage::disk('public')->assertMissing('categories/logos/old.webp');

        $url = $this->getJson('/api/v1/games/mobile-legends')
            ->assertOk()
            ->json('data.logo_url');

        $this->assertIsString($url);
        $this->assertStringContainsString($stored, $url);
    }

    public function test_a_missing_file_degrades_to_null_so_the_storefront_keeps_its_placeholder(): void
    {
        // A path carried over from another environment: the row says there is a
        // logo, the disk has nothing.
        Category::factory()->create([
            'slug' => 'mobile-legends',
            'status' => true,
            'logo' => 'categories/logos/gone.webp',
        ]);

        $this->getJson('/api/v1/games/mobile-legends')
            ->assertOk()
            ->assertJsonPath('data.logo_url', null);
    }
}
