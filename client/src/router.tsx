import { createBrowserRouter, Navigate } from "react-router";
import { RequireAdmin } from "./features/admin/components/RequireAdmin";
import { RedirectIfAuthenticated, RequireAuth } from "./features/auth/components/AuthGuards";
import { GroupRoute } from "./features/groups/components/GroupRoute";
import { AppLayout, DetailLayout } from "./layouts/AppLayout";
import { FullScreenLoader } from "./components/ui/Spinner";
import { CardLayout } from "./layouts/CardLayout";
import { RootLayout } from "./layouts/RootLayout";
import { AlbumPage } from "./pages/AlbumPage";
import { CameraPage } from "./pages/CameraPage";
import { GroupPage } from "./pages/GroupPage";
import { GroupSettingsPage } from "./pages/GroupSettingsPage";
import { HomePage } from "./pages/HomePage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";
import { MemoriesPage } from "./pages/MemoriesPage";
import { MomentPage } from "./pages/MomentPage";
import { NewGroupPage } from "./pages/NewGroupPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PhotoPage } from "./pages/PhotoPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RouteErrorPage } from "./pages/RouteErrorPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { AccountSettingsPage } from "./pages/settings/AccountSettingsPage";
import { AppearanceSettingsPage } from "./pages/settings/AppearanceSettingsPage";
import { BlockedPage } from "./pages/settings/BlockedPage";
import { MyInvitesPage } from "./pages/settings/MyInvitesPage";
import { NotificationSettingsPage } from "./pages/settings/NotificationSettingsPage";
import { PhotoSettingsPage } from "./pages/settings/PhotoSettingsPage";
import { PrivacySettingsPage } from "./pages/settings/PrivacySettingsPage";
import { SettingsHomePage } from "./pages/settings/SettingsHomePage";
import { TermsPage } from "./pages/settings/TermsPage";
import { WrappedListPage } from "./pages/WrappedListPage";
import { WrappedPage } from "./pages/WrappedPage";

// The admin panel is for one person: its code is fetched only when they open it, not by everyone.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    HydrateFallback: FullScreenLoader,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      {
        path: "auth",
        element: <RedirectIfAuthenticated />,
        children: [
          { index: true, element: <Navigate to="login" replace /> },
          {
            element: <CardLayout />,
            children: [
              { path: "login", element: <LoginPage /> },
              { path: "register", element: <RegisterPage /> },
            ],
          },
        ],
      },
      {
        // Public: signed-out visitors see a preview and can sign up from here.
        element: <CardLayout />,
        children: [
          { path: "invite/:token", element: <InvitePage /> },
          // The link in the confirmation email: open to anyone, signed in or not.
          { path: "verify-email", element: <VerifyEmailPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            // The main tabs, with the navigation bar.
            element: <AppLayout />,
            children: [
              { path: "home", element: <HomePage /> },
              { path: "photos/:photoId", element: <PhotoPage /> },
              { path: "memories", element: <MemoriesPage /> },
              { path: "memories/albums/:albumId", element: <AlbumPage /> },
              { path: "memories/moments/:momentId", element: <MomentPage /> },
              { path: "wrapped", element: <WrappedListPage /> },
              { path: "groups/:groupId", element: <GroupRoute />, children: [{ index: true, element: <GroupPage /> }] },
            ],
          },
          {
            // Screens you step into and back out of: no navigation bar.
            element: <DetailLayout />,
            children: [
              { path: "onboarding", element: <OnboardingPage /> },
              { path: "groups/new", element: <NewGroupPage /> },
              {
                path: "groups/:groupId",
                element: <GroupRoute />,
                children: [
                  { path: "settings", element: <GroupSettingsPage /> },
                  // Members used to have their own page; they're part of the group's settings now.
                  { path: "members", element: <Navigate to="../settings" replace /> },
                ],
              },
              { path: "settings", element: <SettingsHomePage /> },
              { path: "settings/account", element: <AccountSettingsPage /> },
              { path: "settings/notifications", element: <NotificationSettingsPage /> },
              { path: "settings/appearance", element: <AppearanceSettingsPage /> },
              { path: "settings/privacy", element: <PrivacySettingsPage /> },
              { path: "settings/blocked", element: <BlockedPage /> },
              { path: "settings/invites", element: <MyInvitesPage /> },
              { path: "settings/photos", element: <PhotoSettingsPage /> },
              { path: "settings/terms", element: <TermsPage /> },
              { path: "profile", element: <Navigate to="/settings/account" replace /> },
            ],
          },
          {
            // The server owner's panel: wider than the app, with its own sections.
            path: "admin",
            element: <RequireAdmin />,
            children: [
              {
                lazy: async () => ({ Component: (await import("./layouts/AdminLayout")).AdminLayout }),
                children: [
                  { index: true, lazy: async () => ({ Component: (await import("./pages/admin/AdminOverviewPage")).AdminOverviewPage }) },
                  { path: "users", lazy: async () => ({ Component: (await import("./pages/admin/AdminUsersPage")).AdminUsersPage }) },
                  { path: "users/:userId", lazy: async () => ({ Component: (await import("./pages/admin/AdminUserPage")).AdminUserPage }) },
                  { path: "groups", lazy: async () => ({ Component: (await import("./pages/admin/AdminGroupsPage")).AdminGroupsPage }) },
                  { path: "groups/:groupId", lazy: async () => ({ Component: (await import("./pages/admin/AdminGroupPage")).AdminGroupPage }) },
                  { path: "reports", lazy: async () => ({ Component: (await import("./pages/admin/AdminReportsPage")).AdminReportsPage }) },
                  { path: "system", lazy: async () => ({ Component: (await import("./pages/admin/AdminSystemPage")).AdminSystemPage }) },
                ],
              },
            ],
          },
          // Full screen, without any chrome.
          { path: "camera", element: <CameraPage /> },
          { path: "wrapped/:year", element: <WrappedPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
