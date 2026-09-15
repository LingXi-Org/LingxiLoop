import { recordPath, resourceArea } from './workspace-model'
import { LegacyResource, WorkspacePage, ResourceListPage } from './workspace-pages'
import { EducationPage } from './education-page'
import { Authenticated, Refine } from '@refinedev/core'
import routerProvider, { CatchAllNavigate } from '@refinedev/react-router'
import { lazy, type ReactNode, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { accessControlProvider, adminQueryClient, authProvider, dataProvider, useManagementSession } from './api'
import { CompanyDashboard, CompanyMembers } from './company-pages'
import { AdminLayout, ForbiddenPage, LoginPage, ResourceDetailPage, SearchPage } from './pages'
import { ADMIN_RESOURCES } from './resources'

const DashboardPage = lazy(() => import('./dashboard-page').then((module) => ({ default: module.DashboardPage })))
const deferredPage = (page: ReactNode) => <Suspense fallback={<div className="grid min-h-64 place-items-center text-sm text-muted-foreground" aria-busy="true">正在加载页面…</div>}>{page}</Suspense>

export function AdminApp() {
  return <BrowserRouter><Refine
    routerProvider={routerProvider}
    dataProvider={dataProvider}
    authProvider={authProvider}
    accessControlProvider={accessControlProvider}
    resources={ADMIN_RESOURCES.map((resource) => ({
      name: resource.name,
      list: recordPath(resource.name),
      show: resource.detail === false ? undefined : `${resourceArea(resource.name)}/${resource.name}/:id`,
      meta: { label: resource.label },
    }))}
    options={{ syncWithLocation: true, warnWhenUnsavedChanges: false, reactQuery: { clientConfig: adminQueryClient } }}
  ><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forbidden" element={<ForbiddenPage />} />
    <Route element={<Authenticated key="admin" fallback={<CatchAllNavigate to="/login" />}><Outlet /></Authenticated>}>
      <Route element={<AdminLayout />}>
        <Route index element={<ManagementHome />} />
        <Route path="members" element={<CompanyMembers />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="organizations/new" element={<EducationPage />} />
        <Route path="education" element={<Navigate replace to="/organizations/new" />} />
        {["users", "organizations", "projects", "ai", "system"].map(area => <Route key={area} path={area} element={<WorkspacePage area={`/${area}`} />} />)}
        <Route path=":section/:resource" element={<ResourceListPage />} />
        <Route path=":section/:resource/:id" element={<ResourceDetailPage />} />
        <Route path="authentication" element={<Navigate replace to="/system?tab=authentication" />} />
        <Route path="status" element={<Navigate replace to="/system" />} />
        <Route path="observability" element={<Navigate replace to="/ai" />} />
        <Route path="resources/:resource" element={<LegacyResource />} />
        <Route path="resources/:resource/:id" element={<LegacyResource />} />
        <Route path="resources" element={<Navigate replace to="/" />} />
      </Route>
    </Route>
    <Route path="*" element={<CatchAllNavigate to="/" />} />
  </Routes></Refine></BrowserRouter>
}

function ManagementHome() {
  const session = useManagementSession()
  if (!session) return <p aria-busy="true">正在确认管理权限…</p>
  return session?.mode === 'company' ? <CompanyDashboard /> : deferredPage(<DashboardPage />)
}
