<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_admin_routes_are_served_by_the_spa(): void
    {
        $this->withoutVite();

        $this->get('/admin/login')
            ->assertOk()
            ->assertViewIs('app')
            ->assertSee('name="app-base-path"', false);
    }

    public function test_representative_routes_are_served_by_the_spa(): void
    {
        $this->withoutVite();

        $this->get('/sales/login')
            ->assertOk()
            ->assertViewIs('app');
    }

    public function test_api_health_endpoint_returns_service_status(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJson([
                'status' => 'ok',
                'service' => config('app.name'),
            ]);
    }
}
