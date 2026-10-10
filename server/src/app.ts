import express, { type Express } from "express";
import helmet from "helmet";
import { trustProxyCount } from "./config/env.js";
import { API_PREFIX } from "./lib/api-path.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";
import { apiRouter } from "./routes/index.js";

type AppOptions = {
  /** How many reverse proxies are in front of the app. Defaults to TRUST_PROXY. */
  trustProxy?: number;
};

export function createApp({ trustProxy = trustProxyCount }: AppOptions = {}): Express {
  const app = express();

  // Behind a proxy every request arrives from the proxy's address, so `req.ip` (which the per-address
  // rate limits use) must come from X-Forwarded-For instead. With no proxy in front that header is
  // whatever the client writes, so it's only believed as far as the proxies we were told about.
  app.set("trust proxy", trustProxy > 0 ? trustProxy : false);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));

  app.use(API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
