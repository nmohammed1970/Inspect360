import { TableCell, TableRow } from "@/components/ui/table";

type EmptyTableRowProps = {
  colSpan: number;
  message: string;
};

export function EmptyTableRow({ colSpan, message }: EmptyTableRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}
