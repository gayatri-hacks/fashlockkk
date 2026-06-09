import { BrandTable } from "@/components/brand-table";
import { SectionHeader } from "@/components/section-header";
import { StatCard } from "@/components/stat-card";
import { loadBrandsData, loadProductsData } from "@/lib/data";

export default async function BrandsPage() {
  const [brands, products] = await Promise.all([
    loadBrandsData(),
    loadProductsData({ search: "", source: "", brand: "", category: "", color: "" }),
  ]);

  const brandCount = brands.length;
  const totalProducts = brands.reduce((sum, b) => sum + b.productCount, 0);
  const avgPrice = brands.length
    ? brands.reduce((sum, b) => sum + b.averagePrice * b.productCount, 0) / (totalProducts || 1)
    : 0;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Brand monitoring"
        title="Brands"
        description="See which brands are most active, what they price their products at, and which categories they are pushing most frequently."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Tracked brands" value={brandCount} tone="accent" />
        <StatCard label="Tracked products" value={totalProducts} />
        <StatCard label="Average product price" value={`₹${Math.round(avgPrice).toLocaleString("en-IN")}`} />
      </div>

      <BrandTable brands={brands} />
    </div>
  );
}
