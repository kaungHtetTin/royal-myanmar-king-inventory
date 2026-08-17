<?php

namespace App\Policies;

use App\Models\User;
use App\Services\UserAdministrationAccess;

class UserPolicy
{
    public function __construct(private readonly UserAdministrationAccess $access) {}

    public function update(User $actor, User $target): bool
    {
        return $this->access->allows($actor, $target);
    }
}
