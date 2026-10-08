import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { WrappedStory } from "../features/wrapped/components/WrappedStory";
import { useWrapped, useWrappedList } from "../features/wrapped/hooks";
import { cameFromList, wrappedPath } from "../features/wrapped/links";
import { ApiError } from "../lib/api-client";
import { usePageTitle } from "../lib/usePageTitle";

function FullScreen({ children }: { children: ReactNode }) {
  return <main className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-bg p-4">{children}</main>;
}

const backToList = (
  <Link to="/wrapped" className={buttonClasses()}>
    See all Wrapped
  </Link>
);

function NoWrapped({ year }: { year: number | null }) {
  return (
    <FullScreen>
      <StateMessage
        headingLevel="h1"
        emoji="🎁"
        title={year ? `No Wrapped for ${year}` : "Wrapped not found"}
        description="A group's Wrapped for a year starts with its first photo that year. You'll only see your own groups'."
        action={backToList}
      />
    </FullScreen>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <FullScreen>
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this Wrapped"
        description="Check your connection and try again."
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    </FullScreen>
  );
}

/** Without ?group=, the first of your groups with a Wrapped that year. */
function FirstGroupOfYear({ year }: { year: number }) {
  const list = useWrappedList();
  if (list.isPending) {
    return (
      <FullScreen>
        <Spinner className="size-8" />
      </FullScreen>
    );
  }
  if (list.isLoadingError) return <LoadFailed onRetry={() => void list.refetch()} />;
  const first = list.data.find((wrapped) => wrapped.year === year);
  return first ? <Navigate replace to={wrappedPath(year, first.group.id)} /> : <NoWrapped year={year} />;
}

function Story({ groupId, year, onClose }: { groupId: string; year: number; onClose: () => void }) {
  const wrapped = useWrapped(groupId, year);
  usePageTitle(wrapped.data ? `${wrapped.data.group.name} · ${year} Wrapped` : `${year} Wrapped`);
  if (wrapped.isPending) {
    return (
      <FullScreen>
        <Spinner className="size-8" />
      </FullScreen>
    );
  }
  if (wrapped.isLoadingError) {
    const missing = wrapped.error instanceof ApiError && [400, 404].includes(wrapped.error.status);
    return missing ? <NoWrapped year={year} /> : <LoadFailed onRetry={() => void wrapped.refetch()} />;
  }
  return (
    <main>
      <WrappedStory wrapped={wrapped.data} onClose={onClose} />
    </main>
  );
}

/** /wrapped/:year?group=… — a group's year, played full screen as a story. */
export function WrappedPage() {
  const { year: yearParam = "" } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const groupId = params.get("group");

  // Back to the list where you were, or to the list itself when the story was opened from a link.
  const close = () => {
    if (cameFromList(location.state)) void navigate(-1);
    else void navigate("/wrapped", { replace: true });
  };

  if (year === null) return <NoWrapped year={null} />;
  if (!groupId) return <FirstGroupOfYear year={year} />;
  return <Story key={`${groupId}-${year}`} groupId={groupId} year={year} onClose={close} />;
}
