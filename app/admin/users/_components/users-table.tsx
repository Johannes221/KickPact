"use client";

import { useRouter } from "next/navigation";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import type { AdminUserRow, AdminUserSortKey } from "@/lib/db/queries/platform-stats";

interface UsersTableProps {
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: AdminUserSortKey;
  dir?: SortDirection;
}

export function UsersTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: UsersTableProps) {
  const router = useRouter();

  const columns: Array<DataTableColumn<AdminUserRow>> = [
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-mono text-xs">{row.email}</div>
          {!row.emailVerified && (
            <div className="text-[0.65rem] uppercase tracking-wider text-amber-700">
              nicht verifiziert
            </div>
          )}
          {row.deletionRequestedAt && (
            <div className="text-[0.65rem] uppercase tracking-wider text-rose-700">
              Löschung beantragt
            </div>
          )}
        </div>
      )
    },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => row.name ?? "—"
    },
    {
      key: "createdAt",
      label: "Erstellt",
      sortable: true,
      render: (row) => (
        <span className="font-mono tabular-nums text-xs text-brand-night-navy/60">
          {new Date(row.createdAt).toLocaleDateString("de-DE")}
        </span>
      )
    },
    {
      key: "sponsorCount",
      label: "Sponsors",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.sponsorCount}</span>
      )
    },
    {
      key: "clubMembershipCount",
      label: "Clubs",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.clubMembershipCount}</span>
      )
    },
    {
      key: "pledgeCount",
      label: "Pledges",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.pledgeCount}</span>
      )
    }
  ];

  return (
    <DataTable<AdminUserRow>
      rows={rows}
      columns={columns}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
      emptyState="Keine User zu diesem Filter."
    />
  );
}
