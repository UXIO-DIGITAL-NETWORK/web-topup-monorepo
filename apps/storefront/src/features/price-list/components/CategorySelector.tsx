import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Image } from "@/components/common/Image";
import { gameCardArt } from "@/lib/games";
import { cn } from "@/lib/utils";
import { useGamesQuery } from "@/hooks/useGamesQuery";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import type { Game } from "@/types/game.type";

interface Props {
  /** Game slug, or null for "all games". */
  activeGameId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategorySelector({ activeGameId, onSelect }: Props): React.JSX.Element {
  const { t } = useTranslation("priceList");
  const [categorySearch, setCategorySearch] = useState("");

  const { data: games } = useGamesQuery();

  // This search only narrows the row of cards already on screen, so it filters
  // client-side rather than issuing a request per keystroke.
  const needle = categorySearch.toLowerCase();
  const filteredGames: Game[] = (games ?? []).filter(
    (g) => g.title.toLowerCase().includes(needle) || g.region.toLowerCase().includes(needle),
  );

  // The logo the admin uploaded for the site. A game with no thumbnail of its
  // own paints this instead of the bundled stand-in.
  const siteLogo = useSiteSettings().text("logo");

  const handleCardClick = (game: Game) => {
    onSelect(activeGameId === game.id ? null : game.id);
  };

  return (
    <Box className="mb-6">
      {/* ── Section header ── */}
      <Box className="flex items-start justify-between gap-4 mb-4">
        <Box className="flex flex-col gap-0.5">
          <Text
            as="p"
            className="font-outfit font-bold text-[16px] text-white uppercase tracking-wide leading-none"
          >
            {t("category.title")}
          </Text>
          <Text as="p" className="font-inter text-[13px] text-[#909AAE] leading-snug">
            {t("category.subtitle")}
          </Text>
        </Box>

        {/* ── Category search input ── */}
        <Box className="relative hidden sm:flex items-center">
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder={t("category.searchPlaceholder")}
            className="w-[200px] bg-white/5 border border-white/10 rounded-full px-4 py-2 pr-9 text-[13px] font-inter text-white placeholder:text-[#909AAE] outline-none focus:border-[#3B82F6]/50 transition-all"
          />
          <Search className="absolute right-3 w-4 h-4 text-[#909AAE] pointer-events-none" />
        </Box>
      </Box>

      {/* ── Game cards row — same style as Top Up Game section on homepage ── */}
      <Box className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {filteredGames.map((game) => {
          const isActive = activeGameId === game.id;
          const art = gameCardArt(game, siteLogo);

          return (
            <Box
              key={game.id}
              as="button"
              type="button"
              onClick={() => handleCardClick(game)}
              className={cn(
                // Mirror TopUpGameCard: rounded-xl overflow-hidden cursor-pointer aspect-3/4
                "group relative flex-shrink-0 w-[130px] rounded-xl overflow-hidden cursor-pointer outline-none select-none transition-all duration-200",
                "aspect-3/4",
                isActive
                  ? "border-[2px] border-[#C084FC] shadow-[0_0_14.87px_rgba(147,51,234,0.45)]"
                  : game.borderColor === "azure"
                    ? "border border-[#3B82F6]/50 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                    : "border border-[#9333EA]/50 shadow-[0_0_12px_rgba(147,51,234,0.15)]",
              )}
            >
              {/* Background art — scales on hover. A game with no thumbnail of
                  its own paints the site's logo rather than the bundled stand-in. */}
              <Image
                src={art.src}
                alt={game.title}
                objectFit={art.objectFit}
                className="absolute inset-0 w-full h-full transition-transform duration-500 ease-out group-hover:scale-110"
              />

              {/* Scrim — darkens toward bottom */}
              <Box className="absolute inset-0 bg-linear-to-b from-black/10 via-black/20 to-black/80 pointer-events-none" />

              {/* Active overlay tint */}
              {isActive && (
                <Box className="absolute inset-0 bg-[#9333EA]/10 pointer-events-none" />
              )}

              {/* Game logo — positioned above region pill; only when the category has one */}
              {game.logoImage && (
                <Box className="absolute inset-x-0 bottom-20 h-14 flex items-center justify-center px-4">
                  <Image
                    src={game.logoImage}
                    alt={`${game.title} logo`}
                    objectFit="contain"
                    className="w-20 h-8 md:w-24 md:h-9"
                  />
                </Box>
              )}

              {/* Game name — the region pill alone did not say which game this
                  card was; the name is what the admin recognises. */}
              <Box className="absolute inset-x-2 bottom-13 px-1">
                <Text
                  as="p"
                  className="font-outfit font-bold text-[11px] leading-[14px] text-white line-clamp-2 text-center"
                >
                  {game.title}
                </Text>
              </Box>

              {/* Region pill — gradient border */}
              <Box className="absolute inset-x-2 bottom-3 p-px rounded-lg bg-linear-to-r from-[#9333EA] to-[#3B82F6]">
                <Box className="rounded-[7px] bg-[#080814]/90 backdrop-blur-sm h-9 flex items-center justify-center">
                  <Text
                    as="span"
                    className="font-inter text-[12px] font-semibold leading-none text-white/90 tracking-wide"
                  >
                    {game.region}
                  </Text>
                </Box>
              </Box>
            </Box>
          );
        })}

        {filteredGames.length === 0 && (
          <Text as="p" className="font-inter text-[13px] text-white/40 py-4">
            {t("category.noResults")}
          </Text>
        )}
      </Box>

      {/* ── Scroll progress bar (decorative) ── */}
      <Box className="mt-2 h-[3px] rounded-full bg-white/8 overflow-hidden">
        <Box className="h-full w-[30%] rounded-full bg-[#9333EA]" />
      </Box>
    </Box>
  );
}
