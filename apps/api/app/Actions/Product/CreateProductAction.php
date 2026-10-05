<?php

namespace App\Actions\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Pricing\WriteProductPricesAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\DTOs\Product\CreateProductDTO;
use App\Models\Product;
use App\Services\ImageOptimizer;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;

class CreateProductAction
{
    public function __construct(
        private CreateActivityLogAction $activityLogAction,
        private ImageOptimizer $images,
        private WriteProductPricesAction $writePrices,
        private MapProductToInternalSupplierAction $mapToInternal,
    ) {}

    public function execute(CreateProductDTO $dto): Product
    {
        $logoPath = null;

        if ($dto->logo instanceof UploadedFile) {
            $logoPath = $this->images->store($dto->logo, 'products/logos');
        }

        $product = Product::create([
            'category_id' => $dto->categoryId,
            'sub_category_id' => $dto->subCategoryId,
            'name' => $dto->name,
            'sub_name' => $dto->subName,
            'code' => $dto->code,
            'logo' => $logoPath,
            'description' => $dto->description,
            'validasi_nickname' => $dto->validasiNickname,
            'access' => $dto->access,
            'tag' => $dto->tag,
            'is_available' => $dto->isAvailable,
            'price_modal' => $dto->priceModal,
            'price_member' => $dto->priceMember,
            'price_vip' => $dto->priceVip,
            'price_reseller' => $dto->priceReseller,
            'price_agent' => $dto->priceAgent,
            'status' => $dto->status,
            'point_percent' => $dto->pointPercent,
            'point_flat' => $dto->pointFlat,
        ]);

        // The typed member price is the default plan's price, and the plan rows
        // are what `PlanPrice` bills from. Without this the product exists with no
        // plan row at all, which the storefront can only serve by falling back to
        // `price_member` and warning about it.
        $this->writePrices->forDefaultPlan($product, $dto->priceMember);

        // A product created by hand has no provider behind it. Without an active
        // supplier mapping `Catalog::sellableProducts()` never serves it, so it
        // is mapped to the platform's own supplier here — see
        // MapProductToInternalSupplierAction.
        $this->mapToInternal->execute($product);

        $this->activityLogAction->execute(new CreateActivityLogDTO(
            userId: Auth::id(),
            ipAddress: request()->ip(),
            userAgent: request()->userAgent(),
            message: "Created new Product: {$product->name}"
        ));

        return $product;
    }
}
