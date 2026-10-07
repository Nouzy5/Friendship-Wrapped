import { createBrowserRouter, Navigate } from "react-router";
import { RedirectIfAuthenticated, RequireAuth } from "./features/auth/components/AuthGuards";
import { GroupRoute } from "./features/groups/components/GroupRoute";
import { AppLayout } from "./layouts/AppLayout";
import { CardLayout } from "./layouts/CardLayout";
import { RootLayout } from "./layouts/RootLayout";
import { CameraPage } from "./pages/CameraPage";
import { GroupMembersPage } from "./pages/GroupMembersPage";
import { GroupPage } from "./pages/GroupPage";
import { GroupSettingsPage } from "./pages/GroupSettingsPage";
import { HomePage } from "./pages/HomePage";
import { InvitePage } from "./pages/InvitePage";
import { AlbumPage } from "./pages/AlbumPage";
import { LoginPage } from "./pages/LoginPage";
import { MemoriesPage } from "./pages/MemoriesPage";
import { NewGroupPage } from "./pages/NewGroupPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PhotoPage } from "./pages/PhotoPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { RouteErrorPage } from "./pages/RouteErrorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WrappedListPage } from "./pages/WrappedListPage";
import { WrappedPage } from "./pages/WrappedPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
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
        children: [{ path: "invite/:token", element: <InvitePage /> }],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "home", element: <HomePage /> },
              { path: "onboarding", element: <OnboardingPage /> },
              { path: "profile", element: <ProfilePage /> },
              { path: "settings", element: <SettingsPage /> },
              { path: "camera", element: <CameraPage /> },
              { path: "photos/:photoId", element: <PhotoPage /> },
              { path: "memories", element: <MemoriesPage /> },
              { path: "memories/albums/:albumId", element: <AlbumPage /> },
              { path: "wrapped", element: <WrappedListPage /> },
              { path: "groups/new", element: <NewGroupPage /> },
              {
                path: "groups/:groupId",
                element: <GroupRoute />,
                children: [
                  { index: true, element: <GroupPage /> },
                  { path: "members", element: <GroupMembersPage /> },
                  { path: "settings", element: <GroupSettingsPage /> },
                ],
              },
            ],
          },
          // Full screen, without the app header and navigation.
          { path: "wrapped/:year", element: <WrappedPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
