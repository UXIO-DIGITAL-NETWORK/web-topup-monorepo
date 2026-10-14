<?php

namespace App\Http\Resources\Api\Storefront;

use App\Support\Storefront\MediaUrl;
use App\Support\Storefront\OrderFormFields;
use Illuminate\Http\Request;

/**
 * GameResource plus everything the checkout page needs to render:
 * the description, the SEO block, and the identity fields to ask for.
 */
class GameDetailResource extends GameResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'description' => $this->description,

            // Drives the "Account Detail" step. Field #1 maps to target_uid and
            // field #2 to target_server — checkout accepts nothing else.
            'order_form_fields' => OrderFormFields::for($this->resource),

            // Whether the storefront should offer a "Cek Username" action.
            //
            // TEMPORARILY OFF (2026-10-14): the operator asked for the nickname
            // check to be out of the way for now, on the product form, the
            // category form and the storefront alike. Turning it off here is the
            // whole switch — the checkout page only offers the button when this
            // is true, so no storefront build had to change.
            //
            // To restore, bring back the original condition and drop the `false`:
            //   (bool) $this->nickname_check_enabled
            //       && trim((string) $this->validasi_nickname) !== ''
            //
            // The columns and the admin's stored values are deliberately left in
            // place, so switching back needs no re-entry of provider URLs.
            'supports_nickname_check' => false,

            'meta' => [
                'title' => $this->meta_title,
                'description' => $this->meta_description,
                'keywords' => $this->meta_keywords ?? [],
                'robots' => $this->meta_robots,
                'og_image_url' => MediaUrl::for($this->og_image),
            ],
        ];
    }
}
