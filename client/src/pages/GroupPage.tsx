import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Avatar } from "../components/ui/Avatar";
import { FeedIcon, GridIcon, SettingsIcon } from "../components/ui/icons";
import { headerIconClasses } from "../components/ui/PageHeader";
import { useCurrentUser } from "../features/auth/hooks";
import { setCurrentGroupId } from "../features/groups/current-group";
import { GroupAvatar } from "../features/groups/components/GroupAvatar";
import { GroupPicker } from "../features/groups/components/GroupPicker";
import { useGroupContext } from "../features/groups/components/GroupRoute";
import { InviteFriendsCard } from "../features/invites/components/InviteFriendsCard";
import { OpenMomentStrip } from "../features/moments/components/OpenMomentStrip";
import { GroupPulseCard } from "../features/pulse/components/GroupPulseCard";
import { GroupFeed, type FeedLayout } from "../features/photos/components/GroupFeed";
import { formatMemberCount } from "../lib/format";
import { usePageTitle } from "../lib/usePageTitle";

/** The layout lives in the URL (?view=grid), so it survives opening a photo and coming back. */
function useLayout(): [FeedLayout, (layout: FeedLayout) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const layout: FeedLayout = searchParams.get("view") === "grid" ? "grid" : "feed";

  function setLayout(next: FeedLayout) {
    setSearchParams(
      (params) => {
        if (next === "grid") params.set("view", "grid");
        else params.delete("view");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return [layout, setLayout];
}

/** Home: one group's photos, with a switcher to the others. */
export function GroupPage() {
  const group = useGroupContext();
  usePageTitle(group.name);
  const me = useCurrentUser();
  const navigate = useNavigate();
  const [layout, setLayout] = useLayout();
  const alone = group.memberCount === 1;

  // This is now the group Home opens, the camera posts to, and whose colour is your accent.
  useEffect(() => setCurrentGroupId(group.id), [group.id]);

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-0.5 pt-3 pr-2 pb-2 pl-4">
        <div className="flex items-center gap-2.5">
          <GroupAvatar group={group} size={36} />
          <GroupPicker current={group} onSelect={(next) => void navigate(`/groups/${next.id}`)} showNewGroup />
          <div className="ml-auto flex shrink-0 items-center">
            <button
              type="button"
              aria-label="Show as grid"
              aria-pressed={layout === "grid"}
              onClick={() => setLayout(layout === "grid" ? "feed" : "grid")}
              className={headerIconClasses}
            >
              {layout === "grid" ? <FeedIcon className="size-[1.375rem]" /> : <GridIcon className="size-[1.375rem]" />}
            </button>
            <Link to={`/groups/${group.id}/settings`} aria-label="Group settings" className={headerIconClasses}>
              <SettingsIcon className="size-[1.375rem]" />
            </Link>
            <Link to="/settings" aria-label="Your profile and settings" className="grid size-11 place-items-center rounded-full">
              <Avatar name={me.displayName} src={me.avatarUrl} color={group.myColor} size="sm" />
            </Link>
          </div>
        </div>
        <Link to={`/groups/${group.id}/settings`} className="self-start pl-[2.875rem] text-[0.8125rem] text-sub hover:text-fg">
          {formatMemberCount(group.memberCount)}
        </Link>
      </header>

      {/* Until there's someone to share photos with, inviting comes first. */}
      {alone ? (
        <div className="px-4 pt-2 pb-4">
          <InviteFriendsCard group={group} highlight />
        </div>
      ) : (
        <div className="pt-2">
          <OpenMomentStrip group={group} />
          <GroupPulseCard group={group} />
        </div>
      )}
      <GroupFeed group={group} layout={layout} />
    </div>
  );
}
