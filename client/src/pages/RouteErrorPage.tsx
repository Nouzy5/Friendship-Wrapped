import { isRouteErrorResponse, useRouteError } from "react-router";
import { buttonClasses } from "../components/ui/Button";
import { StateMessage } from "../components/ui/StateMessage";
import { usePageTitle } from "../lib/usePageTitle";

/** Rendered by the router when a route throws while rendering or loading. */
export function RouteErrorPage() {
  usePageTitle("Something went wrong");
  const error = useRouteError();

  if (import.meta.env.DEV) console.error(error);

  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong while loading this page.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <StateMessage
        headingLevel="h1"
        emoji="😵"
        title="Something went wrong"
        description={description}
        action={
          <a href="/" className={buttonClasses()}>
            Reload the app
          </a>
        }
      />
    </div>
  );
}
