import placeholderArt from "@/assets/images/popular_games/popular_games_1.png";
import type { Game } from "@/types/game.type";
import type { GameModel } from "@/types/models/game.model";

/**
 * Adapts a catalog game into the `Game` shape the cards already render.
 *
 * `id` carries the slug rather than a numeric id because every card links to
 * `/checkout/{id}` and the checkout route is addressed by slug.
 *
 * `borderColor` alternates by position. It has no server-side meaning — it is
 * the grid's existing azure/violet rhythm, preserved so a data-driven list
 * looks identical to the hand-written one it replaces.
 */
export function toGame(model: GameModel, index: number): Game {
  return {
    id: model.slug,
    title: model.name,
    region: model.region ?? model.sub_name ?? "",
    bgImage: model.thumbnail_url ?? placeholderArt,
    // Null when the category has no logo, so the card renders the background
    // alone rather than a wrong stand-in logo over someone else's artwork.
    logoImage: model.logo_url ?? null,
    category: normaliseCategory(model.category_type?.name),
    borderColor: index % 2 === 0 ? "azure" : "violet",
  };
}

export function toGames(models: GameModel[]): Game[] {
  return models.map(toGame);
}

/**
 * The art a game card paints, and how it should fit.
 *
 * A game the admin has not given a thumbnail yet used to be handed the bundled
 * stand-in — a picture of a *different* game, which on a category row reads as
 * the wrong game rather than as "no artwork yet". The site's own logo is the
 * honest default, and the bundled art stays the last resort for a site that has
 * no logo either.
 */
export const gameCardArt = (
  game: Game,
  siteLogo?: string,
): { src: string; objectFit: "cover" | "contain" } =>
  game.bgImage !== placeholderArt || !siteLogo
    ? { src: game.bgImage, objectFit: "cover" }
    : { src: siteLogo, objectFit: "contain" };

/**
 * Category types are admin-managed free text, so they are slugified into the
 * tab key rather than matched against a fixed list — a new type added in the
 * back office shows up without a frontend change.
 */
function normaliseCategory(name: string | undefined): Game["category"] {
  if (!name) return "moba";

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") as Game["category"];
}
