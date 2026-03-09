import DashboardLayout from "@/components/DashboardLayout";
import ContentMenusPage from "@/components/pages/content/ContentMenusPage";

export default async function ContentMenusEditPage({ params }) {
  const resolved = await params;
  const id = typeof resolved?.id === "string" ? resolved.id : null;
  return (
    <DashboardLayout>
      <ContentMenusPage panelMode="edit" panelMenuId={id} />
    </DashboardLayout>
  );
}
