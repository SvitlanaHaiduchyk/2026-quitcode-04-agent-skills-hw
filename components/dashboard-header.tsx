import { logout } from "@/app/login/actions";
import { getCurrentUser, getWorkspace } from "@/lib/data";

export async function DashboardHeader() {
  const user = await getCurrentUser();
  const workspace = await getWorkspace(user.workspaceSlug);

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div>
        <p className="text-sm font-medium">{workspace.name}</p>
        <p className="text-xs text-slate-500">{workspace.timezone}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm">{user.name}</p>
          <p className="text-xs text-slate-500">{user.role}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
            Вийти
          </button>
        </form>
      </div>
    </header>
  );
}
