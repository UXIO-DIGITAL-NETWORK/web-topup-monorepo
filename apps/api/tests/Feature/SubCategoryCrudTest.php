<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SubCategoryCrudTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_sub_categories_require_authentication(): void
    {
        $this->getJson('/api/v1/sub-categories')->assertUnauthorized();
    }

    public function test_can_create_list_update_and_delete_a_sub_category(): void
    {
        $this->actingAsAdmin();
        $category = Category::factory()->create();

        $created = $this->postJson('/api/v1/sub-categories', [
            'category_id' => $category->id,
            'name' => 'Diamonds',
            'logo' => UploadedFile::fake()->image('logo.jpg'),
            'status' => true,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Diamonds')
            ->assertJsonPath('data.category.id', $category->id)
            ->json('data');

        $this->getJson("/api/v1/sub-categories?category_id={$category->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data.data');

        $this->putJson("/api/v1/sub-categories/{$created['id']}", [
            'category_id' => $category->id,
            'name' => 'Weekly Diamonds',
            'status' => false,
        ])->assertOk()->assertJsonPath('data.name', 'Weekly Diamonds');

        $this->deleteJson("/api/v1/sub-categories/{$created['id']}")->assertOk();
        $this->assertDatabaseCount('sub_categories', 0);
    }

    public function test_store_and_update_both_accept_a_missing_logo(): void
    {
        $this->actingAsAdmin();
        $category = Category::factory()->create();

        // The form marks the logo optional, so a sub category has to be creatable
        // before its artwork exists — this used to 422 on a required `logo` rule.
        $created = $this->postJson('/api/v1/sub-categories', [
            'category_id' => $category->id,
            'name' => 'No logo',
            'status' => true,
        ])->assertCreated()->assertJsonPath('data.name', 'No logo')->json('data');

        $this->assertDatabaseHas('sub_categories', [
            'id' => $created['id'],
            'logo' => null,
        ]);

        $this->putJson("/api/v1/sub-categories/{$created['id']}", [
            'category_id' => $category->id,
            'name' => 'Still no logo',
            'status' => true,
        ])->assertOk()->assertJsonPath('data.name', 'Still no logo');

        $this->assertDatabaseHas('sub_categories', [
            'id' => $created['id'],
            'logo' => null,
        ]);
    }
}
