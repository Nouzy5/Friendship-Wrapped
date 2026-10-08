import { StarIcon } from "../../../components/ui/icons";
import type { Photo } from "../../photos/types";
import { useFavorite } from "../hooks";

/** Star toggle. Favorites are private to you; a saved one is filled in your colour. */
export function FavoriteButton({ photo }: { photo: Pick<Photo, "id" | "groupId" | "isFavorite"> }) {
  const favorite = useFavorite(photo);

  return (
    <button
      type="button"
      aria-label="Favorite"
      aria-pressed={photo.isFavorite}
      title={photo.isFavorite ? "Remove from favorites" : "Add to favorites (only you can see these)"}
      onClick={() => favorite.mutate(!photo.isFavorite)}
      className="grid size-11 place-items-center rounded-full transition hover:bg-surface active:scale-90"
    >
      <StarIcon
        // Keyed so the star springs each time it's saved.
        key={photo.isFavorite ? "saved" : "not"}
        className={`size-[1.375rem] ${photo.isFavorite ? "animate-bounce-once text-accent" : ""}`}
        fill={photo.isFavorite ? "currentColor" : "none"}
        stroke={photo.isFavorite ? "var(--fg)" : "currentColor"}
        strokeWidth={photo.isFavorite ? 1.5 : 2}
      />
    </button>
  );
}
