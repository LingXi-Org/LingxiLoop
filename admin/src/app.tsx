import { Authenticated, Refine } from '@refinedev/core'
import routerProvider, { CatchAllNavigate, NavigateToResource } from '@refinedev/react-router'
import { lazy, type ReactNode, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router'
import { accessControlProvider, authProvider, dataProvider } from './api'
import { AuthSettingsPage } from './auth-settings-page'
import { AdminLayout, ForbiddenPage, LoginPage, ResourceDetailPage, ResourceListPage, SearchPage } from './pages'
import { ProductionTopologyPage } from './production-topology-page'
import { ADMIN_RESOURCES } from './resources'

const ReleaseManagementPage = lazy(() => import('./release-management-page').then((module) => ({ default: module.ReleaseManagementPage })))
const ServiceStatusPage = lazy(() => import('./status-page').then((module) => ({ default: module.ServiceStatusPage })))
const ObservabilityPage = lazy(() => import('./observability-page').then((module) => ({ default: module.ObservabilityPage })))
const deferredPage = (page: ReactNode) => <Suspense fallback={<div className="grid min-h-64 place-items-center text-sm text-muted-foreground" aria-busy="true">正在加载页面…</div>}>{page}</Suspense>

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
        <Route index element={<ProductionTopologyPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="releases" element={deferredPage(<ReleaseManagementPage />)} />
        <Route path="authentication" element={<AuthSettingsPage />} />
        <Route path="status" element={deferredPage(<ServiceStatusPage />)} />
        <Route path="observability" element={deferredPage(<ObservabilityPage />)} />
        <Route path="resources/:resource" element={<ResourceListPage />} />
        <Route path="resources/:resource/:id" element={<ResourceDetailPage />} />
        <Route path="resources" element={<NavigateToResource />} />
      </Route>
    </Route>
    <Route path="*" element={<CatchAllNavigate to="/" />} />
  </Routes></Refine></BrowserRouter>
}
