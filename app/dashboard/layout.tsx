import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { getCurrentUser, getWorkspace } from "@/lib/data";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await getCurrentUser();
  const workspace = await getWorkspace(user.workspaceSlug);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white px-4 py-6 md:block">
        <p className="px-2 text-lg font-semibold tracking-tight">LeadDesk</p>
        <p className="px-2 text-xs text-slate-500">
          {workspace.name} · {workspace.plan}
        </p>
        <nav className="mt-8 space-y-1 text-sm">
          <Link href="/dashboard" className="block rounded-md px-2 py-1.5 font-medium hover:bg-slate-100">
            Ліди
          </Link>
          <Link href="/" className="block rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100">
            Публічна форма
          </Link>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
