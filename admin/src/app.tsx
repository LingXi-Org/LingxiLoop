import { Authenticated, Refine } from '@refinedev/core'
import routerProvider, { CatchAllNavigate, NavigateToResource } from '@refinedev/react-router'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router'
import { accessControlProvider, authProvider, dataProvider } from './api'
import { AuthSettingsPage } from './auth-settings-page'
import { AdminLayout, DashboardPage, ForbiddenPage, LoginPage, ReleaseManagementPage, ResourceDetailPage, ResourceListPage, SearchPage } from './pages'
import { ADMIN_RESOURCES } from './resources'
import { ServiceStatusPage } from './status-page'

export function AdminApp() {
  return <BrowserRouter><Refine
    routerProvider={routerProvider}
    dataProvider={dataProvider}
    authProvider={authProvider}
    accessControlProvider={accessControlProvider}
    resources={ADMIN_RESOURCES.map((resource) => ({
      name: resource.name,
      list: `/resources/${resource.name}`,
      show: resource.detail === false ? undefined : `/resources/${resource.name}/:id`,
      meta: { label: resource.label },
    }))}
    options={{ syncWithLocation: true, warnWhenUnsavedChanges: false }}
  ><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forbidden" element={<ForbiddenPage />} />
    <Route element={<Authenticated key="admin" fallback={<CatchAllNavigate to="/login" />}><Outlet /></Authenticated>}>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="releases" element={<ReleaseManagementPage />} />
        <Route path="authentication" element={<AuthSettingsPage />} />
        <Route path="status" element={<ServiceStatusPage />} />
        <Route path="resources/:resource" element={<ResourceListPage />} />
        <Route path="resources/:resource/:id" element={<ResourceDetailPage />} />
        <Route path="resources" element={<NavigateToResource />} />
      </Route>
    </Route>
    <Route path="*" element={<CatchAllNavigate to="/" />} />
  </Routes></Refine></BrowserRouter>
}
