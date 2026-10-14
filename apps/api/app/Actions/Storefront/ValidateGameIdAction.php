<?php

declare(strict_types=1);

namespace App\Actions\Storefront;

use App\Models\Category;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Resolve a player's in-game nickname from their id.
 *
 * `categories.validasi_nickname` names the provider to ask. Only URL templates
 * (http/https) are understood — a free third-party lookup endpoint. The legacy
 * supplier-backed providers (`digiflazz:{sku}` / `product:{id}`) are gone:
 * uxiolabs has no cek-username endpoint, so those values now resolve to
 * "unsupported" (nickname null) rather than erroring.
 *
 * Most games have no provider configured, and that is a normal state — not an
 * error:
 *
 *   - unconfigured game  → {nickname: null, validated: false, supported: false}
 *   - provider says no   → {nickname: null, validated: false, supported: true}
 *   - provider errors    → same as unconfigured, plus a log line
 *
 * This endpoint MUST NOT be able to block a purchase. Every failure path
 * degrades to "no nickname" and checkout carries on; the storefront hides the
 * nickname line when it is null.
 */
class ValidateGameIdAction
{
    private const TIMEOUT_SECONDS = 4;

    /**
     * TEMPORARILY OFF (2026-10-14) — the operator asked for the nickname check to
     * be out of the way for now. The storefront's button is driven by
     * GameDetailResource's flag, which is off too; this constant is defence in
     * depth, so a stale client bundle or a direct call to the endpoint cannot
     * reach the provider either. Restore by flipping this to true and bringing
     * back the flag in GameDetailResource.
     */
    private const ENABLED = false;

    /** @return array{nickname: string|null, validated: bool, supported: bool} */
    public function execute(Category $game, string $userId, ?string $serverId): array
    {
        if (! self::ENABLED) {
            return $this->unsupported();
        }

        $provider = trim((string) $game->validasi_nickname);

        if ($provider === '') {
            return $this->unsupported();
        }

        // A free third-party URL template. Anything else — including leftover
        // supplier-backed values (`digiflazz:`/`product:`) from before the
        // uxiolabs migration — is unsupported, never an error.
        if (str_starts_with($provider, 'http://') || str_starts_with($provider, 'https://')) {
            return $this->resolveViaUrl($game, $provider, $userId, $serverId);
        }

        return $this->unsupported();
    }

    /** @return array{nickname: string|null, validated: bool, supported: bool} */
    private function resolveViaUrl(Category $game, string $provider, string $userId, ?string $serverId): array
    {
        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->acceptJson()
                ->get($this->buildUrl($provider, $userId, $serverId));

            if ($response->failed()) {
                return ['nickname' => null, 'validated' => false, 'supported' => true];
            }

            $nickname = $this->extractNickname($response->json());

            return [
                'nickname' => $nickname,
                'validated' => $nickname !== null,
                'supported' => true,
            ];
        } catch (Throwable $e) {
            // Never rethrow: a provider outage must not take checkout down.
            Log::warning('Game id validation failed', [
                'game' => $game->code,
                'error' => $e->getMessage(),
            ]);

            return $this->unsupported();
        }
    }

    private function buildUrl(string $template, string $userId, ?string $serverId): string
    {
        $replaced = strtr($template, [
            '{user_id}' => rawurlencode($userId),
            '{server_id}' => rawurlencode((string) $serverId),
            '{customer_no}' => rawurlencode($userId.(string) $serverId),
        ]);

        // No placeholders in the template → append the pair as query params so a
        // plain endpoint URL still works.
        if ($replaced === $template) {
            $separator = str_contains($template, '?') ? '&' : '?';
            $replaced = $template.$separator.http_build_query(array_filter([
                'user_id' => $userId,
                'server_id' => $serverId,
            ]));
        }

        return $replaced;
    }

    /**
     * Providers disagree on where the nickname lives; probe the common keys
     * rather than committing to one vendor's envelope.
     */
    private function extractNickname(mixed $payload): ?string
    {
        if (! is_array($payload)) {
            return null;
        }

        foreach (['nickname', 'username', 'name', 'player_name'] as $key) {
            $value = data_get($payload, $key) ?? data_get($payload, "data.{$key}");

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /**
     * Supplier-backed lookups cached a resolved name here; without them there is
     * never a server-side cached nickname (URL lookups are free and re-run
     * client-side). Kept so checkout's call site stays unchanged.
     */
    public function cachedNickname(Category $game, string $userId, ?string $serverId): ?string
    {
        return null;
    }

    /** @return array{nickname: null, validated: false, supported: false} */
    private function unsupported(): array
    {
        return ['nickname' => null, 'validated' => false, 'supported' => false];
    }
}
