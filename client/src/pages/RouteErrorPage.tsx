import { isRouteErrorResponse, useRouteError } from "react-router";
import { StateMessage } from "../components/ui/StateMessage";

/** Rendered by the router when a route throws while rendering or loading. */
export function RouteErrorPage() {
  const error = useRouteError();

  if (import.meta.env.DEV) console.error(error);

  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong while loading this page.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950">
      <StateMessage
        headingLevel="h1"
        emoji="😵"
        title="Something went wrong"
        description={description}
        action={
          <a href="/" className="text-sm font-semibold text-brand-orange hover:underline">
            Reload the app
          </a>
        }
      />
    </div>
  );
}
