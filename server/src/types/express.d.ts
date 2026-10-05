import type { PublicUser } from "../modules/users/user.dto.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`; read it through `currentUser(req)`. */
      user?: PublicUser;
    }
  }
}

export {};
