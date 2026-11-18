// Re-export ImdTable from core/ui/tables for seamless backward compatibility across all feature modules
export {
  ImdTable,
  ImdColumnFilter,
  IMD_TABLE_BREAKPOINT_PX,
  isCompactTableWidth,
  sortTableRows,
  type ImdColumn,
  type ImdTableProps,
  type ImdRowMenuItem,
} from '../../core/ui/tables';
