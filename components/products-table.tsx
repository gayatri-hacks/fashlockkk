"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-utils";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ProductRow } from "@/lib/types";

type FilterOptions = {
  sources: string[];
  brands: string[];
  categories: string[];
  colors: string[];
};

const columns: ColumnDef<ProductRow>[] = [
  {
    accessorKey: "image_url",
    header: "Image",
    cell: ({ row }) => (
      <div className="h-14 w-14 overflow-hidden rounded-2xl border border-border bg-bg">
        {row.original.image_url ? (
          <Image
            src={thumbnailUrl(row.original.image_url, 112, 112)}
            alt={row.original.title}
            width={56}
            height={56}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div>
        <p className="max-w-[20rem] font-medium text-text">{row.original.title}</p>
        <p className="mt-1 text-xs text-muted">ID {row.original.id}</p>
      </div>
    ),
  },
  {
    accessorKey: "brand",
    header: "Brand",
    cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
  },
  {
    accessorKey: "source",
    header: "Source",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex items-center gap-1"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Price
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ getValue }) => formatCurrency(Number(getValue())),
  },
  {
    accessorKey: "discount_percentage",
    header: "Discount",
    cell: ({ getValue }) => `${Number(getValue()).toFixed(0)}%`,
  },
  {
    accessorKey: "color",
    header: "Color",
    cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
  },
  {
    accessorKey: "scraped_at",
    header: "Scraped",
    cell: ({ getValue }) => formatDate(String(getValue())),
  },
  {
    accessorKey: "product_url",
    header: "URL",
    cell: ({ getValue }) => (
      <a
        href={String(getValue())}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-accent hover:underline"
      >
        Open
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    ),
  },
];

export function ProductsTable({
  data,
  filters,
}: {
  data: ProductRow[];
  filters: FilterOptions;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Memoize filtered data to prevent unnecessary recalculations
  const filteredData = useMemo(() => {
    return data.filter((product) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [product.title, product.brand, product.source, product.category, product.color]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesSource = !source || product.source === source;
      const matchesBrand = !brand || product.brand === brand;
      const matchesCategory = !category || product.category === category;
      const matchesColor = !color || product.color === color;

      return matchesSearch && matchesSource && matchesBrand && matchesCategory && matchesColor;
    });
  }, [data, search, source, brand, category, color]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 shadow-soft lg:grid-cols-5">
        <label className="flex items-center gap-2 rounded-2xl border border-border bg-bg px-4 py-3 lg:col-span-2">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products, brands, colors..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>

        <SelectField label="Source" value={source} onChange={setSource} options={filters.sources} />
        <SelectField label="Brand" value={brand} onChange={setBrand} options={filters.brands} />
        <SelectField label="Category" value={category} onChange={setCategory} options={filters.categories} />
        <SelectField label="Color" value={color} onChange={setColor} options={filters.colors} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="sticky top-0 bg-[#f9f5ef]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-border px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-bg">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="border-b border-border px-4 py-4 text-sm text-text">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted">No products match the current filters.</div>
        ) : null}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  }, [onChange]);

  return (
    <label className="rounded-2xl border border-border bg-bg px-4 py-3">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={handleChange}
        className="w-full bg-transparent text-sm outline-none"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
