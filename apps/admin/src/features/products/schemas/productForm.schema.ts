import { z } from "zod";

// Same upload constraints as the Category form, plus WEBP — the frame's
// dropzone caption reads "JPG, JPEG, PNG, WEBP up to 10mb".
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, per system_architecture.md §4.9

/** Description live-counter cap, as the frame's "0/280 characters" shows. */
export const DESCRIPTION_MAX = 280;

// ponytail: money and percentages stay strings, like every other field on this
// form — `z.coerce.number()` turns an empty optional field into 0, which would
// read as "priced at zero" rather than "not filled in". Parse at the point the
// payload finally needs numbers.
const digits = (label: string) => z.string().regex(/^\d*$/, `${label} must be a number`).optional();

/**
 * A margin may be negative — selling below cost is a decision an admin can make
 * (a loss-leader), and the API accepts -100..1000 — so this cannot reuse
 * `percent`, which is digits-only.
 */
const marginPercent = () =>
  z
    .string()
    .regex(/^-?\d*(\.\d+)?$/, "Margin must be a number")
    .refine((value) => value === "" || Number(value) >= -100, "Margin cannot be below -100")
    .refine((value) => value === "" || Number(value) <= 1000, "Margin cannot exceed 1000")
    .optional();

const percent = (label: string) =>
  z
    .string()
    .regex(/^\d*$/, `${label} must be a number`)
    .refine((value) => value === "" || Number(value) <= 100, `${label} cannot exceed 100`)
    .optional();

/**
 * Add Main Products form — product_requirements.md §4.6, following the
 * reference's field set exactly.
 *
 * Required is inferred: the frame marks nothing, so it is the three fields a
 * product cannot exist without (name, code, and the category it is filed
 * under). Everything else is optional rather than invented as mandatory.
 */
export const productFormSchema = z.object({
  name: z.string().min(1, "Product Name is required"),
  nicknameValidation: z.string().optional(),
  subName: z.string().optional(),
  code: z.string().min(1, "Product Code is required"),
  access: z.string().optional(),
  tag: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  subCategory: z.string().optional(),
  logo: z
    .instanceof(File)
    .refine((file) => ACCEPTED_IMAGE_TYPES.includes(file.type), "Only JPG, JPEG, PNG, or WEBP files are allowed")
    .refine((file) => file.size <= MAX_IMAGE_SIZE_BYTES, "File must be 10MB or smaller")
    .optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),

  /* Pricing & Margin. Optional like the rest — a product can be filed before
     it is priced.

     Margins replaced the five fixed money fields (Cost/Public/VIP/Reseller/
     Agent): those were never written by anything, and they could not describe a
     membership plan an admin created — which is how pricing actually works now.
     The cost is the supplier's, not something typed here. */
  /** Margin percent per membership plan, keyed by plan id as the input holds it. */
  margins: z.record(z.string(), marginPercent()),
  /** Selling-price window. 0/empty = no limit, as on the provider screen. */
  priceMin: digits("Lower Price Limit"),
  priceMax: digits("Upper Price Limit"),
  /** Point earn rate. Blank = fall back to the global points settings. */
  points: percent("Points"),
  /** Flat bonus points, the sweetener a cheap denomination needs to be worth
      anything at a percentage alone. */
  pointsFlat: digits("Bonus Points"),

  /* The product's own standing discount — not a flash sale (time-boxed) and
     not a promo code (typed at checkout). An empty type means "no discount",
     which is why the value is only read when a type is set; a lone value with
     no type is meaningless and is dropped on submit. */
  discountType: z.union([z.literal(""), z.literal("percent"), z.literal("fixed")]).optional(),
  discountValue: digits("Discount"),

  /* Product Mix. Empty by default, so an untouched section never blocks Save;
     a row the admin did add must be complete to mean anything. */
  productMix: z.array(
    z.object({
      mainProduct: z.string().min(1, "Main Product is required"),
      quantity: z.string().regex(/^[1-9]\d*$/, "Quantity must be at least 1"),
    }),
  ),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
