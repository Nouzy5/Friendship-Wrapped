import type { PublicUser } from "../modules/users/user.dto.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; read it through `currentUser(req)`. */
      user?: PublicUser;
      /** The stored id (token hash) of the session the request came with, set alongside `user`. */
      sessionId?: string;
    }
  }
}

export {};
