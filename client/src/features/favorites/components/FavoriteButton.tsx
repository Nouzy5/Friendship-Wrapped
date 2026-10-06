import { StarIcon } from "../../../components/ui/icons";
import { headerIconActiveClasses, headerIconClasses } from "../../../components/ui/PageHeader";
import type { Photo } from "../../photos/types";
import { useFavorite } from "../hooks";

/** Star toggle for the photo viewer's header. Favorites are private to you. */
export function FavoriteButton({ photo }: { photo: Pick<Photo, "id" | "groupId" | "isFavorite"> }) {
  const favorite = useFavorite(photo);

  return (
    <button
      type="button"
      aria-label="Favorite"
      aria-pressed={photo.isFavorite}
      title={photo.isFavorite ? "Remove from favorites" : "Add to favorites (only you can see these)"}
      onClick={() => favorite.mutate(!photo.isFavorite)}
      className={photo.isFavorite ? headerIconActiveClasses : headerIconClasses}
    >
      <StarIcon className="size-5" fill={photo.isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
