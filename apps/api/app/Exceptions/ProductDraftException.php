<?php

namespace App\Exceptions;

use Exception;

/**
 * A supplier mapping could not be turned into a product: empty code, or a code
 * already owned by a live product.
 *
 * Kept separate from `SupplierProductPoolException` because it is raised by the
 * shared draft builder, which serves both the (legacy) promote path and the
 * direct "add from supplier" path. The promote action translates it back to the
 * pool exception so its controller and tests keep their 422.
 */
class ProductDraftException extends Exception {}
