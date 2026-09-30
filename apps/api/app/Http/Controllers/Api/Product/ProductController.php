<?php

namespace App\Http\Controllers\Api\Product;

use App\Actions\Product\AddProductsFromSupplierAction;
use App\Actions\Product\BulkCreateProductsAction;
use App\Actions\Product\BulkProductAction;
use App\Actions\Product\CreateProductAction;
use App\Actions\Product\DeleteProductAction;
use App\Actions\Product\GetProductsAction;
use App\Actions\Product\ProductPriceControlAction;
use App\Actions\Product\PublishProductAction;
use App\Actions\Product\RestoreProductAction;
use App\Actions\Product\SetProductMarginAction;
use App\Actions\Product\SetProductMixAction;
use App\Actions\Product\UnpublishProductAction;
use App\Actions\Product\UpdateProductAction;
use App\Exceptions\ProductDraftException;
use App\Exceptions\SupplierProductPoolException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Product\AddProductsFromSupplierRequest;
use App\Http\Requests\Product\BulkCreateProductsRequest;
use App\Http\Requests\Product\BulkProductActionRequest;
use App\Http\Requests\Product\SetProductMarginRequest;
use App\Http\Requests\Product\SetProductMixRequest;
use App\Http\Requests\Product\SetProductPriceLimitRequest;
use App\Http\Requests\Product\StoreProductRequest;
use App\Http\Requests\Product\UpdateProductRequest;
use App\Http\Resources\Api\Product\ProductResource;
use App\Models\Product;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    use ApiResponse;

    public function index(Request $request, GetProductsAction $action)
    {
        $perPage = min(100, max(1, (int) $request->query('per_page', 15)));
        $categoryId = $request->query('category_id');
        $subCategoryId = $request->query('sub_category_id');
        $status = $request->query('status');
        $minPrice = $request->query('min_price');
        $maxPrice = $request->query('max_price');

        $products = $action->execute(
            $perPage,
            $request->query('search'),
            $categoryId !== null ? (int) $categoryId : null,
            $subCategoryId !== null ? (int) $subCategoryId : null,
            $status !== null ? filter_var($status, FILTER_VALIDATE_BOOLEAN) : null,
            $minPrice !== null ? (int) $minPrice : null,
            $maxPrice !== null ? (int) $maxPrice : null,
            $request->query('publish_state'),
        );

        return $this->paginatedResponse(ProductResource::collection($products), 'Products retrieved successfully');
    }

    public function store(StoreProductRequest $request, CreateProductAction $action)
    {
        $product = $action->execute($request->toDTO());

        return $this->successResponse(
            new ProductResource($product->load(['category', 'subCategory', 'planPrices.membershipPlan'])),
            'Product created successfully',
            201
        );
    }

    public function show(Product $product)
    {
        return $this->successResponse(
            new ProductResource($product->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan', 'mixItems.component'])),
            'Product retrieved successfully'
        );
    }

    public function update(UpdateProductRequest $request, Product $product, UpdateProductAction $action)
    {
        $updatedProduct = $action->execute($product, $request->toDTO());

        return $this->successResponse(
            new ProductResource($updatedProduct->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan'])),
            'Product updated successfully'
        );
    }

    public function destroy(Product $product, DeleteProductAction $action)
    {
        $action->execute($product);

        return $this->successResponse(null, 'Product archived successfully');
    }

    /**
     * Restore an archived product. Bound `withTrashed` in routes/api.php — the
     * default binding applies the soft-delete scope and would 404 every target.
     */
    public function restore(Product $product, RestoreProductAction $action)
    {
        try {
            $restored = $action->execute($product);
        } catch (SupplierProductPoolException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new ProductResource($restored->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan'])),
            'Product restored successfully'
        );
    }

    // ── Price controls ─────────────────────────────────────────────────────────

    /**
     * Re-price one product from the Main Products form.
     *
     * Delegates to the provider mapping's margin action wherever a mapping
     * exists, so this screen and Set Profit Margin write the same rows.
     */
    public function setMargin(SetProductMarginRequest $request, Product $product, SetProductMarginAction $action)
    {
        $updated = $action->execute(
            $product,
            $request->planMargins(),
            $request->priceMin(),
            $request->priceMax(),
            $request->limitsProvided(),
            $request->pointPercent(),
            $request->pointFlat(),
            $request->pointsProvided(),
        );

        return $this->successResponse(new ProductResource($updated), 'Product margin updated successfully');
    }

    public function setPriceLimit(SetProductPriceLimitRequest $request, Product $product, ProductPriceControlAction $action)
    {
        $updated = $action->setLimit($product, $request->priceMin(), $request->priceMax());

        return $this->successResponse(
            new ProductResource($updated->load(['category', 'subCategory', 'planPrices.membershipPlan'])),
            'Price limit updated successfully'
        );
    }

    public function bulkShowPrice(BulkProductActionRequest $request, BulkProductAction $action)
    {
        // The client sends `hidden`: "Show Price" posts false, "Hide" posts true.
        return $this->successResponse(
            $action->hide($request->validated('ids'), $request->boolean('hidden')),
            'Product price visibility updated successfully'
        );
    }

    public function bulkPublish(BulkProductActionRequest $request, BulkProductAction $action)
    {
        // The client sends `published`: "Publish" posts true, "Unpublish" posts
        // false. Absent means false, so a bare payload takes products down rather
        // than putting them on sale.
        return $this->successResponse(
            $action->setPublished($request->validated('ids'), $request->boolean('published')),
            'Product publish states updated successfully'
        );
    }

    public function bulkUxiolabsUpdate(BulkProductActionRequest $request, BulkProductAction $action)
    {
        return $this->successResponse(
            $action->uxiolabsUpdate($request->validated('ids')),
            'Products updated from supplier successfully'
        );
    }

    public function bulkDelete(BulkProductActionRequest $request, BulkProductAction $action)
    {
        return $this->successResponse(
            $action->delete($request->validated('ids')),
            'Products archived successfully'
        );
    }

    /** Add Product (Bulk): create many products from a supplier + category. */
    public function bulkCreate(BulkCreateProductsRequest $request, BulkCreateProductsAction $action)
    {
        $result = $action->execute(
            (int) $request->validated('supplier_id'),
            (int) $request->validated('category_id'),
            $request->items(),
        );

        return $this->successResponse($result, 'Products created successfully', 201);
    }

    /**
     * Add Products ▸ From Supplier: provider SKUs become DRAFT products here and
     * now. Replaces the pool stage — whatever the admin picks shows up on the
     * products page immediately, unpublished, awaiting name/price/margin.
     */
    public function fromSupplier(AddProductsFromSupplierRequest $request, AddProductsFromSupplierAction $action)
    {
        return $this->successResponse(
            $action->execute($request->skuCodes()),
            'Products added from supplier successfully',
            201
        );
    }

    /** Listis — put a product back on the storefront. */
    public function publish(Product $product, PublishProductAction $action)
    {
        try {
            $published = $action->execute($product);
        } catch (SupplierProductPoolException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new ProductResource($published->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan'])),
            'Product published successfully'
        );
    }

    /** Unlistis — take a product off the storefront. Archived, never deleted. */
    public function unpublish(Product $product, UnpublishProductAction $action)
    {
        $unpublished = $action->execute($product);

        return $this->successResponse(
            new ProductResource($unpublished->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan'])),
            'Product unpublished successfully'
        );
    }

    /**
     * Set the product's mix — the components it sells together.
     *
     * The accumulated cost and the resulting sell prices are computed by the
     * action, so the admin sees one number (cost) and the API decides the rest.
     */
    public function setMix(SetProductMixRequest $request, Product $product, SetProductMixAction $action)
    {
        try {
            $mixed = $action->execute($product, $request->items());
        } catch (ProductDraftException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new ProductResource($mixed->load(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan', 'mixItems.component'])),
            'Product mix updated successfully'
        );
    }
}
